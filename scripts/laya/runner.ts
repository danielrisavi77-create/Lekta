/**
 * Laya V2.1 runner: snapshot -> caseovi -> lokalni runtime -> adjudicate() s manifestom i pragom
 * iz pouzdanog registra.
 *
 * Nacela (LAYA_V2_SPEC.md, odj. 10 i 12):
 *  - manifest i prag dolaze SAMO iz registra po kljucu pozivatelja; sto god runtime vrati o sebi
 *    (manifest, prag, politika) ne ulazi u odluku osim kroz usporedbu s pinanim vrijednostima;
 *  - bez pinanog modela nema inferencije: svaki case je `runtime_unavailable`;
 *  - runner nikad ne baca i nikad ne mijenja rezultat analize; vraca samo savjetodavne zapise;
 *  - cache kljuc je `inputDigest:modelDigest`.
 */
import { SCHEMA_VERSION, TASK_ID, VERDICTS, adjudicate, modelView } from './contracts-v2.ts';
import type { LayaDecisionCaseV2, LayaVerdict, SemanticAdjudication } from './contracts-v2.ts';
import { buildLayaCandidates } from './candidate-builder.ts';
import type { CandidateSnapshot, SkippedCandidate } from './candidate-builder.ts';
import { pinnedModel } from './registry.ts';
import type { LayaRegistry } from './registry.ts';
import type { LayaRuntimeClient } from './runtime-client.ts';

export interface LayaRunInput {
  snapshot: CandidateSnapshot;
  client: LayaRuntimeClient;
  registry: LayaRegistry;
  modelKey: string;
  cache?: Map<string, unknown>;
  /** Zadano VERDICTS; permutirani redoslijed koristi zaseban cache (odgovor ovisi o redoslijedu). */
  labelOrder?: readonly LayaVerdict[];
}

export interface LayaRunOutput {
  modelDigest: string | null;
  adjudications: SemanticAdjudication[];
  skipped: SkippedCandidate[];
  /** Neispravan snapshot: nijedan case nije izgradjen, analiza ostaje netaknuta. */
  snapshotRejected: boolean;
}

function unavailable(c: LayaDecisionCaseV2): SemanticAdjudication {
  return { schemaVersion: 2, status: 'no_adjudication', caseId: c.caseId, inputDigest: c.inputDigest, reason: 'runtime_unavailable' };
}

export interface CaseRunInput {
  cases: readonly LayaDecisionCaseV2[];
  client: LayaRuntimeClient;
  registry: LayaRegistry;
  modelKey: string;
  cache?: Map<string, unknown>;
  labelOrder?: readonly LayaVerdict[];
}
export interface CaseRunOutput {
  modelDigest: string | null;
  adjudications: SemanticAdjudication[];
  /** Sirovi odgovori po caseu (null na kvar); eval iz njih cita vjerojatnosti, nikad presudu. */
  raw: unknown[];
  latenciesMs: number[];
}

/** Jezgra runnera nad gotovim caseovima (runLaya i eval harness). Nikad ne baca. */
export async function adjudicateCases(input: CaseRunInput): Promise<CaseRunOutput> {
  const cases = [...input.cases];
  let pinned: ReturnType<typeof pinnedModel> = null;
  try { pinned = pinnedModel(input.registry, input.modelKey); } catch { pinned = null; }
  const labelOrder = [...(input.labelOrder ?? VERDICTS)];
  const orderOk = labelOrder.length === VERDICTS.length && VERDICTS.every((v) => labelOrder.includes(v));
  if (!pinned || !orderOk) {
    return { modelDigest: pinned?.modelDigest ?? null, adjudications: cases.map(unavailable), raw: cases.map(() => null), latenciesMs: [] };
  }
  const cache = input.cache ?? new Map<string, unknown>();
  const adjudications: SemanticAdjudication[] = [];
  const raw: unknown[] = [];
  const latenciesMs: number[] = [];
  for (const c of cases) {
    const key = `${c.inputDigest}:${pinned.modelDigest}`;
    let answer: unknown;
    if (cache.has(key)) {
      answer = cache.get(key);
    } else {
      const started = performance.now();
      try {
        answer = await input.client.infer({ schemaVersion: SCHEMA_VERSION, taskId: TASK_ID, caseId: c.caseId,
          inputDigest: c.inputDigest, modelInput: modelView(c), labelOrder });
      } catch {
        answer = null;
      }
      latenciesMs.push(performance.now() - started);
      // Kvar se ne kesira: sljedeci poziv smije pokusati ponovno.
      if (answer !== null && answer !== undefined) cache.set(key, answer);
    }
    raw.push(answer ?? null);
    adjudications.push(adjudicate(answer, c, pinned.manifest, pinned.policy));
  }
  return { modelDigest: pinned.modelDigest, adjudications, raw, latenciesMs };
}

export async function runLaya(input: LayaRunInput): Promise<LayaRunOutput> {
  let cases: LayaDecisionCaseV2[];
  let skipped: SkippedCandidate[];
  try {
    ({ cases, skipped } = buildLayaCandidates(input.snapshot));
  } catch {
    return { modelDigest: null, adjudications: [], skipped: [], snapshotRejected: true };
  }
  const out = await adjudicateCases({ cases, client: input.client, registry: input.registry, modelKey: input.modelKey,
    cache: input.cache, labelOrder: input.labelOrder });
  return { modelDigest: out.modelDigest, adjudications: out.adjudications, skipped, snapshotRejected: false };
}
