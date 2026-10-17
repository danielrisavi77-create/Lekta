import type { RepairClientConfig, RepairMeta, RepairOutcome } from '../report/repair-client';
import { recoveryFor } from '../repair/recovery-policy';
import { awaitAbortable } from '../shared/await-abortable';
import { renderRepairRecovery } from './repair-recovery-view';

type RepairRequestOutcome = Extract<RepairOutcome, { kind:
  | 'request_in_progress'
  | 'request_completed'
  | 'request_completed_unstored'
  | 'request_recovery_unavailable'
  | 'request_no_change'
  | 'request_unknown'
}>;

type RequestStatusCheck = typeof import('../report/repair-client').checkRepairRequestStatus;

export const REPAIR_REQUEST_STATUS_CHECK_TIMEOUT_MS = 30_000;

export interface RepairRequestRecoveryIdentity {
  requestId: string;
  requestFingerprint: string;
  requestUserId: string;
}

export async function createRepairRequestIdentity(fileBytes: Uint8Array, meta: RepairMeta) {
  const identity = await import('../report/repair-request-idempotency');
  const requestFingerprint = await identity.repairRequestFingerprint(fileBytes, meta);
  return { requestFingerprint, requestId: await identity.repairRequestId(requestFingerprint) };
}

interface RepairRequestStatusCheckerDependencies {
  loadRepairClient: () => Promise<{ checkRepairRequestStatus: RequestStatusCheck }>;
  repairConfig: () => RepairClientConfig;
  token: string;
  requestUserId: string | null;
  getCurrentUserId: () => string | null;
  fetcher: typeof fetch;
  summary: HTMLElement;
  openRepairHistory: () => boolean | void | Promise<boolean | void>;
  getAccessToken?: (signal?: AbortSignal) => Promise<string | null>;
}

interface PrepareRepairRequestRecoveryOptions extends Omit<RepairRequestStatusCheckerDependencies, 'requestUserId'> {
  resolveRequestUserId: (requestId: string) => string | null;
  recoveryIdentity: RepairRequestRecoveryIdentity | null;
  fileBytes: Uint8Array;
  meta: RepairMeta;
  setSummary: (html: string) => void;
  retry: (identity: RepairRequestRecoveryIdentity) => void | Promise<void>;
  startNewRepair?: (originalIdentity: RepairRequestRecoveryIdentity, replacementRequestId: string) => void | Promise<void>;
  setOutcomeUnknown: (unknown: boolean) => void;
}

interface RepairRequestStatusCheckerOptions extends RepairRequestStatusCheckerDependencies {
  requestId: string | null;
}

export function createRepairRequestStatusChecker(options: RepairRequestStatusCheckerOptions): () => Promise<boolean> {
  return async () => {
    if (!options.requestId) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPAIR_REQUEST_STATUS_CHECK_TIMEOUT_MS);
    const waitForCheck = <T>(operation: Promise<T>): Promise<T> => awaitAbortable(operation, controller.signal);
    let historyChecked = false;
    const openHistoryOnce = async (): Promise<boolean> => {
      if (historyChecked) return true;
      const loaded = await waitForCheck(Promise.resolve(options.openRepairHistory()));
      if (loaded === false) return false;
      historyChecked = true;
      return true;
    };
    const getAccessToken = async (): Promise<string> => {
      if (!options.getAccessToken) return options.token;
      try {
        return (await waitForCheck(options.getAccessToken(controller.signal))) || '';
      } catch (error) {
        if (controller.signal.aborted) throw error;
        return '';
      }
    };
    const queryStatus = async (token: string) => {
      const { checkRepairRequestStatus } = await waitForCheck(options.loadRepairClient());
      return waitForCheck(checkRepairRequestStatus(options.repairConfig(), token, options.requestId!, options.fetcher, controller.signal));
    };
    const statusEl = options.summary.querySelector<HTMLElement>('[data-repair-recovery-status]');
    const tell = (message: string) => { if (statusEl) statusEl.textContent = message; };
    const sameRequestOwner = () => Boolean(options.requestUserId && options.getCurrentUserId() === options.requestUserId);
    const rejectChangedIdentity = () => {
      tell('Ne mogu potvrditi da je ova prijava poslala izvorni popravak. Provjera statusa i ponovni pokušaj ostaju zaključani; vrati se na izvornu prijavu ili se javi podršci.');
      return false;
    };
    try {
      if (!sameRequestOwner()) return rejectChangedIdentity();
      let token = await getAccessToken();
      if (token && !sameRequestOwner()) return rejectChangedIdentity();
      if (!token) {
        // Refresh may clear an expired session before history can present the explicit sign-in flow.
        // Permit that recovery UI while no account is active, but never query under a different account.
        if (options.getCurrentUserId() && !sameRequestOwner()) return rejectChangedIdentity();
        if (!await openHistoryOnce()) return false;
        if (!sameRequestOwner()) return rejectChangedIdentity();
        token = await getAccessToken();
        if (!sameRequestOwner()) return rejectChangedIdentity();
        if (!token) return false;
      }
      let state = await queryStatus(token);
      if (!sameRequestOwner()) return rejectChangedIdentity();
      if ('error' in state) {
        // Povijest obnavlja isteklu sesiju i prikazuje prijavu kad se token više ne može obnoviti.
        // Nakon prijave čitamo status ponovno sa svježim tokenom; stari odgovor ne otključava pokušaj.
        if (!await openHistoryOnce()) return false;
        if (!sameRequestOwner()) return rejectChangedIdentity();
        token = await getAccessToken();
        if (!sameRequestOwner()) return rejectChangedIdentity();
        if (!token) return false;
        state = await queryStatus(token);
        if (!sameRequestOwner()) return rejectChangedIdentity();
        if ('error' in state) return false;
      }
      if (state.status === 'completed' && state.jobId) {
        tell('Poslužitelj potvrđuje dovršetak i spremljenu kopiju. Ponovni pokušaj ostaje zaključan.');
        void openHistoryOnce().catch(() => {});
        return false;
      }
      if (state.status === 'processing') {
        tell('Poslužitelj potvrđuje da je popravak još u obradi. Nemoj ga slati ponovno; ponovno provjeri „Moji popravci” za koji trenutak.');
        return false;
      }
      if (state.status === 'completed_unstored') {
        tell('Poslužitelj je završio obradu, ali nije spremio kopiju. Možeš sigurno pokušati oporavak istog zahtjeva; poslužitelj ga prihvaća samo ako već postoji odgovarajući aktivni slot.');
        return true;
      }
      if (state.status === 'no_change') {
        tell('Poslužitelj je potvrdio da nije bilo potrebnih izmjena. Promijeni odabrane stavke za novi pokušaj.');
        return false;
      }
      if (state.status === 'unknown' || state.status === 'conflict') {
        tell('Poslužitelj ne može potvrditi ishod. Ponovni pokušaj ostaje zaključan.');
        return false;
      }
      if (state.status === 'missing' || state.status === 'retryable') {
        const historyLoaded = await openHistoryOnce();
        return sameRequestOwner() ? historyLoaded : rejectChangedIdentity();
      }
      return false;
    } catch (error) {
      if (controller.signal.aborted) {
        tell('Provjera statusa nije završila na vrijeme. Ishod popravka ostaje nepoznat, a ponovni pokušaj zaključan. Provjeri „Moji popravci” ili pokušaj ponovno provjeriti status.');
        return false;
      }
      tell('Provjera statusa nije uspjela. Ishod popravka ostaje nepoznat, a ponovni pokušaj zaključan. Provjeri vezu i pokušaj ponovno.');
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}

export async function prepareRepairRequestRecovery(options: PrepareRepairRequestRecoveryOptions) {
  const identity = await createRepairRequestIdentity(options.fileBytes, options.meta);
  const requestId = identity.requestId;
  if (!requestId) {
    options.setSummary('<strong>Popravak nije poslan.</strong> Preglednik nije mogao izraditi stabilan ID ovog zahtjeva. Pokušaj ponovno za koji trenutak.');
    return null;
  }
  const recoveryIdentity = options.recoveryIdentity;
  const sameOriginalRequest = !recoveryIdentity || (
    requestId === recoveryIdentity.requestId
    && identity.requestFingerprint === recoveryIdentity.requestFingerprint
  );
  const requestUserId = recoveryIdentity?.requestUserId ?? options.resolveRequestUserId(requestId);
  const sameOriginalOwner = !recoveryIdentity || options.getCurrentUserId() === recoveryIdentity.requestUserId;
  if (!sameOriginalRequest || !sameOriginalOwner || !requestUserId || options.getCurrentUserId() !== requestUserId) {
    options.setOutcomeUnknown(Boolean(recoveryIdentity));
    if (recoveryIdentity) {
      options.setSummary('<strong>Oporavak je zaključan.</strong> Prijava ili odabrani popravci razlikuju se od izvornog zahtjeva. Vrati izvornu prijavu i odabir za siguran oporavak. Ako želiš poslati zaseban popravak, potvrdi da bi izvorni zahtjev možda još mogao završiti.<p><button type="button" class="btn btn-secondary btn-sm" data-repair-start-new>Započni novi popravak</button></p>');
      const startNewButton = options.summary.querySelector<HTMLButtonElement>('[data-repair-start-new]');
      if (startNewButton && options.startNewRepair) startNewButton.onclick = () => { void options.startNewRepair!(recoveryIdentity, requestId); };
    } else {
      options.setSummary('<strong>Popravak nije poslan.</strong> Ne mogu pouzdano vezati zahtjev uz aktivnu prijavu. Osvježi prijavu pa pokušaj ponovno.');
    }
    return null;
  }
  const checkExistingRequest = createRepairRequestStatusChecker({ ...options, requestId, requestUserId });
  const recoveryRequestIdentity = { requestId, requestFingerprint: identity.requestFingerprint, requestUserId };
  const handleOutcome = (outcome: RepairOutcome): boolean => {
    if (!isRepairRequestOutcome(outcome)) return false;
    options.setOutcomeUnknown(renderRepairRequestOutcome(options.summary, outcome, {
      retry: () => options.retry(recoveryRequestIdentity),
      checkExistingRequest,
      openRepairHistory: options.openRepairHistory,
    }, (value) => value));
    return true;
  };
  const createPending = (signal: AbortSignal) => ({
    token: options.token,
    bytes: options.fileBytes,
    meta: options.meta,
    signal,
    requestId,
    requestFingerprint: identity.requestFingerprint,
  });
  const renderError = (
    outcome: Extract<RepairOutcome, { kind: 'error' }>,
    canOpenRepairHistory: boolean,
    esc: (value: string) => string,
  ): void => {
    const recovery = recoveryFor(outcome, 'after-send');
    if (recovery.action === 'check-existing-job') options.setOutcomeUnknown(true);
    renderRepairRecovery(options.summary, recovery, {
      retry: () => options.retry(recoveryRequestIdentity),
      openJobs: recovery.action === 'check-existing-job'
        ? checkExistingRequest
        : (canOpenRepairHistory ? options.openRepairHistory : null),
    }, esc);
  };
  return { ...identity, requestId, checkExistingRequest, handleOutcome, createPending, renderError };
}

export interface RepairRequestOwnerResolver {
  (requestId: string, proposedOwnerId?: string | null): string | null;
  forget: (requestId: string) => void;
}

export function createRepairRequestOwnerResolver(getCurrentUserId: () => string | null): RepairRequestOwnerResolver {
  const owners = new Map<string, string | null>();
  const resolve = ((requestId: string, proposedOwnerId: string | null = getCurrentUserId()): string | null => {
    if (!owners.has(requestId)) owners.set(requestId, proposedOwnerId);
    return owners.get(requestId) ?? null;
  }) as RepairRequestOwnerResolver;
  resolve.forget = (requestId) => owners.delete(requestId);
  return resolve;
}

export function confirmSeparateRepairAttempt(
  confirm: (message: string) => boolean,
  start: () => void | Promise<void>,
): void | Promise<void> {
  if (!confirm('Izvorni zahtjev možda još traje. Novi popravak bit će zaseban zahtjev i može stvoriti dodatnu obradu. Želiš li nastaviti?')) return;
  return start();
}

export function renderRepairAuthTimeoutRecovery(
  summary: HTMLElement,
  outcomeUnknown: boolean,
  checkExistingRequest: (() => Promise<boolean>) | null,
  retry: () => void | Promise<void>,
  setSummary: (html: string) => void,
  esc: (value: string) => string,
): void {
  if (outcomeUnknown && !checkExistingRequest) {
    setSummary('<strong>Ishod prethodnog popravka nije poznat.</strong> Ne mogu sigurno provjeriti status, pa ponovni pokušaj ostaje zaključan. Provjeri „Moji popravci” ili se javi podršci.');
    return;
  }
  const recovery = outcomeUnknown
    ? { action: 'check-existing-job' as const, retryAllowed: false, message: 'Provjera prijave trajala je predugo. Prethodni popravak možda je još u obradi. Prvo provjeri „Moji popravci” prije novog pokušaja.' }
    : { action: 'retry' as const, retryAllowed: true, message: 'Provjera prijave trajala je predugo. Popravak nije poslan; provjeri vezu i pokušaj ponovno.' };
  renderRepairRecovery(summary, recovery, {
    retry,
    openJobs: outcomeUnknown ? checkExistingRequest : null,
  }, esc);
}

export async function runPendingRepair(
  pending: any,
  loadRepairClient: () => Promise<{ uploadRepair: typeof import('../report/repair-client').uploadRepair }>,
  repairConfig: () => RepairClientConfig,
  fetcher: typeof fetch,
) {
  if (!pending) throw new Error('zahtjev nije pripremljen');
  const { uploadRepair } = await loadRepairClient();
  return uploadRepair(repairConfig(), pending.token, pending.bytes, pending.meta, fetcher, {
    signal: pending.signal,
    requestId: pending.requestId,
    requestFingerprint: pending.requestFingerprint,
  });
}

export function isRepairRequestOutcome(outcome: RepairOutcome): outcome is RepairRequestOutcome {
  return outcome.kind === 'request_in_progress'
    || outcome.kind === 'request_completed'
    || outcome.kind === 'request_completed_unstored'
    || outcome.kind === 'request_recovery_unavailable'
    || outcome.kind === 'request_no_change'
    || outcome.kind === 'request_unknown';
}

export function renderRepairRequestOutcome(
  el: HTMLElement,
  outcome: RepairRequestOutcome,
  hooks: {
    retry: () => void | Promise<void>;
    checkExistingRequest: () => Promise<boolean>;
    openRepairHistory: () => boolean | void | Promise<boolean | void>;
  },
  esc: (value: string) => string,
): boolean {
  const renderStatus = (message: string, retryAllowed: boolean) => renderRepairRecovery(
    el,
    { action: 'check-existing-job', retryAllowed, message },
    { retry: hooks.retry, openJobs: hooks.checkExistingRequest },
    esc,
  );
  switch (outcome.kind) {
    case 'request_in_progress':
      renderStatus('Ovaj popravak još je u obradi. Provjeri status prije bilo kakvog novog pokušaja.', false);
      return true;
    case 'request_completed':
      el.hidden = false;
      el.innerHTML = '<strong>Poslužitelj potvrđuje da je ovaj popravak već dovršen.</strong><p>Provjeri „Moji popravci” za spremljenu kopiju; ponovni pokušaj ostaje zaključan.</p>';
      if (outcome.jobId) void hooks.openRepairHistory();
      return true;
    case 'request_completed_unstored':
      renderStatus('Poslužitelj je završio obradu, ali nije spremio kopiju. Siguran oporavak ponavlja isti zahtjev i ne uzima novi plaćeni slot.', true);
      return true;
    case 'request_recovery_unavailable':
      el.hidden = false;
      el.innerHTML = '<strong>Popravljena kopija nije spremljena i siguran oporavak više nije dostupan.</strong><p>Nije uzet novi plaćeni slot. Nemoj ponovno slati isti popravak; javi se podršci kako bismo provjerili postojeći slot i spremanje datoteke.</p>';
      return true;
    case 'request_no_change':
      el.hidden = false;
      el.innerHTML = 'Prethodna obrada nije našla promjene za odabrane stavke. Odaberi druge stavke ako želiš pokušati novi popravak.';
      return false;
    case 'request_unknown':
      renderStatus('Ne mogu pouzdano utvrditi ishod prethodnog zahtjeva. Provjeri status na poslužitelju prije ponovnog pokušaja.', false);
      return true;
  }
}
