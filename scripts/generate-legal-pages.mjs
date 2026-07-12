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

const PAGE_STYLE = `
  /* Lekta Editorial Instrument: pravne stranice na papiru (folija + serif naslovi + proof rub). */
  :root { color-scheme: light; --ink:#1b2030; --muted:#5c5f6e; --paper:#f3eee2; --panel:#fffdf8; --brand:#33407e; --line:#e2d9c6; --proof:#c8102e; }
  * { box-sizing: border-box; }
  body { font-family: "Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: var(--ink); line-height: 1.62; background: var(--paper); }
  header { max-width: 760px; margin: 2rem auto 0; padding: 0 1.1rem; }
  header a.home { color: var(--brand); text-decoration: none; font-weight: 700; font-size: 0.9rem; }
  main { max-width: 760px; margin: 1rem auto; padding: 1.6rem 1.85rem 2.1rem; position: relative; overflow: hidden; background: var(--panel); border: 1px solid var(--line); border-radius: 20px; box-shadow: 0 8px 24px rgba(41,36,26,.09), inset 0 1px 0 rgba(255,255,255,.6); }
  main::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: color-mix(in srgb, var(--proof) 55%, transparent); }
  h1 { font-family: "Fraunces Variable", Georgia, "Times New Roman", serif; font-optical-sizing: auto; font-weight: 600; font-size: 1.75rem; margin: 0.2rem 0 0.25rem; letter-spacing: -0.015em; line-height: 1.1; }
  .legal-meta { color: var(--muted); font-size: 0.85rem; margin: 0.5rem 0 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--line); }
  .legal-note { background: #f6ecda; border-left: 3px solid #9a5b12; padding: 0.6rem 0.8rem; border-radius: 0 0.4rem 0.4rem 0; font-size: 0.9rem; color: #1e2333; }
  h4 { font-family: "Fraunces Variable", Georgia, serif; font-optical-sizing: auto; font-weight: 600; margin: 1.5rem 0 0.35rem; font-size: 1.08rem; }
  p, li { font-size: 0.95rem; }
  ul { padding-left: 1.2rem; }
  a { color: var(--brand); }
  footer { max-width: 760px; margin: 0 auto; padding: 1.3rem 1.1rem 2.4rem; border-top: 1px solid var(--line); font-size: 0.85rem; color: var(--muted); }
  footer nav { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 0.4rem; }
  footer a { text-decoration: none; color: var(--brand); }
  footer a:hover { text-decoration: underline; }
  @media (prefers-color-scheme: dark) {
    :root { color-scheme: dark; --ink:#f3f1ea; --muted:#a6a4b4; --paper:#14151d; --panel:#1c1d28; --brand:#9199e2; --line:#2f3042; --proof:#f5808f; }
    main { box-shadow: 0 8px 24px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.045); }
    .legal-note { background: #3d3320; border-left-color: #e0a45a; color: #f3f1ea; }
  }
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
<link rel="canonical" href="${SITE_ORIGIN}/${doc.slug}.html">
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

console.log(`[generate-legal-pages] gotovo: ${written} stranica (verzija ${legal.TERMS_VERSION}) u dist/.`);
