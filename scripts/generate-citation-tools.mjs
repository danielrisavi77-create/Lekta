#!/usr/bin/env node
// scripts/generate-citation-tools.mjs
//
// Build-time generator STATICNIH HTML stranica (ne SPA ruta, vidi
// SEO_FREE_TOOLS.md sekcija 2 zasto). Pokreni: node scripts/generate-citation-tools.mjs
// Dodaj u package.json: "generate-citation-tools": "node scripts/generate-citation-tools.mjs"
// i pozovi kao dodatni korak nakon "npm run build" prije deploya.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CONFIGS_PATH = path.join(ROOT, 'data/tools/citation-configs.json');
const FORMATTER_PATH = path.join(ROOT, 'src/tools/format-citation.js');
const OUT_DIR = path.join(ROOT, 'dist/alati');
const CITATI_OUT_DIR = path.join(OUT_DIR, 'citati');

const SITE_ORIGIN = process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr';

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[generate-citation-tools] Nedostaje ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 2rem auto; padding: 0 1rem; color: #18181b; }
  h1 { font-size: 1.375rem; margin-bottom: 0.25rem; }
  .lekta-tool-meta { color: #52525b; font-size: 0.875rem; margin-bottom: 1.5rem; }
  label { display: block; font-size: 0.875rem; margin: 0.75rem 0 0.25rem; }
  input, select { width: 100%; padding: 0.5rem 0.625rem; border-radius: 0.5rem; border: 1px solid #d4d4d8; box-sizing: border-box; }
  button { margin-top: 1rem; padding: 0.625rem 1rem; border-radius: 0.5rem; border: none; background: #18181b; color: white; font-weight: 600; cursor: pointer; }
  #citation-output { margin-top: 1rem; padding: 0.875rem; background: #f4f4f5; border-radius: 0.5rem; white-space: pre-wrap; font-size: 0.9375rem; min-height: 1.5rem; }
  .lekta-cta { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e4e4e7; font-size: 0.9375rem; }
  .lekta-back { display: block; margin-top: 0.5rem; font-size: 0.8125rem; color: #71717a; }
`;

function buildCitationPageHtml(config, formatterSource, slug) {
  const sourceTypeOptions = config.sourceTypes
    .map((st) => `<option value="${escapeHtml(st.type)}">${escapeHtml(st.label)}</option>`)
    .join('');

  const canonical = `${SITE_ORIGIN}/alati/citati/${slug}.html`;
  const ctaUrl = `${SITE_ORIGIN}/?faculty=${encodeURIComponent(config.facultyId)}&utm_source=alat_citati`;

  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Generator citata za ${escapeHtml(config.facultyName)} | Lekta</title>
<meta name="description" content="Citiraj po pravilima ${escapeHtml(config.facultyName)}, provjereno i s izvorom.">
<link rel="canonical" href="${canonical}">
<style>${PAGE_STYLE}</style>
</head>
<body>
<h1>Generator citata za ${escapeHtml(config.facultyName)}</h1>
<p class="lekta-tool-meta">Stil: ${escapeHtml(config.citationStyleName)}. Prema ${escapeHtml(config.sourceLabel)}, provjereno ${escapeHtml(config.verifiedAt)}.</p>

<label for="source-type">Vrsta izvora</label>
<select id="source-type">${sourceTypeOptions}</select>

<div id="fields-container"></div>

<button id="generate-btn" type="button">Generiraj citat</button>
<div id="citation-output" aria-live="polite"></div>

<div class="lekta-cta">
  <strong>Provjeri cijeli rad na Lekti</strong>
  <p>Citat je samo jedan dio provjere. Lekta provjerava oblikovanje, strukturu i citiranje odjednom, prema stvarnim pravilima tvog fakulteta.</p>
  <a href="${ctaUrl}">Provjeri cijeli rad</a>
  <a class="lekta-back" href="./index.html">Svi fakulteti</a>
</div>

<script>
${formatterSource}
var CONFIG = ${JSON.stringify(config)};

var sourceTypeSelect = document.getElementById('source-type');
var fieldsContainer = document.getElementById('fields-container');
var output = document.getElementById('citation-output');

function currentSourceType() {
  return CONFIG.sourceTypes.find(function (st) { return st.type === sourceTypeSelect.value; });
}

function renderFields() {
  var st = currentSourceType();
  fieldsContainer.innerHTML = '';
  st.fields.forEach(function (f) {
    var label = document.createElement('label');
    label.setAttribute('for', 'field-' + f.key);
    label.textContent = f.label + (f.required ? ' *' : '');
    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'field-' + f.key;
    input.dataset.key = f.key;
    fieldsContainer.appendChild(label);
    fieldsContainer.appendChild(input);
  });
}

sourceTypeSelect.addEventListener('change', renderFields);
renderFields();

document.getElementById('generate-btn').addEventListener('click', function () {
  var st = currentSourceType();
  var fields = {};
  st.fields.forEach(function (f) {
    var el = document.getElementById('field-' + f.key);
    fields[f.key] = el ? el.value : '';
  });
  output.textContent = LektaCitation.formatCitation(st.template, fields);
});
</script>
</body>
</html>
`;
}

function buildIndexHtml(configs) {
  const items = configs
    .map((c) => {
      const slug = slugify(c.facultyName);
      return `<li><a href="./${slug}.html">${escapeHtml(c.facultyName)}</a> — ${escapeHtml(c.citationStyleName)}</li>`;
    })
    .join('\n');

  const body =
    configs.length > 0
      ? `<ul>${items}</ul>`
      : `<p>Generatori citata po fakultetu uskoro stizu.</p>`;

  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Generatori citata po fakultetu | Lekta</title>
<meta name="description" content="Citiraj tocno po pravilima svog fakulteta, provjereno i s izvorom.">
<style>${PAGE_STYLE}</style>
</head>
<body>
<h1>Generatori citata po fakultetu</h1>
${body}
<div class="lekta-cta">
  <strong>Provjeri cijeli rad na Lekti</strong>
  <a href="${SITE_ORIGIN}">${SITE_ORIGIN}</a>
</div>
</body>
</html>
`;
}

function buildCharCounterHtml() {
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brojac kartica | Lekta</title>
<meta name="description" content="Izbroji kartice teksta (1800 znakova po kartici) za svoj rad.">
<link rel="canonical" href="${SITE_ORIGIN}/alati/brojac-kartica.html">
<style>${PAGE_STYLE}
  textarea { width: 100%; min-height: 220px; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #d4d4d8; box-sizing: border-box; font-family: inherit; }
  .lekta-stats { display: flex; gap: 1.5rem; margin-top: 0.75rem; font-size: 0.9375rem; }
</style>
</head>
<body>
<h1>Brojac kartica</h1>
<p class="lekta-tool-meta">1 kartica = 1800 znakova (ukljucujuci razmake), standardna jedinica za akademske i lektorske radove.</p>
<textarea id="text-input" placeholder="Zalijepi svoj tekst ovdje..."></textarea>
<div class="lekta-stats">
  <span>Znakova: <strong id="char-count">0</strong></span>
  <span>Kartica: <strong id="page-count">0.0</strong></span>
  <span>Rijeci: <strong id="word-count">0</strong></span>
</div>
<div class="lekta-cta">
  <strong>Provjeri cijeli rad na Lekti</strong>
  <a href="${SITE_ORIGIN}/?utm_source=alat_brojac_kartica">Provjeri cijeli rad</a>
  <a class="lekta-back" href="./citati/index.html">Generatori citata po fakultetu</a>
</div>
<script>
var input = document.getElementById('text-input');
var charCount = document.getElementById('char-count');
var pageCount = document.getElementById('page-count');
var wordCount = document.getElementById('word-count');

input.addEventListener('input', function () {
  var text = input.value;
  var chars = text.length;
  var words = text.trim() ? text.trim().split(/\\s+/).length : 0;
  charCount.textContent = chars;
  pageCount.textContent = (chars / 1800).toFixed(1);
  wordCount.textContent = words;
});
</script>
</body>
</html>
`;
}

function buildSitemap(urls) {
  const entries = urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function main() {
  const configs = loadJson(CONFIGS_PATH);
  const formatterSource = fs.readFileSync(FORMATTER_PATH, 'utf-8');

  // Vrata: SAMO status "verified" ide van. Bilo sto drugo je hard error,
  // ne tih preskok, da nitko slucajno ne objavi neprovjereno pravilo.
  const invalid = configs.filter((c) => c.status !== 'verified');
  if (invalid.length > 0) {
    console.error(
      `[generate-citation-tools] FAIL: ${invalid.length} config(a) nema status:"verified" ` +
        `(${invalid.map((c) => c.facultyId).join(', ')}). Ovo ne smije ici na build.`,
    );
    process.exit(1);
  }

  fs.mkdirSync(CITATI_OUT_DIR, { recursive: true });

  const sitemapUrls = [`${SITE_ORIGIN}/alati/brojac-kartica.html`, `${SITE_ORIGIN}/alati/citati/index.html`];

  for (const config of configs) {
    const slug = slugify(config.facultyName);
    const html = buildCitationPageHtml(config, formatterSource, slug);
    fs.writeFileSync(path.join(CITATI_OUT_DIR, `${slug}.html`), html, 'utf-8');
    sitemapUrls.push(`${SITE_ORIGIN}/alati/citati/${slug}.html`);
    console.log(`[generate-citation-tools] generirano: alati/citati/${slug}.html`);
  }

  fs.writeFileSync(path.join(CITATI_OUT_DIR, 'index.html'), buildIndexHtml(configs), 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'brojac-kartica.html'), buildCharCounterHtml(), 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-alati.xml'), buildSitemap(sitemapUrls), 'utf-8');

  console.log(
    `[generate-citation-tools] gotovo. ${configs.length} fakultet(a), plus brojac kartica, plus sitemap-alati.xml.`,
  );
  if (configs.length === 0) {
    console.warn(
      '[generate-citation-tools] NAPOMENA: citation-configs.json je prazan, popuni ga stvarnim verificiranim stilovima (vidi data/tools/README.md).',
    );
  }
}

main();
