import { awaitAbortable } from '../shared/await-abortable';
import type { Session, SessionResult } from './session';

type Flight = {
  controller: AbortController;
  generation: number;
  submitted: boolean;
  waiters: number;
  promise: Promise<Session | null>;
};

/** Coalesce non-idempotent anonymous signup without tying it to one UI waiter's signal. */
export function createAnonymousSessionFlight(
  start: (signal: AbortSignal, onSubmitted: () => void) => Promise<SessionResult>,
  persist: (session: Session) => boolean | void,
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
    const flight: Flight = {
      controller: new AbortController(),
      generation,
      submitted: false,
      waiters: 0,
      promise: Promise.resolve(null),
    };
    flight.promise = Promise.resolve()
      .then(() => start(flight.controller.signal, () => { flight.submitted = true; }))
      .then((result) => {
        if (!result.ok) return null;
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
      const flight = inFlight ?? begin();
      const requestedGeneration = generation;
      flight.waiters += 1;
      const waiting = signal
        ? awaitAbortable(flight.promise, signal).catch(() => null)
        : flight.promise;
      return waiting.then((session) => {
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
      if (inFlight && !inFlight.submitted) inFlight.controller.abort();
    },
  };
}
