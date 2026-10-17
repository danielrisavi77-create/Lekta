import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepairOutcome, RepairRequestServerState } from '../src/report/repair-client';
import { confirmSeparateRepairAttempt, createRepairRequestIdentity, createRepairRequestOwnerResolver, createRepairRequestStatusChecker, prepareRepairRequestRecovery, renderRepairAuthTimeoutRecovery, renderRepairRequestOutcome, REPAIR_REQUEST_STATUS_CHECK_TIMEOUT_MS, type RepairRequestRecoveryIdentity } from '../src/ui/repair-request-recovery';
import { renderRepairRecovery } from '../src/ui/repair-recovery-view';
import type { RepairMeta } from '../src/report/repair-client';

const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

afterEach(() => vi.useRealTimers());

function outcome<T extends RepairOutcome['kind']>(kind: T): Extract<RepairOutcome, { kind: T }> {
  switch (kind) {
    case 'request_in_progress': return { kind, requestId: 'request-1' } as Extract<RepairOutcome, { kind: T }>;
    case 'request_completed': return { kind, requestId: 'request-1', jobId: 'job-1' } as Extract<RepairOutcome, { kind: T }>;
    case 'request_completed_unstored':
    case 'request_recovery_unavailable':
    case 'request_no_change':
    case 'request_unknown': return { kind, requestId: 'request-1' } as Extract<RepairOutcome, { kind: T }>;
    default: throw new Error(`Unsupported outcome: ${kind}`);
  }
}

describe('renderRepairRequestOutcome', () => {
  let summary: HTMLElement;
  const hooks = () => ({ retry: vi.fn(), checkExistingRequest: vi.fn(async () => true), openRepairHistory: vi.fn() });

  beforeEach(() => {
    document.body.innerHTML = '';
    summary = document.createElement('section');
    document.body.appendChild(summary);
  });

  it('locks a request that is still processing', () => {
    const actions = hooks();
    const unknown = renderRepairRequestOutcome(summary, outcome('request_in_progress'), actions, esc);

    expect(unknown).toBe(true);
    expect(summary.querySelector('[data-repair-check-jobs]')).not.toBeNull();
    expect(summary.querySelector<HTMLButtonElement>('[data-repair-retry]')?.disabled).toBe(true);
  });

  it('opens repair history for a completed request and keeps retry unavailable', () => {
    const actions = hooks();
    const unknown = renderRepairRequestOutcome(summary, outcome('request_completed'), actions, esc);

    expect(unknown).toBe(true);
    expect(actions.openRepairHistory).toHaveBeenCalledOnce();
    expect(summary.querySelector('[data-repair-retry]')).toBeNull();
  });

  it('allows only the explicit recovery path for a completed but unstored result', () => {
    const unknown = renderRepairRequestOutcome(summary, outcome('request_completed_unstored'), hooks(), esc);

    expect(unknown).toBe(true);
    expect(summary.querySelector<HTMLButtonElement>('[data-repair-retry]')?.disabled).toBe(false);
    expect(summary.textContent).toContain('ne uzima novi plaćeni slot');
  });

  it('keeps unavailable recovery locked and reports no-change as a known result', () => {
    const actions = hooks();
    expect(renderRepairRequestOutcome(summary, outcome('request_recovery_unavailable'), actions, esc)).toBe(true);
    expect(summary.querySelector('[data-repair-retry]')).toBeNull();
    expect(summary.textContent).toContain('siguran oporavak više nije dostupan');

    expect(renderRepairRequestOutcome(summary, outcome('request_no_change'), actions, esc)).toBe(false);
    expect(summary.textContent).toContain('nije našla promjene');
  });
});

describe('renderRepairAuthTimeoutRecovery', () => {
  it('keeps an unknown repair locked if no authoritative status checker survives the timeout', () => {
    const summary = document.createElement('section');
    const setSummary = vi.fn((html: string) => { summary.innerHTML = html; });

    renderRepairAuthTimeoutRecovery(summary, true, null, vi.fn(), setSummary, esc);

    expect(setSummary).toHaveBeenCalledOnce();
    expect(summary.textContent).toContain('ponovni pokušaj ostaje zaključan');
    expect(summary.querySelector('[data-repair-retry]')).toBeNull();
  });
});

describe('createRepairRequestStatusChecker', () => {
  const state = (status: RepairRequestServerState['status'], jobId: string | null = null): RepairRequestServerState => ({ status, jobId });

  function checker(result: RepairRequestServerState | { error: RepairOutcome }, historyResult?: boolean) {
    const summary = document.createElement('section');
    summary.innerHTML = '<p data-repair-recovery-status></p>';
    const openRepairHistory = vi.fn(async () => historyResult);
    const checkRepairRequestStatus = vi.fn(async () => result);
    let currentUserId: string | null = 'user-a';
    const check = createRepairRequestStatusChecker({
      requestId: 'request-1',
      requestUserId: 'user-a',
      getCurrentUserId: () => currentUserId,
      loadRepairClient: async () => ({ checkRepairRequestStatus }),
      repairConfig: () => ({ endpoint: '/repair' }),
      token: 'session-token',
      fetcher: fetch,
      summary,
      openRepairHistory,
    });
    return { check, summary, openRepairHistory, checkRepairRequestStatus, setCurrentUserId: (userId: string | null) => { currentUserId = userId; } };
  }

  it('keeps retry locked when a different account would report the request missing', async () => {
    const subject = checker(state('missing'));
    subject.setCurrentUserId('user-b');

    await expect(subject.check()).resolves.toBe(false);
    expect(subject.checkRepairRequestStatus).not.toHaveBeenCalled();
    expect(subject.openRepairHistory).not.toHaveBeenCalled();
    expect(subject.summary.textContent).toContain('prijava poslala izvorni popravak');
  });

  it('keeps retry locked if the account changes while the status check is pending', async () => {
    let currentUserId: string | null = 'user-a';
    const summary = document.createElement('section');
    summary.innerHTML = '<p data-repair-recovery-status></p>';
    const checkRepairRequestStatus = vi.fn(async () => {
      currentUserId = 'user-b';
      return state('missing');
    });
    const check = createRepairRequestStatusChecker({
      requestId: 'request-1',
      requestUserId: 'user-a',
      getCurrentUserId: () => currentUserId,
      loadRepairClient: async () => ({ checkRepairRequestStatus }),
      repairConfig: () => ({ endpoint: '/repair' }),
      token: 'session-token',
      fetcher: fetch,
      summary,
      openRepairHistory: vi.fn(),
    });

    await expect(check()).resolves.toBe(false);
    expect(checkRepairRequestStatus).toHaveBeenCalledOnce();
    expect(summary.textContent).toContain('statusa i ponovni pokušaj ostaju zaključani');
  });

  it('rechecks the original identity after loading history for a missing request', async () => {
    let currentUserId: string | null = 'user-a';
    const summary = document.createElement('section');
    summary.innerHTML = '<p data-repair-recovery-status></p>';
    const checkRepairRequestStatus = vi.fn(async () => state('missing'));
    const check = createRepairRequestStatusChecker({
      requestId: 'request-1',
      requestUserId: 'user-a',
      getCurrentUserId: () => currentUserId,
      loadRepairClient: async () => ({ checkRepairRequestStatus }),
      repairConfig: () => ({ endpoint: '/repair' }),
      token: 'session-token',
      fetcher: fetch,
      summary,
      openRepairHistory: vi.fn(async () => { currentUserId = 'user-b'; return true; }),
    });

    await expect(check()).resolves.toBe(false);
    expect(summary.textContent).toContain('statusa i ponovni pokušaj ostaju zaključani');
  });

  it('keeps the original owner for the same request after the current account changes', () => {
    let currentUserId: string | null = 'user-a';
    const resolveOwner = createRepairRequestOwnerResolver(() => currentUserId);

    expect(resolveOwner('request-1')).toBe('user-a');
    currentUserId = 'user-b';
    expect(resolveOwner('request-1')).toBe('user-a');
    expect(resolveOwner('request-2')).toBe('user-b');
    resolveOwner.forget('request-1');
    expect(resolveOwner('request-1')).toBe('user-b');
  });

  it.each(['missing', 'retryable'] as const)('allows retry only when the server confirms %s', async (status) => {
    const subject = checker(state(status));
    await expect(subject.check()).resolves.toBe(true);
    expect(subject.checkRepairRequestStatus).toHaveBeenCalledOnce();
    expect(subject.openRepairHistory).toHaveBeenCalledOnce();
  });

  it('keeps retry locked if history cannot load after the server confirms the request is retryable', async () => {
    await expect(checker(state('missing'), false).check()).resolves.toBe(false);
  });

  it('renews access through repair history before rechecking a rejected status request', async () => {
    let token = 'expired-token';
    const checkRepairRequestStatus: typeof import('../src/report/repair-client').checkRepairRequestStatus = async (_config, accessToken) => (
      accessToken === 'expired-token'
        ? { error: { kind: 'error', status: 401, message: 'session expired' } }
        : state('missing')
    );
    const checkStatus = vi.fn(checkRepairRequestStatus);
    const openRepairHistory = vi.fn(async () => { token = 'fresh-token'; return true; });
    const check = createRepairRequestStatusChecker({
      requestId: 'request-1',
      requestUserId: 'user-a',
      getCurrentUserId: () => 'user-a',
      loadRepairClient: async () => ({ checkRepairRequestStatus: checkStatus }),
      repairConfig: () => ({ endpoint: '/repair' }),
      token: 'expired-token',
      getAccessToken: async () => token,
      fetcher: fetch,
      summary: document.createElement('section'),
      openRepairHistory,
    });

    await expect(check()).resolves.toBe(true);
    expect(checkStatus.mock.calls.map((call) => call[1])).toEqual(['expired-token', 'fresh-token']);
    expect(openRepairHistory).toHaveBeenCalledOnce();
  });

  it('does not unlock a processing request', async () => {
    const subject = checker(state('processing'));
    await expect(subject.check()).resolves.toBe(false);
    expect(subject.summary.textContent).toContain('još u obradi');
  });

  it('confirms completion by opening history without unlocking retry', async () => {
    const subject = checker(state('completed', 'job-1'));
    await expect(subject.check()).resolves.toBe(false);
    expect(subject.openRepairHistory).toHaveBeenCalledOnce();
    expect(subject.summary.textContent).toContain('spremljenu kopiju');
  });

  it('allows only the completed_unstored recovery and fails closed on lookup errors', async () => {
    await expect(checker(state('completed_unstored')).check()).resolves.toBe(true);
    await expect(checker(state('unknown')).check()).resolves.toBe(false);
    await expect(checker({ error: { kind: 'error', message: 'offline' } }).check()).resolves.toBe(false);
  });

  it('aborts a status request that never settles, unlocks only another status check, and keeps repair retry locked', async () => {
    vi.useFakeTimers();
    const summary = document.createElement('section');
    document.body.appendChild(summary);
    let signal: AbortSignal | undefined;
    const checkRepairRequestStatus = vi.fn(async (
      _config: any,
      _token: string,
      _requestId: string,
      _fetcher: typeof fetch,
      requestSignal?: AbortSignal,
    ) => {
      signal = requestSignal;
      return new Promise<RepairRequestServerState>(() => {});
    }) as unknown as typeof import('../src/report/repair-client').checkRepairRequestStatus;
    const check = createRepairRequestStatusChecker({
      requestId: 'request-1',
      requestUserId: 'user-a',
      getCurrentUserId: () => 'user-a',
      loadRepairClient: async () => ({ checkRepairRequestStatus }),
      repairConfig: () => ({ endpoint: '/repair' }),
      token: 'session-token',
      fetcher: fetch,
      summary,
      openRepairHistory: vi.fn(async () => true),
    });
    renderRepairRecovery(summary, { action: 'check-existing-job', retryAllowed: false, message: 'Ishod popravka nije poznat.' }, {
      retry: vi.fn(),
      openJobs: check,
    }, esc);

    const checkButton = summary.querySelector<HTMLButtonElement>('[data-repair-check-jobs]')!;
    const retryButton = summary.querySelector<HTMLButtonElement>('[data-repair-retry]')!;
    const click = checkButton.onclick;
    expect(click).toBeTypeOf('function');
    const pending = Promise.resolve(click!.call(checkButton, new MouseEvent('click')));
    expect(checkButton.disabled).toBe(true);
    await vi.advanceTimersByTimeAsync(REPAIR_REQUEST_STATUS_CHECK_TIMEOUT_MS);
    await pending;

    expect(signal?.aborted).toBe(true);
    expect(checkButton.disabled).toBe(false);
    expect(retryButton.disabled).toBe(true);
    expect(summary.querySelector<HTMLElement>('[data-repair-recovery-status]')?.hidden).toBe(false);
    expect(summary.textContent).toContain('Provjera statusa nije završila na vrijeme');
    vi.useRealTimers();
  });

  it('bounds access-token refresh and passes the timeout signal into the refresh', async () => {
    vi.useFakeTimers();
    const summary = document.createElement('section');
    summary.innerHTML = '<p data-repair-recovery-status></p>';
    let signal: AbortSignal | undefined;
    const checkRepairRequestStatus = vi.fn(async () => state('missing'));
    const check = createRepairRequestStatusChecker({
      requestId: 'request-1',
      requestUserId: 'user-a',
      getCurrentUserId: () => 'user-a',
      getAccessToken: (requestSignal) => {
        signal = requestSignal;
        return new Promise<string | null>(() => {});
      },
      loadRepairClient: async () => ({ checkRepairRequestStatus }),
      repairConfig: () => ({ endpoint: '/repair' }),
      token: 'session-token',
      fetcher: fetch,
      summary,
      openRepairHistory: vi.fn(async () => true),
    });
    const pending = check();
    await vi.advanceTimersByTimeAsync(REPAIR_REQUEST_STATUS_CHECK_TIMEOUT_MS);

    await expect(pending).resolves.toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(checkRepairRequestStatus).not.toHaveBeenCalled();
    expect(summary.textContent).toContain('Provjera statusa nije završila na vrijeme');
    vi.useRealTimers();
  });
});

describe('prepareRepairRequestRecovery identity binding', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const meta = {
    workType: 'diplomski',
    signals: { words: 12000, titleMarker: 'diplomski' },
    requests: [{ fixerId: 'spacing-fixer', ruleId: 'line-spacing', params: { multiplier: 1.5 } }],
    profileRef: 'hks-sestrinstvo',
    consentVersion: 'terms-v1',
  } as unknown as RepairMeta;

  async function originalIdentity(userId = 'user-a'): Promise<RepairRequestRecoveryIdentity> {
    const identity = await createRepairRequestIdentity(bytes, meta);
    if (!identity.requestId) throw new Error('Expected a deterministic request id');
    return { ...identity, requestUserId: userId };
  }

  function options(overrides: Partial<Parameters<typeof prepareRepairRequestRecovery>[0]> = {}) {
    const summary = document.createElement('section');
    const setSummary = vi.fn((html: string) => { summary.innerHTML = html; });
    const getCurrentUserId = vi.fn(() => 'user-a');
    const resolveRequestUserId = vi.fn(() => 'user-a');
    const retry = vi.fn();
    const startNewRepair = vi.fn();
    const setOutcomeUnknown = vi.fn();
    const base: Parameters<typeof prepareRepairRequestRecovery>[0] = {
      loadRepairClient: async () => ({ checkRepairRequestStatus: async () => ({ status: 'missing', jobId: null }) }),
      repairConfig: () => ({ endpoint: '/repair' }),
      token: 'session-token',
      getCurrentUserId,
      fetcher: fetch,
      summary,
      openRepairHistory: vi.fn(async () => true),
      resolveRequestUserId,
      recoveryIdentity: null,
      fileBytes: bytes,
      meta,
      setSummary,
      retry,
      startNewRepair,
      setOutcomeUnknown,
    };
    return {
      ...base,
      ...overrides,
      summary,
      setSummary,
      getCurrentUserId: overrides.getCurrentUserId ?? getCurrentUserId,
      resolveRequestUserId: overrides.resolveRequestUserId ?? resolveRequestUserId,
      retry: overrides.retry ?? retry,
      startNewRepair: overrides.startNewRepair ?? startNewRepair,
      setOutcomeUnknown: overrides.setOutcomeUnknown ?? setOutcomeUnknown,
    };
  }

  it('accepts only the exact original request and returns its pinned recovery identity', async () => {
    const pinned = await originalIdentity();
    const subject = options({ recoveryIdentity: pinned });
    const prepared = await prepareRepairRequestRecovery(subject);

    expect(prepared?.requestId).toBe(pinned.requestId);
    expect(prepared?.requestFingerprint).toBe(pinned.requestFingerprint);
    expect(prepared?.createPending(new AbortController().signal)).toMatchObject({
      requestId: pinned.requestId,
      requestFingerprint: pinned.requestFingerprint,
    });
    expect(subject.resolveRequestUserId).not.toHaveBeenCalled();
  });

  it('blocks a changed selection and offers a separately confirmed new repair', async () => {
    const pinned = await originalIdentity();
    const changedMeta = { ...meta, requests: [{ fixerId: 'font-fixer', ruleId: 'font', params: { name: 'Book Antiqua' } }] } as unknown as RepairMeta;
    const changedIdentity = await createRepairRequestIdentity(bytes, changedMeta);
    const subject = options({ recoveryIdentity: pinned, meta: changedMeta });

    await expect(prepareRepairRequestRecovery(subject)).resolves.toBeNull();
    expect(subject.setOutcomeUnknown).toHaveBeenCalledWith(true);
    expect(subject.resolveRequestUserId).not.toHaveBeenCalled();
    expect(subject.summary.textContent).toContain('razlikuju se od izvornog zahtjeva');
    expect(subject.summary.querySelector('[data-repair-start-new]')).not.toBeNull();
    subject.summary.querySelector<HTMLButtonElement>('[data-repair-start-new]')?.click();
    expect(subject.startNewRepair).toHaveBeenCalledWith(pinned, changedIdentity.requestId);
  });

  it('blocks reuse of the original recovery identity by a different account', async () => {
    const pinned = await originalIdentity();
    const subject = options({
      recoveryIdentity: pinned,
      getCurrentUserId: vi.fn(() => 'user-b'),
    });

    await expect(prepareRepairRequestRecovery(subject)).resolves.toBeNull();
    expect(subject.resolveRequestUserId).not.toHaveBeenCalled();
    expect(subject.summary.querySelector('[data-repair-start-new]')).not.toBeNull();
  });
});

describe('confirmSeparateRepairAttempt', () => {
  it('does not start a separate repair without explicit confirmation', () => {
    const start = vi.fn();
    const confirm = vi.fn(() => false);

    confirmSeparateRepairAttempt(confirm, start);

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Izvorni zahtjev možda još traje'));
    expect(start).not.toHaveBeenCalled();
  });

  it('continues only after explicit confirmation', () => {
    const start = vi.fn();

    confirmSeparateRepairAttempt(() => true, start);

    expect(start).toHaveBeenCalledOnce();
  });
});
