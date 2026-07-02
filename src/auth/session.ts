/**
 * Klijentska Supabase auth sesija preko GoTrue REST-a (e-mail OTP / magic link).
 *
 * Zasto: create-checkout i generate-report Edge Functioni traze VALJAN korisnicki Supabase
 * JWT (`auth.getUser()`), inace 401. Ovaj modul je jedini izvor tog tokena na klijentu.
 *
 * Bez supabase-js u bundleu: cisti `fetch` prema GoTrue endpointima (`/auth/v1/otp`,
 * `/auth/v1/verify`, `/auth/v1/token`). Sve je testabilno uz injektabilan `fetch`, `store`
 * i `now`. Odluku o pravu pristupa i dalje donosi server; ovdje samo dobavljamo identitet.
 */

export interface AuthConfig {
  /** Supabase projekt URL. Prazno = auth nije konfiguriran. */
  supabaseUrl: string;
  /** Supabase anon (public) kljuc; ide u apikey/Authorization header. */
  anonKey: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Apsolutni trenutak isteka (ms epoch). */
  expiresAt: number;
  email: string;
  userId: string;
}

/** Perzistencija sesije (app.ts je veze na safeStorage; testovi na memoriju). */
export interface SessionStore {
  load(): Session | null;
  save(session: Session | null): void;
}

export type OtpResult = { ok: true } | { ok: false; message: string };
/**
 * `fatal` na neuspjehu znaci da je sam refresh token nevaljan/potrosen (400/401/403), pa se
 * sesija smije obrisati. Bez `fatal` (mreza, 5xx) neuspjeh je tranzijentan i sesija ostaje.
 */
export type SessionResult =
  | { ok: true; session: Session }
  | { ok: false; message: string; fatal?: boolean };

function trimUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function authHeaders(cfg: AuthConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
  };
}

/** GoTrue token odgovor (snake_case) -> tipizirana Session. `now` za deterministicki istek. */
export function parseTokenResponse(raw: unknown, now: number): Session | null {
  const data = (raw ?? {}) as Record<string, unknown>;
  const accessToken = typeof data.access_token === 'string' ? data.access_token : '';
  if (!accessToken) return null;
  const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : '';
  const expiresIn = Number(data.expires_in ?? 3600);
  const user = (data.user ?? {}) as Record<string, unknown>;
  return {
    accessToken,
    refreshToken,
    expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    email: typeof user.email === 'string' ? user.email : '',
    userId: typeof user.id === 'string' ? user.id : '',
  };
}

/** Je li sesija istekla (uz sigurnosni odmak da ne saljemo token pred sam istek). */
export function isExpired(session: Session | null, now: number, skewMs = 60_000): boolean {
  if (!session) return true;
  return now >= session.expiresAt - skewMs;
}

/** Posalji e-mail OTP / magic link. `create_user:true` dopusta prvu prijavu bez ranije registracije. */
export async function requestEmailOtp(
  cfg: AuthConfig,
  email: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OtpResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, message: 'auth nije konfiguriran' };
  const clean = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, message: 'neispravan e-mail' };
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/otp`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({ email: clean, create_user: true }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 429) return { ok: false, message: 'previše pokušaja, pričekaj minutu' };
    return { ok: false, message: `slanje koda nije uspjelo (${res.status})` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/** Potvrdi OTP kod (6 znamenki iz e-maila) i vrati sesiju. */
export async function verifyEmailOtp(
  cfg: AuthConfig,
  email: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<SessionResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, message: 'auth nije konfiguriran' };
  const code = token.trim();
  if (!code) return { ok: false, message: 'unesi kod iz e-maila' };
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/verify`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({ type: 'email', email: email.trim(), token: code }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'kod nije točan ili je istekao' };
      return { ok: false, message: `potvrda nije uspjela (${res.status})` };
    }
    const session = parseTokenResponse(await res.json().catch(() => ({})), now);
    if (!session) return { ok: false, message: 'nevaljan odgovor poslužitelja' };
    return { ok: true, session };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/** Obnovi sesiju iz refresh tokena. */
export async function refreshSession(
  cfg: AuthConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<SessionResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, message: 'auth nije konfiguriran' };
  if (!refreshToken) return { ok: false, message: 'nema refresh tokena' };
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      // 400 invalid_grant / 401 / 403 = refresh token je nevaljan ili rotiran (potrosen) -> fatalno.
      // 5xx i ostalo je tranzijentno; sesiju ne diramo da ne izbacimo korisnika bez razloga.
      const fatal = res.status === 400 || res.status === 401 || res.status === 403;
      return { ok: false, message: `obnova sesije nije uspjela (${res.status})`, fatal };
    }
    const session = parseTokenResponse(await res.json().catch(() => ({})), now);
    if (!session) return { ok: false, message: 'nevaljan odgovor poslužitelja' };
    return { ok: true, session };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/**
 * Vrati valjan access token ili null. Ako je istekao, a ima refresh token, tiho obnovi i
 * spremi. Sesiju brisemo SAMO kad je refresh token stvarno nevaljan (fatalno); na tranzijentnu
 * gresku (mreza, 5xx) sesija ostaje pa korisnik moze ponoviti. Kod paralelnih poziva (rotacija
 * refresh tokena) provjeravamo je li druga dretva u meduvremenu vec spremila valjanu sesiju,
 * da je ne pregazimo s null.
 */
export async function getValidAccessToken(
  cfg: AuthConfig,
  store: SessionStore,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string | null> {
  const current = store.load();
  if (current && !isExpired(current, now)) return current.accessToken;
  if (!current || !current.refreshToken) {
    if (current) store.save(null);
    return null;
  }
  const refreshed = await refreshSession(cfg, current.refreshToken, fetchImpl, now);
  if (refreshed.ok) {
    store.save(refreshed.session);
    return refreshed.session.accessToken;
  }
  // Race: paralelni poziv je mozda vec obnovio i spremio valjanu sesiju s novim tokenom.
  const latest = store.load();
  if (latest && latest.refreshToken !== current.refreshToken && !isExpired(latest, now)) {
    return latest.accessToken;
  }
  if (refreshed.fatal) store.save(null);
  return null;
}
