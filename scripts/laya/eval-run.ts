/**
 * Laya eval na radnoj stanici (V2.2 harness nad V2.1 runnerom). Ulaz je scripts/laya/eval-cli.ts. Protokol: docs/laya/EVALUATION_PROTOCOL.md.
 *
 *   npm run laya:eval -- --gold <gold.json> --endpoint http://127.0.0.1:8765 --model-key <kljuc>
 *                        [--registry scripts/laya/registry.json] [--out izvjestaj.json]
 *                        [--calibrate --min-accuracy 0.9]
 *
 * Izvjestaj sadrzi SAMO brojeve (metrike, pragovi, latencija, razlozi suzdrzavanja), nikad tekst
 * zapisa ni caseId, pa se smije objaviti. Zlatni skup ostaje lokalno. Manifest i prag uvijek
 * dolaze iz registra; `--calibrate` samo PREDLAZE prag za rucni unos u registar.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { VERDICTS, validateDecisionCase } from './contracts-v2.ts';
import type { LayaDecisionCaseV2, LayaVerdict } from './contracts-v2.ts';
import { loadRegistry, pinnedModel } from './registry.ts';
import { httpLayaClient } from './runtime-client.ts';
import { adjudicateCases } from './runner.ts';
import type { CaseRunOutput } from './runner.ts';
import { baselineCurrentHeuristic, baselineMajority, coverageCurve, evaluate, optionOrderInstability, orderInstabilityApplies, selectThreshold } from './eval.ts';
import type { EvalRow } from './eval.ts';

export interface GoldSet {
  schemaVersion: 1;
  datasetId: string;
  split: 'calibration' | 'test';
  items: { case: LayaDecisionCaseV2; gold: LayaVerdict }[];
}

export function loadGoldSet(value: unknown): GoldSet {
  const v = value as Partial<GoldSet> | null;
  if (!v || v.schemaVersion !== 1 || typeof v.datasetId !== 'string' || !['calibration', 'test'].includes(v.split as string)
    || !Array.isArray(v.items) || !v.items.length) throw new Error('Zlatni skup nije valjan (schemaVersion, datasetId, split, items).');
  const seen = new Set<string>();
  const items = v.items.map((item, i) => {
    if (!VERDICTS.includes(item?.gold as LayaVerdict)) throw new Error(`Zlatni skup: stavka ${i} nema valjanu oznaku.`);
    let c: LayaDecisionCaseV2;
    try { c = validateDecisionCase(item.case); } catch { throw new Error(`Zlatni skup: stavka ${i} nije valjan case.`); }
    if (seen.has(c.caseId)) throw new Error(`Zlatni skup: stavka ${i} ponavlja caseId.`);
    seen.add(c.caseId);
    return { case: c, gold: item.gold as LayaVerdict };
  });
  return { schemaVersion: 1, datasetId: v.datasetId, split: v.split as GoldSet['split'], items };
}

/** Vjerojatnosti iz sirovog odgovora samo ako su vezane uz case i potpune; inace null. */
function rawProbabilities(raw: unknown, c: LayaDecisionCaseV2): Record<LayaVerdict, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { caseId?: unknown; inputDigest?: unknown; probabilities?: Record<string, unknown> };
  if (r.caseId !== c.caseId || r.inputDigest !== c.inputDigest || !r.probabilities || typeof r.probabilities !== 'object') return null;
  const out = {} as Record<LayaVerdict, number>;
  for (const v of VERDICTS) {
    const p = r.probabilities[v];
    if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) return null;
    out[v] = p;
  }
  return out;
}

function rowsFrom(gold: GoldSet, run: CaseRunOutput): EvalRow[] {
  return gold.items.map((item, i) => {
    const a = run.adjudications[i];
    return { caseId: item.case.caseId, gold: item.gold, prediction: a.status === 'adjudicated' ? a.verdict : null,
      probabilities: rawProbabilities(run.raw[i], item.case) };
  });
}

function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

const argValue = (args: string[], name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

export async function runEvalCli(args: string[]): Promise<number> {
  const goldPath = argValue(args, '--gold');
  const endpoint = argValue(args, '--endpoint');
  const modelKey = argValue(args, '--model-key');
  if (!goldPath || !endpoint || !modelKey) {
    console.error('Naredba: npm run laya:eval -- --gold <gold.json> --endpoint http://127.0.0.1:8765 --model-key <kljuc> [--out <izvjestaj.json>]');
    return 2;
  }
  const registry = loadRegistry(JSON.parse(readFileSync(argValue(args, '--registry') ?? 'scripts/laya/registry.json', 'utf8')));
  const gold = loadGoldSet(JSON.parse(readFileSync(goldPath, 'utf8')));
  const client = httpLayaClient(endpoint);
  const cases = gold.items.map((i) => i.case);

  const natural = await adjudicateCases({ cases, client, registry, modelKey });
  if (!natural.modelDigest) { console.error(`Kljuc "${modelKey}" nije u registru; bez pinanog modela nema evaluacije.`); return 1; }
  const orderApplies = orderInstabilityApplies(pinnedModel(registry, modelKey)?.manifest.runtimeVersion ?? '');
  const reversed = orderApplies ? await adjudicateCases({ cases, client, registry, modelKey, labelOrder: [...VERDICTS].reverse() }) : null;

  const rows = rowsFrom(gold, natural);
  const reasons: Record<string, number> = {};
  for (const a of natural.adjudications) if (a.status === 'no_adjudication') reasons[a.reason] = (reasons[a.reason] ?? 0) + 1;
  const verdicts = (run: CaseRunOutput) => new Map(gold.items.map((item, i) => {
    const probs = rawProbabilities(run.raw[i], item.case);
    return [item.case.caseId, probs ? VERDICTS.reduce((b, v) => (probs[v] > probs[b] ? v : b), VERDICTS[0]) : null] as const;
  }));
  const thresholds = Array.from({ length: 19 }, (_, i) => Math.round(5 * (i + 1)) / 100);
  const minAccuracy = Number(argValue(args, '--min-accuracy') ?? '0.9');

  const report = {
    schemaVersion: 1, datasetId: gold.datasetId, split: gold.split, n: rows.length, modelKey, modelDigest: natural.modelDigest,
    runtimeAnswered: natural.raw.filter((r) => r !== null).length,
    noAdjudicationReasons: reasons,
    laya: evaluate(rows),
    coverageCurve: coverageCurve(rows, thresholds),
    optionOrderInstability: reversed ? optionOrderInstability(verdicts(natural), verdicts(reversed)) : null,
    optionOrderInstabilityApplicable: orderApplies,
    latencyMs: { median: percentile(natural.latenciesMs, 0.5), p95: percentile(natural.latenciesMs, 0.95) },
    baselines: { currentHeuristic: evaluate(baselineCurrentHeuristic(rows)), majority: evaluate(baselineMajority(rows)) },
    suggestedThreshold: args.includes('--calibrate')
      ? (gold.split === 'calibration' ? selectThreshold(rows, minAccuracy, thresholds) : 'samo na calibration splitu')
      : undefined,
  };
  const text = JSON.stringify(report, null, 2);
  const out = argValue(args, '--out');
  if (out) writeFileSync(out, `${text}\n`); else console.log(text);
  return 0;
}
