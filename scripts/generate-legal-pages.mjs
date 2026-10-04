#!/usr/bin/env node
// scripts/generate-legal-pages.mjs
//
// Build-time generator javnih pravnih stranica iz JEDNOG izvora istine
// (src/legal/legal-content.ts, isti modul koji puni modal na indexu), pa modal
// i stranica ne mogu divergirati. Pokrece se POSLIJE `vite build` (vite prazni
// dist/), wiran u netlify.toml command lanac.
//
// CSP: stranice namjerno NEMAJU nijedan inline <script> (public/_headers hasha
// samo FOUC skriptu glavnih stranica); inline <style> je dopusten (style-src
// 'unsafe-inline'). Bez teme/JS-a: cisti staticni dokumenti.
//
// Identitet pruzatelja dolazi iz data/legal/provider.json; prazna polja (oib,
// adresa) se ne renderiraju, a dokumenti nose napomenu o dopuni registracije.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { SITE_ORIGIN } from './site-origin.mjs';
import { fallbackFaces, ubaciU404, webfontFaces } from './lib/legal-webfonts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('[generate-legal-pages] dist/ ne postoji; pokreni poslije `vite build`.');
  process.exit(1);
}

// Bundle legal modula u IIFE pa eval u Nodeu (isti obrazac kao generate-citation-tools).
async function loadLegal() {
  const out = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/legal/legal-content.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'LektaLegal',
    platform: 'neutral',
    target: 'es2019',
    write: false,
    legalComments: 'none',
  });
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${out.outputFiles[0].text}\n;return LektaLegal;`);
  return factory();
}

// Brand tipografija (Z7 opcija a, odluka vlasnika 2026-09-26): Instrument Serif za h1/h4 i Geist
// Mono za oznake, BEZ design-system.css/JS-a (stranice su namjerno skriptless, vidi CSP komentar na
// vrhu). Ponovno koristi VEC izgradjene woff2 iz glavnog Vite bundlea preko @font-face + apsolutne
// /assets/ putanje (isti vendorirani izvor kao `src/assets/fonts/fonts.css`, ista datoteka, pa je
// cache pogodak ako je posjetitelj vec bio na ulazu); latin + latin-ext (hrvatska dijakritika je u
// latin-ext rasponu). Obrasci i razrjesavanje zive u `scripts/lib/legal-webfonts.mjs`, gdje ih test
// mjeri nad imenima koja Vite stvarno proizvodi.
//
// PRAZAN POGODAK OBARA GENERATOR (popravak Z7(a)). Do sada je nepronadjen rez tiho ispadao i stranica
// je padala na zamjenski glas uz zelen build; sad je to izlaz 1 s imenom obrasca koji nije pogodio.
function padni(problemi, sto) {
  if (problemi.length === 0) return;
  console.error(`[generate-legal-pages] ${sto}:`);
  for (const p of problemi) console.error(`  - ${p}`);
  process.exit(1);
}

const assetsDir = path.join(DIST, 'assets');
const WEBFONTS = webfontFaces(fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : []);
padni(WEBFONTS.problemi, 'webfont iz Vite bundlea nije pronadjen u dist/assets');
const FALLBACK = fallbackFaces(fs.readFileSync(path.join(ROOT, 'src/assets/fonts/fonts.css'), 'utf8'));
padni(FALLBACK.problemi, 'metricki zamjenski glasovi nisu procitani');
const FONT_FACES = [WEBFONTS.css, FALLBACK.css].join(' ');

const PAGE_STYLE = `
  ${FONT_FACES}
  /* ===== KS: Korektorski stol sloj ===== */
  /* Lekta Korektorski stol: pravni dokument kao list papira pod radnom lampom, korektorska crvena samo za akcente.
     Stranice su samostalne (ne ucitavaju design-system.css), pa tokeni istog imena zive lokalno. */
  :root {
    color-scheme: dark;
    --desk:#191512; --desk-ink:#EDE7DC; --desk-muted:rgba(237,231,220,.55); --desk-line:rgba(237,231,220,.14);
    --paper:#F7F3E8; --paper-2:#F0EAD9; --paper-ink:#26221B; --paper-muted:#6E6656; --paper-line:#DCD4BF;
    --red:#E4573D; --red-deep:#C4372E;
    --paper-sh:0 3px 8px rgba(0,0,0,.35),0 22px 60px rgba(0,0,0,.55);
    --font-serif:"Instrument Serif","Instrument Serif Fallback","Instrument Serif Fallback Times",Georgia,"Times New Roman",serif;
    --font-mono:"Geist Mono","Geist Mono Fallback","Geist Mono Fallback Courier",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    /* Instrument Serif ima samo rez 400: bez ovoga bi preglednik h1/h4 lazno podebljao. */
    font-synthesis: none;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --desk:#DFD8C6; --desk-ink:#26221B; --desk-muted:rgba(38,34,27,.6); --desk-line:rgba(38,34,27,.18);
    --paper:#FDFBF3; --paper-2:#F4EFDF;
    --red:#C4372E;
    --paper-sh:0 2px 6px rgba(56,46,32,.16),0 18px 44px rgba(56,46,32,.2);
  }
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      color-scheme: light;
      --desk:#DFD8C6; --desk-ink:#26221B; --desk-muted:rgba(38,34,27,.6); --desk-line:rgba(38,34,27,.18);
      --paper:#FDFBF3; --paper-2:#F4EFDF;
      --red:#C4372E;
      --paper-sh:0 2px 6px rgba(56,46,32,.16),0 18px 44px rgba(56,46,32,.2);
    }
  }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: var(--desk-ink); line-height: 1.62; background: var(--desk); }
  header { max-width: 760px; margin: 2rem auto 0; padding: 0 1.1rem; }
  header a.home { color: var(--desk-ink); text-decoration: none; font-weight: 600; font-size: 0.82rem; font-family: var(--font-mono); letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 1px solid var(--desk-line); padding-bottom: 2px; }
  header a.home:hover { color: var(--red); border-bottom-color: var(--red); }
  main { max-width: 760px; margin: 1.1rem auto; padding: 1.7rem 1.9rem 2.2rem; position: relative; overflow: hidden; background: var(--paper); color: var(--paper-ink); border: 1px solid var(--paper-line); border-radius: 2px; box-shadow: var(--paper-sh); }
  main::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--red-deep); }
  h1 { font-family: var(--font-serif); font-weight: 400; font-size: 1.8rem; margin: 0.2rem 0 0.25rem; letter-spacing: -0.01em; line-height: 1.12; color: var(--paper-ink); }
  .legal-meta { color: var(--paper-muted); font-family: var(--font-mono); font-size: 0.78rem; letter-spacing: 0.02em; margin: 0.55rem 0 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--paper-line); }
  .legal-note { background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); padding: 0.6rem 0.8rem; border-radius: 0 2px 2px 0; font-size: 0.9rem; color: var(--paper-ink); }
  h4 { font-family: var(--font-serif); font-weight: 400; margin: 1.5rem 0 0.35rem; font-size: 1.12rem; color: var(--paper-ink); }
  p, li { font-size: 0.95rem; }
  ul { padding-left: 1.2rem; }
  a { color: var(--red-deep); text-decoration-thickness: 1px; text-underline-offset: 2px; }
  a:hover { text-decoration-thickness: 2px; }
  footer { max-width: 760px; margin: 0 auto; padding: 1.3rem 1.1rem 2.4rem; border-top: 1px solid var(--desk-line); font-size: 0.85rem; color: var(--desk-muted); }
  footer nav { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 0.4rem; }
  footer nav span { color: var(--desk-muted); }
  footer a { text-decoration: none; color: var(--desk-ink); }
  footer a:hover { text-decoration: underline; color: var(--red); }
`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pageShell(doc, allDocs) {
  const nav = allDocs
    .map((d) => (d.slug === doc.slug ? `<span>${esc(d.title)}</span>` : `<a href="/${d.slug}.html">${esc(d.title)}</a>`))
    .join('');
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.title)} - Lekta</title>
<meta name="description" content="${esc(doc.description)}">
<link rel="canonical" href="/${doc.slug}.html">
<meta name="robots" content="index,follow">
<style>${PAGE_STYLE}</style>
</head>
<body>
<header><a class="home" href="/">&larr; Lekta</a></header>
<main>
<h1>${esc(doc.title)}</h1>
${doc.html}
</main>
<footer>
<p>Trebaš provjeriti rad ili ti treba besplatan alat (citati, naslovnica, brojač kartica...)? <a href="/alati.html">Svi besplatni alati</a> &middot; <a data-analyzer-cta href="/#top">Provjeri rad</a></p>
Pravni dokumenti:
<nav>${nav}</nav>
</footer>
</body>
</html>
`;
}

const legal = await loadLegal();
const provider = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/legal/provider.json'), 'utf-8'));
const docs = legal.legalDocuments({
  org: provider.businessName,
  contact: provider.contactEmail,
  controller: provider.privacyController,
  days: provider.retentionDaysOrders,
  logDays: provider.retentionDaysLogs,
  oib: provider.oib,
  address: provider.address,
});

const list = Object.values(docs);
let written = 0;
for (const doc of list) {
  if (!doc.slug || !doc.title || !doc.html || doc.html.length < 200) {
    console.error(`[generate-legal-pages] dokument '${doc.slug || '???'}' je prazan ili nepotpun.`);
    process.exit(1);
  }
  const html = pageShell(doc, list);
  // Modal linkovi unutar sadrzaja rade i ovdje (obicni <a href>); klasa legal-open je inertna bez app.ts.
  fs.writeFileSync(path.join(DIST, `${doc.slug}.html`), html, 'utf-8');
  written++;
}

// 404 je samostalna stranica iz public/ (Vite je kopira bez obrade), pa webfontove dobiva ovdje, iz
// ISTIH razrijesenih rezova kao pravne stranice. Razlog izbora je u komentaru uz oznaku u public/404.html.
// Umetak je idempotentan (`ubaciU404`): ponovni prolaz nad istim dist/ bez novog builda je no-op.
const put404 = path.join(DIST, '404.html');
if (!fs.existsSync(put404)) padni(['dist/404.html ne postoji (public/404.html nije kopiran)'], '404');
const s404 = ubaciU404(fs.readFileSync(put404, 'utf8'), FONT_FACES);
padni(s404.problemi, '404.html nije dobio webfontove');
fs.writeFileSync(put404, s404.html, 'utf-8');

console.log(`[generate-legal-pages] gotovo: ${written} stranica (verzija ${legal.TERMS_VERSION}) i 404.html s webfontovima u dist/.`);
