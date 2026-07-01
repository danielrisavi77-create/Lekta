/**
 * FPZG batch: bodovanje diplomskih i specijalistickih profila iz istih snapshotiranih Uputa
 * (fpzg-upute-akademski-radovi). Nastavak na flagship (politologija-diplomski).
 *
 * Upute izrijekom uredjuju diplomski i zavrsni specijalisticki rad. Ovi profili dijele isti
 * format/strukturu (font/velicina/prored/A4/brojevi stranica/sadrzaj/required-sections), a
 * razlikuju se po opsegu rijeci (Upute daju izrijekom po studiju). Word-count se boduje samo
 * ako se profilov wordMin/max poklapa s Upute-navedenom vrijednoscu (inace se preskace).
 *
 * Vrijednosti se KOPIRAJU iz zivih rules profila -> effectiveRules deep-equal rules (faithfulness).
 * Merge u postojeci data/profiles/fpzg/drafts/fpzg-drafts.json (dodaje profile, ne dira flagship).
 * Pokretanje: node scripts/seed-fpzg-batch.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) {
  console.error('Upotreba: node scripts/seed-fpzg-batch.mjs "<approver>"');
  process.exit(1);
}
const NOW = '2026-07-02';
const SRC = 'fpzg-upute-akademski-radovi';

// Diplomski i specijalisticki profili koje Upute izrijekom pokrivaju.
const BATCH = [
  'fpzg-nacionalna-sigurnost-diplomski',
  'fpzg-novinarstvo-diplomski',
  'fpzg-specijalisticki-odnosi-s-javnoscu',
  'fpzg-specijalisticki-prilagodba-eu',
  'fpzg-specijalisticki-sigurnosna-politika-rh',
  'fpzg-specijalisticki-vanjska-politika-diplomacija',
];

const FORMAT_PAGE = "str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada)";
const FORMAT_QUOTE =
  'Diplomski i zavrsni specijalisticki rad trebaju biti napisani fontom/ pismom Times New Roman, velicinom slova 12 s proredom 1,5, te obostrano poravnati (Justify).';
const A4_QUOTE =
  'Diplomski ili zavrsni specijalisticki rad treba biti otisnut racunalnim pisacem na papiru formata A4 (21x29,7 cm), te ukoricen (meki ili tvrdi uvez).';
const PAGENUM_QUOTE =
  'Stranice rada se numeriraju, ali ne i naslovnice; prethodni dijelovi numeriraju se rimskim brojkama, a osnovni tekst arapskima tako da brojka 1 bude na prvoj stranici uvoda.';
const STRUCT_PAGE = "odjeljak 'STRUKTURA RADA' (str. 9) i 'FORMAT I OPREMA RADA' (izjava o autorstvu, str. 16)";
const STRUCT_QUOTE =
  'Akademski radovi sastoje se od tri cjeline: prethodnoga dijela, osnovnog teksta i zavrsnoga dijela. U prethodnom dijelu obavezni su dijelovi rada naslov (naslovnica) i sadrzaj, a u zavrsnome sazetak, kljucne rijeci i popis literature. Njih mora sadrzavati svaki diplomski i zavrsni specijalisticki rad. Na prvoj sljedecoj stranici treba stajati izjava o autorstvu.';
const TOC_QUOTE =
  'U prethodnom dijelu obavezni su dijelovi rada naslov (naslovnica) i sadrzaj. Kratak sadrzaj daje pregled naslova poglavlja i potpoglavlja.';

// Word-count: Upute daju izrijekom po studiju. Kljuc "min-max" -> doslovni citat.
const WORDCOUNT_BY_RANGE = {
  '10000-12000': 'Ne smije sadrzavati manje od 10.000 ni vise od 12.000 rijeci (diplomski rad na studiju politologije).',
  '12000-15000': 'Ne smije sadrzavati manje od 12.000 ni vise od 15.000 rijeci (diplomski rad na studiju novinarstva).',
  '8000-12000': 'Ne smije sadrzavati manje od 8.000 ni vise od 12.000 rijeci (zavrsni specijalisticki rad).',
};

const verified = readJson('data/profiles/verified-profiles.json');
const sources = readJson('data/sources/source-registry.json');
const HASH = sources.find((s) => s.id === SRC).snapshotHash;

const draftsFile = readJson('data/profiles/fpzg/drafts/fpzg-drafts.json');
draftsFile.profiles = draftsFile.profiles || {};

const ledger = [];
let profilesDone = 0;
let rulesDone = 0;

for (const pid of BATCH) {
  const prof = verified.find((x) => x.id === pid);
  if (!prof) { console.error(`Nema profila ${pid}.`); continue; }
  if (draftsFile.profiles[pid]) { console.error(`Profil ${pid} vec ima draftove; preskacem.`); continue; }
  const R = prof.rules;

  const specs = [
    { checkId: 'font', value: R.font, page: FORMAT_PAGE, quote: FORMAT_QUOTE, label: 'Font', category: 'format' },
    { checkId: 'font-size', value: R.size, page: FORMAT_PAGE, quote: FORMAT_QUOTE, label: 'Velicina slova', category: 'format' },
    { checkId: 'line-spacing', value: R.spacing, page: FORMAT_PAGE, quote: FORMAT_QUOTE, label: 'Prored', category: 'format' },
    { checkId: 'paper-size', value: R.requireA4, page: FORMAT_PAGE, quote: A4_QUOTE, label: 'Format papira A4', category: 'format' },
    { checkId: 'page-numbers', value: R.requirePageNumbers, page: FORMAT_PAGE, quote: PAGENUM_QUOTE, label: 'Brojevi stranica', category: 'format' },
    { checkId: 'toc', value: R.requireToc, page: STRUCT_PAGE, quote: TOC_QUOTE, label: 'Sadrzaj', category: 'structure' },
    { checkId: 'required-sections', value: JSON.parse(JSON.stringify(R.requiredSections)), page: STRUCT_PAGE, quote: STRUCT_QUOTE, label: 'Obvezni dijelovi rada', category: 'structure' },
  ];
  // word-count samo ako se opseg poklapa s Upute-navedenim
  const range = `${R.wordMin}-${R.wordMax}`;
  const wcQuote = WORDCOUNT_BY_RANGE[range];
  if (R.wordMin != null && R.wordMax != null && wcQuote) {
    specs.push({ checkId: 'word-count', value: { min: R.wordMin, max: R.wordMax }, page: FORMAT_PAGE, quote: wcQuote, label: 'Opseg rijeci', category: 'scope' });
  } else {
    console.error(`  ${pid}: opseg ${range} nije u Uputama, word-count preskocen (ostaje advisory).`);
  }

  const entries = specs.map((s) => ({
    ruleId: `${pid}--${s.checkId}`,
    checkId: s.checkId,
    value: s.value,
    category: s.category,
    label: s.label,
    machineCheckable: true,
    authority: 'general',
    sourceId: SRC,
    sourcePage: s.page,
    quote: s.quote,
    status: 'verified',
    verifiedBy: approver,
    confirmedVia: 'ai-1pass-batch',
    lastVerified: NOW,
    verifiedHash: HASH,
  }));
  draftsFile.profiles[pid] = entries;
  rulesDone += entries.length;
  profilesDone++;

  for (const e of entries) {
    ledger.push({
      id: `led-${e.ruleId}-ai-confirmed-${NOW}`, ruleId: e.ruleId, profileId: pid,
      action: 'ai-confirmed', actor: 'ai-1pass', timestamp: NOW,
      sourceId: SRC, sourcePage: e.sourcePage, quote: e.quote,
      note: 'FPZG batch (diplomski/specijalisticki): verificirano protiv snapshotiranih Uputa, doslovni citat.',
    });
    ledger.push({
      id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pid,
      action: 'verified', actor: approver, timestamp: NOW,
      sourceId: SRC, sourcePage: e.sourcePage, quote: e.quote,
      note: 'Batch odobrenje FPZG diplomski/specijalisticki.',
    });
  }
}

const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) { if (!seen.has(l.id)) { existing.push(l); added++; } }

writeFileSync(p('data/profiles/fpzg/drafts/fpzg-drafts.json'), JSON.stringify(draftsFile, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`FPZG batch: ${profilesDone} profila, ${rulesDone} pravila, ${added} ledger zapisa.`);
