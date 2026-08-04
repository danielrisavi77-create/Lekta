import { describe, it, expect } from 'vitest';
import {
  parseTokenResponse, isExpired, requestEmailOtp, verifyEmailOtp,
  refreshSession, getValidAccessToken, signInAnonymously, signInWithPassword, setPassword,
  type Session, type SessionStore,
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
  it('bez redirectTo ne salje redirect_to kljuc (postojeci pozivatelji nepromijenjeni)', async () => {
    let body: any = {};
    await requestEmailOtp(CFG, 'a@b.hr', fetchOnce(res(200), (_u, i) => { body = JSON.parse(i.body as string); }));
    expect(body).not.toHaveProperty('redirect_to');
  });
  it('s redirectTo dodaje redirect_to u tijelo (magic-link vraca se tamo)', async () => {
    let body: any = {};
    await requestEmailOtp(CFG, 'a@b.hr', fetchOnce(res(200), (_u, i) => { body = JSON.parse(i.body as string); }), 'http://localhost:5199/admin.html');
    expect(body).toEqual({ email: 'a@b.hr', create_user: true, redirect_to: 'http://localhost:5199/admin.html' });
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

describe('signInWithPassword', () => {
  it('salje na /auth/v1/token?grant_type=password s email+password', async () => {
    let url = '', body: any = {};
    const r = await signInWithPassword(CFG, ' a@b.hr ', 'tajna123', fetchOnce(res(200, tokenBody), (u, i) => { url = u; body = JSON.parse(i.body as string); }));
    expect(url).toBe('https://proj.supabase.co/auth/v1/token?grant_type=password');
    expect(body).toEqual({ email: 'a@b.hr', password: 'tajna123' });
    expect(r.ok && r.session.accessToken).toBe('jwt-abc');
  });
  it('400/401 daje jedinstvenu poruku (ne otkriva je li e-mail ili lozinka kriva)', async () => {
    expect(await signInWithPassword(CFG, 'a@b.hr', 'x', fetchOnce(res(400)))).toEqual({ ok: false, message: 'e-mail ili lozinka nisu točni' });
    expect(await signInWithPassword(CFG, 'a@b.hr', 'x', fetchOnce(res(401)))).toEqual({ ok: false, message: 'e-mail ili lozinka nisu točni' });
  });
  it('bez lozinke ili e-maila ne zove mrezu', async () => {
    let called = false;
    const spy = (async () => { called = true; return res(200); }) as unknown as typeof fetch;
    await signInWithPassword(CFG, 'a@b.hr', '', spy);
    await signInWithPassword(CFG, '', 'x', spy);
    expect(called).toBe(false);
  });
  it('nekonfiguriran auth ne zove mrezu', async () => {
    const r = await signInWithPassword({ supabaseUrl: '', anonKey: '' }, 'a@b.hr', 'x', fetchOnce(res(200)));
    expect(r.ok).toBe(false);
  });
});

describe('setPassword', () => {
  it('salje PUT /auth/v1/user s Authorization: Bearer <accessToken> (ne anon kljuc)', async () => {
    let url = '', init: any = null;
    const r = await setPassword(CFG, 'user-access-token', 'nova-lozinka-1', fetchOnce(res(200, { id: 'u1' }), (u, i) => { url = u; init = i; }));
    expect(url).toBe('https://proj.supabase.co/auth/v1/user');
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer user-access-token');
    expect(JSON.parse(init.body)).toEqual({ password: 'nova-lozinka-1' });
    expect(r.ok).toBe(true);
  });
  it('kraca lozinka od 8 znakova ne zove mrezu', async () => {
    let called = false;
    const spy = (async () => { called = true; return res(200); }) as unknown as typeof fetch;
    const r = await setPassword(CFG, 'token', 'kratka', spy);
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
  it('bez access tokena ne zove mrezu', async () => {
    let called = false;
    const spy = (async () => { called = true; return res(200); }) as unknown as typeof fetch;
    const r = await setPassword(CFG, '', 'dovoljno-duga-lozinka', spy);
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
  it('401 znaci istekla sesija, ne kriva lozinka', async () => {
    const r = await setPassword(CFG, 'stale-token', 'dovoljno-duga-lozinka', fetchOnce(res(401)));
    expect(r).toEqual({ ok: false, message: 'sesija je istekla, prijavi se ponovno' });
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
  it('fatalna obnova (400) -> null i čisti sesiju', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: 'r', expiresAt: 5_000, email: '', userId: '' });
    const token = await getValidAccessToken(CFG, store, fetchOnce(res(400)), 10_000);
    expect(token).toBeNull();
    expect(store.load()).toBeNull();
  });
  it('tranzijentna obnova (500) -> null ali sesija OSTAJE (offline/5xx ne izbacuje)', async () => {
    const s: Session = { accessToken: 'old', refreshToken: 'r', expiresAt: 5_000, email: '', userId: '' };
    const store = memStore({ ...s });
    const token = await getValidAccessToken(CFG, store, fetchOnce(res(500)), 10_000);
    expect(token).toBeNull();
    expect(store.load()).toMatchObject({ refreshToken: 'r' }); // nije obrisano
  });
  it('mrežna greška (fetch reject) -> null ali sesija OSTAJE', async () => {
    const store = memStore({ accessToken: 'old', refreshToken: 'r', expiresAt: 5_000, email: '', userId: '' });
    const failing = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const token = await getValidAccessToken(CFG, store, failing, 10_000);
    expect(token).toBeNull();
    expect(store.load()).not.toBeNull();
  });
  it('utrka rotacije: paralelni poziv već spremio novu sesiju -> ne gazi je s null', async () => {
    const fresh: Session = { accessToken: 'new-other', refreshToken: 'rotated', expiresAt: 1_000_000, email: '', userId: '' };
    let calls = 0, savedNull = false;
    const store: SessionStore = {
      load: () => (++calls === 1
        ? { accessToken: 'old', refreshToken: 'old-r', expiresAt: 5_000, email: '', userId: '' }
        : fresh),
      save: (v) => { if (v === null) savedNull = true; },
    };
    // Naš poziv dobije fatalni 400 (token je već rotiran), ali store već ima valjanu sesiju.
    const token = await getValidAccessToken(CFG, store, fetchOnce(res(400)), 10_000);
    expect(token).toBe('new-other');
    expect(savedNull).toBe(false);
  });
});

describe('signInAnonymously', () => {
  const anonBody = {
    access_token: 'jwt-anon', refresh_token: 'refresh-anon', expires_in: 3600,
    user: { id: 'user-anon', email: '', is_anonymous: true },
  };

  it('gadja /auth/v1/signup s praznim tijelom i vraca anonimnu sesiju', async () => {
    let url = '', init: any = null;
    const out = await signInAnonymously(CFG, fetchOnce(res(200, anonBody), (u, i) => { url = u; init = i; }), 5_000);
    expect(url).toBe('https://proj.supabase.co/auth/v1/signup');
    expect(init.body).toBe('{}');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.session.userId).toBe('user-anon');
      expect(out.session.isAnonymous).toBe(true);
      expect(out.session.email).toBe('');
    }
  });

  it('422 znaci da anonimne prijave nisu ukljucene (pozivatelj pada na e-mail)', async () => {
    const out = await signInAnonymously(CFG, fetchOnce(res(422)));
    expect(out).toEqual({ ok: false, message: 'anonimna prijava nije uključena' });
  });

  it('bez konfiguracije ne zove mrezu', async () => {
    let called = false;
    const out = await signInAnonymously({ supabaseUrl: '', anonKey: '' }, (async () => { called = true; return res(200); }) as unknown as typeof fetch);
    expect(out.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('e-mail sesija NIJE oznacena kao anonimna', () => {
    expect(parseTokenResponse(tokenBody, 0)!.isAnonymous).toBe(false);
  });
});
