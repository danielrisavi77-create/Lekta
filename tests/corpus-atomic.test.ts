/**
 * Faza 4 (Lekta Error Corpus): ATOMSKI slucajevi. Za svaki dokazujemo UZROCNOST:
 *   (1) u PROLAZNOJ bazi ciljana provjera prolazi (baseline je zasebno dokazan),
 *   (2) nakon JEDNE mutacije bas ta provjera padne (ili izgubi bodove).
 * Time je ta mutacija dokazano odgovorna za nalaz. Testira STVARNI analyzeDocx (golden put).
 *
 * Slucajevi keyaju po stabilnom checkId-u (jezicno-neovisno); `title` sluzi samo za pronalazak
 * checka u rezultatu. Ne mijenja engine (CLAUDE.md) - samo ga vozi kroz kontrolirane ulaze.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { baselineSpec, BASELINE_PROFILE_ID } from './corpus/builder/baseline';
import { ATOMIC_CASES } from './corpus/catalog/atomic';
import { findCheck, meetsExpectation, type CorpusExpectation } from './corpus/error-case';
import { stableCheckId } from './corpus/ids/check-id-registry';

const detectable = ATOMIC_CASES.filter((c) => c.detectableNow);

describe('Lekta Error Corpus - atomski slucajevi (faza 4)', () => {
  let baseline: any;
  beforeAll(async () => {
    baseline = await analyzeFixture(buildDocxFile(baselineSpec(), 'baseline.docx'), { profileId: BASELINE_PROFILE_ID });
  }, 30000);

  it('baza je prolazna (visok score, bez fail statusa)', () => {
    expect(baseline.score).toBeGreaterThanOrEqual(85);
    const fails = (baseline.checks || []).filter((c: any) => c.status === 'fail');
    expect(fails.map((c: any) => c.title)).toEqual([]);
  });

  it('svaki ciljani checkId je registriran (stabilni ID postoji)', () => {
    for (const c of ATOMIC_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: naslov "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(detectable.map((c) => [c.id, c] as const))('%s: u bazi prolazi, mutacija ga ruši', async (_id, c) => {
    // (1) Ciljana provjera prolazi u cistoj varijanti (dijeljena baza ili per-case cleanBuild)
    //     -> mutacija je jedini uzrok promjene.
    const cleanResult = c.cleanBuild
      ? await analyzeFixture(buildDocxFile(c.cleanBuild(), `${c.id}-clean.docx`), { profileId: c.profileId })
      : baseline;
    const baseCheck = findCheck(cleanResult, c.expect.title);
    const passExp: CorpusExpectation = { ...c.expect, outcome: 'pass' };
    expect(meetsExpectation(baseCheck, passExp), `${c.id}: cista varijanta NE prolazi ciljanu provjeru (${baseCheck.status} ${baseCheck.earned}/${baseCheck.max})`).toBe(true);

    // (2) Nakon mutacije ciljana provjera pada / gubi bodove.
    const r = await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId });
    const mutated = findCheck(r, c.expect.title);
    expect(
      meetsExpectation(mutated, c.expect),
      `${c.id}: ocekivan ishod ${c.expect.outcome} (${c.expect.kind}), dobiven status=${mutated.status} ${mutated.earned}/${mutated.max}`,
    ).toBe(true);
  }, 20000);
});
