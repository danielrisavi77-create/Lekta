export interface DispatchRun {
  run_id?: unknown;
}

export interface DispatchOptions {
  appUrl: string;
  workerToken: string;
  timeoutMs: number;
  fetchImpl?: DispatcherFetch;
  maxRuns?: number;
  /**
   * Trenutak do kojeg se smije dispatchati (ms od epohe). Kad se dosegne, preostali runovi se NE
   * salju i prijavljuju se kao odgodjeni (audit OPS-19).
   *
   * Bez ovoga je jedan tick mogao trajati do 10 runova x 180 s = 30 minuta, jer je petlja
   * serijska. Edge funkcija toliko ne zivi, pa bi je runtime prekinuo na pola: dio runova bi bio
   * poslan, dio ne, a pozivatelj ne bi znao dokle se stiglo.
   */
  deadlineAt?: number;
}

export interface DispatchResult {
  runId: string;
  status: number;
}

export interface DispatchBatchResult {
  results: DispatchResult[];
  failed: number;
  /** Runovi koji nisu ni pokusani jer je istekao budzet ticka; sljedeci tick ih preuzima. */
  deferred: number;
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
  let deferred = 0;

  const selected = runs.slice(0, maxRuns);
  for (let i = 0; i < selected.length; i++) {
    const run = selected[i];
    // Budzet ticka: prekini PRIJE novog poziva, ne usred njega. Preostali runovi ostaju
    // neposlani i uredno se prijavljuju, umjesto da ih runtime presijece na pola.
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) {
      deferred = selected.length - i;
      break;
    }
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
    deferred,
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
