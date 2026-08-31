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
  /** Anonimna sesija (bez e-maila). Opcijski da starije spremljene sesije ostanu valjane. */
  isAnonymous?: boolean;
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
    isAnonymous: user.is_anonymous === true,
  };
}

/** Je li sesija istekla (uz sigurnosni odmak da ne saljemo token pred sam istek). */
export function isExpired(session: Session | null, now: number, skewMs = 60_000): boolean {
  if (!session) return true;
  return now >= session.expiresAt - skewMs;
}

/**
 * Posalji e-mail OTP / magic link. `create_user:true` dopusta prvu prijavu bez ranije registracije.
 *
 * `redirectTo` je OPCIJSKI i ADITIVAN (postojeci pozivatelji bez njega rade nepromijenjeno):
 * kad je zadan, GoTrue klik na link u e-mailu preusmjerava TAMO umjesto na defaultni Site URL,
 * s access_token/refresh_token u URL fragmentu (implicit flow, GET /verify - vidi GoTrue izvor).
 * Nuzno kad predlozak e-maila ne prikazuje odvojeni kod za rucni upis, samo klikabilnu poveznicu.
 */
export async function requestEmailOtp(
  cfg: AuthConfig,
  email: string,
  fetchImpl: typeof fetch = fetch,
  redirectTo?: string,
): Promise<OtpResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, message: 'auth nije konfiguriran' };
  const clean = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, message: 'neispravan e-mail' };
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/otp`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({ email: clean, create_user: true, ...(redirectTo ? { redirect_to: redirectTo } : {}) }),
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

/**
 * Anonimna prijava: korisnik dobiva pravi `user_id` i JWT bez e-maila i bez koda.
 *
 * Zasto postoji: server-side popravak MORA imati identitet, jer o njemu vise RLS, mapa u
 * Storageu, "Moji popravci" i pravo na brisanje. Bez identiteta korisnik ne bi mogao obrisati
 * vlastiti dokument, sto se kosi s objavljenom politikom ("dok ih sam ne obrise"). Anonimna
 * sesija daje sve to, a ne trazi ni e-mail (pa je i manje osobnih podataka nego prije).
 *
 * Sesija zivi u istom storeu kao e-mail sesija. Nadogradnja na e-mail UZ ISTI `user_id` radi se
 * kroz `linkEmailToAnonymous` + `confirmEmailLink` (audit P0-07), NIKAD kroz `requestEmailOtp`:
 * OTP s `create_user: true` napravi NOV racun s NOVIM uuid-om, pa bi svi popravci ostali na
 * napustenom anonimnom identitetu. Do 2026-08-24 je ovaj komentar to obecavao, a tok nije
 * postojao; sve sto je sucelje nudilo bilo je upravo ono OTP-a koje identitet gubi.
 */
export async function signInAnonymously(
  cfg: AuthConfig,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<SessionResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, message: 'auth nije konfiguriran' };
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/signup`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: '{}',
    });
    if (!res.ok) {
      // 422 = anonimne prijave nisu ukljucene na projektu (external_anonymous_users_enabled).
      if (res.status === 422) return { ok: false, message: 'anonimna prijava nije uključena' };
      return { ok: false, message: `anonimna prijava nije uspjela (${res.status})` };
    }
    const session = parseTokenResponse(await res.json().catch(() => ({})), now);
    if (!session) return { ok: false, message: 'nevaljan odgovor poslužitelja' };
    return { ok: true, session };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/**
 * Prijava e-mailom i lozinkom - brza alternativa OTP-u/magic-linku, SAMO za racune koji su
 * prethodno postavili lozinku (vidi setPassword). I dalje dokazuje identitet (nesto sto
 * korisnik ZNA), za razliku od golog e-maila bez ikakve provjere - namjerno se ne gradi
 * "prijava bez provjere" opcija, to bi ponistilo admin_users gate nizvodno.
 */
export async function signInWithPassword(
  cfg: AuthConfig,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<SessionResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, message: 'auth nije konfiguriran' };
  const clean = email.trim();
  if (!clean || !password) return { ok: false, message: 'unesi e-mail i lozinku' };
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({ email: clean, password }),
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) return { ok: false, message: 'e-mail ili lozinka nisu točni' };
      return { ok: false, message: `prijava nije uspjela (${res.status})` };
    }
    const session = parseTokenResponse(await res.json().catch(() => ({})), now);
    if (!session) return { ok: false, message: 'nevaljan odgovor poslužitelja' };
    return { ok: true, session };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/**
 * Postavi/promijeni lozinku za VEC prijavljenog korisnika. Dokaz identiteta je valjan access
 * token (korisnik je upravo prosao OTP/magic-link), ne lozinka sama - ovo je "postavi lozinku
 * za sljedeci put", ne nacin zaobilaska prijave.
 */
export async function setPassword(
  cfg: AuthConfig,
  accessToken: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OtpResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, message: 'auth nije konfiguriran' };
  if (!accessToken) return { ok: false, message: 'nedostaje prijava' };
  if (!password || password.length < 8) return { ok: false, message: 'lozinka mora imati barem 8 znakova' };
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/user`, {
      method: 'PUT',
      headers: { ...authHeaders(cfg), Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'sesija je istekla, prijavi se ponovno' };
      return { ok: false, message: `postavljanje lozinke nije uspjelo (${res.status})` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/**
 * Ishod povezivanja e-maila s VEC postojecom (anonimnom) sesijom.
 *
 * `email_taken` je zaseban ishod, ne generic greska: to je jedini slucaj u kojem korisnik ima
 * stvaran izbor (prijaviti se na postojeci racun i svjesno napustiti anonimne popravke), pa mu
 * sucelje mora reci upravo to, a ne "nesto nije uspjelo".
 */
export type LinkEmailResult =
  | { ok: true; pendingConfirmation: true }
  | { ok: false; reason: 'email_taken' | 'not_anonymous' | 'unauthorized' | 'config' | 'invalid_email' | 'network'; message: string };

/**
 * POVEZI e-mail s tekucom anonimnom sesijom, ZADRZAVAJUCI isti `user_id` (audit P0-07).
 *
 * Zasto ovo, a ne OTP. `requestEmailOtp` salje `create_user: true` na `/auth/v1/otp`, sto za
 * nepoznat e-mail radi NOV racun. Anonimni korisnik koji se tako "prijavi" zavrsi na drugom
 * uuid-u, a njegovi popravci ostaju vezani uz stari: RLS ih vise ne pusta, Storage prefiks se ne
 * poklapa, "Moji popravci" je prazan. U produkciji svih 18 repair poslova pripada anonimnim
 * racunima, pa bi to pogodilo bas svakoga tko se odluci prijaviti.
 *
 * GoTrue mehanizam je `PUT /auth/v1/user` s tijelom `{ email }` i Authorization zaglavljem
 * ANONIMNE sesije. Racun ostaje isti; GoTrue posalje potvrdu na novi e-mail, a veza se dovrsi
 * tek u `confirmEmailLink`. Do potvrde korisnik i dalje radi pod anonimnim identitetom, sto je
 * ispravno: nepotvrdjen e-mail ne smije dati pristup nicemu.
 */
export async function linkEmailToAnonymous(
  cfg: AuthConfig,
  accessToken: string,
  email: string,
  fetchImpl: typeof fetch = fetch,
  redirectTo?: string,
): Promise<LinkEmailResult> {
  if (!cfg.supabaseUrl || !cfg.anonKey) return { ok: false, reason: 'config', message: 'auth nije konfiguriran' };
  if (!accessToken) return { ok: false, reason: 'unauthorized', message: 'nedostaje prijava' };
  const clean = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
    return { ok: false, reason: 'invalid_email', message: 'neispravan e-mail' };
  }
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/user`, {
      method: 'PUT',
      headers: { ...authHeaders(cfg), Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ email: clean, ...(redirectTo ? { redirect_to: redirectTo } : {}) }),
    });
    if (res.ok) return { ok: true, pendingConfirmation: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'unauthorized', message: 'sesija je istekla, pokušaj ponovno' };
    }
    // 422 = e-mail vec pripada drugom racunu. Sudar se NE rjesava tiho (ni preuzimanjem tudjeg
    // racuna ni odustajanjem bez rijeci): korisnik mora znati da bi prijavom na taj racun
    // napustio popravke s ovog uredjaja.
    if (res.status === 422) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // Gleda se OBOJE: GoTrue nosi strojni razlog u `error_code`, a ljudski opis u `msg`, i
      // nije zajamceno u kojem od njih stoji trag o anonimnosti. `??` bi provjerio samo prvi.
      const code = `${String(body.error_code ?? '')} ${String(body.msg ?? '')}`;
      if (/anonymous|manual_linking/i.test(code)) {
        return { ok: false, reason: 'not_anonymous', message: 'ovaj račun već ima e-mail' };
      }
      return { ok: false, reason: 'email_taken', message: 'taj e-mail već ima račun' };
    }
    return { ok: false, reason: 'network', message: `povezivanje e-maila nije uspjelo (${res.status})` };
  } catch (e) {
    return { ok: false, reason: 'network', message: e instanceof Error ? e.message : 'mrežna greška' };
  }
}

/**
 * Dovrsi povezivanje kodom iz e-maila i vrati NADOGRADJENU sesiju (audit P0-07).
 *
 * Tip je `email_change`, ne `email`: `email` je obican OTP za prijavu i vratio bi (ili napravio)
 * DRUGI racun. `email_change` dovrsava promjenu nad postojecim korisnikom, pa `user.id` u
 * odgovoru mora biti isti kao prije.
 *
 * Pozivatelj je duzan provjeriti bas to, preko `expectedUserId`. Provjera je ovdje, a ne samo u
 * sucelju, jer je tiha zamjena identiteta upravo kvar koji se popravlja: bolje je odbiti sesiju
 * nego je spremiti i pustiti korisnika da misli da su mu popravci sacuvani.
 */
export async function confirmEmailLink(
  cfg: AuthConfig,
  email: string,
  token: string,
  expectedUserId: string,
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
      body: JSON.stringify({ type: 'email_change', email: email.trim(), token: code }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'kod nije točan ili je istekao' };
      return { ok: false, message: `potvrda nije uspjela (${res.status})` };
    }
    const session = parseTokenResponse(await res.json().catch(() => ({})), now);
    if (!session) return { ok: false, message: 'nevaljan odgovor poslužitelja' };
    // TVRDA PROVJERA IDENTITETA. Ako je uuid drugi, veza nije napravljena nego je nastao nov
    // racun, sto je tocno kvar P0-07. Takvu sesiju NE vracamo kao uspjeh.
    if (expectedUserId && session.userId && session.userId !== expectedUserId) {
      return { ok: false, message: 'povezivanje nije zadržalo isti račun', fatal: true };
    }
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
