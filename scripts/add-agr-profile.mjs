/**
 * Jednokratni port AGR (Agronomski fakultet, diplomski) profila u produkciju.
 *
 * Dodaje: izvor (source-registry), profil (verified-profiles), ledger zapise i
 * azurira manifest brojace. ruleEntries su u data/profiles/unizg-agr/drafts/unizg-agr.json
 * (fan-out) i ulaze u WITH_DRAFTS poglede preko glob-merge-a. Coverage se preracunava
 * zasebno (scripts/recompute-coverage.mjs). Idempotentno: preskace ako AGR vec postoji.
 *
 * Pokretanje: node scripts/add-agr-profile.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);

const HASH = '1d09e18e819b157f83479f5a035c1c3868fecc04a0144aa36c4dec091600c778';

/** Ubaci nove objekte na kraj JSON niza cuvajuci postojeci tekst (bez reformatiranja). */
function appendToJsonArray(rel, newEntries) {
  const path = p(rel);
  const text = readFileSync(path, 'utf8');
  const end = text.lastIndexOf(']');
  if (end < 0) throw new Error(`nije JSON niz: ${rel}`);
  const head = text.slice(0, end).replace(/\s+$/, '');
  const tail = text.slice(end); // ']' + eventualni newline
  const body = newEntries
    .map((e) =>
      JSON.stringify(e, null, 2)
        .split('\n')
        .map((l) => '  ' + l)
        .join('\n'),
    )
    .join(',\n');
  const sep = head.endsWith('[') ? '\n' : ',\n';
  writeFileSync(path, head + sep + body + '\n' + tail);
}

// --- idempotencija -----------------------------------------------------------
const sources = JSON.parse(readFileSync(p('data/sources/source-registry.json'), 'utf8'));
if (sources.some((s) => s.id === 'agr-upute-diplomski-2019')) {
  console.log('AGR izvor vec postoji, preskacem.');
  process.exit(0);
}

// --- 1. izvor ----------------------------------------------------------------
appendToJsonArray('data/sources/source-registry.json', [
  {
    id: 'agr-upute-diplomski-2019',
    kind: 'guidelines',
    title: 'Upute za izradu diplomskog rada (Agronomski fakultet, 2019)',
    url: 'https://www.agr.unizg.hr/upload/nastava/ms_dipl_rad_upute_20190410.pdf',
    publisher: 'Agronomski fakultet Sveucilista u Zagrebu',
    fetchedAt: '2026-07-02',
    snapshotPath: 'data/sources/agr/agr-upute-diplomski-2019.pdf',
    snapshotHash: HASH,
    validityClass: 'stable',
    lastChecked: '2026-07-02',
    note: 'Point-in-time PDF snapshot Uputa za diplomski rad (AGR, 2019). Tehnicko oblikovanje (font 12, prored 1,15, margine 2,5, A4) i opseg 20-50 str. formulirani kao Preporuke -> advisory; numeriranje stranica i obvezan Sadrzaj su imperativ -> scored.',
  },
]);

// --- 2. profil ---------------------------------------------------------------
appendToJsonArray('data/profiles/verified-profiles.json', [
  {
    id: 'agr-diplomski',
    unitId: 'unizg-agr',
    programs: ['diplomski studiji Agronomskog fakulteta Sveucilista u Zagrebu'],
    workTypes: ['graduate'],
    status: 'partial',
    profileLabel: 'Agronomski fakultet, diplomski rad',
    verifiedAt: '2026-07-02',
    documentDate: '2019-04-10',
    rules: {},
    facts: [
      'Numeracija stranica ide od sazetka do kraja teksta, u donjem desnom kutu (imperativ).',
      'Sadrzaj je obvezna cjelina rada (imperativ).',
      'Font 12, prored 1,15, margine 2,5 cm, A4 i opseg 20-50 str. formulirani su kao Preporuke (advisory).',
    ],
    note: 'Tehnicko oblikovanje i opseg su u Uputama pod "Preporuke za tehnicko oblikovanje rada" pa su advisory; scored su samo imperativna pravila (numeracija stranica, obvezan Sadrzaj). Prijediplomski (zavrsni, 2017) i doktorski (DR.08, 2026) profili dolaze kasnije iz zasebnih Uputa.',
    sources: [
      {
        title: 'Upute za izradu diplomskog rada (AGR, 2019)',
        url: 'https://www.agr.unizg.hr/upload/nastava/ms_dipl_rad_upute_20190410.pdf',
      },
    ],
    sourceHierarchy: ['Upute za izradu diplomskog rada (Agronomski fakultet, 2019)'],
    ruleAuthority: 'official-program-guidelines',
    normativeScope: ['numeracija stranica', 'sadrzaj (obvezna cjelina)'],
    advisoryScope: [
      'velicina slova',
      'prored',
      'margine',
      'format papira',
      'opseg u stranicama',
      'stil citiranja (autor-godina)',
      'obvezne cjeline rada',
    ],
  },
]);

// --- 3. ledger ---------------------------------------------------------------
const led = (checkId, action, sourcePage, quote) => ({
  id: `led-agr-diplomski--${checkId}-${action}-2026-07-02`,
  ruleId: `agr-diplomski--${checkId}`,
  profileId: 'agr-diplomski',
  action,
  actor: 'owner-bulk-approval',
  timestamp: '2026-07-02',
  sourceId: 'agr-upute-diplomski-2019',
  sourcePage,
  quote,
  note: 'Port batch-4 AGR seed u produkciju.',
});
const P6 = 'odjeljak 6. Tehnicko oblikovanje rada';
const P1 = 'odjeljak 1. Diplomski rad';
const QPREP = 'Preporuke za tehnicko oblikovanje rada: rad se pise velicinom slova 12 pt, prored 1,15';
const QSCOPE =
  'Preporuka je da diplomski rad bude opsega 20 - 50 stranica osnovnog teksta na papiru A4 formata';
appendToJsonArray('data/verification/ledger.json', [
  led('font-size', 'advisory', P6, QPREP),
  led('line-spacing', 'advisory', P6, QPREP),
  led('margins', 'advisory', P6, 'margine rada trebaju iznositi 2,5 cm'),
  led('paper-size', 'advisory', P1, QSCOPE),
  led(
    'page-numbers',
    'verified',
    P6,
    'stranice se numeriraju od sazetka do kraja teksta, a numeracija se postavlja u donji desni kut',
  ),
  led(
    'toc',
    'verified',
    'odjeljak 2. Struktura i sadrzaj diplomskog rada',
    'Sadrzaj je popis naslova poglavlja i potpoglavlja s brojem stranice na kojoj zapocinju',
  ),
  led('page-count', 'advisory', P1, QSCOPE),
  led(
    'citation-style',
    'advisory',
    'odjeljak 5. Pravila citiranja, a) Citiranje izvora u tekstu',
    'prema Husnjaku (2014.) morfogenetska grada tla ... / prema morfogenetskoj gradi tla (Husnjak 2014.)',
  ),
  led('required-sections', 'advisory', null, 'sazetak / sadrzaj / uvod / sredisnji dio / zakljucak / literatura'),
]);

// --- 4. manifest brojaci -----------------------------------------------------
const manifest = JSON.parse(readFileSync(p('data/manifest.json'), 'utf8'));
const bump = (name, delta) => {
  const row = manifest.find((m) => m.name === name);
  if (!row) throw new Error(`manifest nema ${name}`);
  row.entries += delta;
};
bump('SOURCE_REGISTRY', 1);
bump('VERIFIED_PROFILE_REGISTRY', 1);
bump('VERIFICATION_LEDGER', 9);
bump('SCORED_COVERAGE', 1);
writeFileSync(p('data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log('AGR dodan: izvor + profil + 9 ledger zapisa; manifest azuriran. Pokreni recompute-coverage.');
