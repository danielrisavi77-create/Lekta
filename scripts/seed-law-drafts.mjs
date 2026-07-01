/**
 * Jednokratni seed DRAFT ruleEntries za pravne profile (VERIFICATION_PIPELINE.md korak 3-4).
 *
 * Sto radi: za svaki pravni profil (unitId "pravo" u verified-profiles te sve pravne
 * katedre) izvede granularne `ruleEntries` iz postojecih `rules`, mapirane na
 * COMPILED_CHECK_IDS, i veze ih na source registry po URL-u. Sva pravila ostaju
 * `status: draft`, `scored` se NE postavlja (izvedeni scored je false). Time:
 *   - effectiveRules ostaje deep-equal `rules` (vrijednosti su identicne),
 *   - verification-gate prolazi prazno (nista nije bodovano),
 *   - covjek kasnije kroz konzolu flipa pojedino pravilo u `verified`.
 *
 * Doslovni citati i lokatori odjeljaka pridruzuju se SAMO pravilima vezanima na izvor
 * koji je stvarno procitan i snapshotiran (pravo-upute-oblikovanje-2024). Za ostale
 * izvore quote/sourcePage ostaju null (nacrt ceka citanje izvora). Nista se ne nagada.
 *
 * Pokretanje: node scripts/seed-law-drafts.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);

const verified = JSON.parse(readFileSync(p('data/profiles/verified-profiles.json'), 'utf8'));
const legal = JSON.parse(readFileSync(p('data/profiles/legal-departments.json'), 'utf8'));
const sources = JSON.parse(readFileSync(p('data/sources/source-registry.json'), 'utf8'));

const DRAFT_DATE = '2026-06-30';
const ACTOR = 'ai-draft';
const UPUTE_ID = 'pravo-upute-oblikovanje-2024';

// URL -> registry id (za vezanje profila na izvore bez nagadanja).
const sourceIdByUrl = new Map(sources.map((s) => [s.url, s.id]));

// Doslovni citati i lokatori iz procitanog i snapshotiranog izvora (UPUTE_ID).
// Restaurirana hrvatska dijakritika; lokator je broj odjeljka jer PDF nema pouzdane
// brojeve stranica u ekstrakciji (spec dopusta "stranica ILI odjeljak").
const UPUTE_QUOTES = {
  font: {
    quote: 'Glavni tekst (...) font: Times New Roman',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
  },
  size: {
    quote: 'Glavni tekst (...) velicina fonta: 12',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
  },
  spacing: {
    quote: 'Glavni tekst (...) prored: 1,5 (razmak 0 i prije i poslije)',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
  },
  citation: {
    quote:
      'Bibliografski podatci o koristenim izvorima navode se u biljeskama (fusnotama) koje moraju biti numerirane.',
    page: 'odjeljak 5. Navodenje bibliografskih podataka (citiranje)',
  },
  sections: {
    quote:
      'Rad mora imati uvodni dio, sredisnji dio (s vise poglavlja i/ili potpoglavlja) te zakljucni dio. Na kraju rada treba biti popis koristenih izvora i literature (bibliografija).',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
    note: 'Izjavu o izvornosti potkrijepiti iz Pravilnika/postupka; nije navedena u ovim Uputama.',
  },
  toc: {
    quote: 'Nakon naslovne stranice treba biti stranica sa sadrzajem.',
    page: 'odjeljak 2. Sadrzaj',
  },
  pageNumbers: {
    quote:
      'Stranice rada trebaju biti numerirane, odnosno na svakoj stranici (osim naslovnice) treba biti automatski umetnut broj stranice.',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
  },
  footnoteFont: {
    quote: 'Biljeske (fusnote) (...) font: Times New Roman',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
  },
  footnoteSize: {
    quote: 'Biljeske (fusnote) (...) velicina fonta: 10',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
  },
  footnoteSpacing: {
    quote: 'Biljeske (fusnote) (...) prored: 1 (razmak 0 i prije i poslije)',
    page: 'odjeljak 4. Oblikovanje i uredenje teksta',
  },
  headingRules: {
    quote:
      'naslov 1. razine: font 12, TISKANA SLOVA; naslov 2. razine: font 12, podebljano (bold); naslov 3. razine: font 12, podebljano i kurzivirano (bold i italik). Naslovi se poravnavaju slijeva (left aligned).',
    page: 'odjeljak 3. Naslovi',
  },
};

// Mapiranje rules -> ruleEntry po dimenziji. quoteKey vezuje na UPUTE_QUOTES.
const DIMS = [
  { checkId: 'font', key: 'font', category: 'format', label: 'Font glavnog teksta', quoteKey: 'font' },
  { checkId: 'font-size', key: 'size', category: 'format', label: 'Velicina fonta glavnog teksta', quoteKey: 'size' },
  { checkId: 'line-spacing', key: 'spacing', category: 'format', label: 'Prored glavnog teksta', quoteKey: 'spacing' },
  { checkId: 'margins', key: 'margins', category: 'format', label: 'Margine', quoteKey: null, advisory: true },
  { checkId: 'citation-style', key: 'recommendedCitation', category: 'citation', label: 'Stil citiranja', quoteKey: 'citation' },
  { checkId: 'required-sections', key: 'requiredSections', category: 'structure', label: 'Obvezni dijelovi rada', quoteKey: 'sections' },
  { checkId: 'reference-count', key: 'minReferences', category: 'sources', label: 'Najmanji broj izvora', quoteKey: null },
  { checkId: 'toc', key: 'requireToc', category: 'structure', label: 'Sadrzaj', quoteKey: 'toc', boolean: true },
  { checkId: 'page-numbers', key: 'requirePageNumbers', category: 'format', label: 'Numeriranje stranica', quoteKey: 'pageNumbers', boolean: true },
  { checkId: 'paper-size', key: 'requireA4', category: 'format', label: 'A4 format', quoteKey: null, boolean: true },
  { checkId: 'footnote-font', key: 'footnoteFont', category: 'format', label: 'Font fusnota', quoteKey: 'footnoteFont' },
  { checkId: 'footnote-size', key: 'footnoteSize', category: 'format', label: 'Velicina fusnota', quoteKey: 'footnoteSize' },
  { checkId: 'footnote-spacing', key: 'footnoteSpacing', category: 'format', label: 'Prored fusnota', quoteKey: 'footnoteSpacing' },
  { checkId: 'heading-rules', key: 'headingRules', category: 'structure', label: 'Oblikovanje naslova po razinama', quoteKey: 'headingRules' },
];

/** Vraca registry id "guidelines" izvora koji profil citira, ili null. */
function guidelinesSourceId(profile) {
  for (const s of profile.sources ?? []) {
    const id = sourceIdByUrl.get(s.url);
    if (!id) continue;
    const reg = sources.find((x) => x.id === id);
    if (reg && reg.kind === 'guidelines') return id;
  }
  return null;
}

const ledger = [];

function entriesFor(profile, rules) {
  if (!rules || typeof rules !== 'object') return [];
  const gId = guidelinesSourceId(profile);
  const useUpute = gId === UPUTE_ID;
  const out = [];

  for (const dim of DIMS) {
    if (!(dim.key in rules)) continue;
    const value = rules[dim.key];
    if (dim.boolean && !value) continue; // ne biljezimo "nije obvezno"
    if (value == null) continue;

    const q = useUpute && dim.quoteKey ? UPUTE_QUOTES[dim.quoteKey] : null;
    // Ako smo izvor procitali (useUpute) a dimenzija nije u njemu, znamo da je odsutna
    // pa ne vezemo sourceId. Ako izvor nije procitan, gId je ocekivani (nepinani) izvor.
    const sourceId = q ? gId : useUpute ? null : gId;
    const ruleId = `${profile.id}--${dim.checkId}`;
    const entry = {
      ruleId,
      checkId: dim.checkId,
      value,
      category: dim.category,
      label: dim.label,
      machineCheckable: true,
      authority: sourceId ? 'general' : undefined,
      sourceId,
      sourcePage: q ? q.page : null,
      quote: q ? q.quote : null,
      status: dim.advisory ? 'advisory' : 'draft',
    };
    if (q && q.note) entry.note = q.note;
    out.push(entry);
    ledger.push({
      id: `led-${ruleId}`,
      ruleId,
      profileId: profile.id,
      action: 'drafted',
      actor: ACTOR,
      timestamp: DRAFT_DATE,
      sourceId,
      sourcePage: q ? q.page : null,
      quote: q ? q.quote : null,
      note: 'Nacrt iz postojecih pravila i citiranog izvora; ceka ljudsku verifikaciju.',
    });
  }

  // word-count i page-count: vrijednosti su objekti. Opseg nije u procitanim Uputama,
  // pa za upute-profil ostaje bez izvora; inace ocekivani guidelines izvor.
  const rangeSource = useUpute ? null : gId;
  const wc = {};
  if (rules.wordMin != null) wc.min = rules.wordMin;
  if (rules.wordMax != null) wc.max = rules.wordMax;
  if (Object.keys(wc).length) {
    out.push(makeRangeEntry(profile, 'word-count', 'scope', 'Opseg (broj rijeci)', wc, rangeSource));
  }
  const pc = {};
  if (rules.pageMin != null) pc.min = rules.pageMin;
  if (rules.pageMax != null) pc.max = rules.pageMax;
  if (rules.pageTarget != null) pc.target = rules.pageTarget;
  if (Object.keys(pc).length) {
    out.push(makeRangeEntry(profile, 'page-count', 'scope', 'Opseg (broj stranica)', pc, rangeSource));
  }
  return out;
}

function makeRangeEntry(profile, checkId, category, label, value, gId) {
  const ruleId = `${profile.id}--${checkId}`;
  const entry = {
    ruleId,
    checkId,
    value,
    category,
    label,
    machineCheckable: true,
    authority: gId ? 'general' : undefined,
    sourceId: gId,
    sourcePage: null, // opseg nije u procitanim Uputama; ceka citanje vlastitog izvora
    quote: null,
    status: 'advisory', // opseg pravnih radova je preporuka, ne tvrdo bodovanje
  };
  ledger.push({
    id: `led-${ruleId}`,
    ruleId,
    profileId: profile.id,
    action: 'drafted',
    actor: ACTOR,
    timestamp: DRAFT_DATE,
    sourceId: gId,
    sourcePage: null,
    quote: null,
    note: 'Nacrt opsega; preporuka, ceka potvrdu izvora i ljudsku verifikaciju.',
  });
  return entry;
}

// Od Faze C.5 nacrti zive u staging datoteci, ne inline u profilima (jedan dom,
// bez dvostrukog odrzavanja). Profili JSON se ne mijenja; engine ionako cita rules.
const profiles = {};
let touched = 0;
for (const profile of verified) {
  if (profile.unitId !== 'pravo') continue;
  const entries = entriesFor(profile, profile.rules);
  if (entries.length) {
    profiles[profile.id] = entries;
    touched++;
  }
}
for (const dept of legal) {
  const entries = entriesFor(dept, dept.rules);
  if (entries.length) {
    profiles[dept.id] = entries;
    touched++;
  }
}

const draftsFile = {
  generatedAt: DRAFT_DATE,
  source: 'seed-law-drafts (Faza C); staging od Faze C.5',
  note:
    'Staging nacrti pravnih profila. Svi su status draft/advisory i scored:false dok ih covjek ne verificira kroz verifikacijsku konzolu. Promocija u profil ide tek nakon verifikacije.',
  profiles,
};

writeFileSync(
  p('data/profiles/pravo/drafts/law-drafts.json'),
  JSON.stringify(draftsFile, null, 2) + '\n',
);
writeFileSync(p('data/verification/ledger.json'), JSON.stringify(ledger, null, 2) + '\n');

console.log(`Seed gotov: ${touched} profila u staging, ${ledger.length} ledger zapisa.`);
