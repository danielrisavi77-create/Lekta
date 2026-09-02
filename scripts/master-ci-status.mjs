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

const REPO = 'danielrisavi77-create/Lekta';
const WORKFLOW = 'check.yml';
// Grana je argument SAMO da bi se crvena i "ne znam" grana mogle stvarno izvrsiti (negativne
// kontrole); bez argumenta je uvijek master, sto je jedina upotreba u proizvodu.
const BRANCH = process.argv[2] || 'master';
const TIMEOUT_MS = 20000;

function neZnam(razlog) {
  console.log(`NE ZNAM: ${razlog}`);
  console.log('Ovo NIJE zeleno. Provjeri ponovno prije nego se osloni na master.');
  return 2;
}

async function provjeri() {
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs`
    + `?branch=${encodeURIComponent(BRANCH)}&per_page=20`;

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
  const dovrseni = runovi.filter((r) => r.status === 'completed' && r.conclusion);
  if (!dovrseni.length) {
    return neZnam(`nema dovrsenih runova na ${BRANCH} (u tijeku: ${runovi.length - dovrseni.length}).`);
  }

  const zadnji = dovrseni[0];
  const sha = String(zadnji.head_sha).slice(0, 8);
  const kada = String(zadnji.created_at).replace('T', ' ').replace('Z', ' UTC');

  if (zadnji.conclusion === 'success') {
    console.log(`ZELENO: ${BRANCH} ${sha} je prosao CI (${kada}).`);
    return 0;
  }

  // Niz uzastopnih padova je vazniji od jednog: 2026-09-02 ih je bilo cetiri, a nitko nije gledao.
  let niz = 0;
  for (const r of dovrseni) {
    if (r.conclusion === 'success') break;
    niz += 1;
  }

  console.log(`CRVENO: ${BRANCH} ${sha} je pao na CI-u (${zadnji.conclusion}, ${kada}).`);
  if (niz > 1) console.log(`Uzastopnih padova na vrhu: ${niz}. Grana je crvena duze, ne tek od zadnjeg commita.`);
  console.log(`Detalji: ${zadnji.html_url || '(bez url-a)'}`);
  return 1;
}

process.exitCode = await provjeri();
