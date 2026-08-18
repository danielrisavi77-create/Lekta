import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { dispatchAgentRuns } from '../supabase/functions/katedra-agent-worker/dispatcher';

const indexSource = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'functions', 'katedra-agent-worker', 'index.ts'),
  'utf8',
);
const dispatcherSource = readFileSync(
  join(import.meta.dirname, '..', 'supabase', 'functions', 'katedra-agent-worker', 'dispatcher.ts'),
  'utf8',
);
const source = `${indexSource}\n${dispatcherSource}`;

describe('agent worker dispatcher contract', () => {
  it('uses a dedicated cron secret and never exposes service-role auth to Katedra', () => {
    expect(source).toContain('KATEDRA_AGENT_WORKER_CRON_SECRET');
    expect(source).toContain('isCronAuthorized');
    expect(source).toContain('x-katedra-agent-worker-token');
    expect(source).not.toContain('Authorization: `Bearer ${SERVICE_ROLE_KEY}`');
  });

  it('dispatches only pending/running runs and reports failed callbacks for retry', () => {
    expect(source).toContain(".in('status', ['pending', 'running'])");
    expect(source).toContain('/api/internal/agent-worker');
    expect(source).toContain('failed');
  });

  it('dispatches runs sequentially with the worker token and no service-role header', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push(`${url}:${headers.get('x-katedra-agent-worker-token')}:${headers.get('authorization') || ''}`);
      return new Response('{}', { status: 200 });
    });

    const result = await dispatchAgentRuns(
      [{ run_id: 'run-1' }, { run_id: 'run-2' }],
      { appUrl: 'https://katedra.test', workerToken: 'worker-secret', timeoutMs: 180_000, fetchImpl },
    );

    expect(result).toEqual({
      results: [
        { runId: 'run-1', status: 200 },
        { runId: 'run-2', status: 200 },
      ],
      failed: 0,
      deferred: 0,
    });
    expect(calls).toEqual([
      'https://katedra.test/api/internal/agent-worker:worker-secret:',
      'https://katedra.test/api/internal/agent-worker:worker-secret:',
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('maps callback 5xx to a failed dispatch result', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));

    await expect(dispatchAgentRuns([{ run_id: 'run-1' }], {
      appUrl: 'https://katedra.test',
      workerToken: 'worker-secret',
      timeoutMs: 180_000,
      fetchImpl,
    })).resolves.toEqual({
      results: [{ runId: 'run-1', status: 503 }],
      failed: 1,
      deferred: 0,
    });
  });

  it.each([401, 403, 404, 429, 500, 503])('treats callback HTTP %s as a failed dispatch', async (status) => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status }));

    await expect(dispatchAgentRuns([{ run_id: 'run-1' }], {
      appUrl: 'https://katedra.test',
      workerToken: 'worker-secret',
      timeoutMs: 180_000,
      fetchImpl,
    })).resolves.toMatchObject({
      results: [{ runId: 'run-1', status }],
      failed: 1,
      deferred: 0,
    });
  });

  it('rejects invalid run identifiers and caps the batch at ten', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const runs = Array.from({ length: 12 }, (_, index) => ({ run_id: `run-${index}` }));
    runs.push({ run_id: 'run with spaces' });

    await dispatchAgentRuns(runs, {
      appUrl: 'https://katedra.test',
      workerToken: 'worker-secret',
      timeoutMs: 180_000,
      fetchImpl,
      maxRuns: 12,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(10);
  });

  it('reports a malformed queue row as a failed dispatch instead of silently dropping it', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));

    await expect(dispatchAgentRuns([{ run_id: 'run with spaces' }, { run_id: 'run-1' }], {
      appUrl: 'https://katedra.test',
      workerToken: 'worker-secret',
      timeoutMs: 180_000,
      fetchImpl,
    })).resolves.toEqual({
      results: [{ runId: 'run-1', status: 200 }],
      failed: 1,
      deferred: 0,
    });
  });
});

/**
 * BUDZET TICKA (audit OPS-19).
 *
 * Petlja je serijska, a timeout po runu je bio 180 s uz do 10 runova: jedan tick je mogao trajati
 * do 30 minuta. Edge funkcija toliko ne zivi, pa bi je runtime presjekao na pola posla: dio runova
 * poslan, dio ne, i nitko ne zna dokle se stiglo.
 *
 * Nakon budzeta preostali runovi se prijavljuju kao `deferred` i sljedeci tick ih preuzima.
 */
describe('deadlineAt zaustavlja dispatch prije isteka runtimea', () => {
  const runs = [{ run_id: 'a' }, { run_id: 'b' }, { run_id: 'c' }, { run_id: 'd' }];

  it('bez budzeta salje sve', async () => {
    const seen: string[] = [];
    const out = await dispatchAgentRuns(runs, {
      appUrl: 'https://app.example',
      workerToken: 't',
      timeoutMs: 1000,
      maxRuns: 10,
      fetchImpl: async (_u, init) => {
        seen.push(JSON.parse(String(init?.body)).runId);
        return new Response('{}', { status: 200 });
      },
    });
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(out.deferred).toBe(0);
    expect(out.failed).toBe(0);
  });

  it('istekao budzet zaustavlja PRIJE novog poziva i prijavljuje odgodjene', async () => {
    const seen: string[] = [];
    const out = await dispatchAgentRuns(runs, {
      appUrl: 'https://app.example',
      workerToken: 't',
      timeoutMs: 1000,
      maxRuns: 10,
      // Budzet je vec istekao: nijedan run se ne smije poslati.
      deadlineAt: Date.now() - 1,
      fetchImpl: async (_u, init) => {
        seen.push(JSON.parse(String(init?.body)).runId);
        return new Response('{}', { status: 200 });
      },
    });
    expect(seen, 'nijedan poziv se ne smije dogoditi').toEqual([]);
    expect(out.deferred).toBe(4);
    expect(out.results).toEqual([]);
  });

  it('budzet koji istekne usred posla salje pocetak, ostatak odgadja', async () => {
    const seen: string[] = [];
    const start = Date.now();
    const out = await dispatchAgentRuns(runs, {
      appUrl: 'https://app.example',
      workerToken: 't',
      timeoutMs: 1000,
      maxRuns: 10,
      deadlineAt: start + 40,
      fetchImpl: async (_u, init) => {
        seen.push(JSON.parse(String(init?.body)).runId);
        await new Promise((r) => setTimeout(r, 30));
        return new Response('{}', { status: 200 });
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(runs.length);
    expect(out.deferred).toBe(runs.length - seen.length);
  });
});
