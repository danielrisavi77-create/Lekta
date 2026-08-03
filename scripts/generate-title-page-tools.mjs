#!/usr/bin/env node
// scripts/generate-title-page-tools.mjs
//
// Build-time generator STATICKIH SEO landing stranica po fakultetu za NASLOVNICU
// (naslovnica.html): /alati/naslovnica/<unit>[-<razina>].html. Pokreni:
// node scripts/generate-title-page-tools.mjs (nakon `vite build`, isti obrazac kao
// generate-citation-tools.mjs/generate-faculty-pages.mjs).
//
// Model: informativna stranica (izvor, citat pravilnika, font/margine, staticki pregled) +
// CTA na zivi naslovnica.html - BEZ interaktivnog widgeta (korisnik popunjava live u samom
// alatu), isti pristup kao generate-faculty-pages.mjs. Staticki pregled se ipak mora slagati
// STVARNOM logikom (buildTitlePage: pickRecipients/insertAfterRole/styleForElement), ne
// reimplementacijom u plain JS - za to esbuild-bundlamo src/title-pages/title-page-web.ts u
// IIFE i evaluiramo ga u Node, isti obrazac kao citation-web.ts u generate-citation-tools.mjs.
//
// Honesty-gate: generira SAMO jedinice s provenance.status === 'official' (doslovan citat
// pravilnika / izvor+stranica postoji). 'derived' (konsenzus javnih radova, sablonski
// sourceNote poput "Raspored izveden konsenzusom N javnih radova") i jedinice bez predloska
// (genericka grana koda) NE dobivaju stranicu - nema dovoljno stvarno razlicitog sadrzaja da
// izbjegne near-duplicate rizik; isti nacin razmisljanja kao skip-gate u
// generate-faculty-pages.mjs (radije ne generiraj nego objavi tanku/noindex stranicu).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { SITE_ORIGIN } from './site-origin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TEMPLATES_PATH = path.join(ROOT, 'data/title-pages/templates.json');
const CATALOG_PATH = path.join(ROOT, 'data/catalog/zagreb-catalog.json');
const ENGINE_ENTRY = path.join(ROOT, 'src/title-pages/title-page-web.ts');
const OUT_DIR = path.join(ROOT, 'dist/alati/naslovnica');

const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

export function loadJson(p) {
  if (!fs.existsSync(p)) {
    console.error(`[generate-title-page-tools] Nedostaje ${p}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonInline(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// esbuild bundle motora (IIFE, globalName LektaTitlePage): koristi se za Node eval (staticki
// pregled). Bundle se NE isporucuje pregledniku (stranice su staticke, bez widgeta).
async function buildEngine() {
  const out = await esbuild.build({
    entryPoints: [ENGINE_ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'LektaTitlePage',
    platform: 'browser',
    target: 'es2019',
    write: false,
    minify: true,
    legalComments: 'none',
  });
  return out.outputFiles[0].text;
}

function loadEngineInNode(bundleJs) {
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${bundleJs}\n;return LektaTitlePage;`);
  return factory();
}

// Genericki uzorak za staticki pregled: ISTI sadrzaj kao SAMPLE u naslovnica-page.ts (da
// "primjer" na SEO stranici i "Ubaci primjer" u zivom alatu daju identican pregled).
const GENERIC_SAMPLE_INPUT = {
  author: 'Ana Anić',
  title: 'Uloga civilnog društva u lokalnoj samoupravi',
  mentor: 'izv. prof. dr. sc. Ivan Ivić',
  place: 'Zagreb',
  year: '2026',
};

// --- Stil (Korektorski stol, isti identitet kao ostala dva generatora). NAMJERNO
// DUPLICIRANA (ne dijeljena) CSS - dva neovisna generatora, izbjegava se koupling; ako se
// vizualni identitet promijeni, sva tri mjesta (ukljucujuci generate-citation-tools.mjs i
// generate-faculty-pages.mjs) treba azurirati zasebno. Sheet-specificni dio (.tp-*) je
// prijevod naslovnica.html-ovih pravila (retci: '55-65','54') na --paper-* tokene ovdje. ---
const PAGE_STYLE = `
  :root {
    color-scheme: dark;
    --desk:#191512; --desk-ink:#EDE7DC;
    --paper:#F7F3E8; --paper-2:#F0EAD9; --paper-ink:#26221B; --paper-muted:#6E6656; --paper-line:#DCD4BF; --paper-line-strong:#C6BCA2;
    --sheet:#FDFBF3;
    --red:#E4573D; --red-deep:#C4372E; --red-soft:#F6E3DE; --on-red:#FFF6EF;
    --ok:#2E8B5F; --ok-soft:#DEEFE4;
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
    max-width: 760px; margin: 2rem auto; padding: 1.75rem 1.85rem 2.5rem;
    color: var(--paper-ink); line-height: 1.6; position: relative;
    background: var(--paper); border: 1px solid var(--paper-line); border-radius: 2px; box-shadow: var(--paper-sh);
  }
  body::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--red-deep); }
  .lekta-brand { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; font-family: var(--font-mono); font-size: 0.72rem; letter-spacing: 0.03em; color: var(--paper-muted); margin-bottom: 0.9rem; }
  .lekta-brand a { color: var(--paper-muted); text-decoration: none; font-weight: 700; }
  .lekta-kicker { font-family: var(--font-mono); font-size: 0.75rem; letter-spacing: 0.03em; color: var(--paper-muted); margin-bottom: 0.4rem; }
  .lekta-kicker a { color: var(--paper-muted); text-decoration: none; } .lekta-kicker a:hover { color: var(--paper-ink); text-decoration: underline; }
  .lekta-kicker .sep { margin: 0 0.35em; color: var(--paper-line-strong); }
  h1 { font-family: var(--font-serif); font-weight: 600; font-size: 1.6rem; letter-spacing: -0.01em; line-height: 1.18; margin: 0.1rem 0 0.6rem; color: var(--paper-ink); }
  h2 { font-family: var(--font-serif); font-size: 1.12rem; font-weight: 600; margin: 1.8rem 0 0.6rem; color: var(--paper-ink); border-bottom: 1px solid var(--paper-line); padding-bottom: 0.35rem; }
  .lekta-lead { font-size: 1rem; color: var(--paper-ink); margin: 0 0 1.1rem; }
  .tp-badge { display: inline-block; font-family: var(--font-mono); font-size: 0.72rem; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 2px; margin-bottom: 0.8rem; background: var(--ok-soft); color: var(--ok); }
  blockquote.lekta-quote { margin: 0.6rem 0 1rem; padding: 0.7rem 0.9rem 0.7rem 1rem; border-left: 3px solid var(--red-deep); background: var(--paper-2); font-family: var(--font-serif); font-size: 0.95rem; line-height: 1.55; color: var(--paper-ink); }
  .lekta-source-note { font-size: 0.85rem; color: var(--paper-muted); margin: -0.5rem 0 1rem; }
  .fact-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.6rem; margin: 0.8rem 0; }
  .fact-card { background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); border-radius: 0 2px 2px 0; padding: 0.5rem 0.7rem; }
  .fact-card span { display: block; font-family: var(--font-mono); font-size: 0.68rem; color: var(--paper-muted); text-transform: uppercase; letter-spacing: 0.03em; }
  .fact-card b { font-family: var(--font-serif); font-size: 0.95rem; font-weight: 600; }
  ul.check-list { margin: 0.5rem 0; padding-left: 1.2rem; } ul.check-list li { margin: 0.35rem 0; }
  /* Pregled: list papira uvijek svijetao (zrcali predani dokument), neovisno o stol-temi. */
  .tp-sheet-wrap { background: var(--paper-2); border: 1px solid var(--paper-line); border-radius: 2px; padding: 1rem; margin: 0.9rem 0 1.2rem; }
  .tp-sheet { background: var(--sheet); color: #1b1b1b; border: 1px solid #e7e2d5; border-radius: 2px; box-shadow: 0 6px 18px rgba(41,36,26,.14); aspect-ratio: 1/1.414; max-width: 360px; margin: 0 auto; padding: 34px 28px; display: flex; flex-direction: column; text-align: center; font-family: var(--font-serif); overflow: hidden; }
  .tp-line { line-height: 1.4; }
  .tp-university { font-size: 12px; } .tp-faculty { font-size: 12px; font-weight: 800; margin-top: 2px; } .tp-study { font-size: 10.5px; color: #555; margin-top: 2px; }
  .tp-author { font-size: 13px; margin-top: auto; } .tp-title { font-size: 17px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.015em; margin: 10px 0 0; line-height: 1.2; }
  .tp-subtitle { font-size: 12px; font-style: italic; color: #444; margin-top: 5px; } .tp-worktype { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #555; margin-top: 9px; }
  .tp-mentor { font-size: 11px; margin-top: 20px; } .tp-comentor { font-size: 11px; margin-top: 2px; } .tp-placeyear { font-size: 11px; margin-top: auto; padding-top: 14px; }
  .tp-group:not(:first-child) { margin-top: auto; } .tp-group .tp-line { margin-top: 3px; } .tp-group .tp-line:first-child { margin-top: 0; }
  .lekta-notes { font-size: 0.88rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); border-radius: 0 2px 2px 0; padding: 0.6rem 0.8rem; margin: 0.6rem 0; white-space: pre-wrap; }
  .lekta-cta-box { margin: 1.6rem 0; padding: 1.1rem 1.2rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-radius: 2px; text-align: center; }
  .lekta-cta-box a.btn { display: inline-block; margin-top: 0.5rem; padding: 0.65rem 1.3rem; background: var(--red-deep); color: var(--on-red); font-weight: 700; text-decoration: none; border-radius: 2px; }
  .lekta-cta-box a.btn:hover { background: var(--red); }
  .lekta-cta-box p.priv { font-size: 0.78rem; color: var(--paper-muted); margin-top: 0.5rem; }
  .lekta-disclaimer { font-size: 0.8rem; color: var(--paper-muted); margin-top: 1.6rem; padding-top: 0.9rem; border-top: 1px solid var(--paper-line); }
  .lekta-links { margin-top: 1.2rem; font-size: 0.85rem; } .lekta-links a { color: var(--red-deep); margin-right: 1rem; }
  a { color: var(--red-deep); }
  @media (max-width: 700px) { body { margin: 0; max-width: none; border-radius: 0; border-left-width: 0; border-right-width: 0; box-shadow: none; } }
`;

function pageShell({ title, description, canonical, bodyHtml, jsonLd }) {
  const ogName = title.replace(/ \| Lekta$/, '');
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>try{var _t=localStorage.getItem('lekta.theme');if(_t)document.documentElement.dataset.theme=_t;}catch(e){}</script>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
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
<div class="lekta-brand"><a href="${SITE_ORIGIN}">Lekta</a><span>Besplatan alat, bez registracije</span></div>
${bodyHtml}
</body>
</html>
`;
}

export const WORK_TYPE_LABEL_HR = {
  seminar: 'seminarskog rada', final: 'završnog rada', graduate: 'diplomskog rada',
  specialist: 'specijalističkog rada', doctoral: 'doktorskog rada', article: 'članka', project: 'projektnog rada',
};

/** Slug segment za razinu (null = "opci", nema level-specifican predlozak). */
function levelSlug(level, LEVEL_SLUGS) {
  return level ? LEVEL_SLUGS[level] : 'opci';
}

/**
 * Jedna stranica za jedan official predlozak. `disambiguate`: true kad jedinica ima VISE
 * official predlozaka (razlicite razine) - tada slug/naslov moraju imenovati razinu; false
 * kad je jedini official predlozak te jedinice (slug = goli unitId, naslov ne imenuje razinu
 * jer vrijedi opcenito).
 */
export function buildUnitPage(template, meta, disambiguate, engine) {
  const { unitId, level, provenance, defaultFont, marginsCm, notes } = template;
  const slug = disambiguate ? `${unitId}-${levelSlug(level, engine.LEVEL_SLUGS)}` : unitId;
  const relPath = `/alati/naslovnica/${slug}.html`;
  const canonical = `${SITE_ORIGIN}${relPath}`;
  // "na {ime}" bi trazio deklinaciju (lokativ: "na Fakultetu", ne "na Fakultet") koju ne mozemo
  // pouzdano izvesti za proizvoljna (i rodno razlicita, npr. "Akademija...") imena ustanova;
  // dvotocka/zarez izbjegava gramaticki problem, isti obrazac kao generate-faculty-pages.mjs.
  const levelLabel = level ? WORK_TYPE_LABEL_HR[level] : null;
  const title = `${meta.name}: naslovnica${levelLabel ? ` (${levelLabel})` : ''} | Lekta`;
  const description = `Službeni raspored naslovnice: ${meta.name}${levelLabel ? `, ${levelLabel}` : ''}. Prema ${provenance.sourceNote || 'službenim uputama fakulteta'}. Besplatan generator, ništa se ne šalje na poslužitelj.`;

  const model = engine.buildTitlePage(GENERIC_SAMPLE_INPUT, template);
  const previewHtml = engine.renderTemplateSheet(model);

  const factCards = [];
  if (defaultFont) factCards.push({ label: 'Font', value: defaultFont });
  if (marginsCm) {
    factCards.push({ label: 'Margine', value: `${marginsCm.top}/${marginsCm.right}/${marginsCm.bottom}/${marginsCm.left} cm` });
  }
  const factGridHtml = factCards.length
    ? `<div class="fact-grid">${factCards.map((f) => `<div class="fact-card"><span>${escapeHtml(f.label)}</span><b>${escapeHtml(f.value)}</b></div>`).join('')}</div>`
    : '';

  const quoteHtml = provenance.quote
    ? `<blockquote class="lekta-quote">${escapeHtml(provenance.quote)}</blockquote>`
    : '';
  const sourceLine = [
    provenance.sourceNote ? escapeHtml(provenance.sourceNote) : null,
    provenance.sourcePage ? `str. ${escapeHtml(provenance.sourcePage)}` : null,
  ].filter(Boolean).join(', ');
  const sourceHtml = sourceLine
    ? `<p class="lekta-source-note">Izvor: ${sourceLine}${provenance.verifiedAt ? ` &middot; provjereno ${escapeHtml(provenance.verifiedAt)}` : ''}${provenance.sourceUrl ? ` &middot; <a href="${escapeHtml(provenance.sourceUrl)}" target="_blank" rel="noopener">otvori izvor</a>` : ''}</p>`
    : '';
  const notesHtml = notes ? `<div class="lekta-notes"><strong>Napomena:</strong> ${escapeHtml(notes)}</div>` : '';

  const ctaParams = new URLSearchParams({ fakultet: unitId, utm_source: 'alat_naslovnica_seo', utm_medium: 'organic' });
  if (level) ctaParams.set('razina', engine.LEVEL_SLUGS[level]);
  const ctaHref = `${SITE_ORIGIN}/naslovnica.html?${ctaParams.toString()}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title.replace(/ \| Lekta$/, ''),
    description,
    url: canonical,
    inLanguage: 'hr',
    ...(provenance.verifiedAt ? { dateModified: provenance.verifiedAt } : {}),
    isPartOf: { '@type': 'WebSite', name: 'Lekta', url: SITE_ORIGIN },
  };

  const body = `
<div class="lekta-kicker"><a href="/alati/naslovnica/index.html">Naslovnica po fakultetu</a><span class="sep">&rsaquo;</span>${escapeHtml(meta.name)}</div>
<h1>${escapeHtml(meta.name)}: naslovnica${levelLabel ? ` (${escapeHtml(levelLabel)})` : ''}</h1>
<span class="tp-badge">Službeni raspored fakulteta</span>
<p class="lekta-lead">${escapeHtml(meta.name)} propisuje vlastiti raspored naslovnice${levelLabel ? ` ${escapeHtml(levelLabel)}` : ''}. Ovdje je taj raspored, s izvorom, i besplatan generator koji ga slaže umjesto tebe.</p>
${quoteHtml}
${sourceHtml}
${factGridHtml}
${notesHtml}

<h2>Pregled (generički uzorak)</h2>
<div class="tp-sheet-wrap"><div class="tp-sheet">${previewHtml}</div></div>

<div class="lekta-cta-box">
  <strong>Ispuni svoje podatke</strong>
  <p>Otvori generator naslovnice s već odabranim fakultetom (${escapeHtml(meta.name)}) i slaži svoju naslovnicu, kopiraj tekst ili preuzmi gotov .docx.</p>
  <a class="btn" href="${escapeHtml(ctaHref)}">Otvori generator naslovnice</a>
  <p class="priv">Sve lokalno u pregledniku, bez registracije</p>
</div>

<div class="lekta-disclaimer">
  Ova stranica je pomoćni sažetak, ne službena obavijest fakulteta. Uvijek vrijede aktualne
  službene upute fakulteta, studija i mentora.
</div>
<div class="lekta-links">
  <a href="/alati/naslovnica/index.html">Svi fakulteti</a>
  <a href="/naslovnica.html">Generator naslovnice</a>
  <a href="/alati.html">Svi besplatni alati</a>
</div>`;

  return { html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd }), canonical, verifiedAt: provenance.verifiedAt ?? undefined, slug };
}

export function buildIndexPage(pages, catalog, unitMeta) {
  const relPath = '/alati/naslovnica/index.html';
  const canonical = `${SITE_ORIGIN}${relPath}`;
  const title = 'Naslovnica po fakultetu | Lekta';
  const description = 'Sluzbeni raspored naslovnice po fakultetu, s izvorom i besplatnim generatorom. Odaberi svoju ustanovu.';
  const byUnit = new Map();
  for (const p of pages) {
    if (!byUnit.has(p.unitId)) byUnit.set(p.unitId, []);
    byUnit.get(p.unitId).push(p);
  }
  const groupsHtml = catalog
    .map((inst) => {
      const items = (inst.units || [])
        .filter((u) => byUnit.has(u.id))
        .flatMap((u) => byUnit.get(u.id).map((p) => `<li><a href="/alati/naslovnica/${p.slug}.html">${escapeHtml(unitMeta[u.id].name)}${p.levelLabel ? ` &ndash; ${escapeHtml(p.levelLabel)}` : ''}</a></li>`));
      if (!items.length) return '';
      return `<h2>${escapeHtml(inst.name)}</h2><ul class="check-list">${items.join('')}</ul>`;
    })
    .filter(Boolean)
    .join('');
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: title.replace(/ \| Lekta$/, ''),
    description, url: canonical, inLanguage: 'hr', isPartOf: { '@type': 'WebSite', name: 'Lekta', url: SITE_ORIGIN },
  };
  const body = `
<div class="lekta-kicker">Lekta</div>
<h1>Naslovnica po fakultetu</h1>
<p class="lekta-lead">Fakulteti u nastavku propisuju vlastiti raspored naslovnice; Lekta ga zna i može ga složiti umjesto tebe. Ostali fakulteti koriste uobičajen, generički raspored u samom <a href="/naslovnica.html">generatoru naslovnice</a>.</p>
${groupsHtml}
<div class="lekta-disclaimer">Popis pokriva fakultete za koje imamo potvrđen službeni izvor rasporeda naslovnice. Ostali fakulteti nisu ovdje jer nemamo dovoljno potvrđenog, različitog sadržaja za njih - ne znači da generator ne radi za njih.</div>
<div class="lekta-links"><a href="/naslovnica.html">Generator naslovnice</a><a href="/alati.html">Svi besplatni alati</a></div>`;
  return { html: pageShell({ title, description, canonical, bodyHtml: body, jsonLd }), canonical };
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

/** Cista jezgra (testabilna): official predlosci grupirani po unitId, s flagom treba li slug/naslov disambiguirati razinu. */
export function selectOfficialPages(templates) {
  const byUnit = new Map();
  for (const t of templates) {
    if (t.provenance?.status !== 'official') continue;
    if (!byUnit.has(t.unitId)) byUnit.set(t.unitId, []);
    byUnit.get(t.unitId).push(t);
  }
  const out = [];
  for (const [, group] of byUnit) {
    const disambiguate = group.length > 1;
    for (const t of group) out.push({ template: t, disambiguate });
  }
  return out;
}

async function main() {
  const templates = loadJson(TEMPLATES_PATH);
  const catalog = loadJson(CATALOG_PATH);
  const unitMeta = {};
  for (const inst of catalog) {
    for (const u of inst.units || []) unitMeta[u.id] = { name: u.name, instId: inst.id, instName: inst.name };
  }

  const engineJs = await buildEngine();
  const engine = loadEngineInNode(engineJs);

  const selected = selectOfficialPages(templates);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const pages = [];
  for (const { template, disambiguate } of selected) {
    const meta = unitMeta[template.unitId];
    if (!meta) {
      console.error(`[generate-title-page-tools] FAIL: unitId "${template.unitId}" ne postoji u zagreb-catalog.json`);
      process.exit(1);
    }
    const page = buildUnitPage(template, meta, disambiguate, engine);
    fs.writeFileSync(path.join(OUT_DIR, `${page.slug}.html`), page.html, 'utf-8');
    pages.push({ unitId: template.unitId, slug: page.slug, canonical: page.canonical, verifiedAt: page.verifiedAt, levelLabel: template.level ? WORK_TYPE_LABEL_HR[template.level] : null });
  }

  const indexPage = buildIndexPage(pages, catalog, unitMeta);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexPage.html, 'utf-8');

  const sitemapUrls = [{ loc: indexPage.canonical }, ...pages.map((p) => ({ loc: p.canonical, lastmod: p.verifiedAt }))];
  fs.writeFileSync(path.join(path.dirname(OUT_DIR), 'sitemap-naslovnica.xml'), buildSitemap(sitemapUrls), 'utf-8');

  console.log(`[generate-title-page-tools] gotovo. ${pages.length} statickih stranica (official predlosci) + index + sitemap-naslovnica.xml.`);
}

// Entry-guard (isti obrazac kao generate-faculty-pages.mjs): omogucuje testovima da uvezu
// selectOfficialPages/escapeHtml/loadJson bez da main() usput pise u dist/.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('[generate-title-page-tools] GRESKA:', e);
    process.exit(1);
  });
}
