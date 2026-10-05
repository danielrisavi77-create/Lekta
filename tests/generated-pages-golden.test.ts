/**
 * GOLDEN GENERIRANIH JAVNIH STRANICA (mobilni audit PR 5, odluka vlasnika 2026-10-04: tamni stol posvuda).
 *
 * Prije promjene omotaca biljezi se zateceno ponasanje pet generatora (fakulteti, citatni alati, naslovnica-alati,
 * usporedbe, pokrivenost):
 *  1. dva prolaza uz isti datum daju bajt-identican izlaz (svaka datoteka, ne samo HTML);
 *  2. sadrzaj svake stranice bez omotaca (scripts/lib/generated-page-content.mjs) jednak je goldenu.
 * Promjena stila smije mijenjati bajtove, ali ne i sadrzaj. Golden se pise samo u cistom izoliranom stablu:
 * `node scripts/generated-pages-golden.mjs --write`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { byteDigests, contentDigests, listFiles, runGenerators } from '../scripts/lib/generated-page-content.mjs';

const golden = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/generated-pages-golden.json'), 'utf8')) as {
  buildDate: string;
  pages: Record<string, string>;
};

describe('generirane javne stranice: determinizam i golden sadrzaja', () => {
  let prvi = '';
  let drugi = '';

  beforeAll(() => {
    prvi = fs.mkdtempSync(path.join(os.tmpdir(), 'lekta-gen-1-'));
    drugi = fs.mkdtempSync(path.join(os.tmpdir(), 'lekta-gen-2-'));
    runGenerators(prvi, { datum: golden.buildDate });
    runGenerators(drugi, { datum: golden.buildDate });
  }, 120_000);

  afterAll(() => {
    for (const d of [prvi, drugi]) if (d) fs.rmSync(d, { recursive: true, force: true });
  });

  it('generatori proizvode ciljanu klasu ulaza: sve vrste stranica, ukljucujuci napomenu o roku koja ovisi o datumu', () => {
    const html = listFiles(prvi).filter((f) => f.endsWith('.html'));
    expect(html.length).toBe(Object.keys(golden.pages).length);
    for (const vrsta of [/^alati\/citati\/.+\.html$/, /^alati\/naslovnica\/.+\.html$/, /^usporedba\/.+\/index\.html$/, /^pokrivenost\.html$/, /^fakulteti\/index\.html$/]) {
      expect(html.some((f) => vrsta.test(f)), `postoji ${vrsta}`).toBe(true);
    }
    const sRokom = html.filter((f) => fs.readFileSync(path.join(prvi, f), 'utf8').includes('najbliži poznati rok predaje'));
    expect(sRokom.length, 'barem jedna stranica nosi napomenu o roku (sadrzaj ovisan o datumu je pokriven)').toBeGreaterThan(0);
  });

  it('dva prolaza uz isti datum daju bajt-identican izlaz', () => {
    expect(byteDigests(drugi)).toEqual(byteDigests(prvi));
  });

  it('sadrzaj svake stranice bez omotaca jednak je goldenu', () => {
    const sad = contentDigests(prvi);
    const razlike = [...new Set([...Object.keys(golden.pages), ...Object.keys(sad)])].filter((k) => golden.pages[k] !== sad[k]);
    expect(razlike, 'stranice s promijenjenim, novim ili nestalim sadrzajem (node scripts/generated-pages-golden.mjs --dump D za diff)').toEqual([]);
  }, 120_000);
});
