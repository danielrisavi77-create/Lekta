import { describe, expect, it } from 'vitest';
import {
  baselineCurrentHeuristic, baselineMajority, brierScore, coverageCurve, evaluate, expectedCalibrationError,
  optionOrderInstability, selectThreshold,
} from '../../scripts/laya/eval.ts';
import type { EvalRow } from '../../scripts/laya/eval.ts';
import type { LayaVerdict } from '../../scripts/laya/contracts-v2.ts';

const p = (top: LayaVerdict, conf: number): Record<LayaVerdict, number> => {
  const rest = (1 - conf) / 3;
  return { finding_supported: rest, possible_false_positive: rest, extraction_uncertain: rest, insufficient_evidence: rest, [top]: conf };
};
const row = (caseId: string, gold: LayaVerdict, prediction: LayaVerdict | null, conf = 0.9): EvalRow =>
  ({ caseId, gold, prediction, probabilities: prediction ? p(prediction, conf) : null });

describe('Laya eval metrike', () => {
  const rows: EvalRow[] = [
    row('a', 'finding_supported', 'finding_supported'),
    row('b', 'finding_supported', 'possible_false_positive'), // opasna pogreska
    row('c', 'possible_false_positive', 'possible_false_positive'),
    row('d', 'extraction_uncertain', null), // suzdrzavanje
  ];

  it('pokrivenost, tocnost, opasne pogreske i metrike po oznaci', () => {
    const r = evaluate(rows);
    expect([r.total, r.covered, r.coverage]).toEqual([4, 3, 0.75]);
    expect(r.accuracyOnCovered).toBeCloseTo(2 / 3);
    expect(r.dangerousErrors).toBe(1);
    expect(r.falsePositiveAdjudicationPrecision).toBeCloseTo(0.5);
    expect(r.perLabel.finding_supported).toMatchObject({ precision: 1, recall: 0.5, support: 2 });
    expect(r.perLabel.extraction_uncertain).toMatchObject({ precision: null, recall: 0, fnr: 1, support: 1 });
  });

  it('Brier i ECE: savrseno sigurna tocna predikcija daje 0', () => {
    const perfect: EvalRow[] = [{ caseId: 'x', gold: 'finding_supported', prediction: 'finding_supported',
      probabilities: { finding_supported: 1, possible_false_positive: 0, extraction_uncertain: 0, insufficient_evidence: 0 } }];
    expect(brierScore(perfect)).toBe(0);
    expect(expectedCalibrationError(perfect)).toBe(0);
    expect(brierScore([row('y', 'finding_supported', null)])).toBeNull();
  });

  it('ECE hvata preveliku sigurnost', () => {
    const over = [row('1', 'finding_supported', 'possible_false_positive', 0.95), row('2', 'finding_supported', 'finding_supported', 0.95)];
    expect(expectedCalibrationError(over)).toBeCloseTo(0.45);
  });

  it('krivulja pokrivenosti i izbor praga bez opasnih pogresaka', () => {
    const cal = [row('1', 'finding_supported', 'possible_false_positive', 0.55), row('2', 'possible_false_positive', 'possible_false_positive', 0.9),
      row('3', 'finding_supported', 'finding_supported', 0.8)];
    const curve = coverageCurve(cal, [0.5, 0.7]);
    expect(curve[0]).toMatchObject({ coverage: 1, dangerousErrors: 1 });
    expect(curve[1]).toMatchObject({ coverage: 2 / 3, accuracy: 1, dangerousErrors: 0 });
    expect(selectThreshold(cal, 0.9)).toBeCloseTo(0.6);
    expect(selectThreshold([row('1', 'finding_supported', 'possible_false_positive', 0.99)], 0.5)).toBeNull();
  });

  it('nestabilnost na redoslijed opcija', () => {
    const a = new Map<string, LayaVerdict | null>([['1', 'finding_supported'], ['2', 'possible_false_positive']]);
    const b = new Map<string, LayaVerdict | null>([['1', 'finding_supported'], ['2', 'finding_supported']]);
    expect(optionOrderInstability(a, b)).toBe(0.5);
    expect(optionOrderInstability(a, new Map())).toBeNull();
  });

  it('baselineovi: trenutna heuristika i vecinska klasa', () => {
    const gold = rows.map(({ caseId, gold }) => ({ caseId, gold }));
    expect(new Set(baselineCurrentHeuristic(gold).map((r) => r.prediction))).toEqual(new Set(['finding_supported']));
    expect(evaluate(baselineCurrentHeuristic(gold)).dangerousErrors).toBe(0);
    expect(baselineMajority(gold).every((r) => r.prediction === 'finding_supported')).toBe(true);
  });
});
