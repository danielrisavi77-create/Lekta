import { describe, expect, it } from 'vitest';
import { runLaya } from '../../scripts/laya/runner.ts';
import { loadRegistry } from '../../scripts/laya/registry.ts';
import type { LayaRuntimeClient, LayaInferenceRequest } from '../../scripts/laya/runtime-client.ts';
import { LAYA_FIXTURE_MODEL, makePolicy, makeResult, makeRuntime, makeSnapshot } from '../helpers/laya-v2-fixtures.ts';

const MODEL = LAYA_FIXTURE_MODEL;
const registry = (policy: unknown = makePolicy(), evidence: string | null = 'docs/laya/fixture-kalibracija.md') =>
  loadRegistry({ schemaVersion: 1, entries: [{ entryId: MODEL, manifest: makeRuntime(), policy, calibrationEvidence: evidence }] });

function client(answer: (r: LayaInferenceRequest) => unknown): LayaRuntimeClient & { calls: LayaInferenceRequest[] } {
  const calls: LayaInferenceRequest[] = [];
  return { calls, async infer(r) { calls.push(r); return answer(r); } };
}

describe('Laya runner (V2.1)', () => {
  it('pinani model i valjan odgovor daju savjetodavnu presudu', async () => {
    const c = client(() => makeResult());
    const out = await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: MODEL });
    expect(out.adjudications).toHaveLength(1);
    expect(out.adjudications[0]).toMatchObject({ status: 'adjudicated', verdict: 'finding_supported' });
    expect(c.calls[0].modelInput.text).toBe(makeSnapshot().records[0].text);
  });

  it('bez pinanog modela nema inferencije: runtime_unavailable i nijedan poziv', async () => {
    const c = client(() => makeResult());
    const out = await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: 'nepoznat-kljuc' });
    expect(out.adjudications.map((a) => a.status === 'no_adjudication' && a.reason)).toEqual(['runtime_unavailable']);
    expect(c.calls).toHaveLength(0);
  });

  it('negativna kontrola (Codex A1): runtime koji prijavi drugi manifest i vlastiti prag ne dobiva presudu', async () => {
    const own = { ...makeRuntime(), weightsSha256: '1'.repeat(64) };
    const c = client(() => ({ ...makeResult(), runtime: own }));
    const out = await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: MODEL });
    expect(out.adjudications[0]).toMatchObject({ status: 'no_adjudication', reason: 'weights_mismatch' });

    const withPolicy = client(() => ({ ...makeResult(), policy: { ...makePolicy(), minAnswerConfidence: 0.01 } }));
    const out2 = await runLaya({ snapshot: makeSnapshot(), client: withPolicy, registry: registry(), modelKey: MODEL });
    expect(out2.adjudications[0]).toMatchObject({ status: 'no_adjudication', reason: 'invalid_result' });
  });

  it('prag iz registra, ne iz odgovora: ispod izmjerenog praga nema presude', async () => {
    const c = client(() => ({ ...makeResult(), answerConfidence: 0.2 }));
    const out = await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: MODEL });
    expect(out.adjudications[0]).toMatchObject({ status: 'no_adjudication', reason: 'below_threshold' });
  });

  it('model bez izmjerenog praga daje calibration_missing', async () => {
    const out = await runLaya({ snapshot: makeSnapshot(), client: client(() => makeResult()), registry: registry(null, null), modelKey: MODEL });
    expect(out.adjudications[0]).toMatchObject({ status: 'no_adjudication', reason: 'calibration_missing' });
  });

  it('klijent koji baca ili vraca null daje runtime_unavailable, runner ne baca', async () => {
    const thrower: LayaRuntimeClient = { async infer() { throw new Error('pad'); } };
    for (const c of [thrower, client(() => null)]) {
      const out = await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: MODEL });
      expect(out.adjudications[0]).toMatchObject({ status: 'no_adjudication', reason: 'runtime_unavailable' });
    }
  });

  it('cache kljuc inputDigest:modelDigest sprjecava drugi poziv; kvar se ne kesira', async () => {
    const cache = new Map<string, unknown>();
    const c = client(() => makeResult());
    await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: MODEL, cache });
    await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: MODEL, cache });
    expect(c.calls).toHaveLength(1);

    const failing = client(() => null);
    const cache2 = new Map<string, unknown>();
    await runLaya({ snapshot: makeSnapshot(), client: failing, registry: registry(), modelKey: MODEL, cache: cache2 });
    await runLaya({ snapshot: makeSnapshot(), client: failing, registry: registry(), modelKey: MODEL, cache: cache2 });
    expect(failing.calls).toHaveLength(2);
  });

  it('redoslijed oznaka ide runtimeu; nepotpun redoslijed ne pokrece inferenciju', async () => {
    const c = client(() => makeResult());
    const order = ['insufficient_evidence', 'extraction_uncertain', 'possible_false_positive', 'finding_supported'] as const;
    await runLaya({ snapshot: makeSnapshot(), client: c, registry: registry(), modelKey: MODEL, labelOrder: order });
    expect(c.calls[0].labelOrder).toEqual(order);
    const bad = client(() => makeResult());
    const out = await runLaya({ snapshot: makeSnapshot(), client: bad, registry: registry(), modelKey: MODEL, labelOrder: ['finding_supported'] });
    expect(out.adjudications[0]).toMatchObject({ status: 'no_adjudication', reason: 'runtime_unavailable' });
    expect(bad.calls).toHaveLength(0);
  });

  it('neispravan snapshot ne gradi caseove i ne baca', async () => {
    const bad = { ...makeSnapshot(), documentRevisionId: 'nije-uuid' };
    const c = client(() => makeResult());
    const out = await runLaya({ snapshot: bad, client: c, registry: registry(), modelKey: MODEL });
    expect(out).toMatchObject({ snapshotRejected: true, adjudications: [] });
    expect(c.calls).toHaveLength(0);
  });
});
