/**
 * Faza 4 (Lekta Error Corpus): TOC + HIJERARHIJA atomski slucajevi. Ciljane provjere sadrzaja
 * (font/brojevi stranica/pokrivenost) i hijerarhije naslova emitira samo profil s TOC-detalj
 * gate-ovima; entries se prepoznaju bez pravog fldSimple polja (stil TOC1 / tekst-heuristika).
 * Cist profil+spec enabler, bez izmjene buildera. Dokazujemo:
 *   (1) cleanBuild prolazi ciljanu provjeru pod pravnim profilom,
 *   (2) jedna mutacija je rusi.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { TOC_ATOMIC_CASES } from './corpus/catalog/toc-hierarchy';
import { findCheck, meetsExpectation, type CorpusExpectation } from './corpus/error-case';
import { stableCheckId } from '../src/scoring/check-ids';

describe('Lekta Error Corpus - TOC + hijerarhija atomski slucajevi (faza 4)', () => {
  it('svaki ciljani checkId je registriran (stabilni ID postoji)', () => {
    for (const c of TOC_ATOMIC_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: naslov "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(TOC_ATOMIC_CASES.map((c) => [c.id, c] as const))('%s: cista varijanta prolazi, mutacija ga ruši', async (_id, c) => {
    // (1) cleanBuild prolazi ciljanu provjeru pod profilom -> mutacija je jedini uzrok.
    const clean = await analyzeFixture(buildDocxFile(c.cleanBuild!(), `${c.id}-clean.docx`), { profileId: c.profileId });
    const baseCheck = findCheck(clean, c.expect.title);
    const passExp: CorpusExpectation = { ...c.expect, outcome: 'pass' };
    expect(meetsExpectation(baseCheck, passExp), `${c.id}: cista varijanta NE prolazi ciljanu provjeru (${baseCheck.status} ${baseCheck.earned}/${baseCheck.max})`).toBe(true);

    // (2) mutacija rusi ciljanu provjeru.
    const mutated = findCheck(await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId }), c.expect.title);
    expect(
      meetsExpectation(mutated, c.expect),
      `${c.id}: ocekivan ishod ${c.expect.outcome} (${c.expect.kind}), dobiven status=${mutated.status} ${mutated.earned}/${mutated.max}`,
    ).toBe(true);
  }, 20000);
});
