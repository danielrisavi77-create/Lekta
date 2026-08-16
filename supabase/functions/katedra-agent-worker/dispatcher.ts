export interface DispatchRun {
  run_id?: unknown;
}

export interface DispatchOptions {
  appUrl: string;
  workerToken: string;
  timeoutMs: number;
  fetchImpl?: DispatcherFetch;
  maxRuns?: number;
}

export interface DispatchResult {
  runId: string;
  status: number;
}

export interface DispatchBatchResult {
  results: DispatchResult[];
  failed: number;
}

export type DispatcherFetch = (input: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_BATCH = 4;
const MAX_BATCH = 10;
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/u;

export async function dispatchAgentRuns(
  runs: DispatchRun[],
  options: DispatchOptions,
): Promise<DispatchBatchResult> {
  const fetchImpl = options.fetchImpl || fetch;
  const appUrl = options.appUrl.replace(/\/$/u, '');
  const maxRuns = normalizeBatch(options.maxRuns);
  const results: DispatchResult[] = [];
  let malformed = 0;

  for (const run of runs.slice(0, maxRuns)) {
    const runId = typeof run.run_id === 'string' ? run.run_id.trim() : '';
    if (!RUN_ID_PATTERN.test(runId)) {
      malformed += 1;
      continue;
    }

    try {
      const response = await fetchWithTimeout(fetchImpl, `${appUrl}/api/internal/agent-worker`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-katedra-agent-worker-token': options.workerToken,
        },
        body: JSON.stringify({ runId }),
      }, options.timeoutMs);
      results.push({ runId, status: response.status });
    } catch {
      results.push({ runId, status: 599 });
    }
  }

  return {
    results,
    failed: malformed + results.filter((result) => result.status < 200 || result.status >= 300).length,
  };
}

function normalizeBatch(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.max(1, Math.trunc(value as number)));
}

async function fetchWithTimeout(
  fetchImpl: DispatcherFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const duration = Number.isFinite(timeoutMs) ? Math.max(1, Math.floor(timeoutMs)) : 180_000;
  const timer = setTimeout(() => controller.abort(), duration);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
