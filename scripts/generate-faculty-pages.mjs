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
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from './site-origin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CATALOG_PATH = path.join(ROOT, 'data/catalog/zagreb-catalog.json');
const PROFILES_HEAVY_PATH = path.join(ROOT, 'data/profiles/verified-profiles-heavy.json');
const STATUS_META_PATH = path.join(ROOT, 'data/profiles/profile-status.json');
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
  .fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.6rem; margin: 0.8rem 0; }
  .fact-card { background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); border-radius: 0 2px 2px 0; padding: 0.5rem 0.7rem; }
  .fact-card span { display: block; font-family: var(--font-mono); font-size: 0.68rem; color: var(--paper-muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .fact-card b { font-family: var(--font-serif); font-size: 0.98rem; font-weight: 600; }
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
  a { color: var(--red-deep); }
  @media (max-width: 700px) { body { margin: 0; max-width: none; border-radius: 0; border-left-width: 0; border-right-width: 0; box-shadow: none; } }
`;

function pageShell({ title, description, canonical, bodyHtml, robots, jsonLd }) {
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
<div class="lekta-brand"><a href="/">Lekta</a><span>Besplatna tehnička provjera</span></div>
${bodyHtml}
</body>
</html>
`;
}

function buildFactGrid(rows) {
  const direct = rows.filter((r) => r.uniform);
  if (!direct.length) return '';
  return `<div class="fact-grid">${direct.map((r) => `<div class="fact-card"><span>${escapeHtml(r.label)}</span><b>${escapeHtml(r.value)}</b></div>`).join('')}</div>`;
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
function buildFacultyPage(unitId, workType, group, unitMeta, statusMeta, programQualifier, slugOverride, siblings) {
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
  // Flat facts[] popis je siguran SAMO kod jednog profila: kod vise programa bi neoznaceno
  // miksanje brojki koje se razlikuju po programu ("10.000-12.000" i "12.000-15.000" u istoj
  // listi bez konteksta) djelovalo proturjecno. factRows (fact-grid + tablica po programu) gore
  // vec posteno pokriva taj slucaj s atribucijom, pa se za multiProgram grupe ne treba i ne
  // smije oslanjati na facts[].
  const showFacts = facts.length > 0 && !multiProgram;

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

  const body = `
${breadcrumbHtml(crumbs)}
<h1>${escapeHtml(facultyTitlePart)}: ${escapeHtml(wt.label)}</h1>
${worktypeNavHtml(workType, siblings)}
<p class="lekta-lead">Tehnička pravila prije predaje, prema službenim izvorima fakulteta.</p>
<div class="status-badge">${escapeHtml(statusInfo.label)}</div>
<p class="lekta-lead">${escapeHtml(statusInfo.note)}</p>
${programNote}

${factsSection}
${buildFactGrid(factRows)}
${buildDivergenceTables(factRows)}

${manualChecks.length ? `<h2>Na što paziti</h2><ul class="check-list">${manualChecks.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}

${submissionFacts.length ? `<h2>Predaja</h2><ul class="check-list">${submissionFacts.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}

<figure class="lekta-demo">
  <img src="${DEMO_IMAGE}" alt="Prikaz sučelja Lekte: rezultat tehničke provjere rada s ocjenom i označenim nalazima" loading="lazy" width="1080" height="608">
  <figcaption>Lekta pregleda rad, označi probleme i vodi dokument do ocjene 100 od 100.</figcaption>
</figure>

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
  <a href="/alati/citati/${encodeURIComponent(unitId)}.html">Generator citata za ${escapeHtml(meta.name)}</a>
</div>`;

  return { html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd: [jsonLd, breadcrumbJsonLd(crumbs)] }), verifiedAt, canonical, path: relPath, urlSlug };
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
</div>`;
  return { html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd: [jsonLd, breadcrumbJsonLd(crumbs)] }), canonical, path: relPath };
}

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
function runGenerationPass(groups, splitKeys, slugOverrides, unitMeta, statusMeta, existenceForSiblings, write) {
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
  // id=inst.id na svaki <h2> je sidro na koje ciljaju breadcrumb i footer "Svi fakulteti"
  // linkovi sa svake fakultetske stranice ("/fakulteti/#unizg") - bez toga bi povratak uvijek
  // sletio na vrh liste od ~50 ustanova, ne na onu koju je korisnik upravo gledao.
  const groupsHtml = catalog
    .map((inst) => {
      const units = (inst.units || []).filter((u) => existence.has(u.id));
      if (!units.length) return '';
      const items = units
        .map((u) => {
          const wtMap = existence.get(u.id);
          const links = WORK_TYPE_DISPLAY_ORDER.filter((wt) => wtMap.has(wt))
            .map((wt) => `<a href="${escapeHtml(wtMap.get(wt).path)}">${escapeHtml(wtMap.get(wt).label)}</a>`)
            .join(' · ');
          return `<li>${escapeHtml(u.name)}: ${links}</li>`;
        })
        .join('');
      return `<h2 id="${escapeHtml(inst.id)}">${escapeHtml(inst.name)}</h2><ul class="check-list">${items}</ul>`;
    })
    .filter(Boolean)
    .join('');
  const body = `
<div class="lekta-kicker">Lekta</div>
<h1>Provjera rada po fakultetu</h1>
<p class="lekta-lead">Tehnička pravila prije predaje (diplomski, završni i seminarski rad) po ustanovi: oblikovanje, opseg, citiranje i izvori, iz službenih izvora fakulteta. Odaberi svoju ustanovu i vrstu rada.</p>
${groupsHtml}
<div class="lekta-disclaimer">
  Popis pokriva ustanove za koje postoji barem jedan strojno provjerljiv profil. Odsutnost ustanove ne znači da Lekta ne radi za nju - opća tehnička provjera i dalje vrijedi za sve fakultete iz kataloga.
</div>
<div class="lekta-links">
  <a href="/">Naslovna</a>
  <a href="/pokrivenost.html">Pokrivenost profila</a>
</div>`;
  return { html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd }), canonical, path: relPath };
}

function main() {
  const catalog = loadJson(CATALOG_PATH);
  const heavy = loadJson(PROFILES_HEAVY_PATH);
  const statusMeta = loadJson(STATUS_META_PATH);

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
  const dryRun = runGenerationPass(groups, splitKeys, slugOverrides, unitMeta, statusMeta, null, false);

  // Prolaz 2 (stvaran): isti obilazak, sad sa sibling navigacijom iz prolaza 1, stvarno pise fajlove.
  const { sitemapUrls, written, skipped, existence } = runGenerationPass(
    groups, splitKeys, slugOverrides, unitMeta, statusMeta, dryRun.existence, true,
  );

  const masterIndex = buildMasterIndexPage(catalog, existence);
  const masterDir = path.join(OUT_DIR, 'fakulteti');
  fs.mkdirSync(masterDir, { recursive: true });
  fs.writeFileSync(path.join(masterDir, 'index.html'), masterIndex.html, 'utf-8');
  sitemapUrls.push({ loc: masterIndex.canonical });

  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-fakulteti.xml'), buildSitemap(sitemapUrls), 'utf-8');
  console.log(`[generate-faculty-pages] gotovo. ${written} stranica napisano (+ /fakulteti/ pregled), ${skipped} preskočeno (bez sadržaja), sitemap-fakulteti.xml napisan.`);
}

main();
