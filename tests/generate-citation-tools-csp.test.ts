/**
 * CSP script-src (public/_headers) NEMA 'unsafe-inline'; jedini dopusteni inline <script> je
 * FOUC prekidac teme, preko sha256 hasha (isti hash pokriva index.html i sve stranice alata,
 * v. tests/csp-hash.test.ts i komentar u _headers). scripts/generate-citation-tools.mjs
 * generira ~143 staticke stranice cije pageShell()/buildCharCounterHtml() moraju:
 *  (a) ugraditi TU ISTU bajt-identicnu FOUC skriptu (drukcija bi trazila novi hash),
 *  (b) NIKAD ne inlineati engineJs/TOOL_JS/BROJAC_JS/config kao izvrsni <script> - moraju ici
 *      kao vanjski <script src=> (self, vec pokriven) ili inertni application/json data island
 *      (CSP script-src ga uopce ne gata).
 * scripts/verify-deploy-dist.mjs vec hvata regresiju OVDJE na gotovom dist/ (deploy gate), ali
 * `npm run check` (tsc+vitest+vite build) generate-citation-tools.mjs uopce ne pokrece, pa bi
 * regresija u ovoj datoteci prosla kroz check zelen sve do Netlify builda (produkcija bi tiho
 * blokirala sve gumbe/formulare na ~143 stranica, bez vidljive greske). Izvorni-tekst provjera,
 * isti obrazac kao generate-citation-tools-seo-claims.test.ts: main() ima tesku bocnu ucin
 * (cita profile, pise dist/) pa nije modul-safe za import.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'scripts/generate-citation-tools.mjs'), 'utf8');
const headers = readFileSync(join(root, 'public/_headers'), 'utf8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

function extractFn(name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} nije nadjena u generate-citation-tools.mjs`);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next === -1 ? src.length : next);
}

describe('generate-citation-tools.mjs: CSP script-src (bez unsafe-inline)', () => {
  it('FOUC inline skripta u generatoru je bajt-identicna onoj u index.html (isti sha256 hash pokriva obje)', () => {
    const indexScript = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])[0];
    expect(indexScript).toBeTruthy();
    const hash = 'sha256-' + createHash('sha256').update(indexScript, 'utf8').digest('base64');
    expect(headers).toContain(`'${hash}'`);
    // Doslovan template-literal ulomak (ne konstruiran dinamicki), pa .includes()-brojanje
    // dokazuje bajt-identicnost bez ovisnosti o tocnoj poziciji u datoteci.
    const occurrences = src.split(indexScript).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // pageShell() + buildCharCounterHtml()
  });

  it('pageShell(): config ide kao inertni application/json data island, ne izvrsni <script>', () => {
    const fn = extractFn('pageShell');
    expect(fn).toMatch(/<script type="application\/json" id="lekta-tool-config">\$\{configJs\}<\/script>/);
    expect(fn).not.toMatch(/<script>\$\{configJs/);
  });

  it('pageShell(): motor (engineJs+TOOL_JS) ide kao vanjski <script src=>, nikad inline', () => {
    const fn = extractFn('pageShell');
    expect(fn).toMatch(/<script src="\/alati\/citation-tool\.js"><\/script>/);
    expect(fn).not.toMatch(/<script>\$\{engineJs/);
    expect(fn).not.toMatch(/<script>\$\{TOOL_JS/);
  });

  it('pageShell(): PAGE_STYLE ide kao vanjski <link rel="stylesheet">, ne inline <style>', () => {
    const fn = extractFn('pageShell');
    expect(fn).toMatch(/<link rel="stylesheet" href="\/alati\/citation-style\.css">/);
    expect(fn).not.toMatch(/<style>\$\{PAGE_STYLE/);
  });

  it('buildCharCounterHtml(): dijeli isti /alati/citation-style.css, ne inlinea PAGE_STYLE', () => {
    const fn = extractFn('buildCharCounterHtml');
    expect(fn).toMatch(/<link rel="stylesheet" href="\/alati\/citation-style\.css">/);
    expect(fn).not.toMatch(/<style>\$\{PAGE_STYLE/);
  });

  it('buildCharCounterHtml(): BROJAC_JS ide kao vanjski <script src=>, nikad inline', () => {
    const fn = extractFn('buildCharCounterHtml');
    expect(fn).toMatch(/<script src="\/alati\/brojac-kartica\.js"><\/script>/);
    expect(fn).not.toMatch(/<script>\$\{BROJAC_JS/);
  });

  it('main(): engineJs+TOOL_JS+BROJAC_JS+PAGE_STYLE se pisu u vanjske datoteke, ne inlineaju po stranici', () => {
    expect(src).toMatch(/writeFileSync\(path\.join\(OUT_DIR, 'citation-tool\.js'\)/);
    expect(src).toMatch(/writeFileSync\(path\.join\(OUT_DIR, 'brojac-kartica\.js'\)/);
    expect(src).toMatch(/writeFileSync\(path\.join\(OUT_DIR, 'citation-style\.css'\)/);
  });

  it('public/_headers: /alati/*.js i /alati/*.css imaju dulji Cache-Control od genericnog /*.html (ne max-age=0)', () => {
    // \r?\n: public/_headers moze imati CRLF zavrsetke retka (Windows checkout, autocrlf), pa
    // strogi \n ne bi upario iza \r-a.
    const alatiJsRule = headers.match(/\/alati\/\*\.js\r?\n\s*Cache-Control: ([^\r\n]+)/);
    const alatiCssRule = headers.match(/\/alati\/\*\.css\r?\n\s*Cache-Control: ([^\r\n]+)/);
    expect(alatiJsRule, '/alati/*.js pravilo nedostaje u _headers').toBeTruthy();
    expect(alatiCssRule, '/alati/*.css pravilo nedostaje u _headers').toBeTruthy();
    expect(alatiJsRule![1]).not.toContain('max-age=0');
    expect(alatiCssRule![1]).not.toContain('max-age=0');
  });
});
