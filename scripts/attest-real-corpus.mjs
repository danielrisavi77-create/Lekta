// scripts/attest-real-corpus.mjs
//
// Pretvara LOKALNO mjerenje nad stvarnim radovima u ovjeru koja se smije commitati.
//
// Ulaz je `docs/generated/repair-real-corpus.local.json`, koji je gitignoriran jer nastaje nad tudjim
// studentskim radovima. Izlaz je `data/verification/real-corpus-attestation.json`, koji nosi SAMO
// brojke, imena provjera i otisak skupa; nijedan naziv datoteke, nijedan sadrzaj.
//
// SKRIPTA NE POTPISUJE. Potpis je ljudska radnja i unosi se s `--sign "Ime"`; bez njega ovjera
// postoji ali ljestvica je ne priznaje. Time se ne moze dogoditi da razina dokaza poraste zato sto
// je netko pokrenuo skriptu.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ULAZ = path.join(ROOT, 'docs', 'generated', 'repair-real-corpus.local.json');
const IZLAZ = path.join(ROOT, 'data', 'verification', 'real-corpus-attestation.json');

const args = process.argv.slice(2);
const potpis = (() => {
  const i = args.indexOf('--sign');
  return i >= 0 ? args[i + 1] : null;
})();
// Biljeska uz potpis. Postoji zato sto potpis moze biti unesen po necijoj UPUTI, a ne vlastitom
// rukom; tko poslije cita mora vidjeti razliku, inace potpis tvrdi vise nego sto se dogodilo.
const biljeska = (() => {
  const i = args.indexOf('--note');
  return i >= 0 ? args[i + 1] : null;
})();

if (!fs.existsSync(ULAZ)) {
  console.error(`[ovjera] FAIL: nema ${ULAZ}. Pokreni mjerenje s LEKTA_LOCAL_CORPUS=1.`);
  process.exit(1);
}
const mjerenje = JSON.parse(fs.readFileSync(ULAZ, 'utf8'));
const rezultati = mjerenje.results ?? [];
// VRIJEME I COMMIT MJERENJA SE CITAJU, NE IZMISLJAJU. Do 2026-09-05 je ovdje stajalo `new Date()`, pa
// je `measuredAt` bio trenutak pisanja ovjere; potpis se uz to nasljedjivao, a gard "potpis stariji od
// mjerenja" (real-corpus-attestation.ts) usporedjivao je dva vremena od kojih nijedno nije bilo mjerenje.
// Artefakt bez provenijencije se odbija: ovjera koja ne zna kad je mjereno nije ovjera.
if (typeof mjerenje.generatedAt !== 'string' || typeof mjerenje.generatedFromCommit !== 'string') {
  console.error('[ovjera] FAIL: artefakt mjerenja nema `generatedAt`/`generatedFromCommit`; ponovi mjerenje (LEKTA_LOCAL_CORPUS=1 vite-node scripts/repair-real-corpus.mts).');
  process.exit(1);
}
if (rezultati.length === 0) {
  console.error('[ovjera] FAIL: mjerenje nema nijedan rezultat; prazan skup nije ovjera.');
  process.exit(1);
}

// Otisak SKUPA, ne sadrzaja: imena dokumenata i njihov broj. Mijenja se kad se korpus mijenja, pa
// ovjera prestaje odgovarati stanju i to se vidi.
const otisak = crypto.createHash('sha256')
  .update(rezultati.map((r) => r.documentId).sort().join('\n'))
  .digest('hex')
  .slice(0, 32);

// Registar daje jedinicu i vrste rada za svaki profil; sidecar dokumenta nosi samo `profileId`.
const registar = new Map(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'profiles', 'verified-profiles.json'), 'utf8'))
    .map((p) => [p.id, { unitId: p.unitId ?? null, workTypes: Array.isArray(p.workTypes) ? p.workTypes : [] }]),
);

// Agregacija po JEDINICA x VRSTA RADA (odluka vlasnika 2026-09-05). Dokument mjeren nad profilom s
// vise vrsta rada (9 od 407) ulazi u svaku od njih, jer je profil tako i definiran.
const poSkupini = new Map();
let bezJedinice = 0;
for (const r of rezultati) {
  const p = registar.get(r.profileId);
  if (!p || !p.unitId) { bezJedinice += 1; continue; }
  const vrste = p.workTypes.length ? p.workTypes : ['unknown'];
  for (const wt of vrste) {
    const kljuc = `${p.unitId}::${wt}`;
    if (!poSkupini.has(kljuc)) {
      poSkupini.set(kljuc, { unitId: p.unitId, workType: wt, profileIds: new Set(), documentCount: 0, cleanCount: 0, regressedChecks: new Set() });
    }
    const e = poSkupini.get(kljuc);
    e.profileIds.add(r.profileId);
    e.documentCount += 1;
    const regresije = (r.statusChanges ?? []).filter((s) => /:pass->(warn|fail)$/.test(s));
    for (const s of regresije) e.regressedChecks.add(s.split(':')[0]);
    if (r.outcome !== 'fail' && regresije.length === 0 && !r.integrityFailure) e.cleanCount += 1;
  }
}
if (bezJedinice) console.warn(`[ovjera] ${bezJedinice} dokumenata preskoceno: profil nema jedinicu u registru.`);

const commit = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
})();
if (mjerenje.generatedFromCommit !== commit) {
  console.warn(`[ovjera] UPOZORENJE: mjereno nad ${mjerenje.generatedFromCommit.slice(0, 8)}, HEAD je ${String(commit).slice(0, 8)}; ovjera nosi commit MJERENJA.`);
}

const postojeca = fs.existsSync(IZLAZ) ? JSON.parse(fs.readFileSync(IZLAZ, 'utf8')) : null;
const ovjera = {
  schemaVersion: 1,
  corpusFingerprint: otisak,
  measuredAt: mjerenje.generatedAt,
  measuredFromCommit: mjerenje.generatedFromCommit,
  oracles: ['scripts/repair-real-corpus.mts (harness + detectPassRegressions)'],
  // Potpis se NE nasljedjuje kad se korpus promijeni: tada je rijec o drugom mjerenju.
  signedBy: potpis ?? (postojeca && postojeca.corpusFingerprint === otisak ? postojeca.signedBy : null),
  signedAt: potpis ? new Date().toISOString() : (postojeca && postojeca.corpusFingerprint === otisak ? postojeca.signedAt : null),
  signatureNote: biljeska ?? (postojeca && postojeca.corpusFingerprint === otisak ? postojeca.signatureNote ?? null : null),
  entries: [...poSkupini.values()]
    .map((e) => ({ ...e, profileIds: [...e.profileIds].sort(), regressedChecks: [...e.regressedChecks].sort() }))
    .sort((a, b) => (a.unitId + a.workType).localeCompare(b.unitId + b.workType)),
};

fs.mkdirSync(path.dirname(IZLAZ), { recursive: true });
fs.writeFileSync(IZLAZ, `${JSON.stringify(ovjera, null, 2)}\n`);
const dokazivi = ovjera.entries.filter((e) => e.cleanCount > 0 && e.regressedChecks.length === 0).length;
console.log(`[ovjera] ${IZLAZ}`);
console.log(`  skupina (jedinica x vrsta) mjereno: ${ovjera.entries.length} | s cistim dokazom: ${dokazivi} | potpis: ${ovjera.signedBy ?? 'NEMA (ljestvica je ne priznaje)'}`);
