#!/usr/bin/env node
// scripts/generate-citation-tools.mjs
//
// Build-time generator STATICNIH HTML stranica citatnih alata (SEO free-tools, ne SPA rute).
// Pokreni: node scripts/generate-citation-tools.mjs  (wiran u netlify.toml POSLIJE `vite build`).
//
// Stil po fakultetu se NE autorira rucno: derivira se iz data/profiles/verified-profiles.json
// (rules.recommendedCitation token) + src/citations/citation-meta.ts (token -> label/mode) i
// renderira postojecim motorom src/tools/citation.ts (autor-godina / fusnota / ieee / vancouver).
// Motor se esbuildom bundla u IIFE i (a) inlinea u stranice, (b) Node ga eval-om cita za mapu.
// Custom / bez tokena -> stranica posteno vodi na opci generator, bez izmisljenog stila.
//
// Izlaz u dist/alati/:
//   citati/index.html            dinamicki alat (izbor fakulteta -> ucita se njegov stil)
//   citati/<unit>[-<token>].html staticka SEO stranica po (fakultet x stil)
//   brojac-kartica.html          brojac kartica (1800 znakova)
//   sitemap-alati.xml

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PROFILES_PATH = path.join(ROOT, 'data/profiles/verified-profiles.json');
const CATALOG_PATH = path.join(ROOT, 'data/catalog/zagreb-catalog.json');
const ENGINE_ENTRY = path.join(ROOT, 'src/citations/citation-web.ts');
const OVERRIDES_PATH = path.join(ROOT, 'data/tools/citation-configs.json'); // opcionalni rucni override
const OUT_DIR = path.join(ROOT, 'dist/alati');
const CITATI_OUT_DIR = path.join(OUT_DIR, 'citati');

const SITE_ORIGIN = process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr';
const GENERAL_TOOL_URL = `${SITE_ORIGIN}/citat.html`;

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[generate-citation-tools] Nedostaje ${filePath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

// JSON za inline <script>: neutralizira < da </script> ili <!-- ne razbiju parser.
function jsonInline(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// esbuild bundle motora (IIFE, globalName LektaCitation): koristi se i za inline i za Node eval.
async function buildEngine() {
  const out = await esbuild.build({
    entryPoints: [ENGINE_ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'LektaCitation',
    platform: 'browser',
    target: 'es2019',
    write: false,
    legalComments: 'none',
  });
  return out.outputFiles[0].text;
}

// Ucitaj motor u Node iz istog IIFE bundlea (citationMeta, engineStyleFor). Bez DOM ovisnosti.
function loadEngineInNode(bundleJs) {
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${bundleJs}\n;return LektaCitation;`);
  return factory();
}

const PAGE_STYLE = `
  :root { color-scheme: light; }
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 680px; margin: 2rem auto; padding: 0 1rem; color: #18181b; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: 0.25rem; }
  .lekta-tool-meta { color: #52525b; font-size: 0.875rem; margin-bottom: 1.25rem; }
  label { display: block; font-size: 0.85rem; font-weight: 600; margin: 0.75rem 0 0.25rem; color: #3f3f46; }
  input, select, textarea { width: 100%; padding: 0.5rem 0.625rem; border-radius: 0.5rem; border: 1px solid #d4d4d8; box-sizing: border-box; font: inherit; background: #fff; }
  button { margin-top: 1rem; padding: 0.625rem 1rem; border-radius: 0.5rem; border: none; background: #18181b; color: #fff; font-weight: 600; cursor: pointer; }
  button:hover { background: #27272a; }
  #citation-output { margin-top: 1rem; padding: 0.875rem; background: #f4f4f5; border-radius: 0.5rem; min-height: 1.25rem; }
  .cit-line { font-size: 0.95rem; white-space: pre-wrap; }
  .cit-intext { margin-top: 0.5rem; font-size: 0.85rem; color: #52525b; }
  .cit-missing { margin-top: 0.5rem; font-size: 0.8rem; color: #b45309; }
  .cit-empty { color: #71717a; font-size: 0.875rem; }
  #style-info { margin: 0.5rem 0 0.25rem; font-size: 0.9rem; }
  #style-info a { color: #1d4ed8; }
  .lekta-cta { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e4e4e7; font-size: 0.9375rem; }
  .lekta-cta a { color: #1d4ed8; }
  .lekta-back { display: block; margin-top: 0.5rem; font-size: 0.8125rem; color: #71717a; }
  select#style-select { margin-top: 0.5rem; }
`;

// Klijentski upravljac alata: cita window.LEKTA_TOOL_CONFIG + window.LektaCitation. Bez ${} i backtickova.
const TOOL_JS = String.raw`
(function () {
  var C = window.LektaCitation;
  var cfg = window.LEKTA_TOOL_CONFIG || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var facSel = el('faculty-select');
  var styleSel = el('style-select');
  var styleInfo = el('style-info');
  var formWrap = el('citation-form');
  var typeSel = el('source-type');
  var fieldsBox = el('fields');
  var output = el('citation-output');
  var current = null;

  function currentType() {
    var v = typeSel.value;
    var found = C.SOURCE_TYPES.filter(function (s) { return s.type === v; })[0];
    return found || C.SOURCE_TYPES[0];
  }

  function renderTypeOptions() {
    typeSel.innerHTML = C.SOURCE_TYPES.map(function (s) {
      return '<option value="' + s.type + '">' + esc(s.label) + '</option>';
    }).join('');
  }

  function renderFields() {
    var st = currentType();
    fieldsBox.innerHTML = '';
    st.fields.forEach(function (f) {
      if (f.key === 'accessed' && current && current.accessDate === false) return;
      var label = document.createElement('label');
      label.setAttribute('for', 'f-' + f.key);
      label.textContent = f.label;
      var input = document.createElement('input');
      input.type = 'text';
      input.id = 'f-' + f.key;
      input.setAttribute('data-key', f.key);
      fieldsBox.appendChild(label);
      fieldsBox.appendChild(input);
    });
  }

  function generate() {
    if (!current || !current.engineStyle) return;
    var st = currentType();
    var inp = { type: st.type };
    st.fields.forEach(function (f) { var i = el('f-' + f.key); if (i) inp[f.key] = i.value; });
    var res = C.formatCitation(inp, current.engineStyle);
    var html = res.citation
      ? '<div class="cit-line">' + esc(res.citation) + '</div>'
      : '<div class="cit-empty">Popuni polja pa klikni Generiraj.</div>';
    if (res.inText) html += '<div class="cit-intext">U tekstu: ' + esc(res.inText) + '</div>';
    if (res.missing && res.missing.length) html += '<div class="cit-missing">Nedostaje (preporuceno): ' + res.missing.map(esc).join(', ') + '</div>';
    output.innerHTML = html;
  }

  function setStyle(style) {
    current = style;
    if (!style || !style.engineStyle) {
      if (formWrap) formWrap.style.display = 'none';
      styleInfo.innerHTML = style
        ? '<p>Za ovaj stil (' + esc(style.label) + ') Lekta nema automatski format. Koristi <a href="' + esc(cfg.generalToolUrl || '/citat.html') + '">opci generator citata</a> i provjeri upute mentora.</p>'
        : '<p>Za ovaj fakultet jos nemamo verificiran citatni stil. Koristi <a href="' + esc(cfg.generalToolUrl || '/citat.html') + '">opci generator citata</a> i provjeri sluzbene upute.</p>';
      return;
    }
    if (formWrap) formWrap.style.display = '';
    styleInfo.innerHTML = '<p>Stil: <strong>' + esc(style.label) + '</strong></p>';
    renderFields();
    output.innerHTML = '';
  }

  function stylesForFaculty(fid) {
    var f = (cfg.faculties || []).filter(function (x) { return x.id === fid; })[0];
    return f ? f.styles : [];
  }
  function onFaculty() {
    var styles = stylesForFaculty(facSel.value);
    if (styleSel) {
      if (styles.length <= 1) {
        styleSel.style.display = 'none';
        styleSel.innerHTML = '';
      } else {
        styleSel.style.display = '';
        styleSel.innerHTML = styles.map(function (s, i) {
          var hint = s.programsHint ? ' (' + esc(s.programsHint) + ')' : '';
          return '<option value="' + i + '">' + esc(s.label) + hint + '</option>';
        }).join('');
      }
    }
    setStyle(styles[0] || null);
  }
  function onStyle() {
    var styles = stylesForFaculty(facSel.value);
    setStyle(styles[parseInt(styleSel.value, 10)] || null);
  }

  renderTypeOptions();
  typeSel.addEventListener('change', renderFields);
  el('generate-btn').addEventListener('click', generate);

  if (cfg.mode === 'index') {
    facSel.addEventListener('change', onFaculty);
    if (styleSel) styleSel.addEventListener('change', onStyle);
    onFaculty();
  } else {
    setStyle(cfg.style || null);
  }
})();
`;

function pageShell({ title, description, canonical, bodyHtml, engineJs, configJs }) {
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
<style>${PAGE_STYLE}</style>
</head>
<body>
${bodyHtml}
<script>${engineJs}</script>
<script>window.LEKTA_TOOL_CONFIG = ${configJs};</script>
<script>${TOOL_JS}</script>
</body>
</html>
`;
}

function toolFormHtml({ withFacultyPicker }) {
  const picker = withFacultyPicker
    ? `<label for="faculty-select">Tvoj fakultet</label>
<select id="faculty-select">${FACULTY_OPTIONS}</select>
<select id="style-select" style="display:none" aria-label="Citatni stil"></select>`
    : '';
  return `<div id="tool">
${picker}
<div id="style-info"></div>
<div id="citation-form">
  <label for="source-type">Vrsta izvora</label>
  <select id="source-type"></select>
  <div id="fields"></div>
  <button id="generate-btn" type="button">Generiraj citat</button>
  <div id="citation-output" aria-live="polite"></div>
</div>
</div>`;
}

function ctaHtml(backHref, backLabel) {
  return `<div class="lekta-cta">
  <strong>Provjeri cijeli rad na Lekti</strong>
  <p>Citat je samo jedan dio. Lekta provjerava oblikovanje, strukturu i citiranje odjednom, prema stvarnim pravilima tvog fakulteta.</p>
  <a href="${SITE_ORIGIN}/?utm_source=alat_citati">Provjeri cijeli rad</a>
  <a class="lekta-back" href="${backHref}">${escapeHtml(backLabel)}</a>
</div>`;
}

// --- Popuna podataka -------------------------------------------------------

let FACULTY_OPTIONS = ''; // popunjava buildFaculties()

function buildFaculties(engine) {
  const catalog = loadJson(CATALOG_PATH);
  const profiles = loadJson(PROFILES_PATH);

  const unitMeta = {};
  for (const inst of catalog) {
    for (const u of inst.units || []) unitMeta[u.id] = { name: u.name, instId: inst.id, instName: inst.name };
  }

  const acc = {}; // unitId -> { token -> {count, programs:Set} }
  for (const p of profiles) {
    const u = p.unitId;
    if (!u) continue;
    (acc[u] ??= {});
    const tok = p.rules && p.rules.recommendedCitation;
    if (!tok) continue;
    const t = (acc[u][tok] ??= { count: 0, programs: new Set() });
    t.count++;
    for (const pr of p.programs || []) t.programs.add(pr);
  }

  const faculties = Object.keys(acc)
    .map((u) => {
      const meta = unitMeta[u] || { name: u, instId: 'other', instName: 'Ostalo' };
      const tokens = acc[u];
      const styles = Object.keys(tokens)
        .sort((a, b) => tokens[b].count - tokens[a].count)
        .map((tok) => {
          const m = engine.citationMeta(tok);
          const progs = [...tokens[tok].programs].slice(0, 2).join(', ');
          return {
            token: tok,
            label: m.label,
            mode: m.mode,
            engineStyle: engine.engineStyleFor(tok),
            accessDate: m.accessDate,
            programsHint: progs,
          };
        });
      return { id: u, name: meta.name, instId: meta.instId, instName: meta.instName, styles };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'hr'));

  // faculty <select> grupiran po sveucilistu (redoslijed iz kataloga)
  FACULTY_OPTIONS = catalog
    .map((inst) => {
      const opts = faculties.filter((f) => f.instId === inst.id);
      if (!opts.length) return '';
      return (
        `<optgroup label="${escapeHtml(inst.name)}">` +
        opts.map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)}</option>`).join('') +
        `</optgroup>`
      );
    })
    .join('');

  return faculties;
}

function slugFor(faculty, style) {
  const renderable = faculty.styles.filter((s) => s.engineStyle);
  return renderable.length > 1 ? `${faculty.id}-${slugify(style.token)}` : faculty.id;
}

function buildIndexPage(faculties, engineJs) {
  const clientData = faculties.map((f) => ({
    id: f.id,
    styles: f.styles.map((s) => ({ token: s.token, label: s.label, engineStyle: s.engineStyle, accessDate: s.accessDate, programsHint: s.programsHint })),
  }));
  const config = { mode: 'index', generalToolUrl: GENERAL_TOOL_URL, faculties: clientData };
  const body = `<h1>Generator citata po fakultetu</h1>
<p class="lekta-tool-meta">Odaberi fakultet pa se ucita njegov citatni stil. Provjereno prema profilima Lekte.</p>
${toolFormHtml({ withFacultyPicker: true })}
${ctaHtml(`${SITE_ORIGIN}/alati/brojac-kartica.html`, 'Brojac kartica')}`;
  return pageShell({
    title: 'Generator citata po fakultetu | Lekta',
    description: 'Odaberi svoj fakultet i citiraj tocno po njegovim pravilima, provjereno i s izvorom.',
    canonical: `${SITE_ORIGIN}/alati/citati/index.html`,
    bodyHtml: body,
    engineJs,
    configJs: jsonInline(config),
  });
}

function buildFacultyStylePage(faculty, style, engineJs) {
  const config = {
    mode: 'static',
    generalToolUrl: GENERAL_TOOL_URL,
    style: { token: style.token, label: style.label, engineStyle: style.engineStyle, accessDate: style.accessDate },
  };
  const body = `<h1>Generator citata za ${escapeHtml(faculty.name)}</h1>
<p class="lekta-tool-meta">Stil: ${escapeHtml(style.label)}. Prema profilu ${escapeHtml(faculty.name)} u Lekti.</p>
${toolFormHtml({ withFacultyPicker: false })}
${ctaHtml('./index.html', 'Svi fakulteti')}`;
  return pageShell({
    title: `Generator citata za ${faculty.name} (${style.label}) | Lekta`,
    description: `Citiraj po stilu ${style.label} za ${faculty.name}, provjereno i s izvorom.`,
    canonical: `${SITE_ORIGIN}/alati/citati/${slugFor(faculty, style)}.html`,
    bodyHtml: body,
    engineJs,
    configJs: jsonInline(config),
  });
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
  textarea { min-height: 220px; }
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
${ctaHtml(`${SITE_ORIGIN}/alati/citati/index.html`, 'Generator citata po fakultetu')}
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
  const entries = urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

async function main() {
  // Opcionalni rucni override (npr. custom fakultet): trenutno se samo validira oblik; derivacija
  // iz profila je primarni izvor. Zadrzano radi buducih rucnih iznimaka (vidi data/tools/README.md).
  if (fs.existsSync(OVERRIDES_PATH)) {
    const ov = loadJson(OVERRIDES_PATH);
    if (!Array.isArray(ov)) {
      console.error('[generate-citation-tools] citation-configs.json mora biti niz (override), preskacem.');
    }
  }

  const engineJs = await buildEngine();
  const engine = loadEngineInNode(engineJs);
  const faculties = buildFaculties(engine);

  fs.mkdirSync(CITATI_OUT_DIR, { recursive: true });

  const sitemapUrls = [
    `${SITE_ORIGIN}/alati/brojac-kartica.html`,
    `${SITE_ORIGIN}/alati/citati/index.html`,
  ];

  fs.writeFileSync(path.join(CITATI_OUT_DIR, 'index.html'), buildIndexPage(faculties, engineJs), 'utf-8');

  let pageCount = 0;
  const seen = new Set();
  for (const f of faculties) {
    for (const s of f.styles) {
      if (!s.engineStyle) continue; // custom/none nema staticku stranicu (tanki sadrzaj)
      const slug = slugFor(f, s);
      if (seen.has(slug)) continue;
      seen.add(slug);
      fs.writeFileSync(path.join(CITATI_OUT_DIR, `${slug}.html`), buildFacultyStylePage(f, s, engineJs), 'utf-8');
      sitemapUrls.push(`${SITE_ORIGIN}/alati/citati/${slug}.html`);
      pageCount++;
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'brojac-kartica.html'), buildCharCounterHtml(), 'utf-8');
  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-alati.xml'), buildSitemap(sitemapUrls), 'utf-8');

  const withStyle = faculties.filter((f) => f.styles.some((s) => s.engineStyle)).length;
  const noStyle = faculties.length - withStyle;
  console.log(
    `[generate-citation-tools] gotovo. ${faculties.length} fakultet(a) u izborniku, ` +
      `${pageCount} statickih stranica po (fakultet x stil), plus brojac + sitemap.`,
  );
  console.log(`[generate-citation-tools] ${withStyle} fakulteta s auto-stilom, ${noStyle} bez (vode na opci alat).`);
}

main().catch((e) => {
  console.error('[generate-citation-tools] GRESKA:', e);
  process.exit(1);
});
