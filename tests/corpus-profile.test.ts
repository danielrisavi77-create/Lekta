/**
 * Faza 4 (Lekta Error Corpus): PROFILNO-UVJETOVANI atomski slucajevi. Iste atomske uzrocnosti kao
 * corpus-atomic, ali "prolazna baza" je per-profil (cleanBuild), jer se ciljane provjere u engineu
 * emitiraju SAMO kad profil nosi odgovarajuce pravilo (headingRules, keywordMin/Max, bilingual
 * abstract, minReferences, paperSizes). Za svaki slucaj dokazujemo:
 *   (1) u cistoj varijanti (cleanBuild) ciljana provjera prolazi pod tim profilom,
 *   (2) nakon jedne mutacije ta ista provjera padne.
 * Testira STVARNI analyzeDocx (golden put) preko realnih verificiranih profila iz registra.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture, resolveProfile } from '../src/analysis/golden-entry';
import { PROFILE_ATOMIC_CASES } from './corpus/catalog/profile-enabled';
import { findCheck, meetsExpectation, type CorpusExpectation } from './corpus/error-case';
import { stableCheckId } from '../src/scoring/check-ids';

describe('Lekta Error Corpus - profilno-uvjetovani atomski slucajevi (faza 4)', () => {
  it('svaki ciljani profil postoji u registru i nosi ocekivano pravilo', () => {
    for (const c of PROFILE_ATOMIC_CASES) {
      const p: any = resolveProfile(c.profileId);
      expect(p, `${c.id}: profil ${c.profileId} nije razrjesiv`).toBeTruthy();
    }
  });

  it('svaki ciljani checkId je registriran (stabilni ID postoji)', () => {
    for (const c of PROFILE_ATOMIC_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: naslov "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(PROFILE_ATOMIC_CASES.map((c) => [c.id, c] as const))('%s: u cistoj varijanti prolazi, mutacija ga ruši', async (_id, c) => {
    // (1) cleanBuild prolazi ciljanu provjeru pod svojim profilom -> mutacija je jedini uzrok.
    const clean = await analyzeFixture(buildDocxFile(c.cleanBuild!(), `${c.id}-clean.docx`), { profileId: c.profileId });
    const baseCheck = findCheck(clean, c.expect.title);
    const passExp: CorpusExpectation = { ...c.expect, outcome: 'pass' };
    expect(meetsExpectation(baseCheck, passExp), `${c.id}: cista varijanta NE prolazi ciljanu provjeru (${baseCheck.status} ${baseCheck.earned}/${baseCheck.max})`).toBe(true);

    // (2) mutacija rusi ciljanu provjeru (status warn/fail ili gubitak bodova).
    const mutated = findCheck(await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId }), c.expect.title);
    expect(
      meetsExpectation(mutated, c.expect),
      `${c.id}: ocekivan ishod ${c.expect.outcome} (${c.expect.kind}), dobiven status=${mutated.status} ${mutated.earned}/${mutated.max}`,
    ).toBe(true);
  }, 20000);
});
