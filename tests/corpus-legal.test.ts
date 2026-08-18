/**
 * Faza 4 prosirenje (Lekta Error Corpus): LEGAL-CITATION klaster. Najveca slijepa tocka faze 1
 * (9 pravnih provjera imalo je nula slucajeva) sada ima atomske fail-ove i valid controls nad
 * pravnim profilom (pravo-integrirani-diplomski, citationMode 'legal-notes' -> pokrece legalni
 * citatni engine nad Word fusnotama).
 *
 * Kao i fpzg atomski: PRVO dokazujemo da pravna baza prolazi ciljanu provjeru, pa da je jedna
 * izmjena fusnote rusi. Testira STVARNI analyzeDocx (golden put).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { expectNotPenalised } from "./helpers/check-status";
import { buildDocxFile } from './helpers/docx-builder';
import { analyzeFixture } from '../src/analysis/golden-entry';
import { legalBaselineSpec, LEGAL_PROFILE_ID } from './corpus/builder/legal-baseline';
import { LEGAL_ATOMIC_CASES, LEGAL_VALID_CASES } from './corpus/catalog/legal';
import { findCheck, meetsExpectation, type CorpusExpectation } from './corpus/error-case';
import { stableCheckId } from './corpus/ids/check-id-registry';

const LEGAL_TITLES = [
  'Pravne fusnote', 'Klasifikacija pravnih izvora', 'Potpunost prvog navođenja',
  'op. cit. → prvo navođenje', 'Slijed Ibid.', 'Propisi i uvedene kratice',
  'Sudska praksa', 'Fusnote ↔ bibliografija',
];

describe('Lekta Error Corpus - legal-citation klaster (faza 4)', () => {
  let baseline: any;
  beforeAll(async () => {
    baseline = await analyzeFixture(buildDocxFile(legalBaselineSpec(), 'legal-baseline.docx'), { profileId: LEGAL_PROFILE_ID });
  }, 30000);

  it('pravna baza prolazi sve pravne provjere', () => {
    for (const t of LEGAL_TITLES) {
      const c = findCheck(baseline, t);
      expectNotPenalised(c);
    }
  });

  it('svaki ciljani checkId je registriran', () => {
    for (const c of [...LEGAL_ATOMIC_CASES, ...LEGAL_VALID_CASES]) {
      expect(stableCheckId(c.expect.title), `${c.id}: "${c.expect.title}" nema stabilni ID`).toBe(c.expect.checkId);
    }
  });

  it.each(LEGAL_ATOMIC_CASES.map((c) => [c.id, c] as const))('%s: u bazi prolazi, mutacija ga ruši', async (_id, c) => {
    const baseCheck = findCheck(baseline, c.expect.title);
    const passExp: CorpusExpectation = { ...c.expect, outcome: 'pass' };
    expect(meetsExpectation(baseCheck, passExp), `${c.id}: baza NE prolazi ciljanu provjeru`).toBe(true);

    const r = await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId });
    const mutated = findCheck(r, c.expect.title);
    expect(
      meetsExpectation(mutated, c.expect),
      `${c.id}: ocekivan ${c.expect.outcome}, dobiven status=${mutated.status} ${mutated.earned}/${mutated.max}`,
    ).toBe(true);
  }, 20000);

  it.each(LEGAL_VALID_CASES.map((c) => [c.id, c] as const))('%s: valjana varijanta ostaje bez laznog nalaza', async (_id, c) => {
    const r = await analyzeFixture(buildDocxFile(c.build(), `${c.id}.docx`), { profileId: c.profileId });
    const check = findCheck(r, c.expect.title);
    expect(meetsExpectation(check, c.expect), `${c.id}: lazni nalaz (status=${check.status})`).toBe(true);
  }, 20000);
});
