/**
 * B5.2 smoke test: dokazuje da src/title-pages/title-page-web.ts, esbuild-bundlan u IIFE i
 * evaluiran u Node (isti obrazac kao scripts/generate-citation-tools.mjs koristi za
 * citation-web.ts), daje BAJT-VJERAN rezultat izravnom TS pozivu. scripts/generate-title-page-tools.mjs
 * (B5.3) se oslanja na ovaj harness da staticki pregled po fakultetu ne divergira od
 * stvarnog klijentskog generatora (naslovnica-page.ts). Ako ovaj test padne, generator NE
 * SMIJE nastaviti graditi stranice na krivom motoru.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import esbuild from 'esbuild';

import { buildTitlePage as realBuildTitlePage, titlePageText as realTitlePageText } from '../src/tools/title-page';
import { renderTemplateSheet as realRenderTemplateSheet } from '../src/title-pages/render-sheet';
import type { TitlePageTemplate } from '../src/title-pages/template-schema';
import templatesHeavy from '../data/title-pages/templates-heavy.json';

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'title-pages', 'title-page-web.ts');

let LektaTitlePage: any;

beforeAll(async () => {
  const out = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: 'iife',
    globalName: 'LektaTitlePage',
    platform: 'browser',
    target: 'es2019',
    write: false,
    minify: false,
  });
  const bundleJs = out.outputFiles[0].text;
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${bundleJs}\n;return LektaTitlePage;`);
  LektaTitlePage = factory();
});

describe('title-page-web.ts esbuild-IIFE-eval harness (B5.2)', () => {
  it('bundle izlaze buildTitlePage/titlePageText/renderTemplateSheet/lineStyleCss/LEVEL_SLUGS', () => {
    expect(typeof LektaTitlePage.buildTitlePage).toBe('function');
    expect(typeof LektaTitlePage.titlePageText).toBe('function');
    expect(typeof LektaTitlePage.renderTemplateSheet).toBe('function');
    expect(typeof LektaTitlePage.lineStyleCss).toBe('function');
    expect(LektaTitlePage.LEVEL_SLUGS.graduate).toBe('diplomski');
  });

  it('buildTitlePage (genericki raspored, bez predloska) daje isti rezultat kao izravan TS poziv', () => {
    const input = {
      university: 'Sveučilište u Zagrebu', faculty: 'Fakultet političkih znanosti',
      study: 'Diplomski studij Politologije', author: 'Ana Anić',
      title: 'Uloga civilnog društva u lokalnoj samoupravi', workType: 'Diplomski rad',
      mentor: 'izv. prof. dr. sc. Ivan Ivić', place: 'Zagreb', year: '2026',
    };
    const bundled = LektaTitlePage.buildTitlePage(input);
    const real = realBuildTitlePage(input as any);
    expect(bundled).toEqual(real);
  });

  it('buildTitlePage + renderTemplateSheet nad STVARNIM official predloskom (agr-final) daje isti HTML kao izravan poziv', () => {
    const templates = templatesHeavy as unknown as Record<string, TitlePageTemplate>;
    const template = templates['agr-final'];
    expect(template, 'fixture predlozak agr-final mora postojati').toBeTruthy();

    const input = { author: 'Ana Anić', title: 'Naslov rada', place: 'Zagreb', year: '2026' };
    const bundledModel = LektaTitlePage.buildTitlePage(input, template);
    const realModel = realBuildTitlePage(input as any, template);
    expect(bundledModel).toEqual(realModel);

    const bundledHtml = LektaTitlePage.renderTemplateSheet(bundledModel);
    const realHtml = realRenderTemplateSheet(realModel);
    expect(bundledHtml).toBe(realHtml);
    expect(bundledHtml.length).toBeGreaterThan(0);
  });

  it('titlePageText daje isti plain-text kao izravan TS poziv', () => {
    const input = { author: 'Ana Anić', title: 'Naslov rada', place: 'Zagreb', year: '2026', workType: 'Diplomski rad' };
    const bundledModel = LektaTitlePage.buildTitlePage(input);
    const realModel = realBuildTitlePage(input as any);
    expect(LektaTitlePage.titlePageText(bundledModel)).toBe(realTitlePageText(realModel));
  });
});
