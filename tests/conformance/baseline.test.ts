/**
 * Fallback baseline conformance: jedinice bez profila (npr. tvz/vern/rit) i vrste rada koje profil
 * ne pokriva padaju na genericki obiteljski baseline (BASE_PROFILES) u currentProfile() umjesto na
 * registrirani profil. Taj put je ono sto student iz neportanog fakulteta stvarno dobije, a ostatak
 * korpusa ga NE pokriva (resolveProfile baca za ne-registrirani id). Ovdje ga vrtimo kroz istu
 * derivaciju: uskladjen docx mora proci sve bodovane dimenzije, neuskladjen ih mora srusiti.
 *
 * Dio je PUNE matrice (`npm run conformance`), ne redovnog `npm run check`, jer radi stvarnu analizu.
 * Redovni check pokriva reprezentativni uzorak preko tests/conformance-baseline-tripwire.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  baselineConformanceCases,
  buildBaselineProfile,
  expectBaselineConformance,
} from '../helpers/conformance';

describe('fallback baseline conformance (BASE_PROFILES x vrste rada)', () => {
  for (const { family, workType, id } of baselineConformanceCases()) {
    it(id, () => expectBaselineConformance(family, workType), 30000);
  }
});

describe('baseline: struktura profila prije analize', () => {
  it('lightBaseline (seminar) gasi requireToc, teska vrsta ga drzi', () => {
    expect(buildBaselineProfile('social', 'seminar').requireToc).toBe(false);
    expect(buildBaselineProfile('social', 'graduate').requireToc).toBe(true);
  });

  it('baseline nema definitionId (nije registriran profil) i ima potpune vrijednosti (guard 7128022)', () => {
    for (const { family, workType } of baselineConformanceCases()) {
      const p = buildBaselineProfile(family, workType);
      expect(p.definitionId, `${family}/${workType}`).toBeNull();
      // Sve cetiri check* dimenzije moraju imati vrijednost (baseline ih uvijek nosi), pa checkX ostaje
      // ukljucen bez rizika od "Cannot read ... undefined" koji je rusio zivu analizu prije 7128022.
      expect(Array.isArray(p.font) && p.font.length > 0, `${family} font`).toBe(true);
      expect(Array.isArray(p.size) && p.size.length > 0, `${family} size`).toBe(true);
      expect(typeof p.spacing, `${family} spacing`).toBe('number');
    }
  });
});
