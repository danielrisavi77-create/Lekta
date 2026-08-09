/**
 * Faza 5 (Lekta Error Corpus): BOUNDARY slucajevi. Za svaki brojcani prag (velicina, prored,
 * margine, opseg rijeci) dokazujemo da se below/exact/within-tol/above ponasaju tocno kako
 * profil i tolerancije engine-a nalazu. Vrijednosti su izvedene iz stvarnih profilnih pragova.
 *
 * Uz pojedinacne asertacije, dokazujemo i NEVAKUOZNOST praga: za svaku dimenziju 'exact' prolazi
 * a 'below'/'above' ne prolaze, dakle prag ima stvarni prijelaz (nije uvijek-pass ni uvijek-fail).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { BOUNDARY_CASES } from './corpus/catalog/boundary';
import { findCheck, meetsExpectation } from './corpus/error-case';
import { stableCheckId } from '../src/scoring/check-ids';

describe('Lekta Error Corpus - boundary slucajevi (faza 5)', () => {
  it('svaki ciljani checkId je registriran', () => {
    for (const c of BOUNDARY_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(BOUNDARY_CASES.map((c) => [c.id, c] as const))('%s: prag se ponaša očekivano', async (_id, c) => {
    const r = await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId });
    const check = findCheck(r, c.expect.title);
    expect(
      meetsExpectation(check, c.expect),
      `${c.id}: ocekivan ${c.expect.outcome} (${c.relation}), dobiven status=${check.status} ${check.earned}/${check.max}`,
    ).toBe(true);
  }, 20000);

  it('svaki prag je nevakuozan (exact prolazi, below i above ne)', () => {
    const dims = new Map<string, { exact: boolean; below: boolean; above: boolean }>();
    for (const c of BOUNDARY_CASES) {
      const d = dims.get(c.expect.checkId) ?? { exact: false, below: false, above: false };
      if (c.relation === 'exact') d.exact = c.expect.outcome === 'pass';
      if (c.relation === 'below') d.below = c.expect.outcome === 'not-pass';
      if (c.relation === 'above') d.above = c.expect.outcome === 'not-pass';
      dims.set(c.expect.checkId, d);
    }
    for (const [checkId, d] of dims) {
      expect(d.exact, `${checkId}: nedostaje exact=pass`).toBe(true);
      expect(d.below, `${checkId}: nedostaje below=not-pass`).toBe(true);
      expect(d.above, `${checkId}: nedostaje above=not-pass`).toBe(true);
    }
  });
});
