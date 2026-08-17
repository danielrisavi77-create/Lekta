/**
 * Lekta Control Center: sesija za admin.html preko src/auth/session.ts (isti GoTrue e-mail
 * OTP modul kao glavna app, bez supabase-js u bundleu). Koristi ISTI localStorage kljuc
 * ('lekta.session') kao src/ui/app.ts, pa je admin vec prijavljen ako je nedavno bio
 * prijavljen na glavnoj stranici (isto porijeklo, ista pohrana) - inace admin-auth-gate.ts
 * prikazuje mali OTP obrazac na samoj admin.html.
 */

import {
  getValidAccessToken,
  requestEmailOtp,
  verifyEmailOtp,
  signInWithPassword,
  setPassword,
  type AuthConfig,
  type Session,
  type SessionStore,
} from '../auth/session';
import { ADMIN_CONFIG } from './admin-config';

const SESSION_KEY = 'lekta.session';
const SESSION_MEMORY = new Map<string, unknown>();

function safeStorageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* storage odbijen/nedostupan (privatno pregledavanje) */
  }
  return SESSION_MEMORY.has(key) ? (structuredClone(SESSION_MEMORY.get(key)) as T) : fallback;
}

function safeStorageSet(key: string, value: unknown): void {
  SESSION_MEMORY.set(key, structuredClone(value));
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage odbijen */
  }
}

export const adminAuthConfig: AuthConfig = {
  supabaseUrl: ADMIN_CONFIG.supabaseUrl,
  anonKey: ADMIN_CONFIG.supabaseAnonKey,
};

export const adminSessionStore: SessionStore = {
  load: () => safeStorageGet<Session | null>(SESSION_KEY, null),
  save: (s) => safeStorageSet(SESSION_KEY, s),
};

export function currentAdminSession(): Session | null {
  return adminSessionStore.load();
}

export async function resolveAdminToken(): Promise<string | null> {
  return getValidAccessToken(adminAuthConfig, adminSessionStore);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Ako je korisnik upravo kliknuo magic-link iz e-maila, GoTrue je preusmjerio ovamo s
 * access_token/refresh_token u URL fragmentu (implicit flow - vidi requestEmailOtp redirectTo).
 * Fragment se NIKAD ne salje na server (HTTP spec), ali ga svejedno odmah ocistimo iz adresne
 * trake (history.replaceState) da tokeni ne ostanu vidljivi/ne zavrse u historyju ili bookmarku -
 * isti obrazac kao katedra-handoff.ts za #lekta= fragment. email/userId citamo izravno iz JWT-a
 * (self-describing), bez dodatnog round-tripa na /user.
 */
export function consumeMagicLinkFragment(now: number = Date.now()): Session | null {
  if (typeof location === 'undefined' || !location.hash) return null;
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  const claims = decodeJwtPayload(accessToken);
  const expiresIn = Number(params.get('expires_in') ?? 3600);
  const session: Session = {
    accessToken,
    refreshToken,
    expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    email: typeof claims.email === 'string' ? claims.email : '',
    userId: typeof claims.sub === 'string' ? claims.sub : '',
    isAnonymous: claims.is_anonymous === true,
  };
  adminSessionStore.save(session);
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* history odbijen (rijetko) - fragment ostaje u adresnoj traci, sesija je svejedno spremljena */
  }
  return session;
}

/**
 * Odjava koja STVARNO opoziva sesiju (audit SEC-06).
 *
 * Prije je brisala samo lokalni zapis. Refresh token je ostajao valjan na Supabaseu, pa je
 * ukradeni token nastavio raditi i nakon sto se korisnik uvjerljivo "odjavio". Za administratorsku
 * sesiju je to najgore moguce mjesto za takvu rupu.
 *
 * `scope: global` opoziva SVE sesije tog korisnika, ne samo ovu. Za admin panel je to
 * namjeravano ponasanje: odjava je ovdje sigurnosna radnja, ne udobnost.
 *
 * Lokalni zapis se brise ODMAH i BEZ obzira na ishod mrežnog poziva. Ako opoziv padne (offline,
 * istekao token), korisnik svejedno mora biti odjavljen na ovom uredaju; obrnuti redoslijed bi
 * znacio da mrezna greska ostavlja otvorenu sesiju na ekranu.
 */
export function adminSignOut(): void {
  const session = adminSessionStore.load();
  adminSessionStore.save(null);
  if (!session?.accessToken) return;
  try {
    void fetch(`${adminAuthConfig.supabaseUrl.replace(/\/+$/, '')}/auth/v1/logout?scope=global`, {
      method: 'POST',
      headers: {
        apikey: adminAuthConfig.anonKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
      keepalive: true,
    }).catch(() => {
      /* opoziv je best-effort: lokalna sesija je vec obrisana, korisnik je odjavljen ovdje */
    });
  } catch {
    /* fetch nedostupan (npr. u testu bez mreze) */
  }
}

export { requestEmailOtp, verifyEmailOtp, signInWithPassword, setPassword };
