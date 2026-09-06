// scripts/master-ci-status.mjs
//
// Je li master ZELEN na CI-u? Odgovor u jednoj naredbi, iz GitHuba, ne iz ovog stroja.
//
// Zasto postoji: 2026-09-02 su CETIRI uzastopna master commita bila crvena na CI-u, a otkrila
// ih je tek sesija koja je slucajno mjerila nesto drugo. Lokalni `npm run check` to ne moze
// reci: on mjeri RADNO STABLO (vidi CLAUDE.md), a na ovom stroju zna umrijeti i na OOM-u.
//
// ZASTO NE `gh`: prva izvedba je zvala `gh run list`. Izmjereno 2026-09-03: `gh` je poceo visiti
// na SVAKOJ podnaredbi, ukljucujuci `gh auth status`, i jedan poziv se nije vratio ni nakon 439 s
// (ni uz GH_NO_UPDATE_NOTIFIER=1, dakle nije update notifier). Mreza pritom NIJE bila kriva:
// `api.github.com` je istovremeno odgovarao za 0,32 s. Izravan poziv istog API-ja traje ~1 s i ne
// treba autentikaciju, jer je repozitorij javan. Gard koji ovisi o alatu koji visi je gard koji
// suti upravo kad treba govoriti.
//
// TRI ishoda, ne dva. "Ne znam" se NE smije prikazati kao zeleno:
//
//   0  zeleno    zadnji dovrseni run na grani je uspio
//   1  CRVENO    pao je; uz to se broji NIZ uzastopnih padova, jer je vazniji od zadnjeg
//   2  ne znam   API nedostupan, odbijen, ili nema dovrsenih runova
//
// IZLAZ IDE PREKO `process.exitCode`, NIKAD PREKO `process.exit()`. Izmjereno 2026-09-03:
// `process.exit()` pozvan dok `fetch` jos drzi keep-alive uticnicu rusi Node na Windowsu
// (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`) i vraca 127. Ugovor o tri koda bi
// tako pukao bas u trenutku kad gard treba biti pouzdan.
//
// Pokretanje:  npm run master-ci        (ili: node scripts/master-ci-status.mjs)

import { execFileSync } from 'node:child_process';
import { formatOcjenu, ocijeniRunove } from './master-ci-core.mjs';

const REPO = 'danielrisavi77-create/Lekta';
// SVI workflowi, ne samo `check.yml`. Do 2026-09-06 se pitalo samo za `check`, pa je
// `browser-matrix` bio nevidljiv: bio je crven dva commita zaredom dok je `check` bio zelen, a
// alat bi nad takvom granom javio ZELENO. Prosudba je u `master-ci-core.mjs`, s testovima.
// Grana je argument SAMO da bi se crvena i "ne znam" grana mogle stvarno izvrsiti (negativne
// kontrole); bez argumenta je uvijek master, sto je jedina upotreba u proizvodu.
// `--current` razrjesava granu SAM, jer `$(git ...)` kroz npm skriptu na Windowsu ne izvrsava
// nista nego se prosljedjuje doslovno (izmjereno: grana je ispala '$(git').
const ARG = process.argv[2] || 'master';
const BRANCH = ARG === '--current'
  ? (() => {
      try {
        return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
      } catch {
        return 'master';
      }
    })()
  : ARG;
const TIMEOUT_MS = 20000;

function neZnam(razlog) {
  console.log(`NE ZNAM: ${razlog}`);
  console.log('Ovo NIJE zeleno. Provjeri ponovno prije nego se osloni na master.');
  return 2;
}

async function provjeri() {
  const url = `https://api.github.com/repos/${REPO}/actions/runs`
    + `?branch=${encodeURIComponent(BRANCH)}&per_page=100`;

  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lekta-master-ci' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return neZnam(`GitHub API nije odgovorio (${e && e.message ? e.message : e})`);
  }

  if (!res.ok) {
    // 403 uz iscrpljen anonimni limit je cesta i posebno zavaravajuca greska, pa se imenuje.
    const preostalo = res.headers.get('x-ratelimit-remaining');
    const dodatak = res.status === 403 && preostalo === '0' ? ' (iscrpljen anonimni limit GitHub API-ja)' : '';
    return neZnam(`GitHub API je vratio HTTP ${res.status}${dodatak}`);
  }

  let podaci;
  try {
    podaci = await res.json();
  } catch {
    return neZnam('GitHub API je vratio nesto sto nije JSON.');
  }

  const runovi = Array.isArray(podaci.workflow_runs) ? podaci.workflow_runs : [];
  const ocjena = ocijeniRunove(runovi);
  for (const redak of formatOcjenu(ocjena, BRANCH)) console.log(redak);
  if (ocjena.ishod === 'zeleno') return 0;
  return ocjena.ishod === 'crveno' ? 1 : 2;
}

process.exitCode = await provjeri();
