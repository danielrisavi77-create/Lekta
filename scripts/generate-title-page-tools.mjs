#!/usr/bin/env node
// scripts/generate-title-page-tools.mjs
//
// Build-time generator STATICNIH HTML stranica generatora naslovnice po fakultetu
// (SEO free-tools, ne SPA rute), po uzoru na generate-citation-tools.mjs.
// Pokreni: node scripts/generate-title-page-tools.mjs (netlify.toml POSLIJE `vite build`).
//
// Stranica po fakultetu nastaje SAMO za jedinice s pravim predloskom u
// data/title-pages/templates.json (anti-thin-content: bez predloska nema stranice,
// index vodi na glavni alat /naslovnica.html). Motor (buildTitlePage + docx-writer)
// se esbuildom bundla u IIFE i inlinea; predlozak ide u window.LEKTA_TP_CONFIG.
//
// Izlaz u dist/alati/:
//   naslovnica/index.html              popis fakulteta s predloskom
//   naslovnica/<unit>[-<razina>].html  staticka SEO stranica po predlosku
//   sitemap-naslovnica.xml

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TEMPLATES_PATH = path.join(ROOT, 'data/title-pages/templates.json');
const CATALOG_PATH = path.join(ROOT, 'data/catalog/zagreb-catalog.json');
const LABELS_PATH = path.join(ROOT, 'data/work-type-labels.json');
const ENGINE_ENTRY = path.join(ROOT, 'src/title-pages/title-page-web.ts');
const OUT_DIR = path.join(ROOT, 'dist/alati');
const TP_OUT_DIR = path.join(OUT_DIR, 'naslovnica');

const SITE_ORIGIN = process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr';
const MAIN_TOOL_URL = `${SITE_ORIGIN}/naslovnica.html`;

const LEVEL_SLUGS = {
  seminar: 'seminarski', final: 'zavrsni', graduate: 'diplomski',
  specialist: 'specijalisticki', doctoral: 'doktorski', article: 'clanak', project: 'projektni',
};

const loadJson = (p) => JSON.parse(fs.readFileSync(p, 'utf-8'));
const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonInline = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

async function buildEngine() {
  const out = await esbuild.build({
    entryPoints: [ENGINE_ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'LektaTitlePage',
    platform: 'browser',
    target: 'es2019',
    write: false,
    legalComments: 'none',
  });
  return out.outputFiles[0].text;
}

const PAGE_STYLE = `
  :root { color-scheme: light; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #18181b; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .lekta-tool-meta { color: #52525b; font-size: 0.875rem; margin-bottom: 0.75rem; }
  .tp-badge { display: inline-block; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 999px; margin-bottom: 1rem; }
  .tp-badge.official { background: #dcfce7; color: #166534; }
  .tp-badge.derived { background: #e0e7ff; color: #3730a3; }
  label { display: block; font-size: 0.85rem; font-weight: 600; margin: 0.75rem 0 0.25rem; color: #3f3f46; }
  input, select { width: 100%; padding: 0.5rem 0.625rem; border-radius: 0.5rem; border: 1px solid #d4d4d8; box-sizing: border-box; font: inherit; background: #fff; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  button { margin-top: 1rem; margin-right: 0.5rem; padding: 0.625rem 1rem; border-radius: 0.5rem; border: none; background: #18181b; color: #fff; font-weight: 600; cursor: pointer; }
  button:hover { background: #27272a; }
  button:disabled { opacity: 0.45; cursor: default; }
  #tp-preview { margin-top: 1.25rem; background: #fff; border: 1px solid #d4d4d8; border-radius: 0.375rem; box-shadow: 0 6px 18px rgba(0,0,0,.08); aspect-ratio: 1 / 1.414; padding: 7% 6%; display: flex; flex-direction: column; text-align: center; font-family: Georgia, 'Times New Roman', serif; overflow: hidden; }
  .tp-group { margin-top: 1.1rem; }
  .tp-group:first-child { margin-top: 0; }
  .tp-group:nth-child(2) { margin-top: auto; }
  .tp-group:last-child { margin-top: auto; }
  .tp-line { line-height: 1.35; margin-top: 0.2rem; }
  .tp-empty { margin: auto; color: #71717a; font-style: italic; font-size: 0.9rem; font-family: system-ui, sans-serif; }
  .faq h2 { font-size: 1.1rem; margin-top: 2rem; }
  .faq h3 { font-size: 0.95rem; margin-bottom: 0.25rem; }
  .faq p { margin-top: 0; font-size: 0.9rem; color: #3f3f46; }
  .lekta-cta { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e4e4e7; font-size: 0.9375rem; }
  .lekta-cta a { color: #1d4ed8; }
  .lekta-back { display: block; margin-top: 0.5rem; font-size: 0.8125rem; color: #71717a; }
  ul.unit-list { padding-left: 1.1rem; } ul.unit-list li { margin: 0.3rem 0; } ul.unit-list a { color: #1d4ed8; }
`;

// Klijentski glue stranice: forma -> buildTitlePage(input, template) -> pregled + copy + docx.
const PAGE_SCRIPT = `
(function () {
  var cfg = window.LEKTA_TP_CONFIG;
  var T = window.LektaTitlePage;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function lineCss(style) {
    if (!style) return '';
    var css = [];
    var size = Number(style.sizePt);
    if (isFinite(size) && size > 0) css.push('font-size:' + Math.round(size * 1.1) + 'px');
    if (style.bold) css.push('font-weight:700');
    if (style.italic) css.push('font-style:italic');
    css.push('text-transform:' + (style.uppercase ? 'uppercase' : 'none'));
    if (style.align === 'left' || style.align === 'right') css.push('text-align:' + style.align);
    return css.join(';');
  }
  function readInput() {
    return {
      university: cfg.universityName, faculty: cfg.unitName,
      study: $('tp-study').value, author: $('tp-author').value, title: $('tp-title').value,
      workType: cfg.workTypeLabel, mentor: $('tp-mentor').value,
      mentorLabel: $('tp-mentor-label').value, place: $('tp-place').value, year: $('tp-year').value,
    };
  }
  function render() {
    var model = T.buildTitlePage(readInput(), cfg.template);
    var host = $('tp-preview');
    if (!model.lines.length) {
      host.innerHTML = '<div class="tp-empty">Ispuni polja pa se naslovnica slaze ovdje.</div>';
    } else {
      var html = '';
      var prev = null; var open = false;
      for (var i = 0; i < model.lines.length; i++) {
        var line = model.lines[i];
        if (!open || line.group !== prev) {
          if (open) html += '</div>';
          html += '<div class="tp-group">'; open = true;
        }
        var css = lineCss(line.style);
        html += '<div class="tp-line"' + (css ? ' style="' + css + '"' : '') + '>' + esc(line.text) + '</div>';
        prev = line.group;
      }
      if (open) html += '</div>';
      host.innerHTML = html;
    }
    $('tp-copy').disabled = !model.lines.length;
    $('tp-docx').disabled = !model.lines.length;
    return model;
  }
  ['tp-study', 'tp-author', 'tp-title', 'tp-mentor', 'tp-place', 'tp-year'].forEach(function (id) {
    $(id).addEventListener('input', render);
  });
  $('tp-mentor-label').addEventListener('change', render);
  $('tp-copy').addEventListener('click', function () {
    var model = T.buildTitlePage(readInput(), cfg.template);
    if (!model.lines.length) return;
    var text = T.titlePageText(model);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  });
  $('tp-docx').addEventListener('click', function () {
    var model = T.buildTitlePage(readInput(), cfg.template);
    if (!model.lines.length) return;
    try {
      var blob = T.docxBlob(T.titlePageDoc(model, cfg.template));
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'naslovnica.docx';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) {}
  });
  render();
})();
`;

function pageShell({ title, description, canonical, bodyHtml, jsonLd, inlineJs }) {
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lekta">
<meta property="og:locale" content="hr_HR">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
<style>${PAGE_STYLE}</style>
</head>
<body>
${bodyHtml}
${inlineJs ? `<script>${inlineJs}</script>` : ''}
</body>
</html>`;
}

function badgeHtml(status) {
  return status === 'official'
    ? '<span class="tp-badge official">Predložak prema službenim uputama fakulteta</span>'
    : '<span class="tp-badge derived">Raspored izveden iz javnih radova (nije službeni predložak)</span>';
}

function faqHtml(unitName, levelLabel) {
  return `
<section class="faq">
<h2>Česta pitanja</h2>
<h3>Je li ovo službena naslovnica?</h3>
<p>Raspored prati dostupne izvore fakulteta (oznaka iznad pregleda kaže koje), ali konačnu naslovnicu uvijek uskladi s uputama svog studija ili mentora.</p>
<h3>Mogu li promijeniti fakultet ili razinu?</h3>
<p>Da, otvori opći alat na <a href="${MAIN_TOOL_URL}">lekta naslovnica</a> i odaberi bilo koji fakultet i vrstu rada.</p>
<h3>Što sadrži naslovnica za ${escapeHtml(levelLabel.toLowerCase())} (${escapeHtml(unitName)})?</h3>
<p>Elemente iz predloška: ustanovu i fakultet, autora, naslov, oznaku vrste rada, mentora te mjesto i godinu, redoslijedom koji vidiš u pregledu.</p>
</section>`;
}

function faqJsonLd(unitName) {
  return jsonInline({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Je li ovo sluzbena naslovnica?',
        acceptedAnswer: { '@type': 'Answer', text: 'Raspored prati dostupne izvore fakulteta, ali konacnu naslovnicu uvijek uskladi s uputama svog studija ili mentora.' },
      },
      {
        '@type': 'Question',
        name: `Sto sadrzi naslovnica rada (${unitName})?`,
        acceptedAnswer: { '@type': 'Answer', text: 'Ustanovu i fakultet, autora, naslov rada, oznaku vrste rada, mentora te mjesto i godinu izrade.' },
      },
    ],
  });
}

function unitPage({ template, unitName, universityName, levelLabel, engineJs, fileName }) {
  const canonical = `${SITE_ORIGIN}/alati/naslovnica/${fileName}`;
  const title = `Naslovnica: ${unitName} (${levelLabel.toLowerCase()}) - besplatni predložak`;
  const description = `Složi naslovnicu za ${levelLabel.toLowerCase()} na ${unitName} po predlošku fakulteta. Kopiraj tekst ili preuzmi .docx, besplatno i lokalno u pregledniku.`;
  const deepLink = `${MAIN_TOOL_URL}?fakultet=${encodeURIComponent(template.unitId)}${template.level ? `&razina=${LEVEL_SLUGS[template.level]}` : ''}`;
  const config = {
    unitId: template.unitId,
    unitName,
    universityName,
    workTypeLabel: levelLabel,
    template,
  };
  const body = `
<h1>Naslovnica za ${escapeHtml(levelLabel.toLowerCase())}: ${escapeHtml(unitName)}</h1>
<p class="lekta-tool-meta">${escapeHtml(universityName)} · besplatno, bez registracije, sve lokalno u pregledniku.</p>
${badgeHtml(template.provenance.status)}
<div class="row">
  <div><label for="tp-author">Ime i prezime</label><input id="tp-author" type="text" placeholder="npr. Ana Anić"></div>
  <div><label for="tp-study">Studij ili smjer (opcionalno)</label><input id="tp-study" type="text" placeholder="npr. Diplomski studij"></div>
</div>
<label for="tp-title">Naslov rada</label>
<input id="tp-title" type="text" placeholder="Naslov rada">
<div class="row">
  <div><label for="tp-mentor-label">Titula</label><select id="tp-mentor-label"><option>Mentor</option><option>Mentorica</option></select></div>
  <div><label for="tp-mentor">Mentor / mentorica</label><input id="tp-mentor" type="text" placeholder="npr. dr. sc. Ivan Ivić"></div>
</div>
<div class="row">
  <div><label for="tp-place">Mjesto</label><input id="tp-place" type="text" placeholder="Zagreb"></div>
  <div><label for="tp-year">Godina</label><input id="tp-year" type="text" placeholder="2026"></div>
</div>
<div id="tp-preview" aria-label="Pregled naslovnice"><div class="tp-empty">Ispuni polja pa se naslovnica slaže ovdje.</div></div>
<button id="tp-copy" type="button" disabled>Kopiraj tekst</button>
<button id="tp-docx" type="button" disabled>Preuzmi .docx</button>
${faqHtml(unitName, levelLabel)}
<div class="lekta-cta">
  <p>Puni alat s izborom fakulteta i razine: <a href="${escapeHtml(deepLink)}">generator naslovnice</a>.
  Želiš provjeriti cijeli rad prema pravilima fakulteta? <a href="${SITE_ORIGIN}/index.html#analyzer">Besplatna Lekta provjera</a>.</p>
  <a class="lekta-back" href="${SITE_ORIGIN}/alati/naslovnica/">← Svi fakulteti s predloškom naslovnice</a>
</div>
<script>window.LEKTA_TP_CONFIG = ${jsonInline(config)};</script>
<script>${engineJs}</script>`;
  return pageShell({ title, description, canonical, bodyHtml: body, jsonLd: faqJsonLd(unitName), inlineJs: PAGE_SCRIPT });
}

function indexPage(entries) {
  const canonical = `${SITE_ORIGIN}/alati/naslovnica/`;
  const items = entries
    .map((e) => `<li><a href="${escapeHtml(e.fileName)}">${escapeHtml(e.unitName)} (${escapeHtml(e.levelLabel.toLowerCase())})</a></li>`)
    .join('\n');
  const body = `
<h1>Naslovnice po fakultetima</h1>
<p class="lekta-tool-meta">Besplatni generator naslovnice s predloškom po fakultetu. Za fakultete kojih nema na popisu koristi <a href="${MAIN_TOOL_URL}">opći generator naslovnice</a>.</p>
${entries.length ? `<ul class="unit-list">\n${items}\n</ul>` : `<p>Predlošci po fakultetima stižu uskoro; do tada koristi <a href="${MAIN_TOOL_URL}">opći generator naslovnice</a>.</p>`}
<div class="lekta-cta">
  <p>Želiš provjeriti cijeli rad prema pravilima fakulteta? <a href="${SITE_ORIGIN}/index.html#analyzer">Besplatna Lekta provjera</a>.</p>
</div>`;
  return pageShell({
    title: 'Naslovnice po fakultetima - besplatni generator - Lekta',
    description: 'Generator naslovnice akademskog rada s predloscima po fakultetima: redoslijed, tipografija i .docx preuzimanje. Besplatno i lokalno.',
    canonical,
    bodyHtml: body,
  });
}

function sitemapXml(urls) {
  const rows = urls.map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

async function main() {
  const templates = loadJson(TEMPLATES_PATH);
  const catalog = loadJson(CATALOG_PATH);
  const labels = loadJson(LABELS_PATH);

  const unitInfo = new Map();
  for (const inst of catalog) {
    for (const u of inst.units) unitInfo.set(u.id, { unitName: u.name, universityName: inst.name });
  }

  fs.mkdirSync(TP_OUT_DIR, { recursive: true });
  const engineJs = await buildEngine();

  const entries = [];
  for (const template of templates) {
    const info = unitInfo.get(template.unitId);
    if (!info) {
      console.warn(`[generate-title-page-tools] preskacem ${template.id}: unitId nije u katalogu`);
      continue;
    }
    const levelLabel = template.level ? (labels[template.level] || template.level) : 'Akademski rad';
    const slug = template.level ? `-${LEVEL_SLUGS[template.level]}` : '';
    const fileName = `${template.unitId}${slug}.html`;
    fs.writeFileSync(
      path.join(TP_OUT_DIR, fileName),
      unitPage({ template, unitName: info.unitName, universityName: info.universityName, levelLabel, engineJs, fileName }),
    );
    entries.push({ fileName, unitName: info.unitName, levelLabel });
  }

  entries.sort((a, b) => a.unitName.localeCompare(b.unitName, 'hr') || a.levelLabel.localeCompare(b.levelLabel, 'hr'));
  fs.writeFileSync(path.join(TP_OUT_DIR, 'index.html'), indexPage(entries));

  const urls = [`${SITE_ORIGIN}/alati/naslovnica/`, ...entries.map((e) => `${SITE_ORIGIN}/alati/naslovnica/${e.fileName}`)];
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-naslovnica.xml'), sitemapXml(urls));

  console.log(`[generate-title-page-tools] ${entries.length} stranica fakulteta + index + sitemap -> ${TP_OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
