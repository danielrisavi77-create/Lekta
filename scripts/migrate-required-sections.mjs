/**
 * Option-A migracija required-sections za Upute-pokrivene pravne profile (Faza b).
 *
 * Ispravak prema snapshotiranim Uputama (3-prolazno vec provjereno):
 *   - makni "izjava o izvornosti" iz bodovanih obveznih dijelova (NIJE u Uputama, dolazi
 *     iz Pravilnika koji nije snapshotiran) -> prebaci u manualChecks (advisory podsjetnik,
 *     student i dalje vidi, ne boduje se).
 *   - dodaj "sredisnji dio" (Upute ga izrijekom traze, prije je nedostajao).
 *   - zadrzi sadrzaj (Upute odjeljak 2) te uvod/zakljucak/literatura (odjeljak 4).
 * Uskladjuje rules.requiredSections (zivi engine) i draft ruleEntry na istu Upute-vjernu
 * vrijednost, pa effectiveRules ostaje deep-equal rules (faithfulness drzi), i verificira
 * pravilo (covjek odobrio advisory pristup; vrijednost potkrijepljena postojecim dokazom).
 *
 * Golden se re-baselina jer se mijenja detalj provjere obveznih dijelova (fixture i dalje
 * nalazi sve dijelove, mijenja se samo popis). Pokretanje: node scripts/migrate-required-sections.mjs "<approver>"
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);
const readJson = (rel) => JSON.parse(readFileSync(p(rel), 'utf8'));

const approver = process.argv[2];
if (!approver) {
  console.error('Upotreba: node scripts/migrate-required-sections.mjs "<approver>"');
  process.exit(1);
}
const NOW = '2026-06-30';
const UPUTE = 'pravo-upute-oblikovanje-2024';
const PROFILES = [
  'pravo-integrirani-diplomski',
  'pravo-javna-uprava-prijediplomski',
  'pravo-javna-uprava-diplomski',
  'pravo-porezni-prijediplomski',
];

const CORRECTED = [
  { key: 'toc', label: 'sadržaj', terms: ['sadrzaj', 'contents', 'table of contents'] },
  { key: 'intro', label: 'uvod', terms: ['uvod', 'introduction'] },
  { key: 'body', label: 'središnji dio', terms: ['sredisnji dio', 'razrada', 'poglavlje', 'glava', 'chapter'] },
  { key: 'conclusion', label: 'zaključak', terms: ['zakljucak', 'conclusion'] },
  {
    key: 'refs',
    label: 'izvori i literatura / bibliografija',
    terms: ['izvori i literatura', 'popis izvora i literature', 'popis literature', 'bibliografija', 'literatura', 'references'],
  },
];
const DECLARATION_CHECK =
  'Izjava o izvornosti: obvezna za predaju prema Pravilniku o studijima i studiranju; nije u formatnim Uputama pa se ne boduje automatski.';
const QUOTE =
  'Rad mora imati uvodni dio, sredisnji dio (s vise poglavlja i/ili potpoglavlja) te zakljucni dio. Na kraju rada treba biti popis koristenih izvora i literature (bibliografija). Nakon naslovne stranice treba biti stranica sa sadrzajem.';
const SOURCE_PAGE = 'odjeljak 4 (obvezni dijelovi rada) i odjeljak 2 (sadrzaj)';

const verified = readJson('data/profiles/verified-profiles.json');
const drafts = readJson('data/profiles/pravo/drafts/law-drafts.json');
const sources = readJson('data/sources/source-registry.json');
const upute = sources.find((s) => s.id === UPUTE);

const ledger = [];
let touched = 0;

for (const pid of PROFILES) {
  // 1. zivi profil: rules.requiredSections + manualChecks
  const prof = verified.find((x) => x.id === pid);
  if (!prof) {
    console.error(`Nema profila ${pid} u verified-profiles.`);
    continue;
  }
  prof.rules.requiredSections = JSON.parse(JSON.stringify(CORRECTED));
  prof.manualChecks = prof.manualChecks || [];
  if (!prof.manualChecks.includes(DECLARATION_CHECK)) prof.manualChecks.push(DECLARATION_CHECK);

  // 2. draft ruleEntry: ista vrijednost, verified
  const entries = drafts.profiles[pid] || [];
  const e = entries.find((x) => x.ruleId === `${pid}--required-sections`);
  if (!e) {
    console.error(`Nema required-sections drafta za ${pid}.`);
    continue;
  }
  e.value = JSON.parse(JSON.stringify(CORRECTED));
  e.sourceId = UPUTE;
  e.sourcePage = SOURCE_PAGE;
  e.quote = QUOTE;
  e.authority = 'general';
  e.status = 'verified';
  e.verifiedBy = approver;
  e.confirmedVia = 'ai-3pass-batch';
  e.lastVerified = NOW;
  e.verifiedHash = upute.snapshotHash;

  ledger.push({
    id: `led-${pid}--required-sections-ai-confirmed-${NOW}`,
    ruleId: `${pid}--required-sections`,
    profileId: pid,
    action: 'ai-confirmed',
    actor: 'ai-3pass',
    timestamp: NOW,
    sourceId: UPUTE,
    sourcePage: SOURCE_PAGE,
    quote: QUOTE,
    note: 'Vrijednost ispravljena prema Uputama (maknuta izjava o izvornosti -> advisory/manualChecks, dodan sredisnji dio); potkrijepljeno postojecim 3-prolaznim dokazom obveznih dijelova.',
  });
  ledger.push({
    id: `led-${pid}--required-sections-verified-${NOW}`,
    ruleId: `${pid}--required-sections`,
    profileId: pid,
    action: 'verified',
    actor: approver,
    timestamp: NOW,
    sourceId: UPUTE,
    sourcePage: SOURCE_PAGE,
    quote: QUOTE,
    note: 'Batch odobrenje ispravljenog required-sections; izjava o izvornosti ostaje advisory (Pravilnik).',
  });
  touched++;
}

// append ledger idempotentno
const existing = readJson('data/verification/ledger.json');
const seen = new Set(existing.map((x) => x.id));
let added = 0;
for (const l of ledger) {
  if (seen.has(l.id)) continue;
  existing.push(l);
  added++;
}

writeFileSync(p('data/profiles/verified-profiles.json'), JSON.stringify(verified, null, 2) + '\n');
writeFileSync(p('data/profiles/pravo/drafts/law-drafts.json'), JSON.stringify(drafts, null, 2) + '\n');
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(existing, null, 2) + '\n');
console.log(`Migrirano ${touched} profila, ${added} ledger zapisa. Sljedece: re-baseline golden + recompute coverage.`);
