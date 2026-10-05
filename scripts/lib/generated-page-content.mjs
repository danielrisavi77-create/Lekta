// scripts/lib/generated-page-content.mjs
//
// SADRZAJ GENERIRANE JAVNE STRANICE, BEZ OMOTACA (mobilni audit PR 5, odluka vlasnika 2026-10-04: tamni stol posvuda).
//
// PR 5 namjerno mijenja omotac generiranih stranica (stil, zaglavlje, podnozje), a sadrzaj mora ostati isti. Golden
// zato ne biljezi HTML nego ono sto stranica GOVORI: metapodatke za trazilice i dijeljenje, naslove, tekst, poveznice,
// polja obrasca i slike. Omotac koji se smije mijenjati je `.lekta-brand` (marka), zaglavlje i podnozje izravno pod
// `<body>`, te `<style>`/`<script>`/`<noscript>`/`<template>`. Sve ostalo je sadrzaj, ukljucujuci mrvice i poveznice
// unutar stranice.
//
// Isti generatori i isti podaci daju isti sadrzaj; dvoprolazna bajt-provjera je zasebna (tests/generated-pages-golden).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Window } from 'happy-dom';

/** Generatori javnih stranica kojima PR 5 mijenja omotac, redom iz scripts/build-production.mjs. */
export const GENERATORI = Object.freeze([
  'scripts/generate-citation-tools.mjs',
  'scripts/generate-coverage-page.mjs',
  'scripts/generate-faculty-pages.mjs',
  'scripts/generate-title-page-tools.mjs',
  'scripts/generate-competitor-pages.mjs',
]);

/**
 * Fiksni datum builda za golden. Napomena o roku i broj dana do roka u stranicama fakulteta ovise o datumu; svi rokovi
 * u data/submission/academic-deadlines.json su do 2026-09-01, pa uz danasnji datum ta grana ne bi bila pokrivena.
 * Uz 2026-01-01 dvije stranice nose napomenu o roku (izmjereno 2026-10-05), pa golden cuva i nju.
 */
export const GOLDEN_DATUM = '2026-01-01';

const OMOTAC = 'script, style, noscript, template, .lekta-brand, body > header, body > footer';
const tekst = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Sadrzaj jedne stranice kao obican objekt, stabilnog redoslijeda kljuceva. */
export function pageContent(html) {
  const win = new Window({
    settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true },
  });
  try {
    const doc = win.document;
    doc.write(html);
    const meta = (sel) => doc.querySelector(sel)?.getAttribute('content') ?? null;
    const head = {
      title: tekst(doc.querySelector('title')?.textContent),
      description: meta('meta[name="description"]'),
      robots: meta('meta[name="robots"]'),
      canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      og: [...doc.querySelectorAll('meta[property^="og:"]')].map((m) => [m.getAttribute('property'), m.getAttribute('content')]),
      twitter: [...doc.querySelectorAll('meta[name^="twitter:"]')].map((m) => [m.getAttribute('name'), m.getAttribute('content')]),
      jsonLd: [...doc.querySelectorAll('script[type="application/ld+json"]')].map((s) => tekst(s.textContent)),
    };
    const tijelo = doc.body.cloneNode(true);
    for (const el of [...tijelo.querySelectorAll(OMOTAC)]) el.remove();
    const body = {
      headings: [...tijelo.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => [h.tagName.toLowerCase(), tekst(h.textContent)]),
      text: tekst(tijelo.textContent),
      links: [...tijelo.querySelectorAll('a[href]')].map((a) => [a.getAttribute('href'), tekst(a.textContent)]),
      fields: [...tijelo.querySelectorAll('input, select, textarea, button')].map((f) => [
        f.tagName.toLowerCase(), f.getAttribute('type'), f.getAttribute('name') ?? f.id ?? null, tekst(f.textContent),
        [...f.querySelectorAll('option')].map((o) => [o.getAttribute('value'), tekst(o.textContent)]),
      ]),
      images: [...tijelo.querySelectorAll('img')].map((i) => [i.getAttribute('src'), i.getAttribute('alt')]),
    };
    return { head, body };
  } finally {
    win.close();
  }
}

/** sha256 sadrzaja stranice. */
export function contentDigest(html) {
  return createHash('sha256').update(JSON.stringify(pageContent(html))).digest('hex');
}

/** Vrti svih pet generatora u `izlaz` uz fiksni datum. Djelomican pad rusi mjerenje (CLAUDE.md). */
export function runGenerators(izlaz, { root = process.cwd(), datum = GOLDEN_DATUM } = {}) {
  fs.mkdirSync(izlaz, { recursive: true });
  for (const g of GENERATORI) {
    const r = spawnSync(process.execPath, [path.join(root, g)], {
      cwd: root,
      env: { ...process.env, LEKTA_GENERATED_DIST: izlaz, LEKTA_BUILD_DATE: datum },
      encoding: 'utf8',
    });
    if (r.status !== 0) throw new Error(`${g} pao (kod ${r.status}): ${(r.stderr || r.stdout).slice(-600)}`);
  }
}

/** Sve datoteke ispod `dir`, relativne putanje s `/`, sortirano. */
export function listFiles(dir) {
  const out = [];
  const hodaj = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) hodaj(p);
      else out.push(path.relative(dir, p).split(path.sep).join('/'));
    }
  };
  hodaj(dir);
  return out.sort();
}

/** { putanja: sha256 sadrzaja } za svaku HTML stranicu u `dir`. */
export function contentDigests(dir) {
  const out = {};
  for (const f of listFiles(dir).filter((x) => x.endsWith('.html'))) out[f] = contentDigest(fs.readFileSync(path.join(dir, f), 'utf8'));
  return out;
}

/** { putanja: sha256 sirovih bajtova } za svaku datoteku u `dir`. */
export function byteDigests(dir) {
  const out = {};
  for (const f of listFiles(dir)) out[f] = createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex');
  return out;
}
