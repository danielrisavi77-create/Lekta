/**
 * FPZG dovrsavanje: (1) citation-style za sve FPZG profile iz Pravila navodenja (autor-godina),
 * (2) MES format/struktura iz Uputa (diplomski rad, bez word-count), (3) opci + prijediplomski
 * dobivaju samo citation-style (format/opseg im opce Upute ne pokrivaju izrijekom -> ostaje advisory).
 *
 * Pravila navodenja su FPZG-wide ("na Fakultetu politickih znanosti"), pa citation-style=fpzg
 * vrijedi za sve profile. Vrijednosti se KOPIRAJU iz rules (faithfulness). Merge u fpzg-drafts.json.
 * Pokretanje: node scripts/seed-fpzg-citation-mes.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) { console.error('Upotreba: node scripts/seed-fpzg-citation-mes.mjs "<approver>"'); process.exit(1); }
const NOW = '2026-07-02';
const CIT_SRC = 'fpzg-pravila-navodenja-citiranja';
const UPUTE_SRC = 'fpzg-upute-akademski-radovi';

const CIT_PAGE = 'str. 1, naslov i primjeri unutartekstnih citatnica';
const CIT_QUOTE =
  'Pravila navodenja bibliografskih jedinica i citatnica na Fakultetu politickih znanosti. Unutartekstna citatnica navodi se u obliku (prezime, godina), npr. (Becker, 2007), (Petak, 2001).';

// Upute quote-ovi (isti kao batch) za MES format/strukturu.
const FORMAT_PAGE = "str. 14, odjeljak 'FORMAT I OPREMA RADA' (Format rada)";
const FORMAT_QUOTE = 'Diplomski i zavrsni specijalisticki rad trebaju biti napisani fontom/ pismom Times New Roman, velicinom slova 12 s proredom 1,5, te obostrano poravnati (Justify).';
const A4_QUOTE = 'Diplomski ili zavrsni specijalisticki rad treba biti otisnut racunalnim pisacem na papiru formata A4 (21x29,7 cm), te ukoricen (meki ili tvrdi uvez).';
const PAGENUM_QUOTE = 'Stranice rada se numeriraju, ali ne i naslovnice; prethodni dijelovi numeriraju se rimskim brojkama, a osnovni tekst arapskima tako da brojka 1 bude na prvoj stranici uvoda.';
const STRUCT_PAGE = "odjeljak 'STRUKTURA RADA' (str. 9) i 'FORMAT I OPREMA RADA' (str. 16)";
const STRUCT_QUOTE = 'Akademski radovi sastoje se od tri cjeline: prethodnoga dijela, osnovnog teksta i zavrsnoga dijela. U prethodnom dijelu obavezni su dijelovi rada naslov (naslovnica) i sadrzaj, a u zavrsnome sazetak, kljucne rijeci i popis literature.';
const TOC_QUOTE = 'U prethodnom dijelu obavezni su dijelovi rada naslov (naslovnica) i sadrzaj. Kratak sadrzaj daje pregled naslova poglavlja i potpoglavlja.';

const verified = readJson('data/profiles/verified-profiles.json');
const sources = readJson('data/sources/source-registry.json');
const citHash = sources.find((s) => s.id === CIT_SRC).snapshotHash;
const uputeHash = sources.find((s) => s.id === UPUTE_SRC).snapshotHash;

const draftsFile = readJson('data/profiles/fpzg/drafts/fpzg-drafts.json');
draftsFile.profiles = draftsFile.profiles || {};

const FPZG = verified.filter((x) => x.id.startsWith('fpzg'));
const MES = 'fpzg-mes-master-thesis';

const mkEntry = (pid, checkId, value, sourceId, page, quote, hash, category, label) => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: true, authority: 'general', sourceId, sourcePage: page, quote,
  status: 'verified', verifiedBy: approver, confirmedVia: 'ai-1pass-batch', lastVerified: NOW, verifiedHash: hash,
});

const ledger = [];
let citAdded = 0, mesAdded = 0;
const pushLedger = (e, note) => {
  ledger.push({ id: `led-${e.ruleId}-ai-confirmed-${NOW}`, ruleId: e.ruleId, profileId: e.ruleId.split('--')[0], action: 'ai-confirmed', actor: 'ai-1pass', timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote, note });
  ledger.push({ id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: e.ruleId.split('--')[0], action: 'verified', actor: approver, timestamp: NOW, sourceId: e.sourceId, sourcePage: e.sourcePage, quote: e.quote, note: 'Batch odobrenje.' });
};

for (const prof of FPZG) {
  const pid = prof.id;
  const R = prof.rules;
  const arr = (draftsFile.profiles[pid] = draftsFile.profiles[pid] || []);
  const has = (cid) => arr.some((e) => e.checkId === cid);

  // (1) citation-style za sve (value = rules.recommendedCitation, ocekivano "fpzg")
  if (R.recommendedCitation != null && !has('citation-style')) {
    const e = mkEntry(pid, 'citation-style', R.recommendedCitation, CIT_SRC, CIT_PAGE, CIT_QUOTE, citHash, 'citation', 'Stil citiranja');
    arr.push(e); pushLedger(e, 'FPZG citation-style verificiran iz Pravila navodenja (autor-godina, FPZG-wide).'); citAdded++;
  }

  // (2) MES dodatno: format/struktura iz Uputa (bez word-count; MES nema definiran opseg)
  if (pid === MES) {
    const specs = [
      ['font', R.font, FORMAT_PAGE, FORMAT_QUOTE, 'format', 'Font'],
      ['font-size', R.size, FORMAT_PAGE, FORMAT_QUOTE, 'format', 'Velicina slova'],
      ['line-spacing', R.spacing, FORMAT_PAGE, FORMAT_QUOTE, 'format', 'Prored'],
      ['paper-size', R.requireA4, FORMAT_PAGE, A4_QUOTE, 'format', 'Format papira A4'],
      ['page-numbers', R.requirePageNumbers, FORMAT_PAGE, PAGENUM_QUOTE, 'format', 'Brojevi stranica'],
      ['toc', R.requireToc, STRUCT_PAGE, TOC_QUOTE, 'structure', 'Sadrzaj'],
      ['required-sections', JSON.parse(JSON.stringify(R.requiredSections)), STRUCT_PAGE, STRUCT_QUOTE, 'structure', 'Obvezni dijelovi rada'],
    ];
    for (const [cid, val, page, quote, cat, label] of specs) {
      if (val == null || has(cid)) continue;
      const e = mkEntry(pid, cid, val, UPUTE_SRC, page, quote, uputeHash, cat, label);
      arr.push(e); pushLedger(e, 'MES (diplomski) format/struktura iz FPZG Uputa.'); mesAdded++;
    }
  }
}

const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) { if (!seen.has(l.id)) { existing.push(l); added++; } }

writeFileSync(p('data/profiles/fpzg/drafts/fpzg-drafts.json'), JSON.stringify(draftsFile, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`citation-style dodano: ${citAdded} profila, MES format: ${mesAdded} pravila, ${added} ledger zapisa.`);
