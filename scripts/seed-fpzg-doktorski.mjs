/**
 * FPZG doktorski: bodovanje fpzg-doktorski-politologija iz snapshotiranog DR.SC.-08
 * ("Upute za oblikovanje doktorskog rada", .doc, stabilan).
 *
 * DR.SC.-08 izrijekom propisuje format: A4, Times New Roman, velicina 12, prored 1,5, margine
 * 2,5 cm (sve strane), numeraciju stranica (od Uvoda, donji desni kut). Boduje se 6 pravila
 * koja dokument nedvosmisleno pokriva; toc i required-sections DR.SC.-08 ne nabraja potpuno pa
 * ostaju advisory (nesourceano). Margine su jedini FPZG scored margin (opce Upute ih ne daju).
 *
 * Vrijednosti se KOPIRAJU iz rules profila (faithfulness). Merge u fpzg-drafts.json.
 * Pokretanje: node scripts/seed-fpzg-doktorski.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) {
  console.error('Upotreba: node scripts/seed-fpzg-doktorski.mjs "<approver>"');
  process.exit(1);
}
const NOW = '2026-07-02';
const PID = 'fpzg-doktorski-politologija';
const SRC = 'fpzg-drsc08-doktorski';

const PAGE = "odjeljak 'Postavke stranice' (DR.SC.-08, Upute za oblikovanje doktorskog rada)";
const FORMAT_QUOTE =
  'Postavke stranice: Font (tip pisma): obavezna potpora svih hrvatskih znakova - Times New Roman. Velicina pisma: 12 tipografskih tocaka. Prored: 1,5 redak.';
const MARGIN_QUOTE = 'Lijeva i desna margina: 2,5 cm. Gornja i donja margina: 2,5 cm. Naslovnica ima drugacije margine.';
const A4_QUOTE = 'Rad treba biti ispisan na papiru formata A4 (210x297).';
const PAGENUM_QUOTE =
  'Stranice trebaju biti numerirane. Broje se sve stranice od Uvoda do kraja rada. Numeracija se pise u donjem desnom kutu.';

const verified = readJson('data/profiles/verified-profiles.json');
const sources = readJson('data/sources/source-registry.json');
const src = sources.find((s) => s.id === SRC);
if (!src || !src.snapshotHash) { console.error(`Izvor ${SRC} nije registriran/snapshotiran; prekid.`); process.exit(1); }
const HASH = src.snapshotHash;
const R = verified.find((x) => x.id === PID).rules;

const specs = [
  { checkId: 'font', value: R.font, quote: FORMAT_QUOTE, label: 'Font', category: 'format' },
  { checkId: 'font-size', value: R.size, quote: FORMAT_QUOTE, label: 'Velicina slova', category: 'format' },
  { checkId: 'line-spacing', value: R.spacing, quote: FORMAT_QUOTE, label: 'Prored', category: 'format' },
  { checkId: 'margins', value: R.margins, quote: MARGIN_QUOTE, label: 'Margine', category: 'format' },
  { checkId: 'paper-size', value: R.requireA4, quote: A4_QUOTE, label: 'Format papira A4', category: 'format' },
  { checkId: 'page-numbers', value: R.requirePageNumbers, quote: PAGENUM_QUOTE, label: 'Brojevi stranica', category: 'format' },
];

const entries = specs.map((s) => ({
  ruleId: `${PID}--${s.checkId}`,
  checkId: s.checkId,
  value: s.value,
  category: s.category,
  label: s.label,
  machineCheckable: true,
  authority: 'general',
  sourceId: SRC,
  sourcePage: PAGE,
  quote: s.quote,
  status: 'verified',
  verifiedBy: approver,
  confirmedVia: 'ai-1pass-batch',
  lastVerified: NOW,
  verifiedHash: HASH,
}));

const draftsFile = readJson('data/profiles/fpzg/drafts/fpzg-drafts.json');
draftsFile.profiles = draftsFile.profiles || {};
if (draftsFile.profiles[PID]) { console.error(`${PID} vec ima draftove; prekid.`); process.exit(1); }
draftsFile.profiles[PID] = entries;

const ledger = [];
for (const e of entries) {
  ledger.push({ id: `led-${e.ruleId}-ai-confirmed-${NOW}`, ruleId: e.ruleId, profileId: PID, action: 'ai-confirmed', actor: 'ai-1pass', timestamp: NOW, sourceId: SRC, sourcePage: PAGE, quote: e.quote, note: 'Doktorski format verificiran protiv snapshotiranog DR.SC.-08 (.doc), doslovni citat.' });
  ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: PID, action: 'verified', actor: approver, timestamp: NOW, sourceId: SRC, sourcePage: PAGE, quote: e.quote, note: 'Batch odobrenje FPZG doktorski (DR.SC.-08).' });
}
const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) { if (!seen.has(l.id)) { existing.push(l); added++; } }

writeFileSync(p('data/profiles/fpzg/drafts/fpzg-drafts.json'), JSON.stringify(draftsFile, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`FPZG doktorski: ${entries.length} pravila (uklj. margine), ${added} ledger zapisa.`);
