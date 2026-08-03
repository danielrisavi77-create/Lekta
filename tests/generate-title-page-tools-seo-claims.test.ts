/**
 * scripts/generate-title-page-tools.mjs: SEO-claims testovi (B5.4). Dokazuje da generirane
 * stranice ne "pregovaraju" gramaticki krivo (npr. "na {Ime fakulteta}" trazi lokativ/dekli-
 * naciju koju ne mozemo pouzdano izvesti za proizvoljna, rodno razlicita imena ustanova -
 * isti problem koji generate-faculty-pages.mjs vec izbjegava dvotockom/zarezom), da se doslovan
 * citat pravilnika prikazuje bez izmjene, i da nijedna stranica ne nosi robots noindex (jer
 * honesty-gate vec osigurava da SAMO official predlosci ovamo stignu - vidi
 * generate-title-page-tools-honesty-gate.test.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import esbuild from 'esbuild';

import { buildUnitPage, buildIndexPage, WORK_TYPE_LABEL_HR, selectOfficialPages } from '../scripts/generate-title-page-tools.mjs';
import rawTemplates from '../data/title-pages/templates.json';
import rawCatalog from '../data/catalog/zagreb-catalog.json';

const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'title-pages', 'title-page-web.ts');

let engine;
let unitMeta;

beforeAll(async () => {
  const out = await esbuild.build({
    entryPoints: [ENTRY], bundle: true, format: 'iife', globalName: 'LektaTitlePage',
    platform: 'browser', target: 'es2019', write: false, minify: false,
  });
  // eslint-disable-next-line no-new-func
  engine = new Function(`${out.outputFiles[0].text}\n;return LektaTitlePage;`)();

  unitMeta = {};
  for (const inst of rawCatalog) {
    for (const u of inst.units || []) unitMeta[u.id] = { name: u.name, instId: inst.id, instName: inst.name };
  }
});

// Heuristicka provjera gramaticke greske klase "na {Veliko Slovo...}" - lokativna konstrukcija
// koju ne mozemo pouzdano generirati za proizvoljno ime ustanove (feminine/masculine razlika).
const NA_PLUS_NAME_RE = /\bna [A-ZŠĐČĆŽ]/;

describe('buildUnitPage: gramaticka sigurnost i posten sadrzaj (nad SVIM stvarnim official predloscima)', () => {
  const selected = selectOfficialPages(rawTemplates);

  it('title/h1 nikad ne koriste "na {Ime ustanove}" (trazi nepouzdanu deklinaciju)', () => {
    for (const { template, disambiguate } of selected) {
      const meta = unitMeta[template.unitId];
      const page = buildUnitPage(template, meta, disambiguate, engine);
      const titleMatch = page.html.match(/<title>([^<]*)<\/title>/);
      const h1Match = page.html.match(/<h1>([^<]*)<\/h1>/);
      expect(titleMatch![1], template.id).not.toMatch(NA_PLUS_NAME_RE);
      expect(h1Match![1], template.id).not.toMatch(NA_PLUS_NAME_RE);
    }
  });

  it('nijedna stranica ne nosi robots meta tag (honesty-gate vec jamci samo official predloske)', () => {
    for (const { template, disambiguate } of selected.slice(0, 15)) {
      const meta = unitMeta[template.unitId];
      const page = buildUnitPage(template, meta, disambiguate, engine);
      expect(page.html, template.id).not.toContain('name="robots"');
    }
  });

  it('doslovan quote iz podataka se prikazuje bez izmjene (kad postoji)', () => {
    const withQuote = selected.find(({ template }) => template.provenance.quote);
    expect(withQuote, 'ocekivan barem jedan official zapis s quote poljem').toBeTruthy();
    const meta = unitMeta[withQuote.template.unitId];
    const page = buildUnitPage(withQuote.template, meta, withQuote.disambiguate, engine);
    expect(page.html).toContain(withQuote.template.provenance.quote!.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  });

  it('level-specifican predlozak ne generalizira naslov na "sve razine" (h1 imenuje konkretnu razinu)', () => {
    const found = selected.find(({ template }) => template.level !== null);
    expect(found, 'ocekivan barem jedan level-specifican official zapis').toBeTruthy();
    const meta = unitMeta[found.template.unitId];
    const page = buildUnitPage(found.template, meta, found.disambiguate, engine);
    const expectedLabel = WORK_TYPE_LABEL_HR[found.template.level];
    expect(page.html).toContain(expectedLabel);
  });

  it('svaka stranica citira izvor (sourceNote) ILI sourcePage kad provenance to nosi', () => {
    for (const { template, disambiguate } of selected) {
      if (!template.provenance.sourceNote && !template.provenance.sourcePage) continue;
      const meta = unitMeta[template.unitId];
      const page = buildUnitPage(template, meta, disambiguate, engine);
      expect(page.html, template.id).toContain('Izvor:');
    }
  });

  // Dijakritika regresija (generate-citation-tools.mjs je nekoc pisao literal stringove bez
  // c/c/z/s/dj preko ~144 stranica, uhvaceno tek u scripts/verify-deploy-dist.mjs #8) - hvatamo
  // je ovdje, na razini generatora, prije nego ijedna stranica uopce zavrsi u dist/.
  const BANNED_ASCII = ['sluzbeni', 'genericki', 'razlicit', 'potvrdjen', 'umjes to', 'znaci da'];
  it('nijedna generirana stranica (bilo koji official predlozak) ne sadrzi ASCII-fallback tekst', () => {
    for (const { template, disambiguate } of selected) {
      const meta = unitMeta[template.unitId];
      const page = buildUnitPage(template, meta, disambiguate, engine);
      for (const needle of BANNED_ASCII) {
        expect(page.html, `${template.id}: "${needle}"`).not.toContain(needle);
      }
    }
  });

  it('hub indeks isto ne sadrzi ASCII-fallback tekst', () => {
    const pages = selected.map(({ template, disambiguate }) => ({
      unitId: template.unitId, slug: disambiguate ? `${template.unitId}-x` : template.unitId,
      canonical: 'https://example.test/x.html', levelLabel: null,
    }));
    const index = buildIndexPage(pages, rawCatalog, unitMeta);
    for (const needle of BANNED_ASCII) {
      expect(index.html).not.toContain(needle);
    }
  });
});

describe('buildIndexPage: hub popisuje samo generirane (official) jedinice', () => {
  it('svaki link u indeksu odgovara stvarno generiranoj stranici', () => {
    const selected = selectOfficialPages(rawTemplates);
    const pages = selected.map(({ template, disambiguate }) => {
      const slug = disambiguate ? `${template.unitId}-x` : template.unitId; // slug detalj nebitan ovdje
      return { unitId: template.unitId, slug, canonical: `https://example.test/${slug}.html`, levelLabel: null };
    });
    const index = buildIndexPage(pages, rawCatalog, unitMeta);
    for (const p of pages) {
      expect(index.html, p.slug).toContain(`/alati/naslovnica/${p.slug}.html`);
    }
  });
});
