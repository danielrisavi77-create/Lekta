// @vitest-environment node
/**
 * `summarizeUsage` je cista funkcija (bez I/O): svi ulazi u ovom testu su podmetnuti zapisi, nikad
 * stvarni `usage.jsonl`. Oblik zapisa odgovara onome sto stvarno pise `scripts/agents/cli.mjs`
 * (`observedAt`, `usage.inputTokens`/`outputTokens`/`cachedInputTokens`, kamelCase, ne snake_case).
 */
import { describe, expect, it } from 'vitest';
import { renderReport, resolveSinceDate, summarizeUsage } from '../scripts/agents/usage-report.mjs';

const COST_WEIGHTS = { 'claude-sonnet-5': 1, 'claude-opus-5': 2.5, 'claude-haiku-4-5': 0.5 };

function record(overrides: Record<string, unknown> = {}) {
  return {
    observedAt: '2026-09-25T10:00:00.000Z',
    task: 'T50',
    phase: 'implement',
    agent: 'sonnet',
    provider: 'claude',
    requestedModel: 'claude-sonnet-5',
    reportedModels: ['claude-sonnet-5'],
    usage: { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 200 },
    exitCode: 0,
    status: 'needs_verification',
    ...overrides,
  };
}

describe('summarizeUsage: agregacija podmetnutih zapisa', () => {
  it('prazan niz zapisa: nula poziva, bez pada', () => {
    const summary = summarizeUsage([], {});
    expect(summary.totalCalls).toBe(0);
    expect(summary.recordsConsidered).toBe(0);
    expect(summary.cacheShare).toBeNull();
  });

  it('broji pozive i padove tocno', () => {
    const records = [record(), record({ status: 'failed', exitCode: 1 }), record()];
    const summary = summarizeUsage(records, { costWeights: COST_WEIGHTS });
    expect(summary.totalCalls).toBe(3);
    expect(summary.totalFailed).toBe(1);
  });

  it('zbraja tokene po provideru, modelu, fazi i zadatku', () => {
    const records = [
      record({ provider: 'claude', phase: 'implement', task: 'T50' }),
      record({ provider: 'grok', phase: 'review', task: 'T51', agent: 'grok', requestedModel: 'grok-4.6-build', reportedModels: ['grok-4.6-build'] }),
    ];
    const summary = summarizeUsage(records, { costWeights: COST_WEIGHTS });
    expect(summary.byProvider.claude.calls).toBe(1);
    expect(summary.byProvider.grok.calls).toBe(1);
    expect(summary.byProvider.claude.inputTokens).toBe(1000);
    expect(summary.byPhase.implement.calls).toBe(1);
    expect(summary.byPhase.review.calls).toBe(1);
    expect(summary.byTask.T50.calls).toBe(1);
    expect(summary.byTask.T51.calls).toBe(1);
    expect(summary.totalInputTokens).toBe(2000);
    expect(summary.totalOutputTokens).toBe(1000);
  });

  it('zapis bez usage polja: ne rusi agregaciju, dodaje upozorenje, tokeni ostaju null/nedirnuti', () => {
    const withoutUsage = record({ usage: undefined });
    delete (withoutUsage as Record<string, unknown>).usage;
    const summary = summarizeUsage([withoutUsage], { costWeights: COST_WEIGHTS });
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalInputTokens).toBeNull();
    expect(summary.warnings.some((w) => /bez usage polja/.test(w))).toBe(true);
  });

  it('nepoznat model bez costWeighta: tezina null i upozorenje, ne izmisljena vrijednost', () => {
    const summary = summarizeUsage(
      [record({ requestedModel: 'buduci-model-2027', reportedModels: [] })],
      { costWeights: COST_WEIGHTS },
    );
    const bucket = summary.byModel['buduci-model-2027'];
    expect(bucket).toBeTruthy();
    expect(bucket.costWeight).toBeNull();
    expect(bucket.weightedTokens).toBeNull();
    expect(summary.warnings.some((w) => /buduci-model-2027/.test(w))).toBe(true);
  });

  it('poznat model dobiva primijenjenu tezinu kvote na ulaz+izlaz', () => {
    const summary = summarizeUsage([record()], { costWeights: COST_WEIGHTS });
    const bucket = summary.byModel['claude-sonnet-5'];
    expect(bucket.costWeight).toBe(1);
    expect(bucket.weightedTokens).toBe(1500); // (1000 + 500) * 1
  });

  it('reportedModels ima prednost nad requestedModel', () => {
    const summary = summarizeUsage(
      [record({ requestedModel: 'claude-sonnet-5', reportedModels: ['claude-opus-5'] })],
      { costWeights: COST_WEIGHTS },
    );
    expect(summary.byModel['claude-opus-5']).toBeTruthy();
    expect(summary.byModel['claude-sonnet-5']).toBeUndefined();
  });

  it('bez reportedModels pada na requestedModel', () => {
    const summary = summarizeUsage(
      [record({ reportedModels: [] })],
      { costWeights: COST_WEIGHTS },
    );
    expect(summary.byModel['claude-sonnet-5']).toBeTruthy();
  });

  it('udio kesa: cache_read / (input + cache_read), agregirano', () => {
    const summary = summarizeUsage(
      [record({ usage: { inputTokens: 800, outputTokens: 100, cachedInputTokens: 200 } })],
      { costWeights: COST_WEIGHTS },
    );
    expect(summary.cacheShare).toBeCloseTo(200 / 1000, 5);
  });

  it('granica razdoblja: zapis TOCNO na sinceDate je ukljucen, zapis prije nije', () => {
    const boundary = new Date('2026-09-20T00:00:00.000Z');
    const records = [
      record({ observedAt: '2026-09-20T00:00:00.000Z', task: 'na-granici' }),
      record({ observedAt: '2026-09-19T23:59:59.999Z', task: 'prije-granice' }),
      record({ observedAt: '2026-09-21T00:00:00.000Z', task: 'nakon-granice' }),
    ];
    const summary = summarizeUsage(records, { sinceDate: boundary, costWeights: COST_WEIGHTS });
    expect(summary.recordsConsidered).toBe(2);
    expect(summary.byTask['na-granici']).toBeTruthy();
    expect(summary.byTask['nakon-granice']).toBeTruthy();
    expect(summary.byTask['prije-granice']).toBeUndefined();
  });

  it('sinceDate null (--all) ukljucuje sve zapise bez obzira na datum', () => {
    const records = [
      record({ observedAt: '2020-01-01T00:00:00.000Z' }),
      record({ observedAt: '2026-09-25T00:00:00.000Z' }),
    ];
    const summary = summarizeUsage(records, { sinceDate: null, costWeights: COST_WEIGHTS });
    expect(summary.recordsConsidered).toBe(2);
  });

  it('nikad ne mutira ulazni niz zapisa', () => {
    const records = [record()];
    const snapshot = JSON.parse(JSON.stringify(records));
    summarizeUsage(records, { costWeights: COST_WEIGHTS });
    expect(records).toEqual(snapshot);
  });
});

describe('resolveSinceDate: parsiranje --since', () => {
  const now = new Date('2026-09-26T12:00:00.000Z');

  it('"all" ili prazno vraca null (bez granice)', () => {
    expect(resolveSinceDate('all', now)).toBeNull();
    expect(resolveSinceDate(undefined, now)).toBeNull();
  });

  it('relativni oblik "7d" oduzima 7 dana od "now"', () => {
    const result = resolveSinceDate('7d', now);
    expect(result?.toISOString()).toBe('2026-09-19T12:00:00.000Z');
  });

  it('relativni oblik "24h" oduzima 24 sata', () => {
    const result = resolveSinceDate('24h', now);
    expect(result?.toISOString()).toBe('2026-09-25T12:00:00.000Z');
  });

  it('apsolutan ISO datum se parsira izravno', () => {
    const result = resolveSinceDate('2026-09-19', now);
    expect(result?.toISOString()).toBe('2026-09-19T00:00:00.000Z');
  });

  it('neprepoznat oblik baca gresku umjesto da tiho vrati null', () => {
    expect(() => resolveSinceDate('prosli-tjedan', now)).toThrow();
  });
});

describe('renderReport: "nema zapisa" i exit 0 put', () => {
  it('bez zapisa u razdoblju ispisuje "nema zapisa" bez rusenja', () => {
    const summary = summarizeUsage([], {});
    const text = renderReport(summary, { sinceLabel: 'od 2026-09-19' });
    expect(text).toMatch(/nema zapisa/);
  });

  it('sa zapisima ispisuje brojeve poziva i tokena', () => {
    const summary = summarizeUsage([record()], { costWeights: COST_WEIGHTS });
    const text = renderReport(summary, { sinceLabel: 'sve' });
    expect(text).toMatch(/Pozivi ukupno: 1/);
    expect(text).toMatch(/claude-sonnet-5/);
  });
});
