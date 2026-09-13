// scripts/release-gate-core.mjs
//
// NEGATIVNI SLUCAJEVI KOJI MORAJU ZAUSTAVITI OBJAVU (plan T19), na jednom mjestu i bez `process.exit`.
//
// Pet stanja od kojih svako znaci da objavljeni artefakt ne odgovara onome sto je dokazano:
//
//   (a) `dist/build-info.json` ne postoji, nije JSON ili nema 40-znamenkasti commit
//   (b) `dist/build-info.json` nosi DRUGI commit od onoga koji se gradi (identitet artefakta)
//   (c) dokaz izdanja je `stale` ili `unknown` prema otisku stabla
//   (d) praceni izvor se promijenio nakon ovjere (isto mjerenje kao (c): otisak stabla se razisao)
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
import { proofStaleness, formatStaleness, treeDigestFromLsTree } from './release-proof-core.mjs';
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

  const buildInfoPath = path.join(distDir, 'build-info.json');
  const raw = fs.existsSync(buildInfoPath) ? fs.readFileSync(buildInfoPath, 'utf8') : null;
  const bi = buildInfoVerdict({ raw, expectedCommit });

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

  const conditional = [...bi.conditional, ...pv.conditional];
  return {
    failures: [...bi.blocking, ...pv.blocking, ...(required ? conditional : [])],
    warnings: required ? [] : conditional,
    notes: [...bi.notes, ...pv.notes],
    required,
    head,
    expectedCommit,
    buildInfoCommit: bi.commit,
  };
}

function digestOf(git, ref) {
  if (!ref) return null;
  const out = git.lsTree(ref);
  if (typeof out !== 'string') return null;
  return treeDigestFromLsTree(out);
}
