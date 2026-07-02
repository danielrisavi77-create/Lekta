/**
 * Dovrsava AGR: dodaje zavrsni (prijediplomski, Upute 2017) i doktorski (DR.08, 2026)
 * profile u produkciju, uz vec postojeci diplomski. Izvori su snapshotirani PDF-ovi.
 *
 * Zavrsni: isti "Preporuke za tehnicko oblikovanje" okvir kao diplomski -> 2 scored
 * (numeracija, Sadrzaj), ostalo advisory; opseg 20-30.
 * Doktorski: imperativna "Postavke stranice" -> 6 scored (font-size 12, prored 1,5,
 * margine 2,5, A4, numeracija, Sadrzaj); font-ime "npr. TNR" i citiranje (struka/harvard)
 * ostaju advisory.
 *
 * Idempotentno; ruleEntries u fan-out draftovima. Nakon ovoga: node scripts/recompute-coverage.mjs
 * Pokretanje: node scripts/add-agr-levels.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT);

const HZAV = 'b3ec76035faeedb729c41a046bb522e2b86dbe9f7ebdebee3ecfe7640a323781';
const HDOK = '7d88702516094d932f4eac67a91bf49d8119c214cc6aa56f03954b4e9bcd0f4c';

function appendToJsonArray(rel, newEntries) {
  const path = p(rel);
  const text = readFileSync(path, 'utf8');
  const end = text.lastIndexOf(']');
  const head = text.slice(0, end).replace(/\s+$/, '');
  const tail = text.slice(end);
  const body = newEntries
    .map((e) => JSON.stringify(e, null, 2).split('\n').map((l) => '  ' + l).join('\n'))
    .join(',\n');
  const sep = head.endsWith('[') ? '\n' : ',\n';
  writeFileSync(path, head + sep + body + '\n' + tail);
}

// idempotencija
const sources = JSON.parse(readFileSync(p('data/sources/source-registry.json'), 'utf8'));
if (sources.some((s) => s.id === 'agr-upute-doktorski-2026')) {
  console.log('AGR razine vec postoje, preskacem.');
  process.exit(0);
}

// --- 1. izvori ---------------------------------------------------------------
appendToJsonArray('data/sources/source-registry.json', [
  {
    id: 'agr-upute-zavrsni-2017',
    kind: 'guidelines',
    title: 'Upute za izradu zavrsnog rada (Agronomski fakultet, prijediplomski, 2017)',
    url: 'https://www.agr.unizg.hr/upload/nastava/bs_zavrsni_rad_uputa_20170612.pdf',
    publisher: 'Agronomski fakultet Sveucilista u Zagrebu',
    fetchedAt: '2026-07-02',
    snapshotPath: 'data/sources/agr/agr-upute-zavrsni-2017.pdf',
    snapshotHash: HZAV,
    validityClass: 'stable',
    lastChecked: '2026-07-02',
    note: 'PDF snapshot Uputa za zavrsni (prijediplomski) rad. Tehnicko oblikovanje pod "Preporuke za tehnicko oblikovanje rada" -> advisory; numeracija stranica i obvezan Sadrzaj -> scored. Opseg 20-30 str.',
  },
  {
    id: 'agr-upute-doktorski-2026',
    kind: 'guidelines',
    title: 'Upute za oblikovanje doktorskoga rada (DR.08, Agronomski fakultet, 2026)',
    url: 'https://www.agr.unizg.hr/upload/nastava/dr_08_upute_za_oblikovanje_doktorskog_rada_20260512.pdf',
    publisher: 'Agronomski fakultet Sveucilista u Zagrebu',
    fetchedAt: '2026-07-02',
    snapshotPath: 'data/sources/agr/agr-upute-doktorski-2026.pdf',
    snapshotHash: HDOK,
    validityClass: 'stable',
    lastChecked: '2026-07-02',
    note: 'PDF snapshot DR.08 Uputa za doktorski rad. Imperativna "Postavke stranice" (font 12, prored 1,5, margine 2,5, A4) + numeracija i Sadrzaj -> scored. Font-ime "npr. Times New Roman" i citiranje (struka/harvard) -> advisory. Naslovnica ima margine 3,0 (izuzeto).',
  },
]);

// --- 2. profili --------------------------------------------------------------
appendToJsonArray('data/profiles/verified-profiles.json', [
  {
    id: 'agr-zavrsni',
    unitId: 'agr',
    programs: ['Prijediplomski studiji Agronomskog fakulteta (zavrsni rad)'],
    workTypes: ['final'],
    status: 'partial',
    profileLabel: 'Agronomski fakultet, zavrsni (prijediplomski) rad',
    verifiedAt: '2026-07-02',
    documentDate: '2017-06-12',
    rules: {
      font: ['Arial', 'Times New Roman', 'Calibri'],
      size: [12],
      spacing: 1.15,
      margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      justify: true,
      checkJustify: true,
      requireToc: true,
      requirePageNumbers: true,
      requireA4: true,
      recommendedCitation: 'harvard',
      accessDate: true,
    },
    facts: [
      'Numeracija stranica od sazetka, u donjem desnom kutu (imperativ).',
      'Sadrzaj je obvezna cjelina rada (imperativ).',
      'Obostrano poravnanje (Justify) je propisano.',
      'Font 12, prored 1,15, margine 2,5, A4 i opseg 20-30 str. formulirani kao Preporuke (advisory).',
    ],
    note: 'Tehnicko oblikovanje pod "Preporuke za tehnicko oblikovanje rada" -> advisory; scored samo imperativi (numeracija, Sadrzaj). Isti okvir kao diplomski, opseg 20-30.',
    sources: [
      {
        title: 'Upute za izradu zavrsnog rada (AGR, 2017)',
        url: 'https://www.agr.unizg.hr/upload/nastava/bs_zavrsni_rad_uputa_20170612.pdf',
      },
    ],
    sourceHierarchy: ['Upute za izradu zavrsnog rada (Agronomski fakultet, 2017)'],
    ruleAuthority: 'official-program-guidelines',
    normativeScope: ['numeracija stranica', 'sadrzaj (obvezna cjelina)', 'obostrano poravnanje'],
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
  {
    id: 'agr-doktorski',
    unitId: 'agr',
    programs: ['Doktorski studij Agronomskog fakulteta'],
    workTypes: ['doctoral'],
    status: 'partial',
    profileLabel: 'Agronomski fakultet, doktorski rad',
    verifiedAt: '2026-07-02',
    documentDate: '2026-05-12',
    rules: {
      font: ['Times New Roman'],
      checkFont: false,
      size: [12],
      spacing: 1.5,
      margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      checkJustify: false,
      requireToc: true,
      requirePageNumbers: true,
      requireA4: true,
      recommendedCitation: 'harvard',
      accessDate: true,
    },
    facts: [
      'Postavke stranice su imperativne: font 12, prored 1,5, margine 2,5 cm, A4.',
      'Stranice numerirane od Uvoda do kraja rada.',
      'Rad mora sadrzavati Sadrzaj.',
      'Font-ime nije propisano (obavezna potpora HR znakova, npr. Times New Roman); citiranje po struci (npr. harvardski / casopis Agriculturae Conspectus Scientificus).',
    ],
    note: 'DR.08 Upute su imperativne za oblikovanje pa je 6 pravila scored (font-size, prored, margine, A4, numeracija, Sadrzaj). Font-ime i citiranje advisory. Naslovnica ima margine 3,0 cm (izuzeto iz scored margina tijela). Rasprava min 36000 znakova izostavljena (nema check-id).',
    sources: [
      {
        title: 'Upute za oblikovanje doktorskoga rada (DR.08, AGR, 2026)',
        url: 'https://www.agr.unizg.hr/upload/nastava/dr_08_upute_za_oblikovanje_doktorskog_rada_20260512.pdf',
      },
    ],
    sourceHierarchy: ['Upute za oblikovanje doktorskoga rada (DR.08, Agronomski fakultet, 2026)'],
    ruleAuthority: 'official-program-guidelines',
    normativeScope: [
      'velicina slova',
      'prored',
      'margine',
      'format papira',
      'numeracija stranica',
      'sadrzaj (obvezna cjelina)',
    ],
    advisoryScope: ['naziv fonta', 'stil citiranja (struka/harvard)', 'obvezne cjeline rada'],
  },
]);

// --- 3. fan-out draftovi -----------------------------------------------------
const adv = (checkId, rest) => ({
  ruleId: `agr-zavrsni--${checkId}`,
  checkId,
  status: 'advisory',
  lastVerified: '2026-06-30',
  verifiedBy: 'owner-bulk-approval',
  reviewedBy: null,
  authority: 'program-page',
  sourceId: 'agr-upute-zavrsni-2017',
  ...rest,
});
const P5 = '5. Tehnicko oblikovanje rada (Preporuke)';
const QPREP = 'rad se pise velicinom slova 12 pt, prored 1,15';
const QSCOPE =
  'Zavrsni rad je pisani tekst opsega 20 - 30 stranica osnovnog teksta na papiru A4 formata';
mkdirSync(p('data/profiles/agr-zavrsni/drafts'), { recursive: true });
writeFileSync(
  p('data/profiles/agr-zavrsni/drafts/agr-zavrsni.json'),
  JSON.stringify(
    {
      profileId: 'agr-zavrsni',
      generatedAt: '2026-07-02',
      source: 'Upute za zavrsni rad (AGR, 2017), rucno draftirano iz snapshota.',
      note: 'Preporuke -> advisory; numeracija i Sadrzaj -> scored. Font (Arial/TNR/Calibri) izostavljen kao disjunkcija; justify u zivim rules, ne kao checkId.',
      entries: [
        adv('font-size', { value: 12, category: 'format', label: 'Velicina slova', machineCheckable: true, sourcePage: P5, quote: QPREP }),
        adv('line-spacing', { value: 1.15, category: 'format', label: 'Prored', machineCheckable: true, sourcePage: P5, quote: QPREP }),
        adv('margins', { value: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 }, category: 'format', label: 'Margine', machineCheckable: true, sourcePage: P5, quote: 'margine rada trebaju iznositi 2,5 cm' }),
        adv('paper-size', { value: 'A4', category: 'format', label: 'Format papira', machineCheckable: true, sourcePage: '1. Uvodne odrednice', quote: QSCOPE }),
        {
          ruleId: 'agr-zavrsni--page-numbers', checkId: 'page-numbers', value: true, category: 'format', label: 'Numeracija stranica', machineCheckable: true,
          authority: 'program-page', sourceId: 'agr-upute-zavrsni-2017', sourcePage: P5,
          quote: 'stranice se numeriraju od sazetka do kraja teksta, a numeracija se postavlja u donji desni kut',
          status: 'verified', scored: true, lastVerified: '2026-06-30', verifiedBy: 'owner-bulk-approval', reviewedBy: null, verifiedHash: HZAV,
        },
        {
          ruleId: 'agr-zavrsni--toc', checkId: 'toc', value: true, category: 'structure', label: 'Sadrzaj', machineCheckable: true,
          authority: 'program-page', sourceId: 'agr-upute-zavrsni-2017', sourcePage: '2. Struktura i sadrzaj zavrsnog rada',
          quote: 'Sadrzaj je popis naslova poglavlja i potpoglavlja s brojem stranice na kojoj zapocinju',
          status: 'verified', scored: true, lastVerified: '2026-06-30', verifiedBy: 'owner-bulk-approval', reviewedBy: null, verifiedHash: HZAV,
        },
        adv('page-count', { value: { min: 20, max: 30 }, category: 'scope', label: 'Opseg osnovnog teksta (stranice)', machineCheckable: true, sourcePage: '1. Uvodne odrednice', quote: QSCOPE }),
        adv('citation-style', { value: 'autor-godina', category: 'citation', label: 'Stil citiranja (autor-godina)', machineCheckable: false, sourcePage: '4. Pravila citiranja i izrada popisa literature', quote: 'Citiranje izvora - jedan autor / dva autora / vise autora (autor, godina)' }),
        adv('required-sections', { value: ['naslov', 'sazetak', 'sadrzaj', 'uvod', 'zakljucak', 'popis literature'], category: 'structure', label: 'Obvezne cjeline zavrsnog rada', machineCheckable: false, sourcePage: null, quote: 'naslov / sazetak (do 1000 znakova, 3-5 kljucnih rijeci) / sadrzaj / uvod / ... / zakljucak / popis literature' }),
      ],
    },
    null,
    2,
  ) + '\n',
);

const dsc = (checkId, rest) => ({
  ruleId: `agr-doktorski--${checkId}`,
  checkId,
  status: 'verified',
  scored: true,
  lastVerified: '2026-06-30',
  verifiedBy: 'owner-bulk-approval',
  reviewedBy: null,
  authority: 'program-page',
  sourceId: 'agr-upute-doktorski-2026',
  verifiedHash: HDOK,
  ...rest,
});
const PP = 'odjeljak Postavke stranice';
mkdirSync(p('data/profiles/agr-doktorski/drafts'), { recursive: true });
writeFileSync(
  p('data/profiles/agr-doktorski/drafts/agr-doktorski.json'),
  JSON.stringify(
    {
      profileId: 'agr-doktorski',
      generatedAt: '2026-07-02',
      source: 'DR.08 Upute za oblikovanje doktorskoga rada (AGR, 2026), rucno draftirano iz snapshota.',
      note: 'Imperativna Postavke stranice -> 6 scored. Font-ime i citiranje advisory. Naslovnica 3,0 cm izuzeta. Rasprava >=36000 znakova izostavljena (nema check-id).',
      entries: [
        dsc('font-size', { value: 12, category: 'format', label: 'Velicina slova', machineCheckable: true, sourcePage: PP, quote: 'Velicina pisma: 12 tipografskih tocaka' }),
        dsc('line-spacing', { value: 1.5, category: 'format', label: 'Prored', machineCheckable: true, sourcePage: PP, quote: 'Prored: 1,5 redak' }),
        dsc('margins', { value: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 }, category: 'format', label: 'Margine (tijelo)', machineCheckable: true, sourcePage: PP, quote: 'Lijeva i desna margina: 2,5 cm; Gornja i donja margina: 2,5 cm' }),
        dsc('paper-size', { value: 'A4', category: 'format', label: 'Format papira', machineCheckable: true, sourcePage: 'odjeljak Opce upute', quote: 'Rad treba biti ispisan na papiru formata A4 (210 mm x 297 mm)' }),
        dsc('page-numbers', { value: true, category: 'format', label: 'Numeracija stranica', machineCheckable: true, sourcePage: 'odjeljak Opce upute', quote: 'Stranice trebaju biti numerirane. Broje se sve stranice od Uvoda do kraja rada' }),
        dsc('toc', { value: true, category: 'structure', label: 'Sadrzaj', machineCheckable: true, sourcePage: 'odjeljak Rad mora sadrzavati', quote: 'Rad mora sadrzavati: (...) Sadrzaj' }),
        {
          ruleId: 'agr-doktorski--citation-style', checkId: 'citation-style', value: 'harvard', category: 'citation', label: 'Stil citiranja (struka/harvard)', machineCheckable: false,
          authority: 'program-page', sourceId: 'agr-upute-doktorski-2026', sourcePage: 'odjeljak Popis literature',
          quote: 'Navoenje literature treba biti u skladu s uputama za casopis Agriculturae Conspectus Scientificus (harvardski nacin)',
          status: 'advisory', lastVerified: '2026-06-30', verifiedBy: 'owner-bulk-approval', reviewedBy: null,
        },
        {
          ruleId: 'agr-doktorski--required-sections', checkId: 'required-sections',
          value: ['ocjena rada', 'podaci o mentoru', 'sazetak (HR i EN)', 'sadrzaj', 'uvod', 'pregled literature', 'rasprava', 'popis literature', 'prilozi', 'zivotopis'],
          category: 'structure', label: 'Obvezne cjeline doktorskog rada', machineCheckable: false,
          authority: 'program-page', sourceId: 'agr-upute-doktorski-2026', sourcePage: 'odjeljak Rad mora sadrzavati',
          quote: 'Rad mora sadrzavati: Ocjena / mentor / Sazetak (HR i EN) / Sadrzaj / Uvod / Pregled literature / Rasprava / Popis literature / Prilozi / Zivotopis',
          status: 'advisory', lastVerified: '2026-06-30', verifiedBy: 'owner-bulk-approval', reviewedBy: null,
        },
      ],
    },
    null,
    2,
  ) + '\n',
);

// --- 4. ledger ---------------------------------------------------------------
const led = (profileId, sourceId, checkId, action) => ({
  id: `led-${profileId}--${checkId}-${action}-2026-07-02`,
  ruleId: `${profileId}--${checkId}`,
  profileId,
  action,
  actor: 'owner-bulk-approval',
  timestamp: '2026-07-02',
  sourceId,
  sourcePage: null,
  quote: null,
  note: 'AGR razine (zavrsni/doktorski) dodane u produkciju iz snapshotiranih Uputa.',
});
const zavrsniChecks = [
  ['font-size', 'advisory'], ['line-spacing', 'advisory'], ['margins', 'advisory'], ['paper-size', 'advisory'],
  ['page-numbers', 'verified'], ['toc', 'verified'], ['page-count', 'advisory'], ['citation-style', 'advisory'], ['required-sections', 'advisory'],
];
const doktChecks = [
  ['font-size', 'verified'], ['line-spacing', 'verified'], ['margins', 'verified'], ['paper-size', 'verified'],
  ['page-numbers', 'verified'], ['toc', 'verified'], ['citation-style', 'advisory'], ['required-sections', 'advisory'],
];
appendToJsonArray('data/verification/ledger.json', [
  ...zavrsniChecks.map(([c, a]) => led('agr-zavrsni', 'agr-upute-zavrsni-2017', c, a)),
  ...doktChecks.map(([c, a]) => led('agr-doktorski', 'agr-upute-doktorski-2026', c, a)),
]);

// --- 5. katalog: dodaj programe agr jedinici ---------------------------------
const catPath = p('data/catalog/zagreb-catalog.json');
let cat = readFileSync(catPath, 'utf8');
cat = cat.replace(
  '          "Diplomski studiji Agronomskog fakulteta",',
  '          "Diplomski studiji Agronomskog fakulteta",\n          "Prijediplomski studiji Agronomskog fakulteta (zavrsni rad)",\n          "Doktorski studij Agronomskog fakulteta",',
);
writeFileSync(catPath, cat);

// --- 6. manifest brojaci -----------------------------------------------------
const manifest = JSON.parse(readFileSync(p('data/manifest.json'), 'utf8'));
const bump = (name, delta) => {
  manifest.find((m) => m.name === name).entries += delta;
};
bump('SOURCE_REGISTRY', 2);
bump('VERIFIED_PROFILE_REGISTRY', 2);
bump('VERIFICATION_LEDGER', zavrsniChecks.length + doktChecks.length);
bump('SCORED_COVERAGE', 2);
writeFileSync(p('data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log('AGR zavrsni + doktorski dodani. Pokreni: node scripts/recompute-coverage.mjs');
