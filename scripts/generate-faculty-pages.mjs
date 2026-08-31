#!/usr/bin/env node
// scripts/generate-faculty-pages.mjs
//
// Build-time generator STATICNIH SEO landing stranica po (fakultet x vrsta rada), npr.
// /fpzg/diplomski-rad/. Pokreni: node scripts/generate-faculty-pages.mjs (nakon `vite build`,
// isti obrazac kao generate-citation-tools.mjs).
//
// Opseg: SVE jedinice iz kataloga (data/catalog/zagreb-catalog.json) koje imaju barem jedan
// profil za TARGET_WORK_TYPES nize. Pilot (fpzg/pravo/efzg/fer/ffzg/kif, 20 stranica) je
// pregledan rucno - honesty/koherentnost gateovi ispod (status==='verified' gate za fact-grid,
// MAX_GROUP_SIZE split, prazan-sadrzaj skip) su upravo ono sto cini siguran prelaz na sve
// jedinice bez rucnog pregleda svake pojedinacne stranice.
// TARGET_WORK_TYPES pokriva final/graduate/seminar (marketinska odluka 2026-08-02: doktorski
// namjerno izostavljen - nizak volumen i poznato tanka/osjetljiva provenijencija izvora, vidi
// memoriju o dr.nsk.hr; specialist ostaje otvoreno buduce pitanje).
//
// SADRZAJ JE ISKLJUCIVO IZVEDEN iz data/profiles/verified-profiles-heavy.json (rules, facts,
// manualChecks, submissionFacts, sources, fieldValidation.observedDeviations, verifiedAt) -
// bez ijedne izmisljene tvrdnje (CLAUDE.md "Ne izmisljaj pravila"). Kad isti unitId+workType
// pokriva vise studijskih programa, generator NE tvrdi jedno pravilo ako se programi
// razlikuju: uniformna polja idu kao izravna tvrdnja, RAZLICITA polja idu kao tablica po
// programu (npr. FPZG novinarstvo ima drugaciji opseg rijeci od politologije/nac. sigurnosti).
//
// Stranica bez dovoljno stvarnog sadrzaja (nema izvora/cinjenica/uputa) se NE generira -
// isti nacin razmisljanja kao noindex gate u generate-citation-tools.mjs za genericke stranice.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SITE_ORIGIN } from './site-origin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CATALOG_PATH = path.join(ROOT, 'data/catalog/zagreb-catalog.json');
const PROFILES_HEAVY_PATH = path.join(ROOT, 'data/profiles/verified-profiles-heavy.json');
const STATUS_META_PATH = path.join(ROOT, 'data/profiles/profile-status.json');
const DEADLINES_PATH = path.join(ROOT, 'data/submission/academic-deadlines.json');
const CITATION_SPECS_INDEX_PATH = path.join(ROOT, 'data/tools/citation-specs/verified-index.json');
const TEMPLATES_INDEX_PATH = path.join(ROOT, 'data/title-pages/templates-index.json');
const OUT_DIR = path.join(ROOT, 'dist');

const TARGET_WORK_TYPES = ['final', 'graduate', 'seminar'];

const WORK_TYPE_META = {
  seminar: { slug: 'seminarski-rad', label: 'seminarski rad', labelCap: 'Seminarski rad' },
  final: { slug: 'zavrsni-rad', label: 'završni rad', labelCap: 'Završni rad' },
  graduate: { slug: 'diplomski-rad', label: 'diplomski rad', labelCap: 'Diplomski rad' },
  specialist: { slug: 'specijalisticki-rad', label: 'specijalistički rad', labelCap: 'Specijalistički rad' },
  doctoral: { slug: 'doktorski-rad', label: 'doktorski rad', labelCap: 'Doktorski rad' },
};

// Prikazni redoslijed nezavisan o TARGET_WORK_TYPES (procesni redoslijed): akademska
// progresija (seminarski se pise tijekom studija, zavrsni/diplomski su zavrsni koraci).
const WORK_TYPE_DISPLAY_ORDER = ['seminar', 'final', 'graduate'];

// Lagana, proza-samo kopija tokena iz src/citations/citation-meta.ts (izbjegava esbuild
// bundling punog citatnog enginea za stranice koje nemaju interaktivan alat).
// Duplikat src/title-pages/level-slugs.ts's LEVEL_SLUGS (?razina= param koji naslovnica.html
// vec cita preko parseTitlePageParams). Namjerna duplikacija (isti obrazac kao CITATION_LABELS
// nize) - .mjs build skripte su odvojene od src/ TS-a, nema bundlera ovdje. export radi
// drift-testa (tests/faculty-page-razina-slug-drift.test.ts usporedjuje protiv pravog LEVEL_SLUGS).
export const RAZINA_PARAM_SLUGS = {
  seminar: 'seminarski',
  final: 'zavrsni',
  graduate: 'diplomski',
  specialist: 'specijalisticki',
  doctoral: 'doktorski',
  article: 'clanak',
  project: 'projektni',
};

const CITATION_LABELS = {
  fpzg: 'FPZG autor-godina',
  'pravo-fusnote': 'Pravni fakultet: pravne fusnote',
  'pravo-social-author': 'Pravni fakultet: Socijalni rad autor-godina',
  apa7: 'APA 7',
  harvard: 'Harvard / autor-godina',
  'chicago-author': 'Chicago autor-datum',
  'chicago-notes': 'Chicago fusnote',
  mla9: 'MLA 9',
  vancouver: 'Vancouver',
  ieee: 'IEEE',
  custom: 'prema posebnim uputama',
};

function loadJson(p) {
  if (!fs.existsSync(p)) {
    console.error(`[generate-faculty-pages] Nedostaje ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonInline(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function fmtCm(n) {
  return Number(n).toFixed(1).replace(/\.0$/, '').replace('.', ',');
}

function fmtInt(n) {
  return Number(n).toLocaleString('hr-HR');
}

function fmtDateHr(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}.`;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function dedupeStrings(arrays) {
  const seen = new Set();
  const out = [];
  for (const arr of arrays) {
    for (const s of arr || []) {
      if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
  }
  return out;
}

function dedupeSources(group) {
  const seen = new Map();
  for (const p of group) for (const s of p.sources || []) if (s?.url && !seen.has(s.url)) seen.set(s.url, s);
  return [...seen.values()];
}

// Pretraga na /fakulteti master indeksu (buildMasterIndexPage): namjeran duplikat pravila iz
// src/ui/select-search.ts (.mjs build skripte su odvojene od src/ TS-a, ista konvencija kao
// CITATION_LABELS/RAZINA_PARAM_SLUGS nize) - dijakritika-neosjetljivo, tokenizirani AND-match.
// export radi testabilnosti (tests/generate-faculty-pages.test.ts); klijentska verzija u
// FAKULTETI_SEARCH_JS je namjerni string-duplikat iste logike, ne import (nema bundlera ovdje).
export function normalizeSearch(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
}

export function matchesQuery(query, normalizedHaystack) {
  return normalizeSearch(query).split(/\s+/).filter(Boolean).every((t) => normalizedHaystack.includes(t));
}

// Rjesava "kako se vratim na /fakulteti/ kad otvorim drugi fakultet": stari kicker redak
// (institucija · jedinica, obican tekst) postaje funkcionalan breadcrumb: Svi fakulteti >
// Institucija > Jedinica[ > Program]. Institucija linka na sidro unutar /fakulteti/
// (buildMasterIndexPage stavlja id=inst.id na svaki <h2>), pa povratak ne baci korisnika na
// vrh liste od ~50 ustanova nego ravno na njegovu - ujedno i put do SVIH jedinica iste
// institucije (npr. svih rijeckih sastavnica), ne samo generalni "natrag". Male/privatne
// ustanove (npr. Algebra) su registrirane s institucijom == jedinom jedinicom, pa se
// institucijski clan izostavlja da se isto ime ne ponovi dvaput.
function breadcrumbCrumbs(meta, unitHref, currentLabel) {
  const crumbs = [{ label: 'Svi fakulteti', href: '/fakulteti/' }];
  if (meta.instName !== meta.name) crumbs.push({ label: meta.instName, href: `/fakulteti/#${meta.instId}` });
  crumbs.push({ label: meta.name, href: currentLabel ? unitHref : undefined });
  if (currentLabel) crumbs.push({ label: currentLabel, href: undefined });
  return crumbs;
}

function breadcrumbHtml(crumbs) {
  const inner = crumbs
    .map((c) => (c.href
      ? `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`
      : `<span aria-current="page">${escapeHtml(c.label)}</span>`))
    .join('<span class="sep">›</span>');
  return `<nav class="lekta-kicker" aria-label="Navigacija">${inner}</nav>`;
}

// BreadcrumbList: Google prikaze ovo umjesto sirovog URL-a u rezultatima pretrage - isti
// podatak kao vizualni breadcrumb gore, samo strojno citljiv.
function breadcrumbJsonLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `${SITE_ORIGIN}${c.href}` } : {}),
    })),
  };
}

// Neki unizd programi vec u programs[0] nose "(diplomski rad, Zadar)" ugradjeno u ime
// (umjesto cistog naziva odjela), sto duplicira vrstu rada koja je vec u naslovu/URL-u
// stranice. Zamjena "(vrsta rada, Grad)" -> "(Grad)" cisti to bez diranja PRAVIH varijanti
// (npr. FPZG "(Tekstualni završni rad)" nema zarez unutar zagrade pa ostaje netaknuto).
function programLabel(p) {
  const base = p.variantLabel ? `${p.programs?.[0] || p.profileLabel} (${p.variantLabel})` : (p.programs?.[0] || p.profileLabel || p.id);
  return base.replace(/\((?:diplomski|završni|zavrsni|preddiplomski|prijediplomski)\s+rad,\s*([^()]+)\)/i, '($1)');
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Naziv studija nosi kvalifikatore vrste studija ("Diplomski studij", "Sveučilišni
// integrirani...") koji su vec u worktype dijelu URL-a; ovdje se strippaju da slug bude
// samo predmetno podrucje (npr. "Diplomski studij Politologija" -> "politologija").
const PROGRAM_QUALIFIER_RE = /\b(sveučilišni|integrirani|stručni|prijediplomski|preddiplomski|diplomski|specijalistički|poslijediplomski|doktorski|studij)\b/gi;
function programSlug(program) {
  const stripped = program
    .replace(PROGRAM_QUALIFIER_RE, ' ')
    .replace(/\s+i\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return slugify(stripped || program);
}

// --- Polja koja usporedjujemo po programu; wordMin/wordMax idu kao jedan spareni redak ---
// checkKey: neki profili (cesto STEM-advisory, vidi memoriju batch4-stem-advisory-pattern)
// imaju npr. checkFont:false - vrijednost je TU, ali NIJE bodovana/obvezna, samo informativna.
// Bez ovog gate-a bismo takvu vrijednost prikazali kao tvrdu cinjenicu, sto nije posteno.
const FIELD_SPECS = [
  // Svaka format() funkcija MORA vratiti null (ne stringificirani "undefined") kad polje
  // stvarno ne postoji u profilu (npr. Algebra profili nemaju font/size/spacing/margins u
  // rules uopce) - inace se null-provjera "values.every(v => v == null)" nikad ne okine i
  // stranica ispise doslovno "undefined pt".
  { key: 'font', label: 'Font', checkKey: 'checkFont', format: (v) => (v == null ? null : Array.isArray(v) ? v.join(' ili ') : String(v)) },
  { key: 'size', label: 'Veličina', checkKey: 'checkSize', format: (v) => (v == null ? null : `${Array.isArray(v) ? v.join('/') : v} pt`) },
  { key: 'spacing', label: 'Prored', checkKey: 'checkSpacing', format: (v) => (v == null ? null : String(v).replace('.', ',')) },
  {
    key: 'margins', label: 'Margine', checkKey: 'checkMargins',
    format: (v) => (v ? `${fmtCm(v.top)} / ${fmtCm(v.right)} / ${fmtCm(v.bottom)} / ${fmtCm(v.left)} cm (gore/desno/dolje/lijevo)` : null),
  },
  { key: 'justify', label: 'Poravnanje', checkKey: 'checkJustify', format: (v) => (v ? 'obostrano' : null) },
  { key: 'requireA4', label: 'Format papira', format: (v) => (v ? 'A4' : 'nije posebno propisano') },
  {
    key: 'wordMin', label: 'Opseg (riječi)', pairWith: 'wordMax',
    format: (v, rules) => (v && rules?.wordMax ? `${fmtInt(v)}–${fmtInt(rules.wordMax)} riječi` : null),
  },
  { key: 'minReferences', label: 'Minimalno izvora', format: (v) => (v ? `${v}` : null) },
  { key: 'recommendedCitation', label: 'Citatni stil', format: (v) => (v ? (CITATION_LABELS[v] || v) : null) },
];

function computeFactRows(group) {
  const rows = [];
  const skip = new Set();
  for (const spec of FIELD_SPECS) {
    if (skip.has(spec.key)) continue;
    if (spec.pairWith) skip.add(spec.pairWith);
    const values = group.map((p) => {
      if (spec.checkKey) {
        const explicit = p.rules?.[spec.checkKey];
        // explicit===false: profil sam kaze "ovo je informativno, ne bodovano" - ne tvrdi.
        // explicit===true: profil sam kaze "ovo JEST bodovano" - vjeruj tome BEZ obzira na
        // opci status profila (npr. seminarski "opci akademski rad" profili su status
        // 'partial' jer opseg/struktura nisu pokriveni, ali font/velicina/prored IMAJU
        // eksplicitni checkFont:true - to je stvarno bodovano, ne smije se sakriti).
        // explicit===undefined: nema eksplicitne potvrde ni u jednu stranu (npr. FER, gdje
        // profil.facts[] sam tekstom kaze "advisory" bez checkFont uopce) - u tom slucaju
        // vjeruj SAMO ako je citav profil status 'verified' (najjaca razina potvrde).
        if (explicit === false) return null;
        if (explicit !== true && p.status !== 'verified') return null;
      }
      return spec.format(p.rules?.[spec.key], p.rules);
    });
    if (values.every((v) => v == null)) continue;
    const uniform = values.every((v) => deepEqual(v, values[0]));
    if (uniform) {
      rows.push({ label: spec.label, uniform: true, value: values[0] });
    } else {
      rows.push({
        label: spec.label,
        uniform: false,
        byProgram: group.map((p, i) => ({ program: programLabel(p), value: values[i] ?? 'nije javno potvrđeno' })),
      });
    }
  }
  return rows;
}

function weakestStatus(group) {
  const order = ['generic', 'research', 'partial', 'verified'];
  return group.reduce((worst, p) => (order.indexOf(p.status) < order.indexOf(worst) ? p.status : worst), 'verified');
}

// Coverage Card ("Sto Lekta pokriva"): 3 razine (full/partial/none) po dimenziji. export radi
// testabilnosti (tests/generate-faculty-pages.test.ts).

// Uzak allowlist iz FIELD_SPECS koji broji kao "Oblikovanje" - factRows inace MIJESA
// formatiranje s opsegom/min.izvora/citatnim stilom u JEDAN niz; bez ovog allowlista bi
// "Oblikovanje" i "Citiranje" tier dvostruko brojali isti "Citatni stil" redak.
const FORMAT_LABELS = new Set(['Font', 'Veličina', 'Prored', 'Margine', 'Poravnanje', 'Format papira']);

export function formattingCoverage(factRows, status) {
  const rows = factRows.filter((r) => FORMAT_LABELS.has(r.label));
  if (!rows.length) return 'none';
  return status === 'verified' ? 'full' : 'partial';
}

export function citationCoverage(unitId, factRows, citationIndex) {
  if (citationIndex.some((s) => s.facultyId === unitId)) return 'full';
  // "Citatni stil" redak (FIELD_SPECS 'recommendedCitation') znaci obiteljski stil BEZ
  // vlastitog verificiranog speca - posteno "djelomicno", ne "puno".
  return factRows.some((r) => r.label === 'Citatni stil') ? 'partial' : 'none';
}

export function titlePageCoverage(unitId, workType, templatesIndex) {
  const candidates = templatesIndex.filter((t) => t.unitId === unitId);
  if (!candidates.length) return 'none';
  // Replicira prioritet iz resolveTemplate() (src/title-pages/template-loader.ts): tocna
  // razina ILI level=null (genericki fakultetski predlozak) = puno povjerenje.
  if (candidates.some((t) => t.level === workType || t.level === null)) return 'full';
  // Predlozak postoji, ali SAMO za drugu vrstu rada (REUSE_ORDER grana) - djelomicno.
  return 'partial';
}

const COVERAGE_TIER_GLYPH = { full: '✓', partial: '△', none: '○' };

function buildCoverageCardHtml(items) {
  const rows = items
    .map((it) => `<li class="cov-${it.tier}"><span class="cov-glyph">${COVERAGE_TIER_GLYPH[it.tier]}</span> ${escapeHtml(it.label)}</li>`)
    .join('');
  return `<h2>Što Lekta pokriva</h2><ul class="coverage-list">${rows}</ul><p class="coverage-unknown">△ i ○ ne znače grešku: Lekta ne pretpostavlja pravila koja nisu javno potvrđena. Zahtjeve mentora ili pojedinog kolegija Lekta ne poznaje - ako postoji pisana uputa, unesi je ručno prije predaje.</p>`;
}

// Mapiranje generatorovog internog workType tokena (seminar/final/graduate) na vokabular koji
// koristi data/submission/academic-deadlines.json (seminarski/zavrsni/diplomski/doktorski, BEZ
// dijakritike - isti kanonski token kao toReportWorkType() u src/report/report-work-type.ts,
// koji vec koristi deadline-reminder-toggle.ts za identicnu vrstu pretrage).
const DEADLINE_WORKTYPE_MAP = { seminar: 'seminarski', final: 'zavrsni', graduate: 'diplomski' };

function isDeadlineTrusted(entry) {
  return entry.confirmed === true || entry?.verification?.autoVerified === true;
}

// Najskoriji POZNATI buduci rok predaje za (unitId, workType), preko svih programa/rokova te
// jedinice - namjerno BEZ programId filtera i BEZ tvrdnje da vrijedi za svaki program. Copy koji
// ovo koristi mora reci "najbliži poznati rok" (istinito bez obzira razlikuje li se po programu),
// nikad "rok za tvoj program" (to bismo mogli tvrditi samo uz stvaran programId match).
function nearestDeadlineIso(unitId, workType, registry, todayIso) {
  const mapped = DEADLINE_WORKTYPE_MAP[workType];
  if (!mapped) return null;
  const matches = registry.filter(
    (e) => isDeadlineTrusted(e) && e.facultyId === unitId && e.workType === mapped && e.deadlineDate >= todayIso,
  );
  if (!matches.length) return null;
  return matches.reduce((min, e) => (e.deadlineDate < min ? e.deadlineDate : min), matches[0].deadlineDate);
}

function daysUntilIso(iso, todayIso) {
  return Math.round((Date.parse(iso) - Date.parse(todayIso)) / 86400000);
}

// Ton prati fazu ciklusa do roka (isti prag-sustav 30/14/7/3/0 dana kao 5 razina u
// send-reminders/index.ts) - dalek rok je informativan, blizak rok izravniji poziv na akciju.
// NAMJERNO bez nove CSS klase: i dalje isti .deadline-note okvir, mijenja se samo tekst.
function deadlineUrgencyLead(days) {
  if (days > 14) return 'Za planiranje';
  if (days > 7) return 'Vrijeme za prvu tehničku provjeru';
  if (days > 3) return 'Rok se približava';
  if (days > 0) return 'Zadnji dani prije roka';
  return 'Rok je danas';
}

const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;
const DEMO_IMAGE = `${SITE_ORIGIN}/assets/demo-poster.jpg`;

// Ista vizualna obitelj kao citation-tools generator ("Korektorski stol": tamni stol, crvena
// jedini akcent, list papira svijetao u obje teme) - vidi CLAUDE.md/memoriju design-identity.
// Namjerno DUPLICIRANA (ne dijeljena) s generate-citation-tools.mjs: dva neovisna generatora,
// izbjegava se koupling; ako se vizualni identitet promijeni, oba mjesta treba azurirati.
const PAGE_STYLE = `
  :root {
    color-scheme: dark;
    --desk:#191512; --desk-ink:#EDE7DC;
    --paper:#F7F3E8; --paper-2:#F0EAD9; --paper-ink:#26221B; --paper-muted:#6E6656; --paper-line:#DCD4BF; --paper-line-strong:#C6BCA2;
    --sheet:#FDFBF3;
    --red:#E4573D; --red-deep:#C4372E; --red-soft:#F6E3DE; --on-red:#FFF6EF;
    --paper-sh:0 3px 8px rgba(0,0,0,.35),0 22px 60px rgba(0,0,0,.55);
    --font-serif:Georgia,"Iowan Old Style","Times New Roman",serif;
    --font-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  :root[data-theme="light"] { color-scheme: light; --desk:#DFD8C6; --desk-ink:#26221B; --paper:#FDFBF3; --paper-2:#F4EFDF; --sheet:#FFFFFF; --red:#C4372E; --paper-sh:0 2px 6px rgba(56,46,32,.16),0 18px 44px rgba(56,46,32,.2); }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) { color-scheme: light; --desk:#DFD8C6; --desk-ink:#26221B; --paper:#FDFBF3; --paper-2:#F4EFDF; --sheet:#FFFFFF; --red:#C4372E; --paper-sh:0 2px 6px rgba(56,46,32,.16),0 18px 44px rgba(56,46,32,.2); }
  }
  * { box-sizing: border-box; }
  html { background: var(--desk); min-height: 100%; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    max-width: 780px; margin: 2rem auto; padding: 1.75rem 1.85rem 2.5rem;
    color: var(--paper-ink); line-height: 1.6; position: relative;
    background: var(--paper); border: 1px solid var(--paper-line); border-radius: 2px; box-shadow: var(--paper-sh);
  }
  body::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--red-deep); }
  .lekta-brand { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.03em; color: var(--paper-muted); margin-bottom: 0.9rem; }
  .lekta-brand a { color: var(--paper-muted); text-decoration: none; font-weight: 700; }
  .lekta-kicker { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.03em; color: var(--paper-muted); margin-bottom: 0.4rem; }
  h1 { font-family: var(--font-serif); font-weight: 600; font-size: 1.7rem; letter-spacing: -0.01em; line-height: 1.18; margin: 0.1rem 0 0.6rem; color: var(--paper-ink); }
  h2 { font-family: var(--font-serif); font-size: 1.15rem; font-weight: 600; margin: 1.9rem 0 0.6rem; color: var(--paper-ink); border-bottom: 1px solid var(--paper-line); padding-bottom: 0.35rem; }
  .lekta-lead { font-size: 1rem; color: var(--paper-ink); margin: 0 0 1.1rem; }
  .status-badge { display: inline-block; font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.02em; padding: 0.2rem 0.55rem; border-radius: 2px; background: var(--paper-2); border: 1px solid var(--paper-line); color: var(--paper-muted); margin-bottom: 0.8rem; }
  .verified-badge { display: inline-block; font-family: var(--font-mono); font-size: 0.72rem; color: var(--paper-muted); margin-left: 0.5rem; }
  .fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.6rem; margin: 0.8rem 0; }
  .fact-card { background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); border-radius: 0 2px 2px 0; padding: 0.5rem 0.7rem; }
  .fact-card span { display: block; font-family: var(--font-mono); font-size: 0.68rem; color: var(--paper-muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .fact-card b { font-family: var(--font-serif); font-size: 0.98rem; font-weight: 600; }
  .fact-card i.fc-check { display: block; font-style: normal; font-size: 0.68rem; font-weight: 600; color: var(--red-deep); margin-top: 0.3rem; }
  .deadline-note { font-size: 0.88rem; background: var(--red-soft); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); border-radius: 0 2px 2px 0; padding: 0.55rem 0.75rem; margin: 0.9rem 0; }
  table.by-program { width: 100%; border-collapse: collapse; margin: 0.6rem 0 1rem; font-size: 0.9rem; }
  table.by-program th, table.by-program td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--paper-line); }
  table.by-program th { font-family: var(--font-mono); font-size: 0.7rem; color: var(--paper-muted); text-transform: uppercase; letter-spacing: 0.02em; }
  ul.check-list { margin: 0.5rem 0; padding-left: 1.2rem; }
  ul.check-list li { margin: 0.35rem 0; }
  .deviation-note { font-size: 0.9rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); border-radius: 0 2px 2px 0; padding: 0.6rem 0.8rem; margin: 0.6rem 0; }
  .lekta-demo { margin: 1.1rem 0; }
  .lekta-demo img { width: 100%; border-radius: 2px; border: 1px solid var(--paper-line); display: block; }
  .lekta-demo figcaption { font-size: 0.8rem; color: var(--paper-muted); margin-top: 0.4rem; }
  .lekta-cta-box { margin: 1.6rem 0; padding: 1.1rem 1.2rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-radius: 2px; text-align: center; }
  .lekta-cta-box a.btn { display: inline-block; margin-top: 0.5rem; padding: 0.65rem 1.3rem; background: var(--red-deep); color: var(--on-red); font-weight: 700; text-decoration: none; border-radius: 2px; }
  .lekta-cta-box a.btn:hover { background: var(--red); }
  .lekta-cta-box p.priv { font-size: 0.78rem; color: var(--paper-muted); margin-top: 0.5rem; }
  .source-list { margin: 0.5rem 0; padding-left: 1.1rem; font-size: 0.9rem; }
  .source-list li { margin: 0.3rem 0; }
  .source-list a { color: var(--red-deep); }
  .lekta-disclaimer { font-size: 0.8rem; color: var(--paper-muted); margin-top: 1.6rem; padding-top: 0.9rem; border-top: 1px solid var(--paper-line); }
  .lekta-links { margin-top: 1.2rem; font-size: 0.85rem; }
  .lekta-links a { color: var(--red-deep); margin-right: 1rem; }
  .worktype-nav { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.9rem 0 0.3rem; }
  .worktype-nav .worktype-current, .worktype-nav a { font-family: var(--font-mono); font-size: 0.78rem; padding: 0.3rem 0.65rem; border-radius: 2px; border: 1px solid var(--paper-line); text-decoration: none; }
  .worktype-nav .worktype-current { background: var(--red-deep); color: var(--on-red); border-color: transparent; font-weight: 700; }
  .worktype-nav a { color: var(--paper-ink); background: var(--paper-2); }
  .worktype-nav a:hover { background: var(--paper-line); }
  .lekta-kicker a { color: var(--paper-muted); text-decoration: none; }
  .lekta-kicker a:hover { color: var(--paper-ink); text-decoration: underline; }
  .lekta-kicker .sep { margin: 0 0.35em; color: var(--paper-line-strong); }
  .fk-search { margin: 1rem 0 1.4rem; padding: 0.9rem 1rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-radius: 2px; }
  .fk-search label { display: block; font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--paper-muted); margin-bottom: 0.4rem; }
  .fk-search input[type="search"] { width: 100%; padding: 0.55rem 0.7rem; font-size: 0.95rem; border: 1px solid var(--paper-line-strong); border-radius: 2px; background: var(--sheet); color: var(--paper-ink); }
  .fk-search input[type="search"]:focus { outline: 2px solid var(--red-deep); outline-offset: 1px; }
  .fk-search-count { margin: 0.4rem 0 0; font-size: 0.78rem; color: var(--paper-muted); }
  .fk-search-empty { font-size: 0.9rem; color: var(--paper-muted); }
  .coverage-pending-label { font-size: 0.82rem; color: var(--paper-muted); margin: 0.7rem 0 0.2rem; }
  ul.coverage-pending { opacity: 0.85; }
  ul.coverage-pending li { font-size: 0.92rem; }
  ul.coverage-list { list-style: none; margin: 0.6rem 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.4rem; }
  ul.coverage-list li { padding: 0.35rem 0.6rem; border: 1px solid var(--paper-line); border-radius: 2px; background: var(--paper-2); font-size: 0.88rem; }
  ul.coverage-list li.cov-full { border-left: 3px solid var(--red-deep); }
  ul.coverage-list li.cov-partial,ul.coverage-list li.cov-none { color: var(--paper-muted); }
  ul.coverage-list .cov-glyph { font-weight: 700; margin-right: 0.3rem; }
  .coverage-unknown { font-size: 0.82rem; color: var(--paper-muted); }
  .lekta-consent-banner { display: none; position: fixed; left: 18px; right: 18px; bottom: 18px; z-index: 240; margin: auto; max-width: 760px; padding: 1rem 1.1rem; border: 1px solid var(--paper-line); border-radius: 2px; background: var(--paper); color: var(--paper-ink); box-shadow: var(--paper-sh); align-items: center; justify-content: space-between; gap: 1rem; }
  .lekta-consent-banner.is-visible { display: flex; }
  /* Rezerva prostora ispod trake o privoli. Ove stranice ne ucitavaju tool-page.css, nego nose
     VLASTITU kopiju ovog stila, pa ih popravak ondje nije dosegao i dno je ostajalo zaklonjeno na
     cijelom fakultetskom skupu. Samo za ekran: u ispisu bi rezerva trosila visinu lista.
     BEZ BACKTICKOVA: cijeli ovaj blok zivi u template literalu, pa backtick u komentaru prekida
     literal i rusi build (dogodilo se 2026-08-31, node --check je padao na ovom retku).
     Pravilo za ispis mora gadjati .is-visible: goli .lekta-consent-banner (0,1,0) gubi od
     .lekta-consent-banner.is-visible (0,2,0), pa bi bilo mrtvo. */
  @media screen { body:has(.lekta-consent-banner.is-visible) { padding-bottom: 96px; } }
  @media screen and (max-width: 720px) { body:has(.lekta-consent-banner.is-visible) { padding-bottom: 164px; } }
  @media print { .lekta-consent-banner, .lekta-consent-banner.is-visible { display: none; } }
  .lekta-consent-banner p { margin: 0; font-size: 0.78rem; color: var(--paper-muted); max-width: 480px; }
  .lekta-consent-actions { display: flex; gap: 0.5rem; flex: 0 0 auto; }
  .lekta-consent-actions button { border: 0; border-radius: 2px; padding: 0.55rem 0.8rem; font: 600 0.78rem system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  .lekta-consent-actions button[data-consent="grant"] { background: var(--red-deep); color: var(--on-red); }
  .lekta-consent-actions button[data-consent="deny"] { background: transparent; border: 1px solid var(--paper-line); color: var(--paper-ink); }
  @media (max-width: 700px) { .lekta-consent-banner { align-items: stretch; flex-direction: column; } .lekta-consent-actions { width: 100%; } .lekta-consent-actions button { flex: 1; } }
  a { color: var(--red-deep); }
  @media (max-width: 700px) { body { margin: 0; max-width: none; border-radius: 0; border-left-width: 0; border-right-width: 0; box-shadow: none; } }
`;

function pageShell({ title, description, canonical, bodyHtml, robots, jsonLd, extraScripts }) {
  const ogName = title.replace(/ \| Lekta$/, '');
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>try{var _t=localStorage.getItem('lekta.theme');if(_t)document.documentElement.dataset.theme=_t;}catch(e){}</script>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${robots ? `<meta name="robots" content="${robots}">` : ''}
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lekta">
<meta property="og:locale" content="hr_HR">
<meta property="og:title" content="${escapeHtml(ogName)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(ogName)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<script type="application/ld+json">${jsonInline(jsonLd)}</script>
<style>${PAGE_STYLE}</style>
</head>
<body>
<header class="lekta-brand"><a href="/">Lekta</a><span>Besplatna tehnička provjera</span></header>
<main>
${bodyHtml}
</main>
${(extraScripts || []).map((src) => `<script src="${escapeHtml(src)}"></script>`).join('')}
</body>
</html>
`;
}

function buildFactGrid(rows) {
  const direct = rows.filter((r) => r.uniform);
  if (!direct.length) return '';
  return `<div class="fact-grid">${direct.map((r) => `<div class="fact-card"><span>${escapeHtml(r.label)}</span><b>${escapeHtml(r.value)}</b><i class="fc-check">✓ provjerava Lekta</i></div>`).join('')}</div>`;
}

function buildDivergenceTables(rows) {
  const divergent = rows.filter((r) => !r.uniform);
  if (!divergent.length) return '';
  return divergent.map((r) => `
<p><strong>${escapeHtml(r.label)}</strong> se razlikuje po studijskom programu:</p>
<table class="by-program"><thead><tr><th>Program</th><th>${escapeHtml(r.label)}</th></tr></thead><tbody>
${r.byProgram.map((x) => `<tr><td>${escapeHtml(x.program)}</td><td>${escapeHtml(x.value)}</td></tr>`).join('')}
</tbody></table>`).join('');
}

function worktypeNavHtml(workType, siblings) {
  if (!siblings || !siblings.length) return '';
  return `<div class="worktype-nav"><span class="worktype-current" aria-current="page">${escapeHtml(WORK_TYPE_META[workType].labelCap)}</span>${siblings.map((s) => `<a href="${escapeHtml(s.path)}">${escapeHtml(s.label)}</a>`).join('')}</div>`;
}

// programQualifier + slugOverride: postavlja main() KAD je grupa prevelika/neuniformna za jednu
// fakultetsku stranicu - tada je "group" JEDAN profil. programQualifier ("Psihologija") ide u
// naslov/tekst da stranica ne tvrdi da vrijedi za cijeli fakultet; slugOverride je VEC
// razrijesen (i po potrebi disambiguiran protiv kolizije u main()) segment URL-a - ne racuna se
// ponovno ovdje, da se main()-ova disambiguacija i stvarna putanja fajla ne mogu razici.
// siblings: [{url,label}] za DRUGE vrste rada na istom fakultetu koje stvarno postoje (main()
// ovo racuna u prolazu 1 prije nego se ijedna stranica konacno renderira - vidi main()).
function buildFacultyPage(unitId, workType, group, unitMeta, statusMeta, programQualifier, slugOverride, siblings, deadlines, todayIso, citationIndex, templatesIndex) {
  const meta = unitMeta[unitId];
  if (!meta) {
    console.error(`[generate-faculty-pages] FAIL: unitId "${unitId}" nije u zagreb-catalog.json`);
    process.exit(1);
  }
  const wt = WORK_TYPE_META[workType];
  const status = weakestStatus(group);
  const statusInfo = statusMeta[status] || statusMeta.generic;
  // Zastita protiv "tvrde brojke bez pokrica" je sad NA RAZINI POLJA (vidi computeFactRows/
  // FIELD_SPECS gore): eksplicitni checkX:true se prikazuje bez obzira na status profila (npr.
  // seminarski "opci akademski rad" profili su status 'partial' jer opseg/struktura nisu
  // pokriveni, ali imaju eksplicitni checkFont:true za tehnicko oblikovanje), a polja bez
  // eksplicitne potvrde se prikazuju samo kod potpuno 'verified' profila (fer-diplomski slucaj).
  const factRows = computeFactRows(group);
  const facts = dedupeStrings(group.map((p) => p.facts));
  const manualChecks = dedupeStrings(group.map((p) => p.rules?.manualChecks));
  const submissionFacts = dedupeStrings(group.map((p) => p.submissionFacts));
  // NAMJERNO se ne koristi fieldValidation.observedDeviations: to su interne verifikacijske
  // biljeske (znaju sadrzavati sirove PID-ove repozitorijskih radova, npr. "fpzg:1840") pisane
  // za tim koji odrzava profile, ne za javnu stranicu. CLAUDE.md: repozitorijski radovi sluze
  // iskljucivo regresijskom testiranju parsera, nikad kao javno vidljiv sadrzaj.
  const sources = dedupeSources(group);
  const verifiedDates = [...new Set(group.map((p) => p.verifiedAt).filter(Boolean))].sort();
  const verifiedAt = verifiedDates[verifiedDates.length - 1] || null;
  const multiProgram = group.length > 1;
  const deadlineIso = nearestDeadlineIso(unitId, workType, deadlines, todayIso);
  // Flat facts[] popis je siguran SAMO kod jednog profila: kod vise programa bi neoznaceno
  // miksanje brojki koje se razlikuju po programu ("10.000-12.000" i "12.000-15.000" u istoj
  // listi bez konteksta) djelovalo proturjecno. factRows (fact-grid + tablica po programu) gore
  // vec posteno pokriva taj slucaj s atribucijom, pa se za multiProgram grupe ne treba i ne
  // smije oslanjati na facts[].
  const showFacts = facts.length > 0 && !multiProgram;

  // Coverage Card ("Sto Lekta pokriva") + footer cross-linkovi (Korak 5) dijele ISTE tierove -
  // racunaju se OVDJE, unutar buildFacultyPage, koristeci NJEGOVE lokalne varijable
  // (factRows/status/submissionFacts/deadlineIso) - kod MAX_GROUP_SIZE splita (npr. FFZG
  // diplomski) buildFacultyPage se vec poziva JEDNOM PO PODSTRANICI, pa su automatski tocni
  // po-podstranici bez ikakve posebne logike.
  const citationTier = citationCoverage(unitId, factRows, citationIndex);
  const titlePageTier = titlePageCoverage(unitId, workType, templatesIndex);
  const coverageCardHtml = buildCoverageCardHtml([
    { label: 'Oblikovanje', tier: formattingCoverage(factRows, status) },
    { label: 'Citiranje', tier: citationTier },
    { label: 'Naslovnica', tier: titlePageTier },
    { label: 'Predaja', tier: submissionFacts.length > 0 ? 'full' : 'none' },
    { label: 'Rokovi', tier: deadlineIso ? 'full' : 'none' },
  ]);

  // Footer cross-linkovi (Korak 5): citatni link je popravak postojece rupe - bezuvjetni
  // /alati/citati/<unitId>.html je bio MRTAV link za oko 40% jedinica (generate-citation-tools.mjs
  // generira po-jedinici stranicu SAMO kad postoji token/spec) I za jedinice s VISE renderable
  // stilova (npr. "pravo" ima 2 verificirana citatna stila) slugFor() ondje NE koristi goli
  // <unitId>.html nego <unitId>-<stil>.html - citationTier ne moze pouzdano predvidjeti TOCAN
  // slug bez repliciranja te logike (namjerno izbjegnuto, krsi ne-coupling konvenciju izmedju
  // generatora). Umjesto pogadjanja: provjeri STVARNO postoji li /alati/citati/<unitId>.html na
  // disku (generate-citation-tools.mjs se VEC pokrece PRIJE ovog generatora u netlify.toml
  // lancu) - ako ne postoji (bilo zato sto fakultet nema stil, bilo zato sto ima vise stilova
  // pa je slug drugaciji), siguran fallback je /alati/citati/index.html, koji taj generator
  // UVIJEK pise bezuvjetno.
  const citatiFileExists = fs.existsSync(path.join(OUT_DIR, 'alati/citati', `${unitId}.html`));
  const citationLinkHref = citatiFileExists ? `/alati/citati/${encodeURIComponent(unitId)}.html` : '/alati/citati/index.html';
  const citationLinkLabel = citatiFileExists ? `Generator citata za ${meta.name}` : 'Generator citata (svi stilovi)';
  // Naslovnica: ?fakultet=&razina= je VEC POSTOJECI ugovor koji naslovnica.html cita
  // (parseTitlePageParams, src/title-pages/title-page-params.ts). titlePageTier==='full' znaci
  // stvaran predlozak za TOCNU vrstu rada (ili genericki fakultetski, level=null) - imenuj ga
  // konkretno; 'partial'/'none' NE tvrde specifican predlozak (levelReused ili nema nikakvog).
  const naslovnicaHref = `/naslovnica.html?fakultet=${encodeURIComponent(unitId)}&razina=${encodeURIComponent(RAZINA_PARAM_SLUGS[workType])}`;
  const naslovnicaLabel = titlePageTier === 'full' ? `Naslovnica za ${meta.name}` : 'Naslovnica (generički raspored)';

  // Honesty gate: bez stvarnog sadrzaja se ne objavljuje prazna/tanka stranica. Koristi
  // showFacts (ne sirovi facts.length) da se ne "prevari" gate necim sto se ionako nece prikazati.
  const hasContent = factRows.length > 0 || showFacts || manualChecks.length > 0 || sources.length > 0;
  if (!hasContent) return null;

  const urlSlug = slugOverride || wt.slug;
  const relPath = `/${unitId}/${urlSlug}/`;
  // canonical/og:url/JSON-LD MORAJU biti apsolutni (specifikacija); SVAKI klikabilni <a href>
  // unutar stranice (CTA, sibling-nav, footer) MORA biti RELATIVAN (relPath, ne canonical) -
  // inace klik na lokalnom vite preview-u (localhost) odvede na pravu produkcijsku domenu
  // umjesto da ostane na localhost, sto izgleda kao "stranica ne postoji" iako je generator
  // ispravan. Zove se relPath, ne path, da ne zasjeni uvezeni node:path modul.
  const canonical = `${SITE_ORIGIN}${relPath}`;
  const facultyTitlePart = programQualifier ? `${meta.name}, ${programQualifier}` : meta.name;
  const title = `${facultyTitlePart}: ${wt.labelCap} · tehnička pravila prije predaje | Lekta`;
  // Konkretne brojke (opseg, broj izvora...) u meta descriptionu SAMO kad postoji jedan profil:
  // kod vise programa u grupi brojke mogu biti razlicite po programu (vidi divergenciju nize),
  // pa navodjenje jednog broja kao reprezentativnog za sve bilo bi neposteno.
  const description = (!multiProgram && facts.length)
    ? `${facultyTitlePart}, ${wt.label}: ${facts.slice(0, 3).join(', ')}. Izvor i datum provjere niže. Besplatna automatska provjera prema ovim pravilima.`
    : `${facultyTitlePart}, ${wt.label}: tehnička pravila oblikovanja, opsega i citiranja prema službenim izvorima. Besplatna automatska provjera.`;

  const ctaHref = `/?unit=${encodeURIComponent(unitId)}&utm_source=faculty_page&utm_medium=organic&utm_campaign=${encodeURIComponent(unitId + '_' + workType)}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title.replace(/ \| Lekta$/, ''),
    description,
    url: canonical,
    inLanguage: 'hr',
    ...(verifiedAt ? { dateModified: verifiedAt } : {}),
    isPartOf: { '@type': 'WebSite', name: 'Lekta', url: SITE_ORIGIN },
  };
  const unitHref = programQualifier ? `/${unitId}/${wt.slug}/` : undefined;
  const crumbs = breadcrumbCrumbs(meta, unitHref, programQualifier);

  // "na {Ime}" bi u hrvatskom trazio deklinaciju (dativ: "na Fakultetu", ne "na Fakultet"),
  // koju ne mozemo pouzdano izvesti za proizvoljna imena ustanova; dvotocka/zarez izbjegava
  // gramaticki problem umjesto da rizicira pogresan padez.
  const programNote = programQualifier
    ? `<p class="lekta-lead">Vrijedi za studij: ${escapeHtml(group.map(programLabel).join(', '))}. ${escapeHtml(meta.name)} ima više studijskih programa s različitim pravilima; <a href="/${unitId}/${wt.slug}/">popis svih programa je ovdje</a>.</p>`
    : multiProgram
      ? `<p class="lekta-lead">Vrijedi za ${group.length} studijska programa: ${escapeHtml(group.map(programLabel).join(', '))}.</p>`
      : '';

  const factsSection = showFacts
    ? `<h2>Ključne činjenice</h2><ul class="check-list">${facts.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`
    : '';

  const factGridHtml = buildFactGrid(factRows);
  const divergenceHtml = buildDivergenceTables(factRows);
  // Uokviri fact-grid/divergencijske tablice kao eksplicitan popis "ovo provjeravamo", umjesto
  // da citatelj mora sam zakljuciti da su ovo strojno provjerljive stavke - isti sadrzaj, samo
  // s naslovom koji imenuje da je Lekta ta koja provjerava.
  const checksHeading = (factGridHtml || divergenceHtml)
    ? `<h2>Što Lekta provjerava</h2><p class="lekta-lead">Svako od ovih pravila Lekta provjerava automatski kad učitaš svoj rad.</p>`
    : '';

  const deadlineHtml = deadlineIso
    ? `<p class="deadline-note"><strong>${escapeHtml(deadlineUrgencyLead(daysUntilIso(deadlineIso, todayIso)))}:</strong> najbliži poznati rok predaje (${escapeHtml(wt.label)}, ${escapeHtml(meta.name)}) je <strong>${fmtDateHr(deadlineIso)}</strong>. Rok se može razlikovati po studijskom programu ili godini; provjeri aktualnu odluku svog fakulteta.</p>`
    : '';

  const body = `
${breadcrumbHtml(crumbs)}
<h1>${escapeHtml(facultyTitlePart)}: ${escapeHtml(wt.label)}</h1>
${worktypeNavHtml(workType, siblings)}
<p class="lekta-lead">Tehnička pravila prije predaje, prema službenim izvorima fakulteta.</p>
<div class="status-badge">${escapeHtml(statusInfo.label)}</div>${verifiedAt ? `<span class="verified-badge">Ažurirano ${fmtDateHr(verifiedAt)}</span>` : ''}
<p class="lekta-lead">${escapeHtml(statusInfo.note)}</p>
${programNote}

${coverageCardHtml}

${factsSection}
${checksHeading}
${factGridHtml}
${divergenceHtml}

${manualChecks.length ? `<h2>Na što paziti</h2><ul class="check-list">${manualChecks.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}

${submissionFacts.length ? `<h2>Predaja</h2><ul class="check-list">${submissionFacts.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}

<figure class="lekta-demo">
  <img src="${DEMO_IMAGE}" alt="Prikaz sučelja Lekte: rezultat tehničke provjere rada s ocjenom i označenim nalazima" loading="lazy" width="1080" height="608">
  <figcaption>Lekta pregleda rad, označi probleme i vodi dokument do ocjene 100 od 100.</figcaption>
</figure>

${deadlineHtml}
<div class="lekta-cta-box">
  <strong>Provjeri svoj rad prema ovim pravilima</strong>
  <p>Učitaj Word dokument; Lekta odmah provjerava oblikovanje, opseg, citiranje i strukturu prema profilu: ${escapeHtml(meta.name)}.</p>
  <a class="btn" href="${escapeHtml(ctaHref)}">Provjeri rad</a>
  <p class="priv">Automatska provjera ostaje na tvom uređaju · bez registracije · nije provjera plagijata</p>
</div>

${sources.length ? `<h2>Izvori i datum provjere</h2><p>${verifiedAt ? `Zadnja provjera izvora: <strong>${fmtDateHr(verifiedAt)}</strong>.` : ''} Pravila su izvedena iz sljedećih službenih izvora:</p><ul class="source-list">${sources.map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></li>`).join('')}</ul>` : ''}

<div class="lekta-disclaimer">
  Ova stranica je pomoćni sažetak, ne službena obavijest fakulteta. Uvijek vrijede aktualne službene upute fakulteta, studija, kolegija i mentora. Nije provjera plagijata ni sličnosti teksta (nije Turnitin) i ne jamči prihvaćanje rada, ocjenu ni odluku mentora ili povjerenstva.
</div>
<div class="lekta-links">
  <a href="/">Naslovna</a>
  <a href="/fakulteti/#${escapeHtml(meta.instId)}">Svi fakulteti</a>
  <a href="/pokrivenost.html">Pokrivenost profila</a>
  <a href="${escapeHtml(citationLinkHref)}" data-fk-tool="citati">${escapeHtml(citationLinkLabel)}</a>
  <a href="${escapeHtml(naslovnicaHref)}" data-fk-tool="naslovnica">${escapeHtml(naslovnicaLabel)}</a>
  <a href="/alati.html" data-fk-tool="alati">Ostali besplatni alati (literatura, izjava)</a>
</div>`;

  return { html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd: [jsonLd, breadcrumbJsonLd(crumbs)], extraScripts: ['/fakulteti-analytics.js'] }), verifiedAt, canonical, path: relPath, urlSlug };
}

// Lagana "direktorij" stranica kad je fakultetska grupa prevelika/neuniformna za jednu stranicu
// (splitOversizedGroups): popisuje linkove prema pojedinacnim programskim stranicama umjesto da
// tvrdi jedno pravilo za cijeli fakultet. Bez fact-grida/divergencijskih tablica - samo popis.
function buildHubIndexPage(unitId, workType, subPages, unitMeta, siblings) {
  const meta = unitMeta[unitId];
  const wt = WORK_TYPE_META[workType];
  const relPath = `/${unitId}/${wt.slug}/`;
  const canonical = `${SITE_ORIGIN}${relPath}`;
  const title = `${meta.name}: ${wt.labelCap} po studijskom programu | Lekta`;
  const description = `${meta.name} ima više studijskih programa s različitim pravilima za ${wt.label}. Odaberi svoj program za konkretna pravila, izvore i besplatnu provjeru.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title.replace(/ \| Lekta$/, ''),
    description,
    url: canonical,
    inLanguage: 'hr',
    isPartOf: { '@type': 'WebSite', name: 'Lekta', url: SITE_ORIGIN },
  };
  const crumbs = breadcrumbCrumbs(meta, undefined, undefined);
  const body = `
${breadcrumbHtml(crumbs)}
<h1>${escapeHtml(meta.name)}: ${escapeHtml(wt.label)} po studijskom programu</h1>
${worktypeNavHtml(workType, siblings)}
<p class="lekta-lead">${escapeHtml(meta.name)} ima više studijskih programa s različitim tehničkim pravilima za ${escapeHtml(wt.label)}. Odaberi svoj program:</p>
<ul class="check-list">
${subPages.map((sp) => `<li><a href="${sp.path}">${escapeHtml(sp.programLabel)}</a></li>`).join('')}
</ul>
<div class="lekta-disclaimer">
  Ova stranica je pomoćni sažetak, ne službena obavijest fakulteta. Uvijek vrijede aktualne službene upute fakulteta, studija, kolegija i mentora.
</div>
<div class="lekta-links">
  <a href="/">Naslovna</a>
  <a href="/fakulteti/#${escapeHtml(meta.instId)}">Svi fakulteti</a>
  <a href="/pokrivenost.html">Pokrivenost profila</a>
  <a href="/alati.html" data-fk-tool="alati">Besplatni alati (citat, naslovnica, literatura, izjava)</a>
</div>`;
  return {
    html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd: [jsonLd, breadcrumbJsonLd(crumbs)], extraScripts: ['/fakulteti-analytics.js'] }),
    canonical,
    path: relPath,
  };
}

// Progresivno poboljsanje /fakulteti/ master indeksa (buildMasterIndexPage): puni popis je
// UVIJEK u HTML-u (SEO, no-JS), ova skripta samo sakriva/pokazuje po upitu. normalizeSearch/
// matchesQuery su namjeran string-duplikat istoimenih .mjs funkcija gore (nema bundlera za
// ovu staticku stranicu) - dokazane jednom kao ciste funkcije u tests/generate-faculty-pages.test.ts,
// ovdje se duplikatu vjeruje.
const FAKULTETI_SEARCH_JS = `
function normalizeSearch(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');}
function matchesQuery(q,hay){return normalizeSearch(q).split(/\\s+/).filter(Boolean).every(function(t){return hay.indexOf(t)!==-1;});}
(function(){
  var input=document.getElementById('fk-q');
  var groups=document.getElementById('fk-groups');
  var count=document.getElementById('fk-q-count');
  var empty=document.getElementById('fk-empty');
  if(!input||!groups)return;
  var sections=Array.prototype.slice.call(groups.querySelectorAll('[data-search-group]'));
  var total=groups.querySelectorAll('[data-search]').length;
  function apply(){
    var q=input.value.trim();
    var visible=0;
    sections.forEach(function(sec){
      var items=Array.prototype.slice.call(sec.querySelectorAll('[data-search]'));
      var any=false;
      items.forEach(function(li){
        var show=!q||matchesQuery(q,li.getAttribute('data-search')||'');
        li.hidden=!show;
        if(show){any=true;visible++;}
      });
      sec.hidden=!any;
    });
    if(count)count.textContent=q?(visible+' od '+total+' fakulteta prikazano'):'';
    if(empty)empty.hidden=!(q&&visible===0);
  }
  input.addEventListener('input',apply);
})();
`;

// Consent-respecting analitika na SVE generirane fakultetske stranice (master indeks, hub-indeksi,
// pojedinacne stranice). Namjeran string-duplikat src/tools/tool-analytics.ts's logike (dijeli
// TOCAN isti localStorage consent kljuc i Supabase endpoint - privola je zajednicka za cijeli
// sajt), s vlastitim consent bannerom (bez njega bi fail-closed logika znacila da se od svjezeg
// organskog SEO prometa - upravo publika koju ova stavka treba mjeriti - gotovo nista ne biljezi).
const FAKULTETI_ANALYTICS_JS = `
var CONSENT_KEY='lekta.analytics-consent.v1';
var PRODUCTION_KEY='lekta.production.v2.1';
var DEFAULT_ENDPOINT='https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/analytics-event';
var BANNER_ID='lekta-fk-consent-banner';
function readJson(k){try{var r=localStorage.getItem(k);return r===null?null:JSON.parse(r);}catch(e){return null;}}
function writeJson(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function analyticsEndpoint(){var o=readJson(PRODUCTION_KEY);if(o&&typeof o==='object'&&'analyticsEndpoint' in o){return typeof o.analyticsEndpoint==='string'?o.analyticsEndpoint.trim():'';}return DEFAULT_ENDPOINT;}
function consentGranted(){return readJson(CONSENT_KEY)==='granted';}
function trackFacultyEvent(event){var ep=analyticsEndpoint();if(!ep||!consentGranted())return;try{fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:event,path:location.pathname||'/',timestamp:new Date().toISOString()}),keepalive:true});}catch(e){}}
function setConsent(v){writeJson(CONSENT_KEY,v);var b=document.getElementById(BANNER_ID);if(b)b.classList.remove('is-visible');}
function ensureBanner(){if(!document.body)return null;var existing=document.getElementById(BANNER_ID);if(existing)return existing;var el=document.createElement('div');el.id=BANNER_ID;el.className='lekta-consent-banner';el.setAttribute('role','region');el.setAttribute('aria-label','Postavke privole za analitiku');el.innerHTML='<p><strong>Dobrovoljna anonimna analitika.</strong> Stranica radi jednako i bez nje.</p><div class="lekta-consent-actions"><button type="button" data-consent="deny">Samo nužno</button><button type="button" data-consent="grant">Dopusti analitiku</button></div>';document.body.appendChild(el);var deny=el.querySelector('[data-consent="deny"]');var grant=el.querySelector('[data-consent="grant"]');if(deny)deny.addEventListener('click',function(){setConsent('denied');});if(grant)grant.addEventListener('click',function(){setConsent('granted');});return el;}
function renderBanner(){if(!analyticsEndpoint())return;if(readJson(CONSENT_KEY))return;var b=ensureBanner();if(b)b.classList.add('is-visible');}
var searchTracked=false;
function boot(){
  renderBanner();
  trackFacultyEvent('faculty_page_view');
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest&&e.target.closest('a[href*="#analyzer"]');
    if(a){trackFacultyEvent('faculty_to_analyzer_click');return;}
    var t=e.target&&e.target.closest&&e.target.closest('a[data-fk-tool]');
    if(t)trackFacultyEvent('faculty_tool_click:'+t.getAttribute('data-fk-tool'));
  });
  document.addEventListener('input',function(e){
    if(!searchTracked&&e.target&&e.target.id==='fk-q'&&e.target.value&&e.target.value.trim()){
      searchTracked=true;
      trackFacultyEvent('faculty_search_used');
    }
  });
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot);}else{boot();}
`;

function buildSitemap(urls) {
  const entries = urls
    .map((u) => {
      const lastmod = u.lastmod && /^\d{4}-\d{2}-\d{2}$/.test(u.lastmod) ? `<lastmod>${u.lastmod}</lastmod>` : '';
      return `  <url><loc>${u.loc}</loc>${lastmod}</url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function siblingsFor(existence, unitId, excludeWorkType) {
  const unitMap = existence.get(unitId);
  if (!unitMap) return [];
  return WORK_TYPE_DISPLAY_ORDER.filter((wt) => wt !== excludeWorkType && unitMap.has(wt)).map((wt) => unitMap.get(wt));
}

// Jedan prolaz kroz sve (fakultet x vrsta rada) grupe. write=false (prolaz 1): ne pise fajlove
// ni logove, samo racuna KOJE stranice ce postojati i na kojem URL-u (postrebno da svaka
// stranica moze linkati na sestrinske vrste rada PRIJE nego se ijedna stvarno renderira -
// main() ne zna unaprijed hoce li npr. "kif::seminar" proci honesty gate). write=true (prolaz 2):
// isti obilazak, sad s `existence` iz prolaza 1 dostupnim za sibling navigaciju, stvarno pise.
function runGenerationPass(groups, splitKeys, slugOverrides, unitMeta, statusMeta, existenceForSiblings, write, deadlines, todayIso, citationIndex, templatesIndex) {
  const sitemapUrls = [];
  const hubSubPages = new Map();
  const existence = new Map();
  let written = 0;
  let skipped = 0;

  const recordExistence = (unitId, workType, relPath) => {
    if (!existence.has(unitId)) existence.set(unitId, new Map());
    existence.get(unitId).set(workType, { path: relPath, label: WORK_TYPE_META[workType].labelCap });
  };

  for (const [key, group] of groups) {
    const parts = key.split('::');
    const [unitId, workType] = parts;
    const splitKey = parts.length > 2 ? `${unitId}::${workType}` : null;
    const siblings = existenceForSiblings ? siblingsFor(existenceForSiblings, unitId, workType) : [];
    const page = buildFacultyPage(
      unitId, workType, group, unitMeta, statusMeta,
      splitKey ? programLabel(group[0]) : undefined,
      splitKey ? slugOverrides.get(key) : undefined,
      siblings,
      deadlines, todayIso,
      citationIndex, templatesIndex,
    );
    if (!page) {
      if (write) console.log(`[generate-faculty-pages] preskačem ${key}: nedovoljno sadržaja za pošten prikaz`);
      skipped++;
      continue;
    }
    if (write) {
      const outDir = path.join(OUT_DIR, unitId, page.urlSlug);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), page.html, 'utf-8');
    }
    sitemapUrls.push({ loc: page.canonical, lastmod: page.verifiedAt ?? undefined });
    written++;
    if (splitKey) {
      if (!hubSubPages.has(splitKey)) hubSubPages.set(splitKey, []);
      hubSubPages.get(splitKey).push({ path: page.path, programLabel: programLabel(group[0]) });
    } else {
      recordExistence(unitId, workType, page.path);
    }
  }

  for (const splitKey of splitKeys) {
    const subPages = hubSubPages.get(splitKey);
    if (!subPages || !subPages.length) continue; // sve podstranice preskocene (nema sadrzaja) - nema sto popisati
    const [unitId, workType] = splitKey.split('::');
    const siblings = existenceForSiblings ? siblingsFor(existenceForSiblings, unitId, workType) : [];
    const hub = buildHubIndexPage(unitId, workType, subPages, unitMeta, siblings);
    if (write) {
      const outDir = path.join(OUT_DIR, unitId, WORK_TYPE_META[workType].slug);
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'index.html'), hub.html, 'utf-8');
      console.log(`[generate-faculty-pages] ${splitKey}: razdvojeno na ${subPages.length} programskih stranica + hub`);
    }
    sitemapUrls.push({ loc: hub.canonical });
    written++;
    recordExistence(unitId, workType, hub.path);
  }

  return { sitemapUrls, written, skipped, existence };
}

// Grupirana pregledna stranica ("sve stranice na jednom mjestu"): rjesava orphan-page problem
// (dosad nijedna od 343 stranice nije bila dohvatljiva klikom ni s glavne stranice ni jedna od
// druge - jedina poveznica je bio sitemap-fakulteti.xml, koji citaju tegljaci, ne ljudi).
// Grupirano po instituciji istim redoslijedom kataloga kao generate-citation-tools.mjs.
function buildMasterIndexPage(catalog, existence) {
  const relPath = '/fakulteti/';
  const canonical = `${SITE_ORIGIN}${relPath}`;
  const title = 'Provjera rada po fakultetu: pregled svih ustanova | Lekta';
  const description = 'Tehnička pravila prije predaje po fakultetu i vrsti rada (diplomski, završni, seminarski rad): oblikovanje, opseg, citiranje i izvori. Odaberi svoju ustanovu.';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: title.replace(/ \| Lekta$/, ''),
    description,
    url: canonical,
    inLanguage: 'hr',
    isPartOf: { '@type': 'WebSite', name: 'Lekta', url: SITE_ORIGIN },
  };
  // id=inst.id na <h2> je sidro na koje ciljaju breadcrumb i footer "Svi fakulteti" linkovi
  // sa svake fakultetske stranice ("/fakulteti/#unizg") - bez toga bi povratak uvijek sletio
  // na vrh liste od ~50 ustanova, ne na onu koju je korisnik upravo gledao. <section
  // data-search-group> omata CIJELU instituciju (h2 + oba popisa) da fakulteti-search.js moze
  // sakriti/pokazati cijelu grupu jednim atributom umjesto hodanja po susjednim elementima.
  // data-search na svakoj <li> nosi VEC normaliziranu instituciju+jedinicu (racuna se ovdje,
  // ne po svakom tipkanju na klijentu - jeftinije i jednostavnije za testiranje).
  const groupsHtml = catalog
    .map((inst) => {
      const units = inst.units || [];
      const covered = units.filter((u) => existence.has(u.id));
      const uncovered = units.filter((u) => !existence.has(u.id));
      if (!covered.length && !uncovered.length) return ''; // institucija bez ijedne jedinice u katalogu

      const coveredHtml = covered.length
        ? `<ul class="check-list">${covered
            .map((u) => {
              const wtMap = existence.get(u.id);
              const links = WORK_TYPE_DISPLAY_ORDER.filter((wt) => wtMap.has(wt))
                .map((wt) => `<a href="${escapeHtml(wtMap.get(wt).path)}">${escapeHtml(wtMap.get(wt).label)}</a>`)
                .join(' · ');
              const searchKey = escapeHtml(normalizeSearch(`${inst.name} ${u.name}`));
              return `<li data-search="${searchKey}">${escapeHtml(u.name)}: ${links}</li>`;
            })
            .join('')}</ul>`
        : '';

      // Nepokrivene jedinice (ukljucivo cijele institucije s nula pokrivenih jedinica, npr.
      // Sveuciliste VERN'): PRVI PUT postoje na hubu, u tonu profile-status.json's
      // research/generic unosa ("jos prikupljamo"), ne kao poruka o neuspjehu. Link na
      // /?unit=<id>#analyzer je POSTOJECI ulaz gdje renderWaitlistBar() vec preuzima kad
      // student stigne do rezultata za tu jedinicu - nema nove forme na statickoj stranici.
      const uncoveredHtml = uncovered.length
        ? `<p class="coverage-pending-label">Još prikupljamo posebna pravila za:</p><ul class="check-list coverage-pending">${uncovered
            .map((u) => {
              const searchKey = escapeHtml(normalizeSearch(`${inst.name} ${u.name}`));
              return `<li data-search="${searchKey}"><a href="/?unit=${encodeURIComponent(u.id)}#analyzer">${escapeHtml(u.name)}</a>: opća tehnička provjera već radi, posebna pravila još čekamo</li>`;
            })
            .join('')}</ul>`
        : '';

      return `<section class="fk-inst" data-search-group><h2 id="${escapeHtml(inst.id)}">${escapeHtml(inst.name)}</h2>${coveredHtml}${uncoveredHtml}</section>`;
    })
    .filter(Boolean)
    .join('');
  const body = `
<div class="lekta-kicker">Lekta</div>
<h1>Provjera rada po fakultetu</h1>
<p class="lekta-lead">Tehnička pravila prije predaje (diplomski, završni i seminarski rad) po ustanovi: oblikovanje, opseg, citiranje i izvori, iz službenih izvora fakulteta. Pronađi svoju ustanovu.</p>
<div class="fk-search">
  <label for="fk-q">Pronađi svoj fakultet</label>
  <input type="search" id="fk-q" autocomplete="off" placeholder="Upiši naziv fakulteta ili sveučilišta...">
  <p id="fk-q-count" class="fk-search-count" aria-live="polite"></p>
</div>
<div id="fk-groups">${groupsHtml}</div>
<p id="fk-empty" class="fk-search-empty" hidden>Nema rezultata. Provjeri je li tvoj fakultet upisan pod drugim imenom, ili pogledaj <a href="/pokrivenost.html">cijeli popis pokrivenosti</a>.</p>
<div class="lekta-disclaimer">
  Popis pokriva sve ustanove iz Lektinog kataloga. Ustanove sa strojno provjerljivim profilom imaju vlastitu stranicu s pravilima; ostale imaju opću tehničku provjeru dok posebna pravila ne budu potvrđena.
</div>
<div class="lekta-links">
  <a href="/">Naslovna</a>
  <a href="/pokrivenost.html">Pokrivenost profila</a>
</div>`;
  return {
    html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd, extraScripts: ['/fakulteti-search.js', '/fakulteti-analytics.js'] }),
    canonical,
    path: relPath,
  };
}

function main() {
  const catalog = loadJson(CATALOG_PATH);
  const heavy = loadJson(PROFILES_HEAVY_PATH);
  const statusMeta = loadJson(STATUS_META_PATH);
  const deadlines = fs.existsSync(DEADLINES_PATH) ? loadJson(DEADLINES_PATH) : [];
  // Coverage Card (Sto Lekta pokriva): isti loadJson() + fs.existsSync oprez kao deadlines gore.
  // Nizovi su mali (71/198 unosa) pa se namjerno NE pred-indeksiraju - filtriranje po pozivu unutar
  // citationCoverage/titlePageCoverage drzi kod dosljednim postojecem stilu ovog generatora.
  const citationIndex = fs.existsSync(CITATION_SPECS_INDEX_PATH) ? loadJson(CITATION_SPECS_INDEX_PATH) : [];
  const templatesIndex = fs.existsSync(TEMPLATES_INDEX_PATH) ? loadJson(TEMPLATES_INDEX_PATH) : [];
  const todayIso = new Date().toISOString().slice(0, 10);

  const unitMeta = {};
  for (const inst of catalog) {
    for (const u of inst.units || []) unitMeta[u.id] = { name: u.name, instId: inst.id, instName: inst.name };
  }

  const profiles = Object.values(heavy);
  const groups = new Map();
  for (const p of profiles) {
    for (const wt of p.workTypes || []) {
      if (!TARGET_WORK_TYPES.includes(wt)) continue;
      const key = `${p.unitId}::${wt}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
  }

  // Koherentnost: velika/neuniformna grupa (npr. FFZG diplomski = 9 razlicitih humanistickih
  // odsjeka, svaki s drugacijim citatnim stilom) ne moze biti JEDNA posteno-koherentna stranica -
  // neoznaceni facts[] popis bi postao zid od 30+ nepovezanih tvrdnji. Iznad praga: razdvoji na
  // JEDNU stranicu po profilu (URL kvalificiran nazivom studija) + laganu hub/direktorij stranicu
  // na izvornom unit::worktype URL-u koja linka na sve. Ispod praga: ostaje kao prije, jedna
  // stranica za cijelu grupu (uniformna polja izravno, razlicita kroz tablicu po programu).
  const MAX_GROUP_SIZE = 4;
  const splitKeys = new Set();
  const slugOverrides = new Map(); // "unitId::workType::programSlug" -> konacan (disambiguiran) slug segment
  for (const [key, group] of [...groups]) {
    if (group.length <= MAX_GROUP_SIZE) continue;
    splitKeys.add(key);
    groups.delete(key);
    const wtSlug = WORK_TYPE_META[key.split('::')[1]].slug;
    const seenSlugs = new Map();
    for (const p of group) {
      let baseSlug = programSlug(programLabel(p));
      if (seenSlugs.has(baseSlug)) baseSlug = `${baseSlug}-${p.id}`; // kolizija slugova: rijetko, ali ne smije tiho prepisati
      seenSlugs.set(baseSlug, true);
      const groupKey = `${key}::${baseSlug}`;
      groups.set(groupKey, [p]);
      slugOverrides.set(groupKey, `${baseSlug}-${wtSlug}`);
    }
  }

  // Prolaz 1 (tih, ne pise): sazna KOJE (fakultet x vrsta rada) stranice ce uopce postojati i
  // na kojem URL-u, da prolaz 2 moze svakoj stranici dati poveznice na njene sestrinske vrste
  // rada PRIJE nego ijedna stranica bude konacno renderirana.
  const dryRun = runGenerationPass(groups, splitKeys, slugOverrides, unitMeta, statusMeta, null, false, deadlines, todayIso, citationIndex, templatesIndex);

  // Prolaz 2 (stvaran): isti obilazak, sad sa sibling navigacijom iz prolaza 1, stvarno pise fajlove.
  const { sitemapUrls, written, skipped, existence } = runGenerationPass(
    groups, splitKeys, slugOverrides, unitMeta, statusMeta, dryRun.existence, true, deadlines, todayIso, citationIndex, templatesIndex,
  );

  const masterIndex = buildMasterIndexPage(catalog, existence);
  const masterDir = path.join(OUT_DIR, 'fakulteti');
  fs.mkdirSync(masterDir, { recursive: true });
  fs.writeFileSync(path.join(masterDir, 'index.html'), masterIndex.html, 'utf-8');
  sitemapUrls.push({ loc: masterIndex.canonical });

  fs.writeFileSync(path.join(OUT_DIR, 'fakulteti-search.js'), FAKULTETI_SEARCH_JS, 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'fakulteti-analytics.js'), FAKULTETI_ANALYTICS_JS, 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-fakulteti.xml'), buildSitemap(sitemapUrls), 'utf-8');
  console.log(`[generate-faculty-pages] gotovo. ${written} stranica napisano (+ /fakulteti/ pregled), ${skipped} preskočeno (bez sadržaja), sitemap-fakulteti.xml napisan.`);
}

// Entry-guard (a ne bezuvjetni main() poziv): omogucuje da vitest UVEZE imenovane exporte
// (normalizeSearch/matchesQuery i dalje niz Koraka) bez da main() usput pise u dist/ kao
// sporedni efekt importa. Nula promjene ponasanja za `node scripts/generate-faculty-pages.mjs`.
// process.argv[1] moze biti undefined u nekim runnerima (npr. `node -e`, worker threadovi) -
// pathToFileURL(undefined) bi bacio TypeError PRIJE nego usporedba uopce dodje na red.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
