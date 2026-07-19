/**
 * Faza 4 (Lekta Error Corpus): FOOTNOTE-FORMAT atomski slucajevi. Ciljane provjere oblikovanja
 * (font/razmak fusnota, oznake u tijelu, razmak odlomaka) emitira samo pravni profil s footnote
 * gate-ovima; do sada ih builder nije mogao okinuti. Nakon ADITIVNOG prosirenja docx-buildera
 * (FootnoteSpec + ParaSpec.before/after + raw markeri; golden bajt-identican) dokazujemo:
 *   (1) cleanBuild s ISPRAVNIM oblikom prolazi ciljanu provjeru pod pravnim profilom,
 *   (2) jedna mutacija oblika je rusi.
 * Vozi STVARNI analyzeDocx (golden put), ne dira engine.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { FOOTNOTE_ATOMIC_CASES } from './corpus/catalog/footnote-format';
import { findCheck, meetsExpectation, type CorpusExpectation } from './corpus/error-case';
import { stableCheckId } from './corpus/ids/check-id-registry';

describe('Lekta Error Corpus - footnote-format atomski slucajevi (faza 4)', () => {
  it('svaki ciljani checkId je registriran (stabilni ID postoji)', () => {
    for (const c of FOOTNOTE_ATOMIC_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: naslov "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(FOOTNOTE_ATOMIC_CASES.map((c) => [c.id, c] as const))('%s: cisti oblik prolazi, mutacija ga ruši', async (_id, c) => {
    // (1) cleanBuild prolazi ciljanu provjeru pod pravnim profilom -> mutacija oblika je jedini uzrok.
    const clean = await analyzeFixture(buildDocxFile(c.cleanBuild!(), `${c.id}-clean.docx`), { profileId: c.profileId });
    const baseCheck = findCheck(clean, c.expect.title);
    const passExp: CorpusExpectation = { ...c.expect, outcome: 'pass' };
    expect(meetsExpectation(baseCheck, passExp), `${c.id}: cista varijanta NE prolazi ciljanu provjeru (${baseCheck.status} ${baseCheck.earned}/${baseCheck.max})`).toBe(true);

    // (2) mutacija oblika rusi ciljanu provjeru.
    const mutated = findCheck(await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId }), c.expect.title);
    expect(
      meetsExpectation(mutated, c.expect),
      `${c.id}: ocekivan ishod ${c.expect.outcome} (${c.expect.kind}), dobiven status=${mutated.status} ${mutated.earned}/${mutated.max}`,
    ).toBe(true);
  }, 20000);
});
