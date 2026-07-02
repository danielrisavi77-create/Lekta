import { describe, it, expect } from 'vitest';
import {
  parseTokenResponse, isExpired, requestEmailOtp, verifyEmailOtp,
  refreshSession, getValidAccessToken, type Session, type SessionStore,
} from '../src/auth/session';

const CFG = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon-key' };

function res(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}
function fetchOnce(r: Response, capture?: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (url: string, init: RequestInit) => { capture?.(url, init); return r; }) as unknown as typeof fetch;
}
function memStore(initial: Session | null = null): SessionStore {
  let s = initial;
  return { load: () => s, save: (v) => { s = v; } };
}
const tokenBody = {
  access_token: 'jwt-abc', refresh_token: 'refresh-xyz', expires_in: 3600,
  user: { id: 'user-1', email: 'a@b.hr' },
};

describe('parseTokenResponse', () => {
  it('mapira GoTrue odgovor u sesiju s apsolutnim istekom', () => {
    const s = parseTokenResponse(tokenBody, 1_000_000);
    expect(s).toMatchObject({ accessToken: 'jwt-abc', refreshToken: 'refresh-xyz', email: 'a@b.hr', userId: 'user-1' });
    expect(s!.expiresAt).toBe(1_000_000 + 3600 * 1000);
  });
  it('bez access_token vraća null', () => {
    expect(parseTokenResponse({ refresh_token: 'x' }, 0)).toBeNull();
  });
});

describe('isExpired', () => {
  const s: Session = { accessToken: 't', refreshToken: 'r', expiresAt: 100_000, email: '', userId: '' };
  it('null je uvijek istekao', () => expect(isExpired(null, 0)).toBe(true));
  it('poštuje sigurnosni odmak (60s)', () => {
    expect(isExpired(s, 39_000)).toBe(false); // > 60s do isteka
    expect(isExpired(s, 41_000)).toBe(true);  // unutar 60s odmaka (100000-60000=40000)
  });
});

describe('requestEmailOtp', () => {
  it('odbija neispravan e-mail bez mrežnog poziva', async () => {
    const r = await requestEmailOtp(CFG, 'nije-email', fetchOnce(res(200)));
    expect(r.ok).toBe(false);
  });
  it('šalje na /auth/v1/otp s create_user', async () => {
    let url = '', body: any = {};
    const r = await requestEmailOtp(CFG, ' a@b.hr ', fetchOnce(res(200), (u, i) => { url = u; body = JSON.parse(i.body as string); }));
    expect(r.ok).toBe(true);
    expect(url).toBe('https://proj.supabase.co/auth/v1/otp');
    expect(body).toEqual({ email: 'a@b.hr', create_user: true });
  });
  it('429 daje jasnu poruku', async () => {
    const r = await requestEmailOtp(CFG, 'a@b.hr', fetchOnce(res(429)));
    expect(r).toEqual({ ok: false, message: 'previše pokušaja, pričekaj minutu' });
  });
  it('nekonfiguriran auth ne zove mrežu', async () => {
    const r = await requestEmailOtp({ supabaseUrl: '', anonKey: '' }, 'a@b.hr', fetchOnce(res(200)));
    expect(r.ok).toBe(false);
  });
});

describe('verifyEmailOtp', () => {
  it('vraća sesiju na uspjeh', async () => {
    const r = await verifyEmailOtp(CFG, 'a@b.hr', '123456', fetchOnce(res(200, tokenBody)), 500);
    expect(r.ok && r.session.accessToken).toBe('jwt-abc');
  });
  it('krivi kod -> jasna poruka', async () => {
    const r = await verifyEmailOtp(CFG, 'a@b.hr', '000000', fetchOnce(res(401)));
    expect(r).toEqual({ ok: false, message: 'kod nije točan ili je istekao' });
  });
});

describe('getValidAccessToken', () => {
  it('vraća token dok je valjan (bez mreže)', async () => {
    const store = memStore({ accessToken: 'live', refreshToken: 'r', expiresAt: 100_000, email: '', userId: '' });
    const token = await getValidAccessToken(CFG, store, fetchOnce(res(500)), 10_000);
    expect(token).toBe('live');
  });
  it('obnavlja istekli token i sprema novu sesiju', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: 'refresh-xyz', expiresAt: 5_000, email: '', userId: '' });
    const token = await getValidAccessToken(CFG, store, fetchOnce(res(200, tokenBody)), 10_000);
    expect(token).toBe('jwt-abc');
    expect(store.load()!.accessToken).toBe('jwt-abc');
  });
  it('istekao bez refresh tokena -> null i čisti sesiju', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: '', expiresAt: 5_000, email: '', userId: '' });
    const token = await getValidAccessToken(CFG, store, fetchOnce(res(200, tokenBody)), 10_000);
    expect(token).toBeNull();
    expect(store.load()).toBeNull();
  });
  it('neuspjela obnova -> null i čisti sesiju', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: 'r', expiresAt: 5_000, email: '', userId: '' });
    const token = await getValidAccessToken(CFG, store, fetchOnce(res(400)), 10_000);
    expect(token).toBeNull();
    expect(store.load()).toBeNull();
  });
});
