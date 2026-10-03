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
import { FINGERPRINT_VERSION, attestationContentDigest, attestationRefusals, corpusFingerprintV2, inheritedSignature, sourceKindRefusals } from './lib/corpus-attestation-core.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairSourceHashAtCommit } from './lib/repair-source-hash.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Putanje se mogu preusmjeriti SAMO za test kroz stvarnu skriptu (T83-06): tests/real-corpus-dedupe.test.ts
// je pokrece nad privremenim datotekama, da ne dira gitignorirano mjerenje ni commitanu ovjeru.
const ULAZ = process.env.LEKTA_ATTEST_INPUT || path.join(ROOT, 'docs', 'generated', 'repair-real-corpus.local.json');
const args = process.argv.slice(2);
// VRSTA IZVORA JE OBVEZNA (Codex #225, nalaz 1). Artefakt mjerenja ne zna iz kojeg je korijena korpusa
// dosao (harness spaja vise korijena), pa je vrsta izricit ulaz ovjere: bez `--source-kind` skripta ODBIJA
// pisati, umjesto da ovjera bez polja tiho znaci izvorni DOCX. `public-pdf-converted` (javni rad pretvoren
// iz PDF-a) nikad ne ide u datoteku prave ovjere; pise se u zasebnu PDF ovjeru (razina A-pdf).
const VRSTE_IZVORA = ['source-docx', 'public-pdf-converted'];
const vrstaIzvora = (() => {
  const i = args.indexOf('--source-kind');
  return i >= 0 ? args[i + 1] : null;
})();
if (!VRSTE_IZVORA.includes(vrstaIzvora)) {
  console.error(`[ovjera] FAIL: obavezno --source-kind ${VRSTE_IZVORA.join('|')} (dobiveno: ${String(vrstaIzvora)}).`);
  process.exit(1);
}
const pdfIzvor = vrstaIzvora === 'public-pdf-converted';
const IZLAZ = process.env.LEKTA_ATTEST_OUTPUT
  || path.join(ROOT, 'data', 'verification', pdfIzvor ? 'pdf-corpus-attestation.json' : 'real-corpus-attestation.json');
if (pdfIzvor && path.basename(IZLAZ) === 'real-corpus-attestation.json') {
  console.error('[ovjera] FAIL: ovjera nad radovima pretvorenim iz PDF-a ne smije u datoteku prave ovjere.');
  process.exit(1);
}

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
// T06 (protokol 2.4): verzija Worda u kojem je izlaz vizualno provjeren (COM `Application.Version`,
// danas 14.0). Nije izmisljena: bez zastavice ostaje `null`, a `null` u ovjeri znaci "nije provjereno u
// Wordu", ne "provjereno u nepoznatoj verziji".
const wordVersion = (() => {
  const i = args.indexOf('--word-version');
  return i >= 0 ? String(args[i + 1]) : null;
})();
// T06 (protokol 2.2): izdvojeni skup (`holdout`) se MJERI, ali u dokaz razine A ulazi tek kad vlasnik potvrdi
// zavrsnu provjeru, i to izricito. Bez zastavice ti dokumenti ne ulaze ni u `documentCount` ni u `cleanCount`
// skupine, pa dokaz stoji samo na dokumentima na kojima se ocekivanja nisu dotjerivala.
const holdoutConfirmed = args.includes('--holdout-confirmed');

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
// T83: mjerenje s dvostrukim documentId (napuhani brojevi po skupini), s padom isporuke ili s
// ostecenim paketom ne ovjerava se (scripts/lib/corpus-attestation-core.mjs, attestationRefusals).
// Vrsta izvora mora vrijediti za SVAKI rezultat (sidecar corpus-ingest --source-kind): PDF ovjera ne prima
// rezultat bez PDF sidecara, a ovjera izvornog DOCX-a ne prima rad pretvoren iz PDF-a.
const odbijeno = [...attestationRefusals(rezultati), ...sourceKindRefusals(rezultati, vrstaIzvora)];
if (odbijeno.length) {
  for (const razlog of odbijeno) console.error(`[ovjera] FAIL: ${razlog}.`);
  process.exit(1);
}

// Otisak SKUPA, ne sadrzaja: imena dokumenata i njihov broj. Mijenja se kad se korpus mijenja, pa
// ovjera prestaje odgovarati stanju i to se vidi. Verzija 2 (T83): nad jedinstvenim id-ovima i s
// oznakom verzije, vidi scripts/lib/corpus-attestation-core.mjs.
const otisak = corpusFingerprintV2(rezultati.map((r) => r.documentId));
// Koliko je kopija harness izbacio prije mjerenja; povijest ostaje citljiva uz ovjere prije T83.
const izbaceno = Number.isInteger(mjerenje.scope?.duplicateDocumentCount) ? mjerenje.scope.duplicateDocumentCount : 0;
// T75: otisak koda popravka NAD KOJIM JE MJERENO, iz git objekata commita mjerenja (T74 modul). Ovjera se
// pise u commitu nakon mjerenja, pa otisak s diska (HEAD) ne bi opisivao mjereni kod. Bez otiska nema ovjere.
let otisakKoda;
try {
  otisakKoda = repairSourceHashAtCommit(mjerenje.generatedFromCommit, ROOT).hash;
} catch (e) {
  console.error(`[ovjera] FAIL: otisak koda popravka za commit mjerenja ${mjerenje.generatedFromCommit} nije izracunljiv: ${e.message}`);
  process.exit(1);
}

// Registar daje jedinicu i vrste rada za svaki profil; sidecar dokumenta nosi samo `profileId`.
const registar = new Map(
  JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'profiles', 'verified-profiles.json'), 'utf8'))
    .map((p) => [p.id, { unitId: p.unitId ?? null, workTypes: Array.isArray(p.workTypes) ? p.workTypes : [] }]),
);

// Agregacija po JEDINICA x VRSTA RADA (odluka vlasnika 2026-09-05). Dokument mjeren nad profilom s
// vise vrsta rada (9 od 407) ulazi u svaku od njih, jer je profil tako i definiran.
const poSkupini = new Map();
let bezJedinice = 0;
let izdvojeno = 0;
let neovisnoPotvrdjeno = 0;
// T83-07: koliko je JEDINSTVENIH dokumenata uslo u bar jednu skupinu. Zbroj `documentCount` po skupinama
// nije jednak tom broju (dokument profila s vise vrsta rada ulazi u svaku), pa se broj pise izricito.
let uracunato = 0;
for (const r of rezultati) {
  if (r.expectationProvenance === 'independent') neovisnoPotvrdjeno += 1;
  if (r.holdout === true && !holdoutConfirmed) { izdvojeno += 1; continue; }
  const p = registar.get(r.profileId);
  if (!p || !p.unitId) { bezJedinice += 1; continue; }
  uracunato += 1;
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
if (izdvojeno) console.warn(`[ovjera] ${izdvojeno} dokumenata u izdvojenom skupu NE ulazi u dokaz (dodaj --holdout-confirmed nakon zavrsne provjere).`);

const commit = (() => {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
})();
if (mjerenje.generatedFromCommit !== commit) {
  console.warn(`[ovjera] UPOZORENJE: mjereno nad ${mjerenje.generatedFromCommit.slice(0, 8)}, HEAD je ${String(commit).slice(0, 8)}; ovjera nosi commit MJERENJA.`);
}

const postojeca = fs.existsSync(IZLAZ) ? JSON.parse(fs.readFileSync(IZLAZ, 'utf8')) : null;
const sadrzaj = {
  schemaVersion: 1,
  fingerprintVersion: FINGERPRINT_VERSION,
  sourceKind: vrstaIzvora,
  corpusFingerprint: otisak,
  measuredAt: mjerenje.generatedAt,
  measuredFromCommit: mjerenje.generatedFromCommit,
  repairSourceHash: otisakKoda,
  oracles: ['scripts/repair-real-corpus.mts (harness + detectPassRegressions)'],
  // T06: okolina i protokol mjerenja, da se zakljucak moze vezati uz verziju alata i uz nacin nastanka ocekivanja.
  environment: { wordVersion },
  protocol: {
    holdoutExcluded: !holdoutConfirmed,
    holdoutDocumentCount: rezultati.filter((r) => r.holdout === true).length,
    independentlyConfirmedCount: neovisnoPotvrdjeno,
    derivedExpectationCount: rezultati.length - neovisnoPotvrdjeno,
    // T83: ovjera je provjerila da nijedan dokument nije brojan dvaput (gore se inace prekida).
    duplicateDocumentCount: 0,
    uniqueDocumentCount: rezultati.length,
    rawDocumentCount: rezultati.length + izbaceno,
    countedDocumentCount: uracunato,
  },
  entries: [...poSkupini.values()]
    .map((e) => ({ ...e, profileIds: [...e.profileIds].sort(), regressedChecks: [...e.regressedChecks].sort() }))
    .sort((a, b) => (a.unitId + a.workType).localeCompare(b.unitId + b.workType)),
};
// Potpis pokriva kanonski otisak SADRZAJA ovjere; novi potpis ga zapisuje, a postojeci se prenosi samo
// kad je sadrzaj bajt po bajt isti (isto mjerenje, isti opseg holdouta, iste brojke), vidi T83-05.
const otisakSadrzaja = attestationContentDigest(sadrzaj);
const naslijedjen = potpis ? null : inheritedSignature(postojeca, sadrzaj);
const ovjera = {
  ...sadrzaj,
  signedBy: potpis ?? naslijedjen?.signedBy ?? null,
  signedAt: potpis ? new Date().toISOString() : naslijedjen?.signedAt ?? null,
  signatureNote: biljeska ?? naslijedjen?.signatureNote ?? null,
  signedContentDigest: potpis ? otisakSadrzaja : naslijedjen?.signedContentDigest ?? null,
};

fs.mkdirSync(path.dirname(IZLAZ), { recursive: true });
fs.writeFileSync(IZLAZ, `${JSON.stringify(ovjera, null, 2)}\n`);
const dokazivi = ovjera.entries.filter((e) => e.cleanCount > 0 && e.regressedChecks.length === 0).length;
console.log(`[ovjera] ${IZLAZ}`);
console.log(`  skupina (jedinica x vrsta) mjereno: ${ovjera.entries.length} | s cistim dokazom: ${dokazivi} | potpis: ${ovjera.signedBy ?? 'NEMA (ljestvica je ne priznaje)'}`);
