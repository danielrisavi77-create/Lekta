// scripts/release-gate-core.mjs
//
// NEGATIVNI SLUCAJEVI KOJI MORAJU ZAUSTAVITI OBJAVU (plan T19), na jednom mjestu i bez `process.exit`.
//
// Pet stanja od kojih svako znaci da objavljeni artefakt ne odgovara onome sto je dokazano:
//
//   (a) `dist/build-info.json` ne postoji, nije JSON ili nema 40-znamenkasti commit
//   (b) `dist/build-info.json` nosi DRUGI commit od onoga koji se gradi (identitet artefakta)
//   (c) dokaz izdanja je `stale` ili `unknown` prema otisku stabla
//   (d) praceni izvor se promijenio nakon ovjere, i to na DVA nacina:
//         d1  promjena je COMMITANA  -> otisak stabla se razisao (isto mjerenje kao (c))
//         d2  promjena NIJE commitana -> otisak je i dalje jednak, a u artefakt ulazi drugi kod
//   (e) obavezna razina nema zapisan prolaz u `results[]`
//
// ZASTO ZASEBAN MODUL. `verify-deploy-dist.mjs` je linearna skripta koja se pri uvozu odmah izvrsi i
// zove `process.exit`, pa se njezina odluka nije mogla mjeriti ni nad cim osim nad stvarnim `dist/`
// repozitorija. Odluke su zato ovdje, kao funkcije nad ULAZOM, a skripta ostaje tanko ozicenje.
// CLAUDE.md na to izricito upozorava: testirana cista funkcija uz netestirano ozicenje je lazno
// zeleno, pa uz ovaj modul ide i `scripts/verify-release-proof.mjs`, koji isti gate vrti kao PRAVI
// proces nad zadanim stablom, i time se mjeri i izlazni kod i poruka, ne samo povratna vrijednost.
//
// ZASTO (e) POSTOJI, iako `release-check.mjs` vec racuna `missingRequired`: `complete` je obicno
// polje u JSON-u. Dokaz pecen starijim popisom razina, rucno uredjen dokaz ili dokaz kojemu je
// razina ispala iz `results[]` i dalje tvrdi `complete: true`. Gate koji tudju zastavicu uzima na
// rijec ne moze to vidjeti, pa potpunost ovdje racunamo NEOVISNO, iz `results[]` i popisa obaveznih
// razina (`release-tiers.mjs`), i tek onda usporedjujemo s onim sto dokaz o sebi tvrdi.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { proofStaleness, formatStaleness, treeDigestFromLsTree, PROOF_PATH } from './release-proof-core.mjs';
import { resolveCommit } from './write-build-info.mjs';
import { requiredTierIds } from './release-tiers.mjs';

const SHA40 = /^[0-9a-f]{40}$/;
const kratko = (v) => String(v ?? '').slice(0, 12) || '?';

/**
 * Presuda o IDENTITETU ARTEFAKTA.
 *
 * `blocking` je uvijek pad: ondje se ZNA da je nesto krivo. `conditional` je "ne znam" i pada tek uz
 * tvrd release gate (`LEKTA_REQUIRE_RELEASE_PROOF=1`), jer bi inace svaki build bez razrjesivog
 * commita (klon bez gita) padao na necemu sto nije nalaz o artefaktu.
 *
 * @param raw            sadrzaj `dist/build-info.json`, ili `null` kad datoteke nema
 * @param expectedCommit commit koji se gradi (isti izvor kojim ga je `write-build-info` upisao)
 */
export function buildInfoVerdict({ raw, expectedCommit }) {
  const blocking = [];
  const conditional = [];
  const notes = [];
  if (raw === null || raw === undefined) {
    blocking.push('dist/build-info.json ne postoji (npm run build-info nije prosao?)');
    return { blocking, conditional, notes, commit: null };
  }
  let info = null;
  try {
    info = JSON.parse(String(raw));
  } catch {
    blocking.push('dist/build-info.json nije valjan JSON');
    return { blocking, conditional, notes, commit: null };
  }
  const commit = String(info?.commit ?? '');
  if (!SHA40.test(commit)) {
    blocking.push('dist/build-info.json nema 40-znamenkasti commit');
    return { blocking, conditional, notes, commit: null };
  }
  const expected = String(expectedCommit ?? '').trim();
  if (!SHA40.test(expected)) {
    // Bez razrjesivog commita usporedbe nema. To NIJE prolaz: "ne znam" se imenuje, a uz tvrd gate pada.
    conditional.push(
      'identitet artefakta se ne da provjeriti: commit koji se gradi nije razrjesiv '
        + '(nema valjanog COMMIT_REF ni gita), pa dist/build-info.json nema s cim biti usporedjen',
    );
    return { blocking, conditional, notes, commit };
  }
  if (commit !== expected) {
    blocking.push(
      `dist/build-info.json nosi commit ${kratko(commit)}, a gradi se ${kratko(expected)}: `
        + 'artefakt nema identitet builda (stari build-info u dist/, dist prekopiran iz drugog stabla, '
        + 'ili write-build-info nije ponovno pokrenut nakon promjene koda)',
    );
    return { blocking, conditional, notes, commit };
  }
  notes.push(`identitet artefakta OK: dist/build-info.json = ${kratko(commit)} = commit koji se gradi`);
  return { blocking, conditional, notes, commit };
}

/**
 * Potpunost dokaza IZRACUNATA, ne procitana.
 *
 * Vraca popis obaveznih razina koje u `results[]` nemaju zapisan `pass`. Prazan popis znaci da je
 * dokaz doista potpun, neovisno o tome sto o sebi tvrdi u polju `complete`.
 */
export function missingRequiredFromResults(proof, requiredIds = requiredTierIds()) {
  const results = Array.isArray(proof?.results) ? proof.results : [];
  return requiredIds.filter((id) => !results.some((r) => r && r.id === id && r.status === 'pass'));
}

/** Starost dokaza u danima; bez valjanog `createdAt` je beskonacna, jer svjezinu tada ne mozemo tvrditi. */
export function proofAgeDays(proof, nowMs = Date.now()) {
  const t = Date.parse(String(proof?.createdAt ?? ''));
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((nowMs - t) / 86_400_000);
}

/**
 * Presuda o DOKAZU IZDANJA.
 *
 * Sve tvrdnje se mjere, ne prva pa prekid: dokaz koji je istovremeno nepotpun I zastario treba
 * prijaviti oboje, jer se inace drugi nalaz pojavi tek nakon sto se prvi popravi.
 */
export function releaseProofVerdict({
  exists,
  parseError = false,
  proof = null,
  headDigest = null,
  head = '',
  requiredIds = requiredTierIds(),
  nowMs = Date.now(),
  maxAgeDays = 14,
}) {
  const conditional = [];
  const notes = [];
  const p = (msg) => conditional.push(`dokaz o provjerama: ${msg}`);

  if (!exists) {
    p('docs/generated/RELEASE_PROOF.json ne postoji');
    return { blocking: [], conditional, notes };
  }
  if (parseError || !proof) {
    p('RELEASE_PROOF.json nije valjan JSON');
    return { blocking: [], conditional, notes };
  }

  if (!proof.complete) {
    const missing = Array.isArray(proof.missingRequired) ? proof.missingRequired.join(', ') : '?';
    p(`nije potpun, bez prolaza ostaju: ${missing}`);
  }
  // NEOVISAN IZRACUN, pa i dokaz koji o sebi tvrdi `complete: true` moze pasti ovdje.
  const missing = missingRequiredFromResults(proof, requiredIds);
  if (missing.length) {
    p(
      `obavezne razine bez zapisanog prolaza u results[]: ${missing.join(', ')} `
        + `(dokaz o sebi tvrdi complete=${JSON.stringify(proof.complete)})`,
    );
  }

  const stanje = proofStaleness(proof, headDigest);
  if (stanje.verdict !== 'fresh') {
    // Zastario dokaz je opasniji od nikakvog: izgleda kao potvrda za kod koji nije provjeren.
    // `unknown` (nema otiska, nema `head`, `ls-tree` pao) se namjerno tretira ISTO kao `stale`.
    p(formatStaleness(stanje, proof.commit, head));
  }
  if (proof.dirtyWorkingTree) {
    p('nastao je nad NECISTIM radnim stablom, pa ne pokriva sve sto se gradi');
  }
  const starost = proofAgeDays(proof, nowMs);
  if (starost > maxAgeDays) {
    // STAROST, ODVOJENO OD ZASTARJELOSTI PO COMMITU (audit P0-03).
    //
    // `staleAgainst` hvata promjenu KODA, ali ne i protek VREMENA. Dokaz smije ostati "svjez"
    // po toj mjeri mjesecima ako se izmedju mijenjao samo sam dokaz, a Tier 1 i Tier 2 ovise o
    // stvarima izvan repozitorija: verziji Worda, LibreOfficea, pythona i python-docxa.
    p(
      `star je ${starost} dana (dopusteno ${maxAgeDays}); Tier 1 i Tier 2 ovise o `
        + 'verzijama Worda/LibreOfficea izvan repozitorija, pa stari prolaz ne dokazuje danasnje ponasanje',
    );
  }

  if (!conditional.length) {
    notes.push(formatStaleness(stanje, proof.commit, head));
  }

  // POTPUN DOKAZ NIJE ISTO STO I PUN DOKAZ, i to se ispisuje UVIJEK, i uz OK.
  //
  // `complete` znaci samo da je svaka OBAVEZNA razina prosla. Neobavezna razina (od 2026-09-06
  // `extraction`, jer staging Supabase stoji INACTIVE) ostaje `unavailable`, a dokaz je i dalje
  // "potpun". Bez ovog ispisa bi u dnevniku builda stajalo samo "OK", pa bi ustupak postao
  // nevidljiv tocno ondje gdje se objavljuje.
  const rupe = Array.isArray(proof?.results) ? proof.results.filter((r) => r && r.status !== 'pass') : [];
  if (rupe.length) {
    notes.push(`NIJE IZMJERENO (${rupe.length}), a dokaz se svejedno smatra potpunim:`);
    for (const r of rupe) {
      notes.push(`  ${String(r.id)}: ${String(r.status)}${r.reason ? ` (${r.reason})` : ''} -- ${String(r.label ?? '')}`);
    }
    notes.push('  To su svjesni ustupci, ne prolazi. Razlog i put natrag stoje uz razinu u scripts/release-tiers.mjs.');
  }

  return { blocking: [], conditional, notes };
}

/**
 * Pracene staze s NECOMMITANOM izmjenom, iz ispisa `git status --porcelain --untracked-files=no`.
 *
 * Redci su oblika `XY<razmak><staza>`, uz `stara -> nova` kod preimenovanja i navodnike oko staza s
 * posebnim znakovima. Netrackane (`??`) i ignorirane (`!!`) staze se preskacu, kao i staze koje su
 * izuzete iz otiska stabla; time se mjeri TOCNO ona populacija koju pokriva `treeDigest`, ne siri skup.
 *
 * Vraca `null` kad ispisa nema (git nije uspio, ovo nije git stablo): "ne znam" se imenuje, ne
 * pretvara u "cisto".
 */
export function changedTrackedPaths(porcelainText, excludePaths = [PROOF_PATH]) {
  if (typeof porcelainText !== 'string') return null;
  const excluded = new Set(excludePaths);
  const staze = [];
  for (const raw of porcelainText.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    const oznaka = line.slice(0, 2);
    if (oznaka === '??' || oznaka === '!!') continue;
    const rep = line.slice(3);
    const strelica = rep.indexOf(' -> ');
    const kandidati = strelica >= 0 ? [rep.slice(0, strelica), rep.slice(strelica + 4)] : [rep];
    for (const k of kandidati) {
      const s = k.startsWith('"') && k.endsWith('"') ? k.slice(1, -1) : k;
      if (!s || excluded.has(s)) continue;
      if (!staze.includes(s)) staze.push(s);
    }
  }
  return staze.sort();
}

/**
 * Presuda o STABLU IZ KOJEG SE GRADI (negativni slucaj d2).
 *
 * ZASTO POSTOJI, iako zastarjelost vec ima mjerenje: `treeDigest` se racuna iz `git ls-tree`, dakle iz
 * COMMITANOG stabla. Necommitana izmjena pracene datoteke je u tom pogledu nevidljiva: `vite build` je
 * ugradi u artefakt, a otisak ostane jednak onome u dokazu, pa presuda izadje kao `fresh`. Objavi se
 * kod koji nijedna razina dokaza nije mjerila, uz zeleno na svim ostalim provjerama.
 *
 * Cistocu stabla je do 2026-09-13 mjerio samo `release-check.mjs`, i to u trenutku PECENJA dokaza
 * (`proof.dirtyWorkingTree`). To je druga tvrdnja o drugom trenutku: govori kakvo je stablo bilo dok se
 * dokaz pekao, ne kakvo je dok se gradi. Za Netlify (gradnja iz svjezeg checkouta) razlika je bez
 * ucinka, ali dokumentirani put objave je bas rucna lokalna gradnja iz worktreea.
 *
 * Nalaz je UVJETAN, kao i ostale tvrdnje o dokazu: uz tvrd gate je pad, bez njega upozorenje, jer
 * razvojna gradnja iz necistog stabla je normalna i nije nalaz o objavi.
 *
 * GRANICA KOJU OVO NE MJERI, i to se ne presucuje: netrackane datoteke nisu ni u otisku stabla pa nisu
 * ni ovdje. Tracked modul koji uvozi netrackan modul je zaseban razred i hvata ga `npm run orphan-scan`.
 */
export function workingTreeVerdict({ status, excludePaths = [PROOF_PATH], maxNamed = 5 } = {}) {
  const conditional = [];
  const notes = [];
  const staze = changedTrackedPaths(status, excludePaths);
  if (staze === null) {
    conditional.push(
      'stablo koje se gradi: cistoca NIJE izmjerena (`git status` nije uspio ili ovo nije git stablo), '
        + 'pa se ne zna gradi li se ono sto je ovjereno',
    );
    return { conditional, notes, dirtyPaths: null };
  }
  if (!staze.length) {
    notes.push(`stablo koje se gradi je cisto (nijedna pracena datoteka nema necommitanu izmjenu, uz izuzet ${PROOF_PATH})`);
    return { conditional, notes, dirtyPaths: [] };
  }
  const visak = staze.length > maxNamed ? ` i jos ${staze.length - maxNamed}` : '';
  conditional.push(
    `stablo koje se gradi ima NECOMMITANE izmjene pracenih datoteka (${staze.length}): `
      + `${staze.slice(0, maxNamed).join(', ')}${visak}. Otisak stabla se racuna iz \`git ls-tree\`, dakle iz `
      + 'COMMITANOG stabla, pa te izmjene NE cine dokaz zastarjelim, a u artefakt ulaze: dokaz izdanja tada '
      + 'ne pokriva kod koji se objavljuje.',
  );
  return { conditional, notes, dirtyPaths: staze };
}

/** Git pogledi koje gate treba; injektabilni iskljucivo da bi se lanac mogao mjeriti bez pravog repozitorija. */
export function defaultGit(rootDir) {
  return {
    resolvable(ref) {
      try {
        execSync(`git cat-file -e ${ref}^{commit}`, { cwd: rootDir, stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    },
    head() {
      try {
        return execSync('git rev-parse HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
      } catch {
        return '';
      }
    },
    lsTree(ref) {
      try {
        return execSync(`git ls-tree -r ${ref}`, { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      } catch {
        return null;
      }
    },
    statusPorcelain() {
      try {
        // `--untracked-files=no`: netrackano nije u otisku stabla, pa nije ni ovdje (vidi workingTreeVerdict).
        return execSync('git status --porcelain --untracked-files=no', { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      } catch {
        return null;
      }
    },
    exec(cmd) {
      return execSync(cmd, { cwd: rootDir, encoding: 'utf8' });
    },
  };
}

/**
 * Cijeli gate nad STVARNIM stablom: procita `dist/build-info.json` i `docs/generated/RELEASE_PROOF.json`,
 * razrijesi commit koji se gradi i otisak stabla, pa vrati sto pada, sto je upozorenje i sto se ispisuje.
 *
 * NE ZOVE `process.exit` i nista ne ispisuje: odluku o izlazu donosi pozivatelj.
 */
export function collectReleaseGate({
  rootDir,
  distDir = path.join(rootDir, 'dist'),
  env = process.env,
  nowMs = Date.now(),
  git = defaultGit(rootDir),
  requiredIds = requiredTierIds(),
  treeDigest = null,
  skipArtifactIdentity = false,
} = {}) {
  const required = env.LEKTA_REQUIRE_RELEASE_PROOF === '1';
  const maxAgeDays = Number(env.LEKTA_PROOF_MAX_AGE_DAYS ?? '14');

  // `COMMIT_REF` postavlja Netlify; ako se ne da razrijesiti u ovom klonu, pada se na HEAD; ako ni
  // to ne ide, `head` ostaje prazan i presuda o zastarjelosti je `unknown` (do 2026-09-09 je prazan
  // `head` TIHO PRESKAKAO provjeru).
  let head = String(env.COMMIT_REF || '').trim();
  if (head && !git.resolvable(head)) head = '';
  if (!head) head = git.head();

  // ISTI izvor kojim je `write-build-info.mjs` odlucio sto upisati; time se dvije strane ne mogu raziti.
  const expectedCommit = resolveCommit(env, (cmd) => git.exec(cmd));

  // IDENTITET ARTEFAKTA SE NE MJERI PRIJE NEGO ARTEFAKT POSTOJI.
  //
  // Slucajevi (a) i (b) govore o `dist/`, a `dist/build-info.json` nastaje tek u lancu gradnje
  // (`build-production.mjs`, korak `build-info`). U postupku ciste ovjere (korak 5 u
  // docs/deploy/RELEASE_PROOF_WORKFLOW.md) se poslije proof-only commita provjerava SAMO je li dokaz
  // jos svjez, a artefakta tada jos nema: gate koji ondje bezuvjetno pada na (a) ne mjeri dokaz nego
  // redoslijed, i to porukom koja salje u krivom smjeru ("npm run build-info nije prosao?").
  //
  // Zato SUZENJE, nikad gasenje: `skipArtifactIdentity` iskljucuje TOCNO (a) i (b) i to glasno
  // imenuje u ispisu; presude (c), (d) i (e) ostaju netaknute. Da se ne bi tiho uvuklo u lanac objave,
  // `verify-deploy-dist.mjs` tu zastavicu odbija, a `tests/release-gate-wiring.test.ts` tvrdi da je
  // nijedan potrosac u lancu objave ne prosljedjuje.
  const buildInfoPath = path.join(distDir, 'build-info.json');
  const raw = fs.existsSync(buildInfoPath) ? fs.readFileSync(buildInfoPath, 'utf8') : null;
  const bi = skipArtifactIdentity
    ? {
      blocking: [],
      conditional: [],
      notes: ['identitet artefakta NIJE mjeren (--proof-only): dist/build-info.json nastaje tek u lancu gradnje, a tu tvrdnju daje verify-deploy-dist'],
      commit: null,
    }
    : buildInfoVerdict({ raw, expectedCommit });

  const proofPath = path.join(rootDir, 'docs', 'generated', 'RELEASE_PROOF.json');
  const exists = fs.existsSync(proofPath);
  let proof = null;
  let parseError = false;
  if (exists) {
    try {
      proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
    } catch {
      parseError = true;
    }
  }
  const headDigest = treeDigest !== null ? treeDigest : digestOf(git, head);
  const pv = releaseProofVerdict({
    exists,
    parseError,
    proof,
    headDigest,
    head,
    requiredIds,
    nowMs,
    maxAgeDays,
  });

  // (d2) STABLO IZ KOJEG SE GRADI, a ne samo stablo za koje dokaz tvrdi da ga pokriva.
  //
  // Mjeri se i uz `--proof-only`: suzenje se tice ARTEFAKTA ((a) i (b)), a ovo je tvrdnja o izvoru, pa
  // je u koraku 5 postupka jednako relevantna kao zastarjelost.
  const wt = workingTreeVerdict({
    status: typeof git.statusPorcelain === 'function' ? git.statusPorcelain() : null,
  });

  const conditional = [...bi.conditional, ...pv.conditional, ...wt.conditional];
  return {
    failures: [...bi.blocking, ...pv.blocking, ...(required ? conditional : [])],
    warnings: required ? [] : conditional,
    notes: [...bi.notes, ...pv.notes, ...wt.notes],
    required,
    head,
    expectedCommit,
    buildInfoCommit: bi.commit,
    artifactIdentityMeasured: !skipArtifactIdentity,
    dirtyPaths: wt.dirtyPaths,
  };
}

/**
 * ZAVRSNI REDAK ISPISA, i zasto nije kozmetika.
 *
 * Mek gate (razvojni CI, bez `LEKTA_REQUIRE_RELEASE_PROOF=1`) namjerno ne pada na "ne znam" i na
 * zastarjeli dokaz. To je odluka o STROGOSTI, ne tvrdnja o dokazu. Do 2026-09-13 je ta razlika u
 * ispisu nestajala: skripta bi ispisala upozorenje `ZASTARJELO`, pa kao ZADNJI redak `OK: ... stoje`
 * i izasla s 0. Operater cita zadnji redak i izlazni kod, pa je iz toga zakljucivao da je svjezina
 * potvrdjena, a nije bila ni izmjerena kao pad.
 *
 * `scripts/release-proof-core.mjs` isto pravilo vec ima za pojedinacnu presudu ("`stale` i `unknown`
 * nikad ne sadrze OK"); ovdje vrijedi za zbroj: rijec OK se ne pojavljuje ni u jednom ishodu osim
 * onoga u kojem NEMA nijednog nalaza.
 *
 * @param gate       povratna vrijednost `collectReleaseGate`
 * @param opseg.ok    tvrdnja koja se smije izreci SAMO kad nema nijednog nalaza
 * @param opseg.scope sto je ovaj poziv uopce mjerio (imenuje se i kad se nista ne potvrdjuje)
 */
export function gateSummaryLine(gate, { ok, scope }) {
  const { failures = [], warnings = [], required = false } = gate ?? {};
  if (failures.length) {
    return { level: 'fail', text: `gate izdanja je PAO (nalaza: ${failures.length}): ${scope}.` };
  }
  if (warnings.length) {
    return {
      level: 'unconfirmed',
      text:
        `NIJE POTVRDJENO (nalaza: ${warnings.length}): ${scope}. Gornji nalazi nisu izmjereni kao pad `
        + 'jer je gate MEK (LEKTA_REQUIRE_RELEASE_PROOF nije 1), pa ovo NIJE potvrda dokaza izdanja.',
    };
  }
  return {
    level: 'ok',
    text: `OK: ${ok}${required ? '' : ' (gate je MEK: LEKTA_REQUIRE_RELEASE_PROOF nije 1)'}.`,
  };
}

function digestOf(git, ref) {
  if (!ref) return null;
  const out = git.lsTree(ref);
  if (typeof out !== 'string') return null;
  return treeDigestFromLsTree(out);
}
