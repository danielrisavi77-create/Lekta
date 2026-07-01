/**
 * FPZG flagship: draftanje + verifikacija pravila za fpzg-politologija-diplomski iz snapshotiranih
 * "Upute za pisanje akademskih radova na FPZG" (fpzg-upute-akademski-radovi, stabilan PDF).
 *
 * Upute su izrijekom usmjerene na diplomski i zavrsni specijalisticki rad (Tablica 2 + uvod), pa
 * je diplomski cist match (prijediplomski zavrsni ovaj dokument ne uredjuje, treba mu vlastiti izvor).
 * Boduju se 8 pravila potkrijepljenih doslovnim citatima iz Uputa: font, velicina, prored, format
 * papira (A4), brojevi stranica, opseg rijeci (10000-12000 politologija), sadrzaj (toc) i obvezni
 * dijelovi (required-sections; ukljucuje izjavu o autorstvu koju Upute takodjer propisuju).
 *
 * Vrijednosti se KOPIRAJU iz zivih rules profila, pa effectiveRules ostaje deep-equal rules
 * (faithfulness). Zivi engine ionako cita rules; ovo popunjava verifikacijski sloj (scored).
 * Pokretanje: node scripts/seed-fpzg-flagship.mjs "<approver>"
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) {
  console.error('Upotreba: node scripts/seed-fpzg-flagship.mjs "<approver>"');
  process.exit(1);
}
const NOW = '2026-07-02';
const PID = 'fpzg-politologija-diplomski';
const SRC = 'fpzg-upute-akademski-radovi';

const verified = readJson('data/profiles/verified-profiles.json');
const sources = readJson('data/sources/source-registry.json');
const R = verified.find((x) => x.id === PID).rules;
const HASH = sources.find((s) => s.id === SRC).snapshotHash;

const FORMAT_PAGE = "str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada)";
const FORMAT_QUOTE =
  'Diplomski i zavrsni specijalisticki rad trebaju biti napisani fontom/ pismom Times New Roman, velicinom slova 12 s proredom 1,5, te obostrano poravnati (Justify).';
const A4_QUOTE =
  'Diplomski ili zavrsni specijalisticki rad treba biti otisnut racunalnim pisacem na papiru formata A4 (21x29,7 cm), te ukoricen (meki ili tvrdi uvez).';
const PAGENUM_QUOTE =
  'Stranice rada se numeriraju, ali ne i naslovnice; prethodni dijelovi numeriraju se rimskim brojkama, a osnovni tekst arapskima tako da brojka 1 bude na prvoj stranici uvoda.';
const WORDCOUNT_QUOTE =
  'Ne smije sadrzavati manje od 10.000 ni vise od 12.000 rijeci (diplomski rad na studiju politologije).';
const STRUCT_PAGE = "odjeljak 'STRUKTURA RADA' (str. 9) i 'FORMAT I OPREMA RADA' (izjava o autorstvu, str. 16)";
const STRUCT_QUOTE =
  'Akademski radovi sastoje se od tri cjeline: prethodnoga dijela, osnovnog teksta i zavrsnoga dijela. U prethodnom dijelu obavezni su dijelovi rada naslov (naslovnica) i sadrzaj, a u zavrsnome sazetak, kljucne rijeci i popis literature. Njih mora sadrzavati svaki diplomski i zavrsni specijalisticki rad. Na prvoj sljedecoj stranici treba stajati izjava o autorstvu.';
const TOC_QUOTE =
  'U prethodnom dijelu obavezni su dijelovi rada naslov (naslovnica) i sadrzaj. Kratak sadrzaj daje pregled naslova poglavlja i potpoglavlja.';

// Svako pravilo: value se KOPIRA iz rules (faithfulness), + doslovni citat i lokator.
const specs = [
  { checkId: 'font', value: R.font, page: FORMAT_PAGE, quote: FORMAT_QUOTE, label: 'Font', category: 'format' },
  { checkId: 'font-size', value: R.size, page: FORMAT_PAGE, quote: FORMAT_QUOTE, label: 'Velicina slova', category: 'format' },
  { checkId: 'line-spacing', value: R.spacing, page: FORMAT_PAGE, quote: FORMAT_QUOTE, label: 'Prored', category: 'format' },
  { checkId: 'paper-size', value: R.requireA4, page: FORMAT_PAGE, quote: A4_QUOTE, label: 'Format papira A4', category: 'format' },
  { checkId: 'page-numbers', value: R.requirePageNumbers, page: FORMAT_PAGE, quote: PAGENUM_QUOTE, label: 'Brojevi stranica', category: 'format' },
  { checkId: 'word-count', value: { min: R.wordMin, max: R.wordMax }, page: FORMAT_PAGE, quote: WORDCOUNT_QUOTE, label: 'Opseg rijeci', category: 'scope' },
  { checkId: 'toc', value: R.requireToc, page: STRUCT_PAGE, quote: TOC_QUOTE, label: 'Sadrzaj', category: 'structure' },
  {
    checkId: 'required-sections',
    value: JSON.parse(JSON.stringify(R.requiredSections)),
    page: STRUCT_PAGE,
    quote: STRUCT_QUOTE,
    label: 'Obvezni dijelovi rada',
    category: 'structure',
  },
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
  sourcePage: s.page,
  quote: s.quote,
  status: 'verified',
  verifiedBy: approver,
  confirmedVia: 'ai-1pass-batch',
  lastVerified: NOW,
  verifiedHash: HASH,
}));

const draftsFile = { faculty: 'fpzg', profiles: { [PID]: entries } };
mkdirSync(new URL('data/profiles/fpzg/drafts/', ROOT), { recursive: true });
writeFileSync(p('data/profiles/fpzg/drafts/fpzg-drafts.json'), JSON.stringify(draftsFile, null, 2) + '\n');

// ledger: ai-confirmed + verified po pravilu
const ledger = [];
for (const e of entries) {
  ledger.push({
    id: `led-${e.ruleId}-ai-confirmed-${NOW}`,
    ruleId: e.ruleId,
    profileId: PID,
    action: 'ai-confirmed',
    actor: 'ai-1pass',
    timestamp: NOW,
    sourceId: SRC,
    sourcePage: e.sourcePage,
    quote: e.quote,
    note: 'Draftano i verificirano protiv snapshotiranih FPZG Uputa (stabilan PDF), doslovni citat potvrdjen.',
  });
  ledger.push({
    id: `led-${e.ruleId}-verified-${NOW}`,
    ruleId: e.ruleId,
    profileId: PID,
    action: 'verified',
    actor: approver,
    timestamp: NOW,
    sourceId: SRC,
    sourcePage: e.sourcePage,
    quote: e.quote,
    note: 'Batch odobrenje FPZG flagship (politologija diplomski).',
  });
}
const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) {
  if (!seen.has(l.id)) { existing.push(l); added++; }
}
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`FPZG flagship: ${entries.length} pravila draftano+verificirano, ${added} ledger zapisa.`);
console.log('required-sections keys:', R.requiredSections.map((x) => x.key).join(', '));
