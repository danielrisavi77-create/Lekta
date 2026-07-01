/**
 * Verifikacija sociologija katedre protiv snapshotirane stranice (harvest zadnjeg pravnog izvora).
 *
 * Stranica Katedre za sociologiju ("Dodatne informacije za pisane radove") izrijekom propisuje
 * oblikovanje i strukturu. Snapshotirana 2026-07-02 (volatile HTML, hash 98eb269b..). Ovime se
 * 6 postojecih draftova (font, velicina, prored, required-sections, sadrzaj, brojevi stranica)
 * verificira protiv tog izvora, uz jednu ispravku: required-sections dobiva "razradu" (sredisnji
 * dio), koju izvor izrijekom navodi a draft ju je izostavio. Vrijednost se uskladjuje u rules
 * (legal-departments) i u draftu identicno, pa effectiveRules ostaje deep-equal rules.
 *
 * Izvor je volatile, pa je glavni verifiedHash postavljen ali vrata NE rusi na njegov drift
 * (gate: source-hash-drift samo za stabilne izvore). Pokretanje: node scripts/verify-sociologija.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) {
  console.error('Upotreba: node scripts/verify-sociologija.mjs "<approver>"');
  process.exit(1);
}
const NOW = '2026-07-02';
const SRC = 'pravo-katedra-sociologija-upute';
const DEPT = 'sociologija';

const FORMAT_QUOTE =
  'Stranice moraju biti numerirane, font Times New Roman, velicina 12, obostrano poravnanje, prored 1,5.';
const FORMAT_PAGE = "odjeljak 'Opcenita struktura rada', recenica o oblikovanju rada";
const TOC_QUOTE =
  'Kratak sadrzaj mora imati popis svih naslova poglavlja i potpoglavlja s odgovarajucom stranicom na kojoj poglavlje/potpoglavlje pocinje.';
const STRUCT_QUOTE =
  'Pisani rad mora imati: naslovnicu, kratak sadrzaj, uvod, razradu rada po poglavljima, zakljucak, popis literature i popis priloga (ukoliko ih ima).';
const STRUCT_PAGE = "odjeljak 'Opcenita struktura rada' (obvezni dijelovi rada)";

const BODY_SECTION = {
  key: 'body',
  label: 'razrada rada po poglavljima',
  terms: ['razrada', 'sredisnji dio', 'poglavlje', 'glava', 'chapter'],
};

// Po checkId: citat i lokator kojim se pravilo potkrepljuje.
const EVIDENCE = {
  font: { page: FORMAT_PAGE, quote: FORMAT_QUOTE },
  'font-size': { page: FORMAT_PAGE, quote: FORMAT_QUOTE },
  'line-spacing': { page: FORMAT_PAGE, quote: FORMAT_QUOTE },
  'page-numbers': { page: FORMAT_PAGE, quote: FORMAT_QUOTE },
  toc: { page: STRUCT_PAGE, quote: TOC_QUOTE },
  'required-sections': { page: STRUCT_PAGE, quote: STRUCT_QUOTE },
};

const legal = readJson('data/profiles/legal-departments.json');
const drafts = readJson('data/profiles/pravo/drafts/law-drafts.json');
const sources = readJson('data/sources/source-registry.json');
const src = sources.find((s) => s.id === SRC);
if (!src || !src.snapshotHash) {
  console.error(`Izvor ${SRC} nije snapshotiran; prekid.`);
  process.exit(1);
}
const HASH = src.snapshotHash;

// 1. rules baseline (legal-departments): dodaj body u requiredSections (toc,intro,body,conclusion,refs)
const dept = legal.find((x) => x.id === DEPT);
const withBody = (arr) => {
  if (arr.some((s) => s.key === 'body')) return arr;
  const out = [];
  for (const s of arr) {
    out.push(s);
    if (s.key === 'intro') out.push(JSON.parse(JSON.stringify(BODY_SECTION)));
  }
  return out;
};
dept.rules.requiredSections = withBody(dept.rules.requiredSections || []);

// 2. draft ruleEntries: verificiraj svih 6, required-sections dobiva body
const entries = drafts.profiles[DEPT] || [];
const ledger = [];
let scored = 0;
for (const e of entries) {
  const ev = EVIDENCE[e.checkId];
  if (!ev) {
    console.error(`Nema dokaza za checkId ${e.checkId} (${e.ruleId}); preskacem.`);
    continue;
  }
  if (e.checkId === 'required-sections') e.value = withBody(e.value || []);
  e.authority = 'general';
  e.sourceId = SRC;
  e.sourcePage = ev.page;
  e.quote = ev.quote;
  e.status = 'verified';
  e.verifiedBy = approver;
  e.confirmedVia = 'ai-1pass-batch';
  e.lastVerified = NOW;
  e.verifiedHash = HASH;

  ledger.push({
    id: `led-${e.ruleId}-ai-confirmed-${NOW}`,
    ruleId: e.ruleId,
    profileId: DEPT,
    action: 'ai-confirmed',
    actor: 'ai-1pass',
    timestamp: NOW,
    sourceId: SRC,
    sourcePage: ev.page,
    quote: ev.quote,
    note: 'Verificirano protiv snapshotirane stranice Katedre za sociologiju (volatile). Direktno citanje, doslovni citat potvrdjen.',
  });
  ledger.push({
    id: `led-${e.ruleId}-verified-${NOW}`,
    ruleId: e.ruleId,
    profileId: DEPT,
    action: 'verified',
    actor: approver,
    timestamp: NOW,
    sourceId: SRC,
    sourcePage: ev.page,
    quote: ev.quote,
    note: e.checkId === 'required-sections'
      ? 'Batch odobrenje; required-sections dobio razradu (sredisnji dio) koju izvor izrijekom navodi.'
      : 'Batch odobrenje sociologija pravila.',
  });
  scored++;
}

const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) {
  if (seen.has(l.id)) continue;
  existing.push(l);
  added++;
}

writeFileSync(p('data/profiles/legal-departments.json'), JSON.stringify(legal, null, 2) + '\n');
writeFileSync(p('data/profiles/pravo/drafts/law-drafts.json'), JSON.stringify(drafts, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`Verificirano ${scored} sociologija pravila, ${added} ledger zapisa. Sljedece: recompute coverage + check.`);
