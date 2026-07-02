/**
 * Port RGNF (Rudarsko-geolosko-naftni fakultet) - novi fakultet iz re-harvesta 2026-07-02.
 * Uputa 2025 (skenirana, OCR-ana) je proceduralna i IZRIJEKOM delegira oblikovanje na
 * Predlozak koji je "sastavni dio uputa". Predlozak (DOCX) sadrzi EKSPLICITNA pisana
 * pravila -> scored. Isti predlozak vrijedi za zavrsni i diplomski rad.
 *
 * Pise fanout draftove (rgnf-zavrsni, rgnf-diplomski) + port-spec (izvori, profili, unit,
 * katalog, ledger). Pokretanje: node scripts/gen-rgnf.mjs, pa node scripts/port-faculty.mjs
 * discovery/port-specs/rgnf.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const NOW = '2026-07-02';
const PRED = 'rgnf-predlozak-2022';
const PRED_HASH = '1773255a260cb9605b38b69acbc64296411f95d298b11cc1adb957b01984bd35';
const UPUTA = 'rgnf-uputa-zavrsni-diplomski-2025';
const UPUTA_HASH = 'cac42903e6449b0ebfc21c30dc351d66092118672d28fe5bf2d28954741191e6';
const PAGE = "odjeljak 2.1 Tekst rada i postavke stranica (Predlozak)";

const Q_TEXT = 'Za pisanje teksta koristi se font Times New Roman, veličine slova 12 pt i proreda 1,5.';
const Q_MARGIN = 'Margine stranica kroz cijeli rad moraju biti iduće: lijeva 3 cm, ostale 2,5 cm (postavljeno u predlošku).';
const Q_TOC = 'Popis poglavlja s numeracijom stranica (sadržaj) te popis slika i tablica, mogu se upisivati ručno ili automatski.';
const Q_CIT = 'Pri izradi diplomskog/završnog rada treba slijediti harvardski sustav citiranja.';
const Q_STRUCT = 'Na kraju rada obavezan je popis literature. Stavke popisa moraju odgovarati citatima iz teksta rada (sve što se nalazi u popisu literature mora imati referencu u tekstu i obratno).';

const mk = (pid, checkId, value, category, label, quote, mc = true, scored = true, status = 'verified') => ({
  ruleId: `${pid}--${checkId}`, checkId, value, category, label,
  machineCheckable: mc, authority: 'program-page', sourceId: PRED, sourcePage: PAGE, quote,
  status, ...(scored ? { scored: true } : {}), verifiedHash: PRED_HASH,
  lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null,
  confirmedVia: 'ai-1pass-batch',
});

function entries(pid) {
  return [
    mk(pid, 'font', ['Times New Roman'], 'format', 'Vrsta slova', Q_TEXT),
    mk(pid, 'font-size', 12, 'format', 'Velicina slova', Q_TEXT),
    mk(pid, 'line-spacing', 1.5, 'format', 'Prored', Q_TEXT),
    mk(pid, 'margins', { top: 2.5, right: 2.5, bottom: 2.5, left: 3 }, 'format', 'Margine', Q_MARGIN),
    mk(pid, 'toc', true, 'structure', 'Sadrzaj', Q_TOC),
    mk(pid, 'citation-style', 'harvard', 'citation', 'Stil citiranja (harvardski, autor-godina)', Q_CIT, false, true),
    // struktura nije iskazana jedinstvenim imperativom "rad mora sadrzavati" -> advisory
    { ruleId: `${pid}--required-sections`, checkId: 'required-sections',
      value: ['naslovnica', 'sazetak', 'sadrzaj', 'uvod', 'razrada', 'popis literature'],
      category: 'structure', label: 'Obvezne cjeline rada', machineCheckable: false,
      authority: 'program-page', sourceId: PRED, sourcePage: PAGE, quote: Q_STRUCT,
      status: 'advisory', lastVerified: NOW, verifiedBy: 'owner-bulk-approval', reviewedBy: null },
  ];
}

const SOURCES = [
  { id: PRED, kind: 'template', title: 'Predlozak zavrsnog ili diplomskog rada (RGNF)',
    url: 'https://www.rgn.unizg.hr/images/studentska_referada/2022/Predlo%C5%BEak_zavr%C5%A1nog_ili_diplomskog_rada.docx',
    publisher: 'Sveuciliste u Zagrebu, Rudarsko-geolosko-naftni fakultet', fetchedAt: NOW,
    snapshotPath: 'data/sources/rgnf/rgnf-predlozak-2022.docx', snapshotHash: PRED_HASH,
    validityClass: 'stable', lastChecked: NOW,
    note: 'Predlozak istovremeno sluzi kao template i sadrzi pisane upute za oblikovanje; "sastavni dio" Uputa 2025 (cl. 10 Pravilnika). Faculty-wide, vrijedi za zavrsni i diplomski.' },
  { id: UPUTA, kind: 'guidelines', title: 'Upute za izradu i obranu zavrsnog i diplomskog rada (RGNF, 2025)',
    url: 'https://www.rgn.unizg.hr/hr/studiji/preddiplomski-studij/zavrsni-radovi/upute-i-predlosci',
    publisher: 'Sveuciliste u Zagrebu, Rudarsko-geolosko-naftni fakultet', fetchedAt: NOW,
    snapshotPath: 'data/sources/rgnf/rgnf-uputa-zavrsni-diplomski-2025.pdf', snapshotHash: UPUTA_HASH,
    validityClass: 'stable', lastChecked: NOW,
    note: 'Skenirana, OCR-ana (scripts/ocr_pdf.py). Proceduralna (prijava teme, obrana, povjerenstva); oblikovanje IZRIJEKOM delegira na Predlozak koji je sastavni dio uputa.' },
];

const baseRules = {
  font: ['Times New Roman'], size: [12], spacing: 1.5,
  margins: { top: 2.5, right: 2.5, bottom: 2.5, left: 3 },
  requireToc: true, recommendedCitation: 'harvard',
};

const PROFS = [
  { fac: 'rgnf', pid: 'rgnf-zavrsni', program: 'Prijediplomski studiji Rudarsko-geolosko-naftnog fakulteta (zavrsni rad)',
    workType: 'final', label: 'Rudarsko-geolosko-naftni fakultet, zavrsni rad' },
  { fac: 'rgnf', pid: 'rgnf-diplomski', program: 'Diplomski studiji Rudarsko-geolosko-naftnog fakulteta',
    workType: 'graduate', label: 'Rudarsko-geolosko-naftni fakultet, diplomski rad' },
];

mkdirSync('data/profiles/rgnf/drafts', { recursive: true });

const profiles = [], ledger = [], catalogPrograms = [];
for (const { pid, program, workType, label } of PROFS) {
  const es = entries(pid);
  writeFileSync(`data/profiles/rgnf/drafts/${pid}.json`,
    JSON.stringify({ profileId: pid, entries: es, generatedAt: NOW }, null, 2) + '\n');
  catalogPrograms.push(program);
  profiles.push({
    id: pid, unitId: 'rgnf', programs: [program], workTypes: [workType], status: 'partial',
    profileLabel: label, verifiedAt: NOW, documentDate: null,
    rules: baseRules, facts: [
      'Predlozak (RGNF) izrijekom vrijedi za zavrsni i diplomski rad; sastavni dio Uputa 2025.',
      'Font Times New Roman 12 pt, prored 1,5 (imperativ "koristi se") -> scored.',
      'Margine lijeva 3 cm, ostale 2,5 cm ("moraju biti") -> scored.',
      'Sadrzaj (popis poglavlja s numeracijom) -> scored; harvardski citatni sustav (imperativ "treba slijediti") -> scored.',
      'Struktura rada nije iskazana jedinstvenim imperativom "mora sadrzavati" -> required-sections advisory.',
      'Format papira (A4) i numeracija stranica nisu tekstualno propisani u predlosku -> izostavljeni.',
    ],
    note: 'Pisana pravila iz Predloska (RGNF, 2022) koji je sastavni dio Uputa 2025 (skenirana Uputa OCR-ana; delegira oblikovanje na Predlozak). Scored: font, velicina, prored, margine, sadrzaj, citatni stil. Advisory: obvezne cjeline.',
    sources: SOURCES.map((s) => ({ title: s.title, url: s.url })),
    sourceHierarchy: [
      'Pravilnik o izradi i obrani zavrsnog i diplomskog rada (RGNF)',
      'Upute za izradu i obranu zavrsnog i diplomskog rada (RGNF, 2025)',
      'Predlozak zavrsnog ili diplomskog rada (RGNF, 2022)',
    ],
    ruleAuthority: 'official-program-guidelines',
    normativeScope: ['font', 'velicina slova', 'prored', 'margine', 'sadrzaj', 'stil citiranja'],
    advisoryScope: ['obvezne cjeline rada'],
  });
  for (const e of es) {
    if (e.status !== 'verified') continue;
    ledger.push({
      id: `led-${e.ruleId}-verified-${NOW}`, ruleId: e.ruleId, profileId: pid, action: 'verified',
      actor: 'owner-bulk-approval', timestamp: NOW, sourceId: PRED, sourcePage: PAGE, quote: e.quote,
      note: 'Port RGNF: direktno citanje Predloska (sastavni dio Uputa 2025).',
    });
  }
}

const spec = {
  faculty: 'rgnf',
  unit: { id: 'rgnf', name: 'Rudarsko-geolosko-naftni fakultet', family: 'stem', status: 'generic' },
  catalogPrograms: [...catalogPrograms, 'Opci profil fakulteta'],
  sources: SOURCES, profiles, ledger,
};
writeFileSync('discovery/port-specs/rgnf.json', JSON.stringify(spec, null, 2) + '\n');
console.log(`Generirano: 2 RGNF profila, ${ledger.length} ledger, ${SOURCES.length} izvora.`);
