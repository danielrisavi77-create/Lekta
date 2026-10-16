import { describe, expect, it, vi } from 'vitest';
import type { Session, SessionResult } from '../src/auth/session';
import { createAnonymousSessionFlight } from '../src/auth/anonymous-session-flight';

const session: Session = {
  accessToken: 'anon-access', refreshToken: 'anon-refresh', expiresAt: 10_000,
  email: '', userId: 'anon-user', isAnonymous: true,
};

const emailSession: Session = {
  accessToken: 'email-access', refreshToken: 'email-refresh', expiresAt: 10_000,
  email: 'student@example.test', userId: 'email-user', isAnonymous: false,
};

describe('createAnonymousSessionFlight', () => {
  it('istek prvog cekatelja ne prekida signup koji ceka drugi', async () => {
    let resolveSignIn!: (result: SessionResult) => void;
    let markSubmitted!: () => void;
    let requestSignal!: AbortSignal;
    const start = vi.fn((signal: AbortSignal, submitted: () => void) => {
      requestSignal = signal;
      markSubmitted = submitted;
      return new Promise<SessionResult>((resolve) => { resolveSignIn = resolve; });
    });
    const persist = vi.fn(() => true);
    const flight = createAnonymousSessionFlight(start, persist);
    const firstController = new AbortController();
    const first = flight.run(firstController.signal);
    await Promise.resolve();
    const second = flight.run();

    firstController.abort();
    await expect(first).resolves.toBeNull();
    expect(start).toHaveBeenCalledOnce();
    expect(requestSignal.aborted).toBe(false);
    markSubmitted();
    resolveSignIn({ ok: true, session });

    await expect(second).resolves.toBe(session);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(session);
  });

  it('logout tijekom poslanog signup-a dopusta sljedecem pokusaju preuzeti kasnu sesiju', async () => {
    let resolveSignIn!: (result: SessionResult) => void;
    let markSubmitted!: () => void;
    let requestSignal!: AbortSignal;
    const start = vi.fn((signal: AbortSignal, submitted: () => void) => {
      requestSignal = signal;
      markSubmitted = submitted;
      return new Promise<SessionResult>((resolve) => { resolveSignIn = resolve; });
    });
    let stored: Session | null = null;
    const persist = vi.fn((value: Session) => {
      if (stored) return false;
      stored = value;
      return true;
    });
    const flight = createAnonymousSessionFlight(start, persist);
    const beforeLogout = flight.run();
    await Promise.resolve();
    markSubmitted();
    flight.invalidate();
    expect(requestSignal.aborted).toBe(false);
    const afterLogout = flight.run();
    resolveSignIn({ ok: true, session });

    await expect(beforeLogout).resolves.toBeNull();
    await expect(afterLogout).resolves.toBe(session);
    expect(stored).toBe(session);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('ne prepisuje e-mail sesiju kada anonimni signup stigne kasnije', async () => {
    let resolveSignIn!: (result: SessionResult) => void;
    let markSubmitted!: () => void;
    const start = (_signal: AbortSignal, submitted: () => void) => {
      markSubmitted = submitted;
      return new Promise<SessionResult>((resolve) => { resolveSignIn = resolve; });
    };
    let stored: Session | null = null;
    const persist = vi.fn((value: Session) => {
      if (stored) return false;
      stored = value;
      return true;
    });
    const flight = createAnonymousSessionFlight(start, persist);
    const pending = flight.run();
    await Promise.resolve();
    markSubmitted();
    flight.invalidate();
    stored = emailSession;
    resolveSignIn({ ok: true, session });

    await expect(pending).resolves.toBeNull();
    expect(stored).toBe(emailSession);
    expect(persist).not.toHaveBeenCalled();
  });
});
