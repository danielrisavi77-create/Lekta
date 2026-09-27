import { describe, expect, it } from 'vitest';
import { MAX_RECORDS, buildLayaCandidates, type CandidateSnapshot } from '../../scripts/laya/candidate-builder.ts';
import { DecisionContractError, validateDecisionCase } from '../../scripts/laya/contracts-v2.ts';
import { REFERENCE_TEXT, makeCase, makeSnapshot } from '../helpers/laya-v2-fixtures.ts';

type AnySnapshot = Record<string, any>;
const build = (s: AnySnapshot) => buildLayaCandidates(s as CandidateSnapshot);
function rejects(run: () => unknown, code?: string): void {
  let caught: unknown = null;
  try { run(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DecisionContractError);
  if (code) expect((caught as DecisionContractError).code).toBe(code);
}
function withRecord(patch: Record<string, unknown>, snapshot: AnySnapshot = makeSnapshot()): AnySnapshot {
  return { ...snapshot, records: [{ ...snapshot.records[0], ...patch }] };
}
function withChecks(checks: unknown[]): AnySnapshot {
  const s = makeSnapshot();
  return { ...s, result: { ...s.result, checks } };
}

describe('Laya v2 candidate builder', () => {
  it('baseline: eksplicitno vezan warn zapis postaje tocno ocekivani case', () => {
    const { cases, skipped } = build(makeSnapshot());
    expect(skipped).toEqual([]);
    expect(cases).toEqual([makeCase()]);
    expect(validateDecisionCase(cases[0])).toEqual(cases[0]);
  });

  it('fail status je takoder nalaz', () => {
    const { cases } = build(withChecks([{ id: 'reference.completeness', status: 'fail' }]));
    expect(cases).toHaveLength(1);
    expect(cases[0].engine.checkStatus).toBe('fail');
  });

  const skips: [string, AnySnapshot, string][] = [
    ['formalni check nikad ne ide Layi', withRecord({ checkId: 'page.margins' }), 'check_not_eligible'],
    ['zapis bez checkId-ja', withRecord({ checkId: null }), 'check_not_eligible'],
    ['check ne postoji u rezultatu', withChecks([]), 'check_missing'],
    ['check bez stabilnog id-ja nije eksplicitna veza', withChecks([{ status: 'warn' }]), 'check_missing'],
    ['dvostruki check', withChecks([{ id: 'reference.completeness', status: 'warn' }, { id: 'reference.completeness', status: 'fail' }]), 'check_ambiguous'],
    ['pass nije nalaz', withChecks([{ id: 'reference.completeness', status: 'pass' }]), 'check_not_finding'],
    ['informational nije nalaz', withChecks([{ id: 'reference.completeness', status: 'informational' }]), 'check_not_finding'],
    ['nepoznat status nije nalaz', withChecks([{ id: 'reference.completeness', status: 'nesto' }]), 'check_not_finding'],
    ['nesigurna veza', withRecord({ linkage: 'uncertain' }), 'linkage_not_explicit'],
    ['nepodrzan jezik', withRecord({ language: 'unsupported' }), 'unsupported_language'],
    ['prazan zapis', withRecord({ text: '   ' }), 'evidence_incomplete'],
    ['predug kontekst', withRecord({ text: 'x'.repeat(2001) }), 'context_limit'],
  ];

  it.each(skips)('%s -> skipped bez teksta', (_name, snapshot, reason) => {
    const { cases, skipped } = build(snapshot);
    expect(cases).toEqual([]);
    expect(skipped).toEqual([{ paragraphIndex: 12, recordIndex: 0, reason }]);
    expect(JSON.stringify(skipped)).not.toContain(REFERENCE_TEXT);
  });

  it('bez lokalnog dopustenja odbija cijeli batch', () => {
    const s = makeSnapshot();
    rejects(() => build({ ...s, provenance: { ...s.provenance, localInferenceAllowed: false } }), 'DATA_NOT_PERMITTED');
  });

  it('metapodaci se provjeravaju i za prazan batch', () => {
    expect(build({ ...makeSnapshot(), records: [] })).toEqual({ cases: [], skipped: [] });
    rejects(() => build({ ...makeSnapshot(), records: [], engineRevision: 'nije-sha' }));
    rejects(() => build({ ...makeSnapshot(), records: [], documentRevisionId: 'student@example.com' }));
  });

  it('duplikat lokatora se odbija', () => {
    const s = makeSnapshot();
    rejects(() => build({ ...s, records: [s.records[0], { ...s.records[0], checkId: 'page.margins' }] }), 'DUPLICATE_IDENTITY');
  });

  it('sparse nizovi, accessori i naslijedjena polja se odbijaju', () => {
    const s = makeSnapshot();
    // eslint-disable-next-line no-sparse-arrays
    rejects(() => build({ ...s, records: [, s.records[0]] }), 'INVALID_SNAPSHOT');
    const sparseChecks: unknown[] = []; sparseChecks.length = 2;
    rejects(() => build(withChecks(sparseChecks)), 'INVALID_SNAPSHOT');
    let calls = 0;
    const record = { ...s.records[0] };
    Object.defineProperty(record, 'text', { enumerable: true, get() { calls++; return REFERENCE_TEXT; } });
    rejects(() => build({ ...s, records: [record] }), 'INVALID_SNAPSHOT');
    expect(calls).toBe(0);
    rejects(() => build({ ...s, records: [Object.assign(Object.create({ checkId: 'reference.completeness' }), { ...s.records[0] })] }), 'INVALID_SNAPSHOT');
    rejects(() => build({ ...s, records: [null] }), 'INVALID_SNAPSHOT');
  });

  it('nevaljani tipovi zapisa odbijaju batch, ne postaju skip', () => {
    rejects(() => build(withRecord({ paragraphIndex: 0 })), 'INVALID_SNAPSHOT');
    rejects(() => build(withRecord({ recordIndex: 1.5 })), 'INVALID_SNAPSHOT');
    rejects(() => build(withRecord({ text: 42 })), 'INVALID_SNAPSHOT');
    rejects(() => build(withRecord({ linkage: 'maybe' })), 'INVALID_SNAPSHOT');
    rejects(() => build(withRecord({ language: 'de' })), 'INVALID_SNAPSHOT');
  });

  it('granica broja zapisa je tocno MAX_RECORDS', () => {
    const s = makeSnapshot();
    const records = (n: number) => Array.from({ length: n }, (_, i) => ({ ...s.records[0], paragraphIndex: 12 + i }));
    expect(build({ ...s, records: records(MAX_RECORDS) }).cases).toHaveLength(MAX_RECORDS);
    rejects(() => build({ ...s, records: records(MAX_RECORDS + 1) }), 'INVALID_SNAPSHOT');
  });

  it('ne cita score, issues, triage ni recipe: getteri na njima se ne izvrsavaju', () => {
    const s = makeSnapshot();
    let calls = 0;
    const result: Record<string, unknown> = { checks: s.result.checks };
    for (const key of ['score', 'issues', 'details', 'recipe']) {
      Object.defineProperty(result, key, { enumerable: true, get() { calls++; throw new Error('procitano'); } });
    }
    expect(build({ ...s, result }).cases).toHaveLength(1);
    expect(calls).toBe(0);
  });
});
