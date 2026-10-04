/**
 * T102: montaza prijave Googleom na ruti /rad/ (src/routes/workspace/google-sign-in.ts).
 * Pravi PKCE modul, mock GoTrue fetch, pa se tvrdi cijeli tok: gumb samo iza zastavice, povratak
 * sprema sesiju istog oblika kao OTP tok i cisti URL.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_BUTTON_ID } from '../src/auth/google-oauth';
import { parseTokenResponse, type Session } from '../src/auth/session';
import { googleSignInActive, mountGoogleSignIn, type GoogleSignInDeps } from '../src/routes/workspace/google-sign-in';

const CFG = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon-key' };
const tokenBody = { access_token: 'jwt-g', refresh_token: 'r-g', expires_in: 3600, user: { id: 'user-g', email: 's@gmail.com' } };

function setupDom(): void {
  document.body.innerHTML =
    '<div class="modal-backdrop hidden" id="authModal"><div class="modal"><div class="order-status hidden" id="authStatus"></div>' +
    '<div class="modal-actions"><button id="authSubmit" type="button">Pošalji kod</button></div></div></div>';
}

function harness(over: Partial<GoogleSignInDeps> = {}) {
  const log = { assigned: '' as string, saved: null as Session | null, replaced: '' as string, toasts: [] as string[], events: [] as string[], after: 0, fetches: 0 };
  let pkce: unknown = null;
  const deps: GoogleSignInDeps = {
    enabled: true,
    config: CFG,
    doc: document,
    location: { origin: 'https://lekta.hr', pathname: '/rad/', search: '', href: 'https://lekta.hr/rad/', assign: (u: string) => { log.assigned = u; } },
    history: { replaceState: (_s: unknown, _t: string, url?: string | URL | null) => { log.replaced = String(url); } },
    loadSession: () => null,
    saveSession: (s) => { log.saved = s; },
    pkce: { load: () => pkce, save: (v) => { pkce = v; } },
    toast: (m) => { log.toasts.push(m); },
    setStatus: () => {},
    track: (e) => { log.events.push(e); },
    afterSignIn: () => { log.after++; },
    fetchImpl: (async () => { log.fetches++; return { ok: true, status: 200, json: async () => tokenBody } as unknown as Response; }) as unknown as typeof fetch,
    ...over,
  };
  return { deps, log, pkce: () => pkce, setPkce: (v: unknown) => { pkce = v; } };
}

async function otvoriModal(): Promise<void> {
  document.getElementById('authModal')!.classList.remove('hidden');
  await new Promise((r) => setTimeout(r, 20));
}

describe('ruta /rad/: prijava Googleom', () => {
  beforeEach(setupDom);

  it('aktivna je samo uz zastavicu i konfiguriran Auth (nepoznato je iskljuceno)', () => {
    expect(googleSignInActive({ enabled: false, config: CFG })).toBe(false);
    expect(googleSignInActive({ enabled: true, config: { supabaseUrl: '', anonKey: 'k' } })).toBe(false);
    expect(googleSignInActive({ enabled: true, config: CFG })).toBe(true);
  });

  it('bez zastavice nema gumba ni nakon otvaranja modala, i OAuth modul se ne ucitava', async () => {
    let ucitano = 0;
    const { deps } = harness({ enabled: false, loadOAuth: async () => { ucitano++; return import('../src/auth/google-oauth'); } });
    await mountGoogleSignIn(deps);
    await otvoriModal();
    expect(document.getElementById(GOOGLE_BUTTON_ID)).toBeNull();
    expect(ucitano).toBe(0);
  });

  it('sa zastavicom otvaranje modala montira gumb; klik sprema verifier i ide na /authorize s redirect_to = origin + putanja', async () => {
    const h = harness();
    await mountGoogleSignIn(h.deps);
    await otvoriModal();
    const b = document.getElementById(GOOGLE_BUTTON_ID) as HTMLButtonElement;
    expect(b?.textContent).toBe('Prijava Googleom');
    b.click();
    await new Promise((r) => setTimeout(r, 20));
    const url = new URL(h.log.assigned);
    expect(url.pathname).toBe('/auth/v1/authorize');
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe('https://lekta.hr/rad/');
    expect((h.pkce() as { verifier: string }).verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('anonimnom korisniku (popravci za povezivanje) gumb se ne nudi', async () => {
    const anon: Session = { accessToken: 'a', refreshToken: 'r', expiresAt: 9e15, email: '', userId: 'anon-1', isAnonymous: true };
    const h = harness({ loadSession: () => anon });
    await mountGoogleSignIn(h.deps);
    await otvoriModal();
    expect(document.getElementById(GOOGLE_BUTTON_ID)).toBeNull();
  });

  it('povratak s ?code= uz spremljen verifier sprema sesiju istog oblika kao OTP tok i cisti URL', async () => {
    const h = harness();
    h.setPkce({ verifier: 'v'.repeat(43), createdAt: Date.now() });
    h.deps.location = { ...h.deps.location, search: '?code=abc&ref=r', href: 'https://lekta.hr/rad/?code=abc&ref=r' };
    await mountGoogleSignIn(h.deps);
    expect(h.log.fetches).toBe(1);
    const ocekivano = parseTokenResponse(tokenBody, 0)!;
    expect(Object.keys(h.log.saved!).sort()).toEqual(Object.keys(ocekivano).sort());
    expect(h.log.saved).toMatchObject({ accessToken: 'jwt-g', refreshToken: 'r-g', email: 's@gmail.com', userId: 'user-g', isAnonymous: false });
    expect(h.log.replaced).toBe('/rad/?ref=r');
    expect(h.log.events).toEqual(['auth_signed_in']);
    expect(h.log.after).toBe(1);
    expect(h.pkce()).toBeNull();
  });

  it('tudji ?code= bez verifiera ne radi nista: bez mreze, bez sesije, URL netaknut', async () => {
    const h = harness();
    h.deps.location = { ...h.deps.location, search: '?code=napadac', href: 'https://lekta.hr/rad/?code=napadac' };
    await mountGoogleSignIn(h.deps);
    expect(h.log.fetches).toBe(0);
    expect(h.log.saved).toBeNull();
    expect(h.log.replaced).toBe('');
    expect(h.log.toasts).toEqual([]);
  });
});
