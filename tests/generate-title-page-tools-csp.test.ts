/**
 * scripts/generate-title-page-tools.mjs: CSP testovi (B5.4). public/_headers script-src NEMA
 * 'unsafe-inline' - jedina dopustena inline skripta na cijelom siteu je FOUC tema-prekidac
 * (whitelistan preko sha256 hasha). Generirane stranice su staticke (bez interaktivnog
 * widgeta), pa NE SMIJU nositi nijedan drugi <script> osim te FOUC skripte (bajt-identicne
 * onoj u index.html) i inertnog application/ld+json JSON-LD-a. Isti disciplina kao
 * tests/generate-citation-tools-csp.test.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

import { buildUnitPage, buildIndexPage, selectOfficialPages } from '../scripts/generate-title-page-tools.mjs';
import rawTemplates from '../data/title-pages/templates.json';
import rawCatalog from '../data/catalog/zagreb-catalog.json';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

function foucScriptFrom(html: string): string | null {
  const m = html.match(/<script>try\{var _t=localStorage\.getItem\('lekta\.theme'\)[^<]*<\/script>/);
  return m ? m[0] : null;
}

/** Sve <script> tagove (otvarajuci) iz HTML-a, s tipom ako postoji. */
function scriptTags(html: string): string[] {
  return [...html.matchAll(/<script[^>]*>/g)].map((m) => m[0]);
}

describe('generate-title-page-tools: CSP (bez unsafe-inline)', () => {
  let engine: any;
  let unitMeta: Record<string, any>;

  beforeAll(async () => {
    const ENGINE_ENTRY = join(ROOT, 'src', 'title-pages', 'title-page-web.ts');
    const out = await esbuild.build({
      entryPoints: [ENGINE_ENTRY], bundle: true, format: 'iife', globalName: 'LektaTitlePage',
      platform: 'browser', target: 'es2019', write: false, minify: false,
    });
    // eslint-disable-next-line no-new-func
    engine = new Function(`${out.outputFiles[0].text}\n;return LektaTitlePage;`)();
    unitMeta = {};
    for (const inst of rawCatalog as any[]) {
      for (const u of inst.units || []) unitMeta[u.id] = { name: u.name, instId: inst.id, instName: inst.name };
    }
  // Hook radi PUNI esbuild bundle. Sam po sebi <1 s (mjereno: csp 465 ms, seo 918 ms), ali
  // dok na istom stroju tece drugi vitest prijedje 10 s koliko je vitestov default za hook.
  }, 120000);

  it('FOUC skripta na generiranoj stranici je bajt-identicna onoj u index.html', () => {
    const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf-8');
    const canonicalFouc = foucScriptFrom(indexHtml);
    expect(canonicalFouc, 'index.html FOUC skripta nije pronadjena (regex drift?)').toBeTruthy();

    const selected = selectOfficialPages(rawTemplates as any[]);
    expect(selected.length).toBeGreaterThan(0);
    const { template, disambiguate } = selected[0];
    const page = buildUnitPage(template, unitMeta[template.unitId], disambiguate, engine);
    expect(foucScriptFrom(page.html)).toBe(canonicalFouc);
  });

  it('nijedna generirana stranica ne nosi drugi <script> osim FOUC-a i application/ld+json', () => {
    const selected = selectOfficialPages(rawTemplates as any[]).slice(0, 20);
    for (const { template, disambiguate } of selected) {
      const page = buildUnitPage(template, unitMeta[template.unitId], disambiguate, engine);
      const tags = scriptTags(page.html);
      for (const tag of tags) {
        const isFouc = tag === '<script>';
        const isJsonLd = tag.includes('application/ld+json');
        expect(isFouc || isJsonLd, `${template.id}: neocekivan <script> tag "${tag}"`).toBe(true);
      }
    }
  });

  it('index (hub) stranica isto ne nosi drugi <script> osim FOUC-a i JSON-LD-a', () => {
    const selected = selectOfficialPages(rawTemplates as any[]);
    const pages = selected.map(({ template, disambiguate }) => ({
      unitId: template.unitId, slug: disambiguate ? `${template.unitId}-x` : template.unitId,
      canonical: 'https://example.test/x.html', levelLabel: null,
    }));
    const index = buildIndexPage(pages, rawCatalog as any[], unitMeta);
    const tags = scriptTags(index.html);
    for (const tag of tags) {
      expect(tag === '<script>' || tag.includes('application/ld+json')).toBe(true);
    }
  });

  it('CSS je inline preko <style> (dopusteno: style-src ima unsafe-inline, za razliku od script-src)', () => {
    const selected = selectOfficialPages(rawTemplates as any[]);
    const { template, disambiguate } = selected[0];
    const page = buildUnitPage(template, unitMeta[template.unitId], disambiguate, engine);
    expect(page.html).toContain('<style>');
    expect(page.html).not.toContain('<link rel="stylesheet"');
  });
});
