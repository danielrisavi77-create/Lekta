/**
 * FPZG opci akademski rad (seminar/projektni/clanak): bodovanje FORMATA preko OPCE KLAUZULE Uputa.
 *
 * Opce Upute (str. 6) izrijekom kazu da "donose temeljne naputke za izradu SVIH VRSTA akademske
 * proze" te da se "studente svih razina studija upucuju da ih prouce". Seminarski/projektni rad i
 * clanak jesu akademska proza, pa se po opcoj klauzuli (domenska odluka approvera) na njih
 * primjenjuju temeljna formatska pravila (font, velicina, prored, brojevi stranica).
 *
 * NAMJERNO SE NE BODUJE:
 *  - paper-size (A4/uvez): seminar se ne ukoricuje; approver iskljucio.
 *  - toc / required-sections: rules imaju requireToc=false i requiredSections=[] -> nema restrikcije,
 *    ne izmisljamo strukturu za kratke radove.
 *  - word-count: opci profil nema definiran opseg (mentor/kolegij ga zadaje).
 *
 * citation-style za ovaj profil vec je bodovan (seed-fpzg-citation-mes). Vrijednosti se KOPIRAJU iz
 * rules (faithfulness). Merge u fpzg-drafts.json. Pokretanje: node scripts/seed-fpzg-opci-format.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) { console.error('Upotreba: node scripts/seed-fpzg-opci-format.mjs "<approver>"'); process.exit(1); }
const NOW = '2026-07-02';
const UPUTE = 'fpzg-upute-akademski-radovi';
const PID = 'fpzg-opci-akademski-rad';

const CLAUSE = 'Upute donose temeljne naputke za izradu svih vrsta akademske proze; studente svih razina studija upucuju se da ih prouce.';
const FMT_SPEC = 'Diplomski i zavrsni specijalisticki rad trebaju biti napisani fontom/ pismom Times New Roman, velicinom slova 12 s proredom 1,5, te obostrano poravnati (Justify).';
const PG_SPEC = 'Stranice rada se numeriraju, ali ne i naslovnice; prethodni dijelovi rimskim, osnovni tekst arapskim brojkama.';
const FMT_PAGE = 'str. 6 (opca klauzula: svih vrsta proze, sve razine studija) i str. 14 (FORMAT I OPREMA RADA)';

const verified = readJson('data/profiles/verified-profiles.json');
const sources = readJson('data/sources/source-registry.json');
const uputeHash = sources.find((s) => s.id === UPUTE).snapshotHash;

const draftsFile = readJson('data/profiles/fpzg/drafts/fpzg-drafts.json');
draftsFile.profiles = draftsFile.profiles || {};

const mk = (checkId, value, page, quote, category, label) => ({
  ruleId: `${PID}--${checkId}`, checkId, value, category, label,
  machineCheckable: true, authority: 'general', sourceId: UPUTE, sourcePage: page, quote,
  status: 'verified', verifiedBy: approver, confirmedVia: 'ai-1pass-batch', lastVerified: NOW, verifiedHash: uputeHash,
});

const R = verified.find((x) => x.id === PID).rules;
const arr = (draftsFile.profiles[PID] = draftsFile.profiles[PID] || []);
const has = (c) => arr.some((e) => e.checkId === c);

const specs = [
  ['font', R.font, FMT_PAGE, CLAUSE + ' ' + FMT_SPEC, 'format', 'Font'],
  ['font-size', R.size, FMT_PAGE, CLAUSE + ' ' + FMT_SPEC, 'format', 'Velicina slova'],
  ['line-spacing', R.spacing, FMT_PAGE, CLAUSE + ' ' + FMT_SPEC, 'format', 'Prored'],
  ['page-numbers', R.requirePageNumbers, FMT_PAGE, CLAUSE + ' ' + PG_SPEC, 'format', 'Brojevi stranica'],
];

const ledger = [];
let rules = 0;
for (const [cid, val, page, quote, cat, label] of specs) {
  if (val == null || has(cid)) continue;
  const e = mk(cid, val, page, quote, cat, label);
  arr.push(e);
  rules++;
  ledger.push({ id: `led-${e.ruleId}-ai-confirmed-${NOW}`, ruleId: e.ruleId, profileId: PID, action: 'ai-confirmed', actor: 'ai-1pass', timestamp: NOW, sourceId: UPUTE, sourcePage: page, quote, note: 'Format seminara/projektnog/clanka preko opce klauzule Uputa (svih vrsta proze); domenski odobrio approver.' });
  ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: PID, action: 'verified', actor: approver, timestamp: NOW, sourceId: UPUTE, sourcePage: page, quote, note: 'Batch odobrenje opci FPZG rad (format, bez A4/opsega).' });
}

const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) { if (!seen.has(l.id)) { existing.push(l); added++; } }

writeFileSync(p('data/profiles/fpzg/drafts/fpzg-drafts.json'), JSON.stringify(draftsFile, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`Opci FPZG rad: ${rules} pravila, ${added} ledger zapisa.`);
