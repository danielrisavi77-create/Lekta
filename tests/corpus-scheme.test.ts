/**
 * Faza 4 (Lekta Error Corpus): INTERPUNKCIJA CITATA - zadnja preostala bodovana provjera bez
 * atomskog slucaja, na referentnom fpzg profilu, bez izmjene buildera (tekst-mutacija). Dokazujemo:
 *   (1) cleanBuild prolazi ciljanu provjeru,
 *   (2) jedna mutacija je rusi.
 *
 * Shema numeriranja stranica (page.numbers.scheme) je namjerno izostavljena: demotirana je na
 * informativnu (max 0, uvijek 'pass') jer nema sourced ruleEntry, pa vise nema fail-stanje za
 * dokazati.
 */
import { describe, it, expect } from 'vitest';
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { SCHEME_PUNCT_ATOMIC_CASES } from './corpus/catalog/scheme-punctuation';
import { findCheck, meetsExpectation, type CorpusExpectation } from './corpus/error-case';
import { stableCheckId } from './corpus/ids/check-id-registry';

describe('Lekta Error Corpus - shema numeriranja + interpunkcija (faza 4)', () => {
  it('svaki ciljani checkId je registriran (stabilni ID postoji)', () => {
    for (const c of SCHEME_PUNCT_ATOMIC_CASES) {
      expect(stableCheckId(c.expect.title), `${c.id}: naslov "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(SCHEME_PUNCT_ATOMIC_CASES.map((c) => [c.id, c] as const))('%s: cista varijanta prolazi, mutacija ga ruši', async (_id, c) => {
    const clean = await analyzeFixture(buildDocxFile(c.cleanBuild!(), `${c.id}-clean.docx`), { profileId: c.profileId });
    const baseCheck = findCheck(clean, c.expect.title);
    const passExp: CorpusExpectation = { ...c.expect, outcome: 'pass' };
    expect(meetsExpectation(baseCheck, passExp), `${c.id}: cista varijanta NE prolazi ciljanu provjeru (${baseCheck.status} ${baseCheck.earned}/${baseCheck.max})`).toBe(true);

    const mutated = findCheck(await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId }), c.expect.title);
    expect(
      meetsExpectation(mutated, c.expect),
      `${c.id}: ocekivan ishod ${c.expect.outcome} (${c.expect.kind}), dobiven status=${mutated.status} ${mutated.earned}/${mutated.max}`,
    ).toBe(true);
  }, 20000);
});
