/**
 * Prijava Googleom preko Supabase Auth (GoTrue) OAuth providera, PKCE tok (T102).
 *
 * Zasto PKCE, a ne implicitni tok s tokenima u fragmentu: implicitni povratak prihvaca bilo koje
 * tokene u URL-u, pa napadac moze poslati poveznicu sa SVOJIM tokenima i prijaviti zrtvu u svoj
 * racun (login CSRF). Ovdje se verifier stvara i pamti u pregledniku koji je prijavu pokrenuo, a
 * povratni `?code=` vrijedi samo uz taj verifier. Bez spremljenog verifiera URL se uopce ne
 * obraduje: tudja poveznica s `?code=` nema nikakav ucinak.
 *
 * Isti stil kao session.ts: cisti fetch prema GoTrue REST-u, bez supabase-js, a fetch, pohrana,
 * vrijeme i slucajnost su injektabilni. Sesija ima isti oblik `Session` kao OTP tok, pa je app.ts
 * sprema istim `authStore` pod `lekta.session`.
 *
 * Zastavica `VITE_AUTH_GOOGLE_ENABLED` je zadano iskljucena: bez nje se gumb ne renderira i
 * povratak se ne obraduje. Ukljucuje je vlasnik tek kad Google provider radi na Supabaseu, koji
 * je dijeljen s Katedrom (uri_allow_list).
 */
import { parseTokenResponse, type AuthConfig, type SessionResult } from './session';
import { callbackFrom, MAX_RETURN_HASH, readPending, PKCE_MAX_AGE_MS, type PkceStore } from './google-callback';

function trimUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** RFC 7636: verifier od 32 slucajna bajta (43 znaka), challenge = base64url(SHA-256(verifier)). */
export async function createPkcePair(cryptoImpl: Crypto = globalThis.crypto): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64Url(cryptoImpl.getRandomValues(new Uint8Array(32)));
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

/** GoTrue `/authorize` za Google provider; povratak ide na `redirectTo` s `?code=`. */
export function googleAuthorizeUrl(cfg: AuthConfig, redirectTo: string, challenge: string): string {
  const q = new URLSearchParams({
    provider: 'google',
    redirect_to: redirectTo,
    code_challenge: challenge,
    code_challenge_method: 's256',
  });
  return `${trimUrl(cfg.supabaseUrl)}/auth/v1/authorize?${q.toString()}`;
}

/**
 * Adresa povratka: tocno `origin` + putanja trenutne stranice, bez query i fragmenta (isti oblik kao
 * OTP `redirect_to`). Mora biti na `uri_allow_list` dijeljenog Auth projekta (lekta.hr, Netlify
 * produkcija, localhost za razvoj), inace GoTrue tiho vraca na site_url.
 */
export function googleRedirectTo(loc: { origin: string; pathname: string }): string {
  return loc.origin + loc.pathname;
}

/**
 * Pokreni prijavu: spremi verifier (i fragment za povratak) pa preusmjeri preglednik na GoTrue
 * `/authorize`. Vraca `false` bez navigacije ako pohrana nije prihvatila zapis (Codex R6 na #307).
 */
export async function startGoogleSignIn(
  cfg: AuthConfig,
  opts: { redirectTo: string; store: PkceStore; assign: (url: string) => void; now?: number; cryptoImpl?: Crypto; returnHash?: string },
): Promise<boolean> {
  const { verifier, challenge } = await createPkcePair(opts.cryptoImpl);
  const hash = typeof opts.returnHash === 'string' && opts.returnHash.startsWith('#') && opts.returnHash.length <= MAX_RETURN_HASH
    ? opts.returnHash
    : undefined;
  const saved = opts.store.save({ verifier, createdAt: opts.now ?? Date.now(), ...(hash ? { returnHash: hash } : {}) });
  if (saved === false || readPending(opts.store)?.verifier !== verifier) return false;
  opts.assign(googleAuthorizeUrl(cfg, opts.redirectTo, challenge));
  return true;
}

/**
 * Identitet iz GoTrue odgovora mora biti stvaran Google korisnik: id, e-mail, oba tokena i
 * `is_anonymous` koji nije `true`. Odgovor bez `user` ili anonimni korisnik je neuspjeh (Codex R3).
 */
function verifiedIdentity(raw: unknown): boolean {
  const data = (raw ?? {}) as Record<string, unknown>;
  const user = data.user as Record<string, unknown> | undefined;
  return !!user
    && typeof user.id === 'string' && user.id.length > 0
    && typeof user.email === 'string' && user.email.length > 0
    && user.is_anonymous !== true
    && typeof data.access_token === 'string' && data.access_token.length > 0
    && typeof data.refresh_token === 'string' && data.refresh_token.length > 0;
}

/**
 * Obradi povratak s `/authorize`. `null` znaci da URL nije povratak prijave pokrenute u OVOM
 * pregledniku (nema `code` ni `error`, ili nema spremljenog verifiera) i nista se ne dira. Kad
 * verifier postoji, trosi se u svakom slucaju (jednokratan); istekao je neuspjeh bez mreznog poziva.
 */
export async function completeGoogleSignIn(
  cfg: AuthConfig,
  search: string,
  opts: { store: PkceStore; fetchImpl?: typeof fetch; now?: number; hash?: string },
): Promise<SessionResult | null> {
  const cb = callbackFrom(search, opts.hash ?? '');
  if (!cb) return null;
  const { code, error } = cb;

  const now = opts.now ?? Date.now();
  const pending = readPending(opts.store);
  if (!pending || typeof pending.verifier !== 'string' || !pending.verifier) return null;
  opts.store.save(null);
  if (!(now - pending.createdAt >= 0 && now - pending.createdAt <= PKCE_MAX_AGE_MS)) {
    return { ok: false, message: 'prijava je istekla, pokušaj ponovno' };
  }
  if (error || !code) return { ok: false, message: 'prijava Googleom je otkazana ili odbijena' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${trimUrl(cfg.supabaseUrl)}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      body: JSON.stringify({ auth_code: code, code_verifier: pending.verifier }),
    });
    if (!res.ok) return { ok: false, message: 'prijava Googleom nije uspjela' };
    const raw = await res.json().catch(() => ({}));
    if (!verifiedIdentity(raw)) return { ok: false, message: 'nevaljan identitet u odgovoru poslužitelja' };
    const session = parseTokenResponse(raw, now);
    return session ? { ok: true, session } : { ok: false, message: 'nevaljan odgovor poslužitelja' };
  } catch {
    return { ok: false, message: 'mrežna pogreška pri prijavi' };
  }
}

export const GOOGLE_BUTTON_ID = 'authGoogle';

/**
 * Gumb "Prijava Googleom" u zadanom spremniku. Bez zastavice (`enabled` false) gumb se NE
 * renderira, a postojeci se uklanja. Vraca gumb ili null.
 */
export function mountGoogleButton(container: Element | null, enabled: boolean, onClick: () => void): HTMLButtonElement | null {
  const doc = container?.ownerDocument;
  const existing = doc?.getElementById(GOOGLE_BUTTON_ID) ?? null;
  if (!container || !enabled) {
    existing?.remove();
    return null;
  }
  const btn = (existing as HTMLButtonElement | null) ?? doc!.createElement('button');
  btn.id = GOOGLE_BUTTON_ID;
  btn.type = 'button';
  btn.className = 'btn btn-secondary';
  btn.textContent = 'Prijava Googleom';
  btn.onclick = onClick;
  if (!existing) container.prepend(btn);
  return btn;
}
