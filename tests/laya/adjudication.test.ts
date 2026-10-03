import { describe, expect, it } from 'vitest';
import { adjudicate, modelDigest, type NoAdjudicationReason } from '../../scripts/laya/contracts-v2.ts';
import { makeCase, makePolicy, makeResult, makeRuntime } from '../helpers/laya-v2-fixtures.ts';

const ok = () => adjudicate(makeResult(), makeCase(), makeRuntime(), makePolicy());

describe('Laya v2 fail-closed adjudikacija', () => {
  it('baseline: vezan, pinan i kalibriran odgovor daje savjetodavnu presudu', () => {
    const out = ok();
    expect(out).toMatchObject({ status: 'adjudicated', verdict: 'finding_supported', caseId: makeCase().caseId,
      modelDigest: modelDigest(makeRuntime()), calibrationRevision: 'cal-fixture-1' });
    if (out.status !== 'adjudicated') throw new Error('baseline');
    expect(out.cacheKey).toBe(`${makeCase().inputDigest}:${modelDigest(makeRuntime())}`);
    // Presuda nikad ne nosi score, status checka, fixability ni repair.
    expect(Object.keys(out).sort()).toEqual(['answerConfidence', 'cacheKey', 'calibrationRevision', 'caseId',
      'inputDigest', 'modelDigest', 'schemaVersion', 'status', 'verdict']);
  });

  const cases: [string, NoAdjudicationReason, () => ReturnType<typeof adjudicate>][] = [
    ['runtime nije vratio nista', 'runtime_unavailable', () => adjudicate(undefined, makeCase(), makeRuntime(), makePolicy())],
    ['case nije valjan', 'case_invalid', () => adjudicate(makeResult(), { ...makeCase(), caseId: 'laya:v2|x' }, makeRuntime(), makePolicy())],
    ['manifest nedostaje', 'manifest_invalid', () => adjudicate(makeResult(), makeCase(), null, makePolicy())],
    ['nepoznata verzija sheme', 'unknown_schema', () => adjudicate({ ...makeResult(), schemaVersion: 1 }, makeCase(), makeRuntime(), makePolicy())],
    ['nepoznata oznaka', 'unknown_label', () => adjudicate({ ...makeResult(), verdict: 'pass' }, makeCase(), makeRuntime(), makePolicy())],
    ['dodatno polje u odgovoru', 'invalid_result', () => adjudicate({ ...makeResult(), score: 100 }, makeCase(), makeRuntime(), makePolicy())],
    ['odgovor za drugi case', 'input_not_bound', () => adjudicate({ ...makeResult(), caseId: 'laya:v2|drugi' }, makeCase(), makeRuntime(), makePolicy())],
    ['odgovor za stari ulaz', 'input_not_bound', () => adjudicate({ ...makeResult(), inputDigest: 'f'.repeat(64) }, makeCase(), makeRuntime(), makePolicy())],
    ['tezine ne odgovaraju manifestu', 'weights_mismatch', () => adjudicate({ ...makeResult(), runtime: { ...makeRuntime(), weightsSha256: '0'.repeat(64) } }, makeCase(), makeRuntime(), makePolicy())],
    ['tokenizer ne odgovara', 'vocabulary_mismatch', () => adjudicate({ ...makeResult(), runtime: { ...makeRuntime(), vocabularySha256: '0'.repeat(64) } }, makeCase(), makeRuntime(), makePolicy())],
    ['druga preciznost istog checkpointa', 'runtime_mismatch', () => adjudicate({ ...makeResult(), runtime: { ...makeRuntime(), precision: 'fp16' } }, makeCase(), makeRuntime(), makePolicy())],
    ['zbroj vjerojatnosti nije 1', 'invalid_distribution', () => adjudicate({ ...makeResult(), probabilities: { ...makeResult().probabilities, finding_supported: 0.9 } }, makeCase(), makeRuntime(), makePolicy())],
    ['verdict nije argmax', 'invalid_distribution', () => adjudicate({ ...makeResult(), verdict: 'possible_false_positive' }, makeCase(), makeRuntime(), makePolicy())],
    ['izjednacen argmax', 'invalid_distribution', () => adjudicate({ ...makeResult(), probabilities: { finding_supported: 0.4, possible_false_positive: 0.4, extraction_uncertain: 0.1, insufficient_evidence: 0.1 } }, makeCase(), makeRuntime(), makePolicy())],
    ['vjerojatnost izvan [0,1]', 'invalid_distribution', () => adjudicate({ ...makeResult(), probabilities: { ...makeResult().probabilities, extraction_uncertain: -0.1 } }, makeCase(), makeRuntime(), makePolicy())],
    ['kalibracija nedostaje', 'calibration_missing', () => adjudicate(makeResult(), makeCase(), makeRuntime(), null)],
    ['prag izmjeren za drugi model', 'calibration_mismatch', () => adjudicate(makeResult(), makeCase(), makeRuntime(), { ...makePolicy(), modelDigest: '0'.repeat(64) })],
    ['prag iz druge kalibracijske revizije', 'calibration_mismatch', () => adjudicate(makeResult(), makeCase(), makeRuntime(), { ...makePolicy(), calibrationRevision: 'cal-2' })],
    ['pouzdanost ispod praga', 'below_threshold', () => adjudicate({ ...makeResult(), answerConfidence: 0.49 }, makeCase(), makeRuntime(), makePolicy())],
  ];

  it.each(cases)('%s -> no_adjudication', (_name, reason, run) => {
    expect(ok().status).toBe('adjudicated');
    const out = run();
    expect(out.status).toBe('no_adjudication');
    if (out.status === 'no_adjudication') expect(out.reason).toBe(reason);
    expect(out).not.toHaveProperty('verdict');
  });

  it('bez policyja nema presude ni uz answerConfidence 1.0', () => {
    const out = adjudicate({ ...makeResult(), answerConfidence: 1 }, makeCase(), makeRuntime(), undefined);
    expect(out).toMatchObject({ status: 'no_adjudication', reason: 'calibration_missing' });
  });

  it('redoslijed opcija u odgovoru ne mijenja presudu', () => {
    const p = makeResult().probabilities;
    const reordered = { insufficient_evidence: p.insufficient_evidence, extraction_uncertain: p.extraction_uncertain,
      possible_false_positive: p.possible_false_positive, finding_supported: p.finding_supported };
    expect(adjudicate({ ...makeResult(), probabilities: reordered }, makeCase(), makeRuntime(), makePolicy())).toEqual(ok());
  });

  it('Proxy koji baca iz trapa daje no_adjudication, ne iznimku', () => {
    const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('proxy trap'); } });
    expect(adjudicate(hostile, makeCase(), makeRuntime(), makePolicy())).toMatchObject({ status: 'no_adjudication', reason: 'invalid_result' });
  });

  it('adjudicate nikad ne baca, ni na smecu', () => {
    for (const junk of [0, '', [], 'finding_supported', { schemaVersion: 2 }, Object.create(null)]) {
      expect(() => adjudicate(junk, makeCase(), makeRuntime(), makePolicy())).not.toThrow();
      expect(adjudicate(junk, makeCase(), makeRuntime(), makePolicy()).status).toBe('no_adjudication');
    }
  });
});
