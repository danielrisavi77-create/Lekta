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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE_ORIGIN = process.env.LEKTA_SITE_ORIGIN || 'https://lektahr.netlify.app';

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
  :root { color-scheme: light; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem 3rem; color: #1e2333; line-height: 1.6; background: #f8f6f0; }
  header a.home { color: #33407e; text-decoration: none; font-weight: 700; font-size: 0.9rem; }
  h1 { font-size: 1.55rem; margin: 0.75rem 0 0.25rem; letter-spacing: -0.01em; }
  .legal-meta { color: #5c5f6e; font-size: 0.85rem; margin: 0.5rem 0 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid #e5ddcc; }
  .legal-note { background: #f6ecda; border-left: 3px solid #9a5b12; padding: 0.6rem 0.8rem; border-radius: 0 0.4rem 0.4rem 0; font-size: 0.9rem; }
  h4 { margin: 1.4rem 0 0.35rem; font-size: 1.02rem; }
  p, li { font-size: 0.95rem; }
  ul { padding-left: 1.2rem; }
  a { color: #33407e; }
  footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #e5ddcc; font-size: 0.85rem; color: #5c5f6e; }
  footer nav { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 0.4rem; }
  footer a { text-decoration: none; }
  footer a:hover { text-decoration: underline; }
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
