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
import { SITE_ORIGIN } from './site-origin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PROFILES_PATH = path.join(ROOT, 'data/profiles/verified-profiles.json');
const CATALOG_PATH = path.join(ROOT, 'data/catalog/zagreb-catalog.json');
const ENGINE_ENTRY = path.join(ROOT, 'src/citations/citation-web.ts');
const REGISTRY_PATH = path.join(ROOT, 'data/sources/source-registry.json');
// Verificirani per-fakultet citatni specovi (data/tools/citation-specs/README tok):
// build cita ISKLJUCIVO verified/; drafts/ nikad ne izlazi u dist.
const SPECS_VERIFIED_DIR = path.join(ROOT, 'data/tools/citation-specs/verified');
const OUT_DIR = path.join(ROOT, 'dist/alati');
const CITATI_OUT_DIR = path.join(OUT_DIR, 'citati');

// SITE_ORIGIN dolazi iz scripts/site-origin.mjs (jedan izvor, fallback lektahr.netlify.app).
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
  /* Lekta Editorial Instrument: citatni alat na papiru (folija + serif naslovi + proof korekturni rub).
     Standalone stranice bez importa fonta pa se stackovi gracilno spustaju na Georgia/Times/system. */
  :root {
    color-scheme: light;
    --bg: #f3eee2; --panel: #fffdf8; --panel-2: #ebe4d5;
    --text: #1b2030; --muted: #5c5f6e; --line: #e2d9c6; --line-strong: #cfc6b2;
    --brand: #33407e; --brand-2: #4b50a4; --on-brand: #ffffff;
    --proof: #c8102e; --proof-strong: #a60c24;
    --warn: #9a5b12; --warn-soft: #f6ecda;
    --danger: #b23a4e; --danger-soft: #f7e9ec;
    --edge: rgba(255,255,255,.6);
    --shadow-sm: 0 8px 24px rgba(41,36,26,.09);
    --display-serif: "Fraunces Variable", "Source Serif 4 Variable", Georgia, "Times New Roman", serif;
    --ink-serif: "Source Serif 4 Variable", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
    --radius: 20px; --radius-sm: 14px; --radius-pill: 999px;
  }
  * { box-sizing: border-box; }
  html { background: var(--bg); }
  body {
    font-family: "Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    max-width: 680px; margin: 2rem auto; padding: 1.75rem 1.85rem 2.25rem;
    color: var(--text); line-height: 1.55; position: relative;
    background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
    box-shadow: var(--shadow-sm), inset 0 1px 0 var(--edge);
  }
  /* proof-red korekturni rub (correction margin keyline), vertikalno uvucen da ne viri iz zaobljenih kutova */
  body::before { content: ""; position: absolute; left: 0; top: 14px; bottom: 14px; width: 3px; border-radius: 3px; background: color-mix(in srgb, var(--proof) 55%, transparent); }
  h1 { font-family: var(--display-serif); font-optical-sizing: auto; font-weight: 600; font-size: 1.55rem; letter-spacing: -0.015em; line-height: 1.12; margin: 0.1rem 0 0.3rem; }
  .lekta-tool-meta { color: var(--muted); font-size: 0.875rem; margin: 0 0 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--line); }
  label { display: block; font-size: 0.85rem; font-weight: 600; margin: 0.75rem 0 0.25rem; color: var(--text); }
  input, select, textarea { width: 100%; padding: 0.5rem 0.7rem; border-radius: var(--radius-sm); border: 1px solid var(--line-strong); font: inherit; color: var(--text); background: var(--panel-2); }
  input:focus-visible, select:focus-visible, textarea:focus-visible, button:focus-visible, a:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--brand); border-radius: var(--radius-sm); }
  button { margin-top: 1rem; padding: 0.6rem 1.15rem; border-radius: var(--radius-pill); border: none; background: var(--brand); color: var(--on-brand); font-weight: 600; cursor: pointer; }
  button:hover { background: var(--brand-2); }
  #citation-output { margin-top: 1rem; padding: 0.9rem 1rem; background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius-sm); min-height: 1.25rem; }
  .cit-line { font-family: var(--ink-serif); font-variant-numeric: tabular-nums; font-size: 1rem; line-height: 1.5; white-space: pre-wrap; }
  .cit-intext { margin-top: 0.5rem; font-size: 0.85rem; color: var(--muted); }
  .cit-missing { margin-top: 0.5rem; font-size: 0.8rem; color: var(--warn); }
  .cit-empty { color: var(--muted); font-size: 0.875rem; }
  #style-info { margin: 0.5rem 0 0.25rem; font-size: 0.9rem; }
  a { color: var(--brand); }
  #style-info a { color: var(--brand); }
  .lekta-cta { margin-top: 2rem; padding-top: 1.1rem; border-top: 1px solid var(--line); font-size: 0.9375rem; }
  .lekta-cta strong { font-family: var(--display-serif); font-weight: 600; font-size: 1.05rem; }
  .lekta-cta a { display: inline-block; margin-top: 0.4rem; color: var(--brand); font-weight: 600; }
  .lekta-back { display: block; margin-top: 0.5rem; font-size: 0.8125rem; color: var(--muted); font-weight: 400; }
  select#style-select { margin-top: 0.5rem; }
  .tabs { display: flex; gap: 0.5rem; margin: 1.1rem 0 0.25rem; }
  .tab { margin: 0; background: var(--panel-2); color: var(--muted); padding: 0.4rem 0.9rem; font-size: 0.85rem; border: 1px solid var(--line); }
  .tab.active { background: var(--brand); color: var(--on-brand); border-color: transparent; }
  textarea#bulk-input { min-height: 170px; }
  .bulk-note { font-size: 0.85rem; color: var(--text); background: var(--warn-soft); border-left: 3px solid var(--warn); padding: 0.55rem 0.75rem; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; margin: 0.6rem 0; }
  .bulk-card { border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 0.5rem 0.75rem 0.75rem; margin: 0.6rem 0; }
  .bulk-card.low-conf { border-color: var(--danger); background: var(--danger-soft); }
  .bulk-card-head { font-size: 0.78rem; color: var(--muted); margin-bottom: 0.25rem; }
  #bulk-output { margin-top: 1rem; }
  #bulk-output a { color: var(--brand); font-size: 0.8rem; }
  #bulk-result { min-height: 120px; font-family: var(--ink-serif); font-variant-numeric: tabular-nums; font-size: 0.9rem; }
  .lekta-stats strong { font-family: var(--ink-serif); font-variant-numeric: tabular-nums; }
  @media (max-width: 700px) {
    body { margin: 0; max-width: none; border-radius: 0; border-left-width: 0; border-right-width: 0; box-shadow: none; }
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --bg: #14151d; --panel: #1c1d28; --panel-2: #242536;
      --text: #f3f1ea; --muted: #a6a4b4; --line: #2f3042; --line-strong: #44465c;
      --brand: #9199e2; --brand-2: #aca6ec; --on-brand: #14151d;
      --proof: #f5808f; --proof-strong: #f7a0ab;
      --warn: #e0a45a; --warn-soft: #3d3320;
      --danger: #e77a8b; --danger-soft: #43242b;
      --edge: rgba(255,255,255,.045);
      --shadow-sm: 0 8px 24px rgba(0,0,0,.28);
    }
  }
`;

// Klijentski upravljac alata: cita window.LEKTA_TOOL_CONFIG + window.LektaCitation. Bez ${} i backtickova.
const TOOL_JS = String.raw`
(function () {
  var C = window.LektaCitation;
  var cfg = window.LEKTA_TOOL_CONFIG || {};
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var current = null;

  function typeDef(t) { return C.SOURCE_TYPES.filter(function (s) { return s.type === t; })[0] || C.SOURCE_TYPES[0]; }

  // Napuni karticu izvora: <select.card-type> + polja. values nosi type + vrijednosti polja.
  function renderCard(card, values) {
    values = values || {};
    var type = values.type || card.getAttribute('data-type') || C.SOURCE_TYPES[0].type;
    card.setAttribute('data-type', type);
    var opts = C.SOURCE_TYPES.map(function (s) {
      return '<option value="' + s.type + '"' + (s.type === type ? ' selected' : '') + '>' + esc(s.label) + '</option>';
    }).join('');
    var fieldsHtml = typeDef(type).fields.map(function (f) {
      if (f.key === 'accessed' && current && current.accessDate === false) return '';
      var v = values[f.key] != null ? values[f.key] : '';
      return '<label>' + esc(f.label) + '<input type="text" data-key="' + f.key + '" value="' + esc(v) + '"></label>';
    }).join('');
    card.innerHTML = '<label class="card-type-label">Vrsta izvora<select class="card-type">' + opts + '</select></label>' + fieldsHtml;
    card.querySelector('.card-type').addEventListener('change', function () { renderCard(card, readCard(card)); });
  }

  function readCard(card) {
    var sel = card.querySelector('.card-type');
    if (!sel) return { type: C.SOURCE_TYPES[0].type };
    var out = { type: sel.value };
    card.setAttribute('data-type', out.type);
    card.querySelectorAll('input[data-key]').forEach(function (i) { out[i.getAttribute('data-key')] = i.value; });
    return out;
  }

  function sortKeyOf(inp) {
    var a = C.parseAuthors(inp.authors || '');
    return ((a.length ? a[0].last : (inp.title || '')) || '').toLowerCase();
  }

  // Vjeran spec (verificiran iz sluzbenih uputa) ima prednost pred obiteljskim motorom.
  // Style-pin nema vlastite predloske: dokazuje KOJI stil vrijedi, renderira obiteljski motor.
  function formatWithCurrent(inp) {
    if (current && current.spec && !current.spec.pin) return C.formatFromSpec(current.spec, inp);
    return C.formatCitation(inp, current.engineStyle);
  }

  // --- Jedan izvor ---
  var singleCard = el('single-card');
  function generateSingle() {
    if (!current || (!current.engineStyle && !current.spec)) return;
    var res = formatWithCurrent(readCard(singleCard));
    var html = res.citation
      ? '<div class="cit-line">' + esc(res.citation) + '</div>'
      : '<div class="cit-empty">Popuni polja pa klikni Generiraj.</div>';
    if (res.inText) html += '<div class="cit-intext">U tekstu: ' + esc(res.inText) + '</div>';
    if (res.missing && res.missing.length) html += '<div class="cit-missing">Nedostaje (preporuceno): ' + res.missing.map(esc).join(', ') + '</div>';
    el('citation-output').innerHTML = html;
  }

  // --- Cijela literatura (bulk): zalijepi -> prepoznaj -> UREDI po unosu -> formatiraj + sortiraj ---
  function parseBulk() {
    var refs = C.splitReferences(el('bulk-input').value);
    var box = el('bulk-entries');
    box.innerHTML = '';
    if (!refs.length) { el('bulk-generate').style.display = 'none'; el('bulk-output').innerHTML = ''; return; }
    refs.forEach(function (raw, i) {
      var p = C.parseReference(raw);
      var card = document.createElement('div');
      card.className = 'bulk-card' + (p.lowConfidence ? ' low-conf' : '');
      var head = document.createElement('div');
      head.className = 'bulk-card-head';
      head.textContent = 'Referenca ' + (i + 1) + (p.lowConfidence ? ' (malo prepoznato, dopuni rucno)' : '');
      var fields = document.createElement('div');
      fields.className = 'bulk-card-fields';
      card.appendChild(head);
      card.appendChild(fields);
      box.appendChild(card);
      var values = { type: p.type };
      Object.keys(p.fields).forEach(function (k) { values[k] = p.fields[k]; });
      renderCard(fields, values);
    });
    el('bulk-generate').style.display = '';
    el('bulk-output').innerHTML = '';
  }

  function generateBulk() {
    if (!current || (!current.engineStyle && !current.spec)) return;
    var items = [];
    el('bulk-entries').querySelectorAll('.bulk-card-fields').forEach(function (card) {
      var inp = readCard(card);
      var res = formatWithCurrent(inp);
      if (res.citation) items.push({ key: sortKeyOf(inp), text: res.citation });
    });
    // Redoslijed literature: abecedno osim ako verificirani spec propisuje redoslijed pojavljivanja.
    var byAppearance = current.spec && current.spec.bibliography && current.spec.bibliography.sort === 'appearance';
    if (!byAppearance) items.sort(function (a, b) { return a.key.localeCompare(b.key, 'hr'); });
    var listText = items.map(function (x) { return x.text; }).join('\n');
    el('bulk-output').innerHTML =
      '<label>Literatura (abecedno, ' + items.length + ') <a href="#" id="bulk-copy">kopiraj</a></label>' +
      '<textarea id="bulk-result" rows="' + Math.min(20, Math.max(4, items.length + 1)) + '"></textarea>';
    el('bulk-result').value = listText;
    el('bulk-copy').addEventListener('click', function (e) {
      e.preventDefault();
      el('bulk-result').select();
      try { document.execCommand('copy'); } catch (_) {}
    });
  }

  function showTab(which) {
    el('panel-single').style.display = which === 'single' ? '' : 'none';
    el('panel-bulk').style.display = which === 'bulk' ? '' : 'none';
    el('tab-single').className = 'tab' + (which === 'single' ? ' active' : '');
    el('tab-bulk').className = 'tab' + (which === 'bulk' ? ' active' : '');
  }

  function setStyle(style) {
    current = style;
    var tabs = el('tool-tabs');
    // Tri postene razine: (1) verificiran spec iz sluzbenih uputa; (2) obiteljski oblik
    // (token poznat, spec ne) uz jasan caveat; (3) custom/bez tokena -> opci alat.
    if (!style || (!style.engineStyle && !style.spec)) {
      if (tabs) tabs.style.display = 'none';
      el('panel-single').style.display = 'none';
      el('panel-bulk').style.display = 'none';
      el('style-info').innerHTML = style
        ? '<p>Za ovaj stil (' + esc(style.label) + ') Lekta nema automatski format. Koristi <a href="' + esc(cfg.generalToolUrl || '/citat.html') + '">opci generator citata</a> i provjeri upute mentora.</p>'
        : '<p>Za ovaj fakultet jos nemamo verificiran citatni stil. Koristi <a href="' + esc(cfg.generalToolUrl || '/citat.html') + '">opci generator citata</a> i provjeri sluzbene upute.</p>';
      return;
    }
    if (tabs) tabs.style.display = '';
    if (style.spec && style.spec.pin) {
      el('style-info').innerHTML = '<p>Stil: <strong>' + esc(style.label) + '</strong>. Propisan sluzbenim uputama: &quot;' + esc(style.spec.sourceLabel) + '&quot;, provjereno ' + esc(style.spec.verifiedAt || '') + '. Format: opci ' + esc(style.label) + ' oblik.</p>';
    } else if (style.spec) {
      el('style-info').innerHTML = '<p>Stil: <strong>' + esc(style.label) + '</strong>. Format prema sluzbenim uputama: &quot;' + esc(style.spec.sourceLabel) + '&quot;, provjereno ' + esc(style.spec.verifiedAt || '') + '.</p>';
    } else {
      el('style-info').innerHTML = '<p>Stil: <strong>' + esc(style.label) + '</strong> (opci oblik). Tvoj fakultet koristi ovaj stil; tocan izgled interpunkcije provjeri u uputama fakulteta ili kod mentora.</p>';
    }
    showTab('single');
    renderCard(singleCard, readCard(singleCard));
  }

  // --- Izbor fakulteta/stila (index) ---
  var facSel = el('faculty-select');
  var styleSel = el('style-select');
  function stylesForFaculty(fid) {
    var f = (cfg.faculties || []).filter(function (x) { return x.id === fid; })[0];
    return f ? f.styles : [];
  }
  function onFaculty() {
    var styles = stylesForFaculty(facSel.value);
    if (styleSel) {
      if (styles.length <= 1) { styleSel.style.display = 'none'; styleSel.innerHTML = ''; }
      else {
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
    setStyle(stylesForFaculty(facSel.value)[parseInt(styleSel.value, 10)] || null);
  }

  renderCard(singleCard, { type: C.SOURCE_TYPES[0].type });
  el('generate-btn').addEventListener('click', generateSingle);
  el('tab-single').addEventListener('click', function () { showTab('single'); });
  el('tab-bulk').addEventListener('click', function () { showTab('bulk'); });
  el('bulk-parse').addEventListener('click', parseBulk);
  el('bulk-generate').addEventListener('click', generateBulk);

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
<div id="tool-tabs" class="tabs">
  <button id="tab-single" class="tab active" type="button">Jedan izvor</button>
  <button id="tab-bulk" class="tab" type="button">Cijela literatura</button>
</div>
<div id="panel-single">
  <div id="single-card"></div>
  <button id="generate-btn" type="button">Generiraj citat</button>
  <div id="citation-output" aria-live="polite"></div>
</div>
<div id="panel-bulk" style="display:none">
  <p class="bulk-note">Zalijepi popis literature (jedna referenca po retku ili odvojene praznim retkom). Alat prepozna polja koliko moze; OBAVEZNO provjeri i ispravi svaki unos prije koristenja.</p>
  <textarea id="bulk-input" rows="8" placeholder="Zalijepi cijelu literaturu ovdje, npr.:&#10;Kovacic, I. (2020). Naslov knjige. Zagreb: Izdavac.&#10;Horvat, A. (2019). Naslov clanka. Casopis, 28(3), 45-67."></textarea>
  <button id="bulk-parse" type="button">Prepoznaj reference</button>
  <div id="bulk-entries"></div>
  <button id="bulk-generate" type="button" style="display:none">Generiraj i sortiraj abecedno</button>
  <div id="bulk-output"></div>
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

// --- Verificirani citatni specovi + gate -------------------------------------

// Ucita verified/*.json uz TVRDI gate (exit 1): shema valjana, status verified, nijedan
// predlozak flagiran, izvor snapshotiran, verifiedHash == aktualni snapshotHash (drift).
// Neverificiran ili driftan spec NE SMIJE u dist; bolje srusiti build nego objaviti krivo.
function loadVerifiedSpecs(engine) {
  const specs = new Map(); // "facultyId:styleToken" -> spec
  if (!fs.existsSync(SPECS_VERIFIED_DIR)) return specs;
  const registry = loadJson(REGISTRY_PATH);
  for (const file of fs.readdirSync(SPECS_VERIFIED_DIR).filter((f) => f.endsWith('.json'))) {
    const spec = loadJson(path.join(SPECS_VERIFIED_DIR, file));
    const fail = (msg) => {
      console.error(`[generate-citation-tools] FAIL spec ${file}: ${msg}`);
      process.exit(1);
    };
    const errs = engine.validateCitationSpec(spec);
    if (errs.length) fail(`shema: ${errs.join('; ')}`);
    if (spec.status !== 'verified') fail(`status "${spec.status}" nije "verified"`);
    if ((spec.sourceTypes ?? []).some((t) => t.recheck)) fail('sadrzi flagirane (needs-recheck) predloske');
    const src = registry.find((r) => r.id === spec.sourceId);
    if (!src || !src.snapshotHash) fail(`izvor ${spec.sourceId} nije snapshotiran u registryju`);
    if (src.snapshotHash !== spec.verifiedHash) {
      fail(`izvor ${spec.sourceId} promijenjen nakon verifikacije (hash drift); reverificiraj (approve-citation-spec)`);
    }
    const key = `${spec.facultyId}:${spec.styleToken}`;
    if (specs.has(key)) fail(`duplikat za ${key}`);
    specs.set(key, spec);
  }
  return specs;
}

// Klijentu treba samo render-podskup speca (bez provenijencije/examples), stranica ostaje lagana.
function clientSpec(spec) {
  if (spec.outcome === 'style-pin') {
    // pin: obiteljski motor + provenijencija; ne nosi (i ne mora imati) vlastite predloske
    return {
      pin: true,
      label: spec.label,
      sourceLabel: spec.sourceLabel,
      verifiedAt: spec.verifiedAt,
      accessDate: spec.accessDate !== false,
    };
  }
  return {
    pin: false,
    label: spec.label,
    sourceLabel: spec.sourceLabel,
    verifiedAt: spec.verifiedAt,
    accessDate: spec.accessDate !== false,
    authorFormat: spec.authorFormat,
    inText: {
      mode: spec.inText.mode,
      template: spec.inText.template,
      withPagesTemplate: spec.inText.withPagesTemplate,
      authorsShort: spec.inText.authorsShort,
    },
    bibliography: spec.bibliography,
    sourceTypes: (spec.sourceTypes ?? []).map((t) => ({
      type: t.type, template: t.template, requiredFields: t.requiredFields,
    })),
  };
}

// --- Popuna podataka -------------------------------------------------------

let FACULTY_OPTIONS = ''; // popunjava buildFaculties()

function buildFaculties(engine, specs) {
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

  // Verified specovi po fakultetu, da se surface i custom-spec tokeni kojih NEMA u profilima
  // (npr. "efos", "filoz-fusnote"); style-pinove ciji token = profilni token vec hvata acc petlja.
  const specsByFac = {};
  for (const spec of specs.values()) (specsByFac[spec.facultyId] ??= []).push(spec);

  const styleFromSpec = (spec) => ({
    token: spec.styleToken,
    label: spec.label,
    mode: spec.inText?.mode ?? engine.citationMeta(spec.styleToken)?.mode ?? 'author-year',
    engineStyle: engine.engineStyleFor(spec.styleToken), // null za custom -> klijent koristi formatFromSpec
    accessDate: spec.accessDate !== false,
    programsHint: '',
    spec: clientSpec(spec),
  });

  // fakulteti = oni s profilnim tokenima UNIJA onih koji imaju samo verified spec
  const unitIds = new Set([...Object.keys(acc), ...Object.keys(specsByFac)]);
  const faculties = [...unitIds]
    .map((u) => {
      const meta = unitMeta[u] || { name: u, instId: 'other', instName: 'Ostalo' };
      const tokens = acc[u] || {};
      const styles = Object.keys(tokens)
        .sort((a, b) => tokens[b].count - tokens[a].count)
        .map((tok) => {
          const m = engine.citationMeta(tok);
          const progs = [...tokens[tok].programs].slice(0, 2).join(', ');
          const spec = specs.get(`${u}:${tok}`) ?? null;
          return {
            token: tok,
            label: spec ? spec.label : m.label,
            mode: m.mode,
            engineStyle: engine.engineStyleFor(tok),
            accessDate: spec ? spec.accessDate !== false : m.accessDate,
            programsHint: progs,
            spec: spec ? clientSpec(spec) : null,
          };
        });
      // dodaj verified specove ciji token NIJE medju profilnim tokenima (custom-spec surface)
      const covered = new Set(styles.map((s) => s.token));
      for (const spec of specsByFac[u] || []) {
        if (!covered.has(spec.styleToken)) { styles.push(styleFromSpec(spec)); covered.add(spec.styleToken); }
      }
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
  const renderable = faculty.styles.filter((s) => s.engineStyle || s.spec);
  return renderable.length > 1 ? `${faculty.id}-${slugify(style.token)}` : faculty.id;
}

function buildIndexPage(faculties, engineJs) {
  const clientData = faculties.map((f) => ({
    id: f.id,
    styles: f.styles.map((s) => ({ token: s.token, label: s.label, engineStyle: s.engineStyle, accessDate: s.accessDate, programsHint: s.programsHint, spec: s.spec })),
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
    style: { token: style.token, label: style.label, engineStyle: style.engineStyle, accessDate: style.accessDate, spec: style.spec },
  };
  const metaLine = style.spec && style.spec.pin
    ? `Stil propisan sluzbenim uputama: ${escapeHtml(style.spec.sourceLabel)}, provjereno ${escapeHtml(style.spec.verifiedAt ?? '')}. Format: opci ${escapeHtml(style.label)} oblik.`
    : style.spec
      ? `Vjeran format prema sluzbenim uputama: ${escapeHtml(style.spec.sourceLabel)}, provjereno ${escapeHtml(style.spec.verifiedAt ?? '')}.`
      : `Stil: ${escapeHtml(style.label)}. Prema profilu ${escapeHtml(faculty.name)} u Lekti.`;
  const body = `<h1>Generator citata za ${escapeHtml(faculty.name)}</h1>
<p class="lekta-tool-meta">${metaLine}</p>
${toolFormHtml({ withFacultyPicker: false })}
${ctaHtml('./index.html', 'Svi fakulteti')}`;
  return pageShell({
    title: `Generator citata za ${faculty.name} (${style.label}) | Lekta`,
    description: style.spec
      ? `Citiraj tocno po sluzbenim uputama za ${faculty.name}, s izvorom i datumom provjere.`
      : `Citiraj po stilu ${style.label} za ${faculty.name}, provjereno i s izvorom.`,
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
  <span>Kartica: <strong id="page-count">0,00</strong></span>
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
  // isto pravilo kao kanonski brojac (src/tools/counter.ts): prijelomi retka se NE broje u znakove
  var chars = text.replace(/[\\r\\n]/g, '').length;
  var words = text.trim() ? text.trim().split(/\\s+/).length : 0;
  charCount.textContent = chars;
  pageCount.textContent = (chars / 1800).toFixed(2).replace('.', ',');
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
  const engineJs = await buildEngine();
  const engine = loadEngineInNode(engineJs);
  const specs = loadVerifiedSpecs(engine); // gate: exit 1 na neverificirano/drift
  const faculties = buildFaculties(engine, specs);

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
      if (!s.engineStyle && !s.spec) continue; // custom/none bez speca nema staticku stranicu
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

  const withSpec = faculties.filter((f) => f.styles.some((s) => s.spec)).length;
  const withStyle = faculties.filter((f) => f.styles.some((s) => s.engineStyle || s.spec)).length;
  const noStyle = faculties.length - withStyle;
  console.log(
    `[generate-citation-tools] gotovo. ${faculties.length} fakultet(a) u izborniku, ` +
      `${pageCount} statickih stranica po (fakultet x stil), plus brojac + sitemap.`,
  );
  console.log(
    `[generate-citation-tools] ${withSpec} s VERIFICIRANIM specom (sluzbene upute), ` +
      `${withStyle - withSpec} s obiteljskim stilom, ${noStyle} bez (vode na opci alat).`,
  );
}

main().catch((e) => {
  console.error('[generate-citation-tools] GRESKA:', e);
  process.exit(1);
});
