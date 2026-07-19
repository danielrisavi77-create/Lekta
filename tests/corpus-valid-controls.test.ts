/**
 * Faza 4 (Lekta Error Corpus): VALID CONTROL slucajevi. Valjani dokumenti s netipicnom ali
 * ispravnom reprezentacijom (font/velicina iz docDefaults, nbsp u citatnici, gola godina bez
 * autora, uredna https poveznica) NE smiju proizvesti lazni nalaz. Stiti od false-positive
 * regresija jednako kao sto atomski slucajevi stite od promasenih detekcija.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { VALID_CONTROL_CASES } from './corpus/catalog/valid-controls';
import { findCheck, meetsExpectation } from './corpus/error-case';
import { stableCheckId } from './corpus/ids/check-id-registry';

const detectable = VALID_CONTROL_CASES.filter((c) => c.detectableNow);

describe('Lekta Error Corpus - valid controls (faza 4)', () => {
  it('svaki ciljani checkId je registriran', () => {
    for (const c of VALID_CONTROL_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(detectable.map((c) => [c.id, c] as const))('%s: valjana varijanta ostaje bez laznog nalaza', async (_id, c) => {
    const r = await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId });
    const check = findCheck(r, c.expect.title);
    expect(
      meetsExpectation(check, c.expect),
      `${c.id}: lazni nalaz - ciljana provjera nije 'pass' (status=${check.status} ${check.earned}/${check.max})`,
    ).toBe(true);
  }, 20000);
});
