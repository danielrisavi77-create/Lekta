#!/usr/bin/env node
// scripts/generate-competitor-pages.mjs
//
// Build-time generator statickih "usporedba/<slug>" podstranica (P2b), po uzoru na
// scripts/generate-faculty-pages.mjs (isti pageShell/PAGE_STYLE "Korektorski stol" obrazac,
// NAMJERNO DUPLICIRAN, ne dijeljen preko importa, isti razlog kao tamo: dva neovisna
// generatora, izbjegava se coupling). Pokreni POSLIJE `vite build` (dist/ vec postoji).
//
// Opseg: SVAKA tvrdnja o konkurenciji dolazi ISKLJUCIVO iz data/competitors/competitor-facts.json,
// gdje svaki zapis nosi sourceTitle+sourceUrl+checkedDate. Generator ne izmislja nista - ako
// polje fali u podatku, izostaje sa stranice (nema nagadjanja), isti princip kao "Ne izmisljaj
// pravila" (CLAUDE.md) primijenjen na tvrdnje o vanjskim proizvodima umjesto o fakultetima.
//
// Stranice NAMJERNO nisu u site-wide navu (link-spam za long-tail SEO); dostupne su iz
// landing_usporedba.html link-out bloka i vlastitog sitemap-usporedba.xml.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN } from './site-origin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FACTS_PATH = path.join(ROOT, 'data/competitors/competitor-facts.json');
const OUT_DIR = path.join(ROOT, 'dist');
const OG_IMAGE = `${SITE_ORIGIN}/og-image.png`;

function loadJson(p) {
  if (!fs.existsSync(p)) {
    console.error(`[generate-competitor-pages] Nedostaje ${p}`);
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

function fmtDateHr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return iso || '';
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}.`;
}

// Ista vizualna obitelj kao generate-faculty-pages.mjs ("Korektorski stol"), NAMJERNO
// duplicirana (vidi komentar na vrhu datoteke).
const PAGE_STYLE = `
  :root {
    color-scheme: dark;
    --desk:#191512; --desk-ink:#EDE7DC;
    --paper:#F7F3E8; --paper-2:#F0EAD9; --paper-ink:#26221B; --paper-muted:#6E6656; --paper-line:#DCD4BF; --paper-line-strong:#C6BCA2;
    --sheet:#FDFBF3;
    --red:#E4573D; --red-deep:#C4372E; --red-soft:#F6E3DE; --on-red:#FFF6EF;
    --ok:#1E7F4F;
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
  .lekta-kicker a { color: var(--paper-muted); text-decoration: none; }
  .lekta-kicker a:hover { color: var(--paper-ink); text-decoration: underline; }
  .lekta-kicker .sep { margin: 0 0.35em; color: var(--paper-line-strong); }
  h1 { font-family: var(--font-serif); font-weight: 600; font-size: 1.7rem; letter-spacing: -0.01em; line-height: 1.18; margin: 0.1rem 0 0.6rem; color: var(--paper-ink); }
  h2 { font-family: var(--font-serif); font-size: 1.15rem; font-weight: 600; margin: 1.9rem 0 0.6rem; color: var(--paper-ink); border-bottom: 1px solid var(--paper-line); padding-bottom: 0.35rem; }
  .lekta-lead { font-size: 1rem; color: var(--paper-ink); margin: 0 0 1.1rem; }
  .fact-list { margin: 0.6rem 0; padding: 0; list-style: none; }
  .fact-list li { background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--red-deep); border-radius: 0 2px 2px 0; padding: 0.65rem 0.85rem; margin: 0.6rem 0; }
  .fact-list .fact-claim { display: block; margin-bottom: 0.35rem; }
  .fact-list .fact-source { display: block; font-family: var(--font-mono); font-size: 0.72rem; color: var(--paper-muted); }
  .fact-list .fact-source a { color: var(--red-deep); }
  .hardrule { font-size: 0.9rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-left: 3px solid var(--ok); border-radius: 0 2px 2px 0; padding: 0.65rem 0.85rem; margin: 0.9rem 0; }
  .lekta-cta-box { margin: 1.6rem 0; padding: 1.1rem 1.2rem; background: var(--paper-2); border: 1px solid var(--paper-line); border-radius: 2px; text-align: center; }
  .lekta-cta-box a.btn { display: inline-block; margin-top: 0.5rem; padding: 0.65rem 1.3rem; background: var(--red-deep); color: var(--on-red); font-weight: 700; text-decoration: none; border-radius: 2px; }
  .lekta-cta-box a.btn:hover { background: var(--red); }
  .lekta-disclaimer { font-size: 0.8rem; color: var(--paper-muted); margin-top: 1.6rem; padding-top: 0.9rem; border-top: 1px solid var(--paper-line); }
  .lekta-links { margin-top: 1.2rem; font-size: 0.85rem; }
  .lekta-links a { color: var(--red-deep); margin-right: 1rem; }
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
<div class="lekta-brand"><a href="/">Lekta</a><span>Besplatna tehnička provjera</span></div>
${bodyHtml}
</body>
</html>
`;
}

function buildSitemap(urls) {
  const entries = urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

function buildCompetitorPage(entry) {
  const canonical = `${SITE_ORIGIN}/usporedba/${entry.slug}/`;
  const title = `Lekta naspram ${entry.productName} | Lekta`;
  const description = `Objektivna, izvorena usporedba: ${entry.productName} naspram Lekte za tehničku provjeru hrvatskog akademskog rada. ${entry.facts.length} provjerenih tvrdnji, s izvorom i datumom.`;

  const factsHtml = entry.facts
    .map(
      (f) => `<li><span class="fact-claim">${escapeHtml(f.claim)}</span><span class="fact-source">Izvor: <a href="${escapeHtml(f.sourceUrl)}">${escapeHtml(f.sourceTitle)}</a> &middot; zadnja provjera: ${escapeHtml(fmtDateHr(f.checkedDate))}</span></li>`,
    )
    .join('');

  const bodyHtml = `
<div class="lekta-kicker"><a href="/landing_usporedba.html">Usporedba</a><span class="sep">&rsaquo;</span><span aria-current="page">${escapeHtml(entry.productName)}</span></div>
<h1>Lekta naspram ${escapeHtml(entry.productName)}</h1>
<p class="lekta-lead">${escapeHtml(entry.categoryNote)} Ispod su tvrdnje o ${escapeHtml(entry.productName)}, svaka s izvorom i datumom provjere; ništa nije procijenjeno ni nagađano.</p>

<h2>Provjerene tvrdnje</h2>
<ul class="fact-list">${factsHtml}</ul>

<h2>Gdje je Lekta drukčija</h2>
<p class="hardrule">Lekta mjeri formu rada (font, margine, prored, numeraciju, format citata) prema pravilima konkretnog hrvatskog fakulteta. Lekta nikad ne piše, ne prepravlja i ne ocjenjuje rečenice, argumentaciju ni sadržaj rada, ni preko AI modela ni na bilo koji drugi način.</p>

<div class="lekta-cta-box">
  <p>Provjeri svoj rad prema pravilima tvog fakulteta.</p>
  <a class="btn" href="/index.html#analyzer">Besplatno provjeri rad</a>
  <p class="priv">Besplatna automatska provjera: dokument ostaje na tvom uređaju.</p>
</div>

<div class="lekta-links"><a href="/landing_usporedba.html">&larr; Puna usporedba pristupa</a><a href="/landing_benchmark.html">Javni benchmark</a></div>
<p class="lekta-disclaimer">Lekta radi pomoćnu tehničku provjeru prema odabranom profilu i ne zamjenjuje službene upute ustanove, studija, kolegija ni mentora. Tvrdnje o ${escapeHtml(entry.productName)} temelje se isključivo na izvorima navedenima gore.</p>
`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Usporedba', item: `${SITE_ORIGIN}/landing_usporedba.html` },
      { '@type': 'ListItem', position: 2, name: entry.productName, item: canonical },
    ],
  };

  return { html: pageShell({ title, description, canonical, bodyHtml, jsonLd }), canonical };
}

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    console.error('[generate-competitor-pages] dist/ ne postoji; pokreni nakon `vite build`.');
    process.exit(1);
  }
  const facts = loadJson(FACTS_PATH);
  const urls = [];
  let count = 0;

  for (const slug of Object.keys(facts)) {
    const entry = facts[slug];
    if (!entry.facts?.length) {
      console.warn(`[generate-competitor-pages] PRESKACEM ${slug}: nema tvrdnji u competitor-facts.json`);
      continue;
    }
    const { html, canonical } = buildCompetitorPage(entry);
    const outDir = path.join(OUT_DIR, 'usporedba', entry.slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf-8');
    urls.push(canonical);
    count++;
  }

  fs.writeFileSync(path.join(OUT_DIR, 'sitemap-usporedba.xml'), buildSitemap(urls), 'utf-8');
  console.log(`[generate-competitor-pages] ${count} podstranica u dist/usporedba/**, ${urls.length} u sitemap-usporedba.xml`);
}

main();
