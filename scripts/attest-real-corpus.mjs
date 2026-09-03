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

const poProfilu = new Map();
for (const r of rezultati) {
  const kljuc = `${r.profileId}::${r.workType ?? 'unknown'}`;
  if (!poProfilu.has(kljuc)) {
    poProfilu.set(kljuc, { profileId: r.profileId, workType: r.workType ?? 'unknown', documentCount: 0, cleanCount: 0, regressedChecks: new Set() });
  }
  const e = poProfilu.get(kljuc);
  e.documentCount += 1;
  const regresije = (r.statusChanges ?? []).filter((s) => /:pass->(warn|fail)$/.test(s));
  for (const s of regresije) e.regressedChecks.add(s.split(':')[0]);
  if (r.outcome !== 'fail' && regresije.length === 0 && !r.integrityFailure) e.cleanCount += 1;
}

const commit = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
})();

const postojeca = fs.existsSync(IZLAZ) ? JSON.parse(fs.readFileSync(IZLAZ, 'utf8')) : null;
const ovjera = {
  schemaVersion: 1,
  corpusFingerprint: otisak,
  measuredAt: new Date().toISOString(),
  measuredFromCommit: commit,
  oracles: ['scripts/repair-real-corpus.mts (harness + detectPassRegressions)'],
  // Potpis se NE nasljedjuje kad se korpus promijeni: tada je rijec o drugom mjerenju.
  signedBy: potpis ?? (postojeca && postojeca.corpusFingerprint === otisak ? postojeca.signedBy : null),
  signedAt: potpis ? new Date().toISOString() : (postojeca && postojeca.corpusFingerprint === otisak ? postojeca.signedAt : null),
  signatureNote: biljeska ?? (postojeca && postojeca.corpusFingerprint === otisak ? postojeca.signatureNote ?? null : null),
  entries: [...poProfilu.values()]
    .map((e) => ({ ...e, regressedChecks: [...e.regressedChecks].sort() }))
    .sort((a, b) => (a.profileId + a.workType).localeCompare(b.profileId + b.workType)),
};

fs.mkdirSync(path.dirname(IZLAZ), { recursive: true });
fs.writeFileSync(IZLAZ, `${JSON.stringify(ovjera, null, 2)}\n`);
const dokazivi = ovjera.entries.filter((e) => e.cleanCount > 0 && e.regressedChecks.length === 0).length;
console.log(`[ovjera] ${IZLAZ}`);
console.log(`  profila mjereno: ${ovjera.entries.length} | s cistim dokazom: ${dokazivi} | potpis: ${ovjera.signedBy ?? 'NEMA (ljestvica je ne priznaje)'}`);
