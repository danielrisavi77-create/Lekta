import { describe, expect, it, vi } from 'vitest';
import type { Session, SessionResult } from '../src/auth/session';
import { createAnonymousSessionFlight } from '../src/auth/anonymous-session-flight';
import { awaitAbortable } from '../src/shared/await-abortable';

const session: Session = {
  accessToken: 'anon-access', refreshToken: 'anon-refresh', expiresAt: 10_000,
  email: '', userId: 'anon-user', isAnonymous: true,
};

describe('createAnonymousSessionFlight', () => {
  it('spaja ponovljene pokusaje i sprema kasnu sesiju nakon isteka cekanja', async () => {
    let resolveSignIn!: (result: SessionResult) => void;
    const start = vi.fn(() => new Promise<SessionResult>((resolve) => { resolveSignIn = resolve; }));
    const persist = vi.fn();
    const flight = createAnonymousSessionFlight(start, persist);
    const controller = new AbortController();
    const first = flight.run(controller.signal);
    const timedWait = awaitAbortable(first, controller.signal);
    const retry = flight.run();
    await Promise.resolve();

    expect(start).toHaveBeenCalledOnce();
    controller.abort();
    await expect(timedWait).rejects.toMatchObject({ name: 'AbortError' });
    resolveSignIn({ ok: true, session });

    await expect(first).resolves.toBe(session);
    await expect(retry).resolves.toBe(session);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(session);
  });

  it('ne sprema kasnu anonimnu sesiju nakon prijave drugom korisniku ili odjave', async () => {
    let resolveSignIn!: (result: SessionResult) => void;
    const start = () => new Promise<SessionResult>((resolve) => { resolveSignIn = resolve; });
    const persist = vi.fn();
    const flight = createAnonymousSessionFlight(start, persist);
    const pending = flight.run();
    await Promise.resolve();
    flight.invalidate();
    resolveSignIn({ ok: true, session });

    await expect(pending).resolves.toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });
});
