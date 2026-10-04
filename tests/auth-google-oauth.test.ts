/**
 * T102: prijava Googleom preko Supabase Auth OAuth providera (PKCE), iza VITE_AUTH_GOOGLE_ENABLED.
 * Provider je mock fetch; tvrdi se oblik zahtjeva prema GoTrueu i da spremljena sesija ima isti
 * oblik kao sesija OTP toka (`lekta.session`).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { googleAuthEnabled } from '../src/auth/google-flag';
import {
  completeGoogleSignIn,
  createPkcePair,
  GOOGLE_BUTTON_ID,
  googleRedirectTo,
  mountGoogleButton,
  startGoogleSignIn,
} from '../src/auth/google-oauth';
import {
  callbackFrom,
  cleanedCallbackUrl,
  clearExpiredPkce,
  PKCE_MAX_AGE_MS,
  type PendingPkce,
  type PkceStore,
} from '../src/auth/google-callback';
import { verifyEmailOtp } from '../src/auth/session';
import { flagContractProblems, pkceContractProblems } from './helpers/google-auth-flag';

const CFG = { supabaseUrl: 'https://proj.supabase.co/', anonKey: 'anon-key' };
const tokenBody = {
  access_token: 'jwt-abc', refresh_token: 'refresh-xyz', expires_in: 3600,
  user: { id: 'user-g', email: 'student@gmail.com' },
};

function res(status: number, body: unknown = {}): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}
function memPkce(initial: PendingPkce | null = null): PkceStore & { value: () => PendingPkce | null } {
  let v = initial;
  return { load: () => v, save: (x) => { v = x; }, value: () => v };
}
function recordingFetch(r: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return r; }) as unknown as typeof fetch;
  return { f, calls };
}

async function sha256b64url(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('zastavica VITE_AUTH_GOOGLE_ENABLED', () => {
  it('zadano je iskljucena; ukljucuje je samo true ili 1', () => {
    for (const v of [undefined, '', ' ', 'false', '0', 'no', 'yes', 'on']) {
      expect(googleAuthEnabled({ VITE_AUTH_GOOGLE_ENABLED: v }), String(v)).toBe(false);
    }
    for (const v of ['true', '1', ' TRUE ']) expect(googleAuthEnabled({ VITE_AUTH_GOOGLE_ENABLED: v }), v).toBe(true);
    expect(googleAuthEnabled({})).toBe(false);
  });

  it('u testnom buildu (bez zastavice) je iskljucena', () => {
    expect(googleAuthEnabled()).toBe(false);
  });
});

describe('gumb "Prijava Googleom"', () => {
  function modal(): Element {
    document.body.innerHTML = '<div id="authModal"><div class="modal-actions"><button id="authSubmit">Pošalji kod</button></div></div>';
    return document.querySelector('#authModal .modal-actions')!;
  }

  it('bez zastavice se ne renderira', () => {
    const box = modal();
    expect(mountGoogleButton(box, false, () => {})).toBeNull();
    expect(document.getElementById(GOOGLE_BUTTON_ID)).toBeNull();
  });

  it('sa zastavicom se renderira jednom, a iskljucivanjem nestaje', () => {
    const box = modal();
    let klik = 0;
    const b = mountGoogleButton(box, true, () => { klik++; })!;
    mountGoogleButton(box, true, () => { klik++; });
    expect(document.querySelectorAll(`#${GOOGLE_BUTTON_ID}`)).toHaveLength(1);
    expect(b.textContent).toBe('Prijava Googleom');
    expect(b.type).toBe('button');
    b.click();
    expect(klik).toBe(1);
    mountGoogleButton(box, false, () => {});
    expect(document.getElementById(GOOGLE_BUTTON_ID)).toBeNull();
  });

  it('staticki rad/index.html nema gumb; renderira ga samo kod iza zastavice', () => {
    const html = readFileSync('rad/index.html', 'utf8').replace(/\r\n/g, '\n');
    expect(html).not.toContain(`id="${GOOGLE_BUTTON_ID}"`);
    expect(html).not.toContain('Prijava Googleom');
  });
});

describe('ugovori izvrseni nad stvarnim funkcijama (isti se izvrsavaju nad mutantima u gate-mutations)', () => {
  it('zastavica je fail-closed', () => {
    expect(flagContractProblems(googleAuthEnabled)).toEqual([]);
  });
  it('PKCE povratak: tudji code ignoriran, istek odbijen, verifier jednokratan', async () => {
    expect(await pkceContractProblems(completeGoogleSignIn, PKCE_MAX_AGE_MS)).toEqual([]);
  });
});

describe('adresa povratka (redirect_to)', () => {
  it('je tocno origin + putanja, bez query i fragmenta', () => {
    expect(googleRedirectTo(new URL('https://lekta.hr/rad/?code=x&ref=r#odjeljak'))).toBe('https://lekta.hr/rad/');
    expect(googleRedirectTo(new URL('http://localhost:5173/rad/'))).toBe('http://localhost:5173/rad/');
    expect(googleRedirectTo({ origin: 'https://lektahr.netlify.app', pathname: '/rad/' })).toBe('https://lektahr.netlify.app/rad/');
  });
});

describe('PKCE pokretanje', () => {
  it('par: verifier od 43 znaka, challenge = base64url(SHA-256(verifier))', async () => {
    const { verifier, challenge } = await createPkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(await sha256b64url(verifier));
  });

  it('sprema verifier i preusmjerava na GoTrue /authorize za Google s challengeom i redirect_to', async () => {
    const store = memPkce();
    let target = '';
    await startGoogleSignIn(CFG, { redirectTo: 'https://lekta.hr/rad/', store, assign: (u) => { target = u; }, now: 5_000 });
    const url = new URL(target);
    expect(url.origin + url.pathname).toBe('https://proj.supabase.co/auth/v1/authorize');
    expect(url.searchParams.get('provider')).toBe('google');
    expect(url.searchParams.get('redirect_to')).toBe('https://lekta.hr/rad/');
    expect(url.searchParams.get('code_challenge_method')).toBe('s256');
    const pending = store.value()!;
    expect(pending.createdAt).toBe(5_000);
    expect(url.searchParams.get('code_challenge')).toBe(await sha256b64url(pending.verifier));
    expect(target).not.toContain(pending.verifier);
  });
});

describe('PKCE povratak', () => {
  const pending: PendingPkce = { verifier: 'v'.repeat(43), createdAt: 1_000_000 };

  it('mijenja code za sesiju istog oblika kao OTP tok i trosi verifier', async () => {
    const store = memPkce(pending);
    const { f, calls } = recordingFetch(res(200, tokenBody));
    const out = await completeGoogleSignIn(CFG, '?code=auth-code-1', { store, fetchImpl: f, now: 1_000_500 });
    expect(out).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://proj.supabase.co/auth/v1/token?grant_type=pkce');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ auth_code: 'auth-code-1', code_verifier: pending.verifier });
    expect((calls[0].init.headers as Record<string, string>).apikey).toBe('anon-key');
    expect(store.value()).toBeNull();

    // Isti GoTrue odgovor kroz OTP tok daje sesiju istog oblika i sadrzaja (lekta.session).
    const otp = await verifyEmailOtp(CFG, 'a@b.hr', '123456', (async () => res(200, tokenBody)) as unknown as typeof fetch, 1_000_500);
    expect(otp.ok && out && out.ok).toBe(true);
    if (otp.ok && out?.ok) expect(out.session).toEqual(otp.session);
  });

  it('bez spremljenog verifiera URL s ?code= se ignorira, bez mreze (tudja poveznica nema ucinka)', async () => {
    const store = memPkce(null);
    const { f, calls } = recordingFetch(res(200, tokenBody));
    expect(await completeGoogleSignIn(CFG, '?code=napadacev-kod', { store, fetchImpl: f, now: 1 })).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('URL bez code i error nije povratak: verifier ostaje netaknut', async () => {
    const store = memPkce(pending);
    const { f, calls } = recordingFetch(res(200, tokenBody));
    expect(await completeGoogleSignIn(CFG, '?ref=abc', { store, fetchImpl: f, now: 1_000_500 })).toBeNull();
    expect(store.value()).toEqual(pending);
    expect(calls).toHaveLength(0);
  });

  it('istekao verifier je neuspjeh bez mreze i trosi se', async () => {
    const store = memPkce(pending);
    const { f, calls } = recordingFetch(res(200, tokenBody));
    const out = await completeGoogleSignIn(CFG, '?code=x', { store, fetchImpl: f, now: pending.createdAt + PKCE_MAX_AGE_MS + 1 });
    expect(out).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    expect(store.value()).toBeNull();
  });

  it('error od providera (korisnik odustao) je neuspjeh bez mreze', async () => {
    const store = memPkce(pending);
    const { f, calls } = recordingFetch(res(200, tokenBody));
    const out = await completeGoogleSignIn(CFG, '?error=access_denied&error_description=x', { store, fetchImpl: f, now: 1_000_500 });
    expect(out).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it('odbijena zamjena koda i mrezna greska su neuspjeh, ne iznimka', async () => {
    const odbijeno = await completeGoogleSignIn(CFG, '?code=x', { store: memPkce(pending), fetchImpl: recordingFetch(res(400, {})).f, now: 1_000_500 });
    expect(odbijeno).toMatchObject({ ok: false });
    const pukne = (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch;
    expect(await completeGoogleSignIn(CFG, '?code=x', { store: memPkce(pending), fetchImpl: pukne, now: 1_000_500 })).toMatchObject({ ok: false });
  });

  it('cleanedCallbackUrl uklanja samo parametre povratka', () => {
    expect(cleanedCallbackUrl('https://lekta.hr/rad/?code=a&ref=r&error_description=x#odjeljak')).toBe('/rad/?ref=r#odjeljak');
    expect(cleanedCallbackUrl('https://lekta.hr/rad/?code=a')).toBe('/rad/');
  });
});

describe('Codex runda 1 na #307: pohrana, fragment i istek', () => {
  it('R6: kad pohrana odbije zapis, prijava se ne pokrece i nema navigacije', async () => {
    let target = '';
    const odbija: PkceStore = { load: () => null, save: () => false };
    const ok = await startGoogleSignIn(CFG, { redirectTo: 'https://lekta.hr/rad/', store: odbija, assign: (u) => { target = u; } });
    expect(ok).toBe(false);
    expect(target).toBe('');
  });

  it('R2: fragment iz trenutka pokretanja sprema se uz verifier, a redirect_to ga ne nosi', async () => {
    const store = memPkce();
    let target = '';
    const ok = await startGoogleSignIn(CFG, { redirectTo: 'https://lekta.hr/rad/', store, returnHash: '#session=abc', assign: (u) => { target = u; } });
    expect(ok).toBe(true);
    expect(store.value()!.returnHash).toBe('#session=abc');
    expect(new URL(target).searchParams.get('redirect_to')).toBe('https://lekta.hr/rad/');
    const nevaljan = memPkce();
    await startGoogleSignIn(CFG, { redirectTo: 'x', store: nevaljan, returnHash: 'session=bez-ljestvi', assign: () => {} });
    expect(nevaljan.value()!.returnHash).toBeUndefined();
  });

  it('R2/R5: cleanedCallbackUrl vraca spremljeni fragment i brise gresku iz fragmenta', () => {
    expect(cleanedCallbackUrl('https://lekta.hr/rad/?code=a', '#session=abc')).toBe('/rad/#session=abc');
    expect(cleanedCallbackUrl('https://lekta.hr/rad/#error=access_denied&error_description=x', '#session=abc')).toBe('/rad/#session=abc');
    expect(cleanedCallbackUrl('https://lekta.hr/rad/#error=access_denied')).toBe('/rad/');
    // Postojeci koristan fragment ima prednost pred spremljenim.
    expect(cleanedCallbackUrl('https://lekta.hr/rad/?code=a#session=novi', '#session=stari')).toBe('/rad/#session=novi');
  });

  it('R5: greska providera u fragmentu je povratak (neuspjeh bez mreze), a obican fragment nije', async () => {
    expect(callbackFrom('', '#error=access_denied&error_description=x')).toMatchObject({ code: null, error: 'access_denied' });
    expect(callbackFrom('', '#session=abc')).toBeNull();
    const store = memPkce({ verifier: 'v'.repeat(43), createdAt: 1_000_000 });
    const { f, calls } = recordingFetch(res(200, tokenBody));
    const out = await completeGoogleSignIn(CFG, '', { store, fetchImpl: f, now: 1_000_500, hash: '#error=access_denied' });
    expect(out).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
    expect(store.value()).toBeNull();
  });

  it('R7: istekli verifier se cisti, svjezi ostaje', () => {
    const star = memPkce({ verifier: 'v'.repeat(43), createdAt: 0 });
    clearExpiredPkce(star, PKCE_MAX_AGE_MS + 1);
    expect(star.value()).toBeNull();
    const svjez = memPkce({ verifier: 'v'.repeat(43), createdAt: 0 });
    clearExpiredPkce(svjez, PKCE_MAX_AGE_MS - 1);
    expect(svjez.value()).not.toBeNull();
  });

  it('R3: odgovor bez user ili s anonimnim korisnikom nije prijava', async () => {
    const p: PendingPkce = { verifier: 'v'.repeat(43), createdAt: 1_000_000 };
    for (const tijelo of [
      { access_token: 'a', refresh_token: 'r', expires_in: 3600 },
      { ...tokenBody, user: { id: 'anon', email: '', is_anonymous: true } },
      { ...tokenBody, user: { id: 'u', email: 'x@y.hr', is_anonymous: true } },
      { ...tokenBody, refresh_token: '' },
    ]) {
      const out = await completeGoogleSignIn(CFG, '?code=x', { store: memPkce(p), fetchImpl: recordingFetch(res(200, tijelo)).f, now: 1_000_500 });
      expect(out, JSON.stringify(tijelo)).toMatchObject({ ok: false });
    }
  });
});
