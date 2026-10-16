import type { Session, SessionResult } from './session';

/** Coalesce anonymous signup and keep its eventual session when a UI waiter times out. */
export function createAnonymousSessionFlight(
  start: (signal?: AbortSignal) => Promise<SessionResult>,
  persist: (session: Session) => void,
) {
  let inFlight: Promise<Session | null> | null = null;
  let generation = 0;

  return {
    run(signal?: AbortSignal): Promise<Session | null> {
      if (inFlight) return inFlight;
      const startedAt = generation;
      let request: Promise<Session | null>;
      request = Promise.resolve()
        .then(() => start(signal))
        .then((result) => {
          if (!result.ok || generation !== startedAt) return null;
          persist(result.session);
          return result.session;
        })
        .catch(() => null)
        .finally(() => {
          if (inFlight === request) inFlight = null;
        });
      inFlight = request;
      return request;
    },
    invalidate() {
      generation += 1;
    },
  };
}
