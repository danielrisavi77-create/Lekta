/**
 * Laya eval harness (LAYA_V2_SPEC.md, odj. 16 do 20). Ciste funkcije nad retcima
 * (zlatna oznaka, predikcija ili suzdrzavanje, vjerojatnosti); ne pokrecu model.
 *
 * Mjeri se odvojeno po svakoj od cetiri oznake; agregatna tocnost nije dovoljna. Najvaznija
 * sigurnosna mjera je broj pravih problema oznacenih kao `possible_false_positive`
 * (`dangerousErrors`) i preciznost te oznake.
 */
import { VERDICTS } from './contracts-v2.ts';
import type { LayaVerdict } from './contracts-v2.ts';

export interface EvalRow {
  caseId: string;
  gold: LayaVerdict;
  /** null znaci suzdrzavanje (no_adjudication). */
  prediction: LayaVerdict | null;
  /** Sirove vjerojatnosti runtimea; null kad runtime nije odgovorio valjano. */
  probabilities: Record<LayaVerdict, number> | null;
}

export interface LabelMetrics { precision: number | null; recall: number | null; f1: number | null; fpr: number | null; fnr: number | null; support: number }
export interface EvalReport {
  total: number;
  covered: number;
  coverage: number;
  accuracyOnCovered: number | null;
  perLabel: Record<LayaVerdict, LabelMetrics>;
  /** Pravi nalaz (gold finding_supported) koji je model proglasio moguce laznim. */
  dangerousErrors: number;
  falsePositiveAdjudicationPrecision: number | null;
  brier: number | null;
  expectedCalibrationError: number | null;
}

const ratio = (a: number, b: number): number | null => (b === 0 ? null : a / b);

function labelMetrics(rows: EvalRow[], label: LayaVerdict): LabelMetrics {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of rows) {
    const predicted = r.prediction === label;
    const actual = r.gold === label;
    // Suzdrzavanje nad pravom oznakom je propust (fn); nad drugom oznakom nije lazna uzbuna.
    if (predicted && actual) tp++; else if (predicted) fp++; else if (actual) fn++; else tn++;
  }
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1, fpr: ratio(fp, fp + tn), fnr: ratio(fn, fn + tp), support: tp + fn };
}

/** Viseklasni Brier: prosjek kvadratnih odstupanja od one-hot zlatne oznake. */
export function brierScore(rows: EvalRow[]): number | null {
  const scored = rows.filter((r) => r.probabilities);
  if (!scored.length) return null;
  const sum = scored.reduce((total, r) => total + VERDICTS.reduce((s, v) => s + ((r.probabilities![v] ?? 0) - (v === r.gold ? 1 : 0)) ** 2, 0), 0);
  return sum / scored.length;
}

/** ECE s jednakim binovima po pouzdanosti (max vjerojatnost). */
export function expectedCalibrationError(rows: EvalRow[], bins = 10): number | null {
  const scored = rows.filter((r) => r.probabilities);
  if (!scored.length) return null;
  const bucket: { n: number; conf: number; correct: number }[] = Array.from({ length: bins }, () => ({ n: 0, conf: 0, correct: 0 }));
  for (const r of scored) {
    const p = r.probabilities!;
    const top = VERDICTS.reduce((best, v) => (p[v] > p[best] ? v : best), VERDICTS[0]);
    const conf = p[top];
    const b = bucket[Math.min(bins - 1, Math.floor(conf * bins))];
    b.n++; b.conf += conf; b.correct += top === r.gold ? 1 : 0;
  }
  return bucket.reduce((e, b) => (b.n ? e + (b.n / scored.length) * Math.abs(b.conf / b.n - b.correct / b.n) : e), 0);
}

export function evaluate(rows: EvalRow[]): EvalReport {
  const covered = rows.filter((r) => r.prediction !== null);
  const perLabel = Object.fromEntries(VERDICTS.map((v) => [v, labelMetrics(rows, v)])) as Record<LayaVerdict, LabelMetrics>;
  return {
    total: rows.length,
    covered: covered.length,
    coverage: rows.length ? covered.length / rows.length : 0,
    accuracyOnCovered: ratio(covered.filter((r) => r.prediction === r.gold).length, covered.length),
    perLabel,
    dangerousErrors: rows.filter((r) => r.gold === 'finding_supported' && r.prediction === 'possible_false_positive').length,
    falsePositiveAdjudicationPrecision: perLabel.possible_false_positive.precision,
    brier: brierScore(rows),
    expectedCalibrationError: expectedCalibrationError(rows),
  };
}

/** Krivulja pokrivenosti: za svaki prag, udio odgovorenih i tocnost medju njima. */
export function coverageCurve(rows: EvalRow[], thresholds: readonly number[]): { threshold: number; coverage: number; accuracy: number | null; dangerousErrors: number }[] {
  return thresholds.map((t) => {
    const kept = rows.filter((r) => r.probabilities && Math.max(...VERDICTS.map((v) => r.probabilities![v])) >= t);
    const predicted = (r: EvalRow) => VERDICTS.reduce((best, v) => (r.probabilities![v] > r.probabilities![best] ? v : best), VERDICTS[0]);
    return {
      threshold: t,
      coverage: rows.length ? kept.length / rows.length : 0,
      accuracy: ratio(kept.filter((r) => predicted(r) === r.gold).length, kept.length),
      dangerousErrors: kept.filter((r) => r.gold === 'finding_supported' && predicted(r) === 'possible_false_positive').length,
    };
  });
}

/**
 * Najnizi prag cija krivulja nema opasnih pogresaka i ima barem `minAccuracy`. Prag se bira na
 * zamrznutom kalibracijskom skupu, a provjerava na zasebnom testnom skupu (odj. 19).
 */
export function selectThreshold(calibrationRows: EvalRow[], minAccuracy: number, grid: readonly number[] = Array.from({ length: 19 }, (_, i) => 0.05 * (i + 1))): number | null {
  for (const point of coverageCurve(calibrationRows, grid)) {
    if (point.coverage > 0 && point.dangerousErrors === 0 && point.accuracy !== null && point.accuracy >= minAccuracy) return point.threshold;
  }
  return null;
}

/** Stabilnost na permutaciju redoslijeda opcija (odj. 20): udio caseova kojima se presuda promijenila. */
export function optionOrderInstability(original: ReadonlyMap<string, LayaVerdict | null>, permuted: ReadonlyMap<string, LayaVerdict | null>): number | null {
  const ids = [...original.keys()].filter((id) => permuted.has(id));
  if (!ids.length) return null;
  return ids.filter((id) => original.get(id) !== permuted.get(id)).length / ids.length;
}

/** Baseline A: trenutna Lekta, koja svaki `warn`/`fail` zapis tretira kao stvaran nalaz. */
export function baselineCurrentHeuristic(rows: readonly Pick<EvalRow, 'caseId' | 'gold'>[]): EvalRow[] {
  return rows.map((r) => ({ caseId: r.caseId, gold: r.gold, prediction: 'finding_supported', probabilities: null }));
}

/** Baseline vecinske klase iz samog skupa: Laya ga mora nadmasiti (upstream bazni modeli su bili ispod njega). */
export function baselineMajority(rows: readonly Pick<EvalRow, 'caseId' | 'gold'>[]): EvalRow[] {
  const counts = new Map<LayaVerdict, number>();
  for (const r of rows) counts.set(r.gold, (counts.get(r.gold) ?? 0) + 1);
  const majority = VERDICTS.reduce((best, v) => ((counts.get(v) ?? 0) > (counts.get(best) ?? 0) ? v : best), VERDICTS[0]);
  return rows.map((r) => ({ caseId: r.caseId, gold: r.gold, prediction: majority, probabilities: null }));
}
