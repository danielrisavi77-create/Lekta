import { describe, expect, it, vi } from 'vitest';
import type { Session, SessionResult } from '../src/auth/session';
import { createAnonymousSessionFlight, resolveAccessTokenOrAnonymous } from '../src/auth/anonymous-session-flight';

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
    await expect(beforeLogout).resolves.toBeNull();
    const afterLogout = flight.run();
    resolveSignIn({ ok: true, session });

    await expect(afterLogout).resolves.toBe(session);
    expect(stored).toBe(session);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('kasna anonimna sesija ne prepisuje e-mail sesiju', async () => {
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
    await expect(pending).resolves.toBeNull();
    resolveSignIn({ ok: true, session });

    await expect(flight.run()).resolves.toBe(session);
    expect(stored).toBe(emailSession);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(session);
  });

  it('ne zapocinje novi signup ako kasnu sesiju nije moguce spremiti', async () => {
    const resolveSignIn: ((result: SessionResult) => void)[] = [];
    let markSubmitted!: () => void;
    let stored: Session | null = null;
    const start = vi.fn((_signal: AbortSignal, submitted: () => void) => {
      markSubmitted = submitted;
      return new Promise<SessionResult>((resolve) => { resolveSignIn.push(resolve); });
    });
    const persist = vi.fn((value: Session) => {
      if (stored) return false;
      stored = value;
      return true;
    });
    const flight = createAnonymousSessionFlight(start, persist, () => !stored);
    const pending = flight.run();
    await Promise.resolve();
    markSubmitted();
    flight.invalidate();
    stored = emailSession;
    await expect(pending).resolves.toBeNull();
    resolveSignIn[0]({ ok: true, session });
    await expect(flight.run()).resolves.toBe(session);

    await expect(flight.run()).resolves.toBeNull();
    expect(start).toHaveBeenCalledOnce();
    expect(stored).toBe(emailSession);

    flight.invalidate();
    stored = null;
    const afterLogout = flight.run();
    await Promise.resolve();
    expect(start).toHaveBeenCalledTimes(2);
    const freshSession = { ...session, accessToken: 'fresh-access', refreshToken: 'fresh-refresh', userId: 'fresh-anon-user' };
    resolveSignIn[1]({ ok: true, session: freshSession });
    await expect(afterLogout).resolves.toBe(freshSession);
    expect(stored).toBe(freshSession);
  });

  it('odjava ocisti kasnu anon sesiju koja je stigla prije e-mail prijave', async () => {
    const resolveSignIn: ((result: SessionResult) => void)[] = [];
    const start = vi.fn((_signal: AbortSignal, submitted: () => void) => {
      submitted();
      return new Promise<SessionResult>((resolve) => { resolveSignIn.push(resolve); });
    });
    let stored: Session | null = null;
    const persist = vi.fn((value: Session) => {
      if (stored) return false;
      stored = value;
      return true;
    });
    const flight = createAnonymousSessionFlight(start, persist, () => !stored);
    const beforeLogout = flight.run();
    await Promise.resolve();
    flight.invalidate();
    await expect(beforeLogout).resolves.toBeNull();
    resolveSignIn[0]({ ok: true, session });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    flight.invalidate(); // email OTP saves the new session immediately after invalidating
    stored = emailSession;
    flight.invalidate(); // logout invalidates while that e-mail session is still in storage
    stored = null;
    const afterLogout = flight.run();
    await Promise.resolve();

    expect(start).toHaveBeenCalledTimes(2);
    const freshSession = { ...session, accessToken: 'fresh-access', refreshToken: 'fresh-refresh', userId: 'fresh-anon-user' };
    resolveSignIn[1]({ ok: true, session: freshSession });
    await expect(afterLogout).resolves.toBe(freshSession);
    expect(stored).toBe(freshSession);
  });
});

describe('resolveAccessTokenOrAnonymous', () => {
  it('postojeca sesija s neuspjelom obnovom ne zapocinje anonimni signup', async () => {
    const load = vi.fn(() => ({ ...session, expiresAt: 0 }));
    const resolve = vi.fn(async () => null);
    const runAnonymous = vi.fn(async () => session);

    await expect(resolveAccessTokenOrAnonymous(true, resolve, load, runAnonymous)).resolves.toBeNull();
    expect(runAnonymous).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('uzima e-mail token spremljen dok se prva provjera odvijala', async () => {
    let loads = 0;
    const load = vi.fn(() => ++loads === 1 ? null : emailSession);
    const resolve = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(emailSession.accessToken);
    const runAnonymous = vi.fn(async () => session);

    await expect(resolveAccessTokenOrAnonymous(true, resolve, load, runAnonymous)).resolves.toBe(emailSession.accessToken);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(runAnonymous).not.toHaveBeenCalled();
  });
});
