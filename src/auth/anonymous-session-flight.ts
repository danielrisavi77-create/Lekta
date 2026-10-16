import { awaitAbortable } from '../shared/await-abortable';
import type { Session, SessionResult } from './session';

type Flight = {
  controller: AbortController;
  generation: number;
  submitted: boolean;
  waiters: number;
  invalidated: Promise<void>;
  releaseInvalidated: () => void;
  promise: Promise<Session | null>;
};

/** Coalesce non-idempotent anonymous signup without tying it to one UI waiter's signal. */
export function createAnonymousSessionFlight(
  start: (signal: AbortSignal, onSubmitted: () => void) => Promise<SessionResult>,
  persist: (session: Session) => boolean | void,
  canStart: () => boolean = () => true,
) {
  let inFlight: Flight | null = null;
  let generation = 0;
  let staleSession: Session | null = null;
  let persisted: { generation: number; session: Session } | null = null;

  const persistFor = (targetGeneration: number, session: Session): boolean => {
    if (generation !== targetGeneration) return false;
    if (persisted?.generation === targetGeneration && persisted.session === session) return true;
    if (persist(session) === false) return false;
    persisted = { generation: targetGeneration, session };
    if (staleSession === session) staleSession = null;
    return true;
  };

  const begin = (): Flight => {
    let releaseInvalidated!: () => void;
    const flight: Flight = {
      controller: new AbortController(),
      generation,
      submitted: false,
      waiters: 0,
      invalidated: new Promise<void>((resolve) => { releaseInvalidated = resolve; }),
      releaseInvalidated: () => releaseInvalidated(),
      promise: Promise.resolve(null),
    };
    flight.promise = Promise.resolve()
      .then(() => !flight.controller.signal.aborted && canStart()
        ? start(flight.controller.signal, () => { flight.submitted = true; })
        : null)
      .then((result) => {
        if (!result?.ok) return null;
        if (generation === flight.generation) persistFor(flight.generation, result.session);
        else staleSession = result.session;
        return result.session;
      })
      .catch(() => null)
      .finally(() => {
        if (inFlight === flight) inFlight = null;
      });
    inFlight = flight;
    return flight;
  };

  return {
    run(signal?: AbortSignal): Promise<Session | null> {
      if (signal?.aborted) return Promise.resolve(null);
      if (!inFlight && staleSession) {
        const reusable = staleSession;
        if (persistFor(generation, reusable)) return Promise.resolve(reusable);
      }
      if (inFlight?.controller.signal.aborted && !inFlight.submitted) inFlight = null;
      const flight = inFlight ?? (canStart() ? begin() : null);
      if (!flight) return Promise.resolve(null);
      const requestedGeneration = generation;
      flight.waiters += 1;
      const waiting = signal
        ? awaitAbortable(flight.promise, signal).catch(() => null)
        : flight.promise;
      return Promise.race([waiting, flight.invalidated.then(() => null)]).then((session) => {
        if (!session || generation !== requestedGeneration) return null;
        persistFor(requestedGeneration, session);
        return session;
      }).finally(() => {
        flight.waiters -= 1;
        if (flight.waiters === 0 && !flight.submitted) flight.controller.abort();
      });
    },
    invalidate() {
      generation += 1;
      if (inFlight) {
        inFlight.releaseInvalidated();
        let releaseInvalidated!: () => void;
        inFlight.invalidated = new Promise<void>((resolve) => { releaseInvalidated = resolve; });
        inFlight.releaseInvalidated = () => releaseInvalidated();
        if (!inFlight.submitted) inFlight.controller.abort();
      }
    },
  };
}

export async function resolveAccessTokenOrAnonymous(
  configured: boolean,
  resolve: () => Promise<string | null>,
  load: () => Session | null,
  runAnonymous: (signal?: AbortSignal) => Promise<Session | null>,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!configured) return null;
  const before = load();
  const token = await resolve();
  if (token || signal?.aborted) return token;
  const stored = load();
  if (before || stored) {
    const changed = stored && (stored.userId !== before?.userId
      || stored.accessToken !== before?.accessToken
      || stored.refreshToken !== before?.refreshToken);
    if (changed) {
      const latest = await resolve();
      if (latest || signal?.aborted) return latest;
    }
    return null;
  }
  const session = await runAnonymous(signal);
  const latest = await resolve();
  const current = load();
  return latest || (session && current?.userId === session.userId ? session.accessToken : null);
}
