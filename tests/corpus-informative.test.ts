/**
 * Faza 4 prosirenje (Lekta Error Corpus): INFORMATIVNI valid-controli (P3).
 *
 * Sest informativnih (ne-bodovanih) provjera bez ijednog slucaja dobiva valid-control koji ih
 * dovodi u pravi BODOVANI pass. Ne testiramo puki status 'pass' (makeCheck ga iznudi za svaki
 * max-0 check pa bi bio vakuozan) nego kind:'earned' + outcome:'pass' -> meetsExpectation trazi
 * max>0 && earned===max. Tako test PADA ako check ostane informativan (regresijski signal) i
 * dokazuje da valjani (skliski) oblik ne daje lazni 'warn'. Testira STVARNI analyzeDocx (golden put).
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { INFORMATIVE_VALID_CASES } from './corpus/catalog/informative-controls';
import { findCheck, meetsExpectation } from './corpus/error-case';
import { stableCheckId } from '../src/scoring/check-ids';

describe('Lekta Error Corpus - informativni valid-controli (P3)', () => {
  it('svaki ciljani checkId je registriran i konzistentan s naslovom', () => {
    for (const c of INFORMATIVE_VALID_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
      expect(c.expect.kind, `${c.id}: mora traziti bodovani (earned) pass, ne coerced status`).toBe('earned');
    }
  });

  it.each(INFORMATIVE_VALID_CASES.map((c) => [c.id, c] as const))(
    '%s: valjana varijanta daje bodovani pass (max>0, earned===max), ne informativni max-0',
    async (_id, c) => {
      const r = await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId });
      const check = findCheck(r, c.expect.title);
      expect(
        meetsExpectation(check, c.expect),
        `${c.id}: ocekivan bodovani pass, dobiven status=${check.status} ${check.earned}/${check.max}`,
      ).toBe(true);
    },
    20000,
  );
});
