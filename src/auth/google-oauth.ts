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

/** Verifier stariji od ovoga ne vrijedi: povratak s Googlea traje sekunde, ne sate. */
export const PKCE_MAX_AGE_MS = 10 * 60_000;

export interface PendingPkce {
  verifier: string;
  createdAt: number;
}

/** Jednokratna pohrana verifiera (app.ts: safeStorageGet/Set; testovi: memorija). */
export interface PkceStore {
  load(): PendingPkce | null;
  save(value: PendingPkce | null): void;
}

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

/** Pokreni prijavu: spremi verifier pa preusmjeri preglednik na GoTrue `/authorize`. */
export async function startGoogleSignIn(
  cfg: AuthConfig,
  opts: { redirectTo: string; store: PkceStore; assign: (url: string) => void; now?: number; cryptoImpl?: Crypto },
): Promise<void> {
  const { verifier, challenge } = await createPkcePair(opts.cryptoImpl);
  opts.store.save({ verifier, createdAt: opts.now ?? Date.now() });
  opts.assign(googleAuthorizeUrl(cfg, opts.redirectTo, challenge));
}

/**
 * Obradi povratak s `/authorize`. `null` znaci da URL nije povratak prijave pokrenute u OVOM
 * pregledniku (nema `code` ni `error`, ili nema spremljenog verifiera) i nista se ne dira. Kad
 * verifier postoji, trosi se u svakom slucaju (jednokratan); istekao je neuspjeh bez mreznog poziva.
 */
export async function completeGoogleSignIn(
  cfg: AuthConfig,
  search: string,
  opts: { store: PkceStore; fetchImpl?: typeof fetch; now?: number },
): Promise<SessionResult | null> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;

  const now = opts.now ?? Date.now();
  const pending = opts.store.load();
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
    const session = parseTokenResponse(await res.json().catch(() => ({})), now);
    return session ? { ok: true, session } : { ok: false, message: 'nevaljan odgovor poslužitelja' };
  } catch {
    return { ok: false, message: 'mrežna pogreška pri prijavi' };
  }
}

/** Ukloni `code`, `error`, `error_description` i `state` iz URL-a da se povratak ne obradi dvaput. */
export function cleanedCallbackUrl(href: string): string {
  const url = new URL(href);
  for (const k of ['code', 'error', 'error_code', 'error_description', 'state']) url.searchParams.delete(k);
  return url.pathname + url.search + url.hash;
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
