/**
 * PRIJAVA GOOGLEOM NA RUTI `/rad/` (T102), iza `VITE_AUTH_GOOGLE_ENABLED`.
 *
 * Zivi u ruti, ne u `app.ts`: `tests/ui-module-budget.test.ts` gura `app.ts` prema dolje, a ovo je
 * oprema modala prijave, ne analizator. Iz `app.ts` se koriste samo izvezeni toast, status
 * modala, otkup preporuke i osvjezavanje prijave. Sam OAuth tok (PKCE) je u
 * `src/auth/google-oauth.ts` i ucitava se lijeno, tek kad je zastavica ukljucena.
 *
 * Gumb se nudi samo kad nema anonimne sesije koju bi trebalo povezati: povezivanje anonimnog
 * racuna s Google identitetom je zaseban tok koji ovdje ne postoji, pa bi nova prijava ostavila
 * anonimne popravke na starom racunu. Takav korisnik i dalje ima prijavu e-mailom, koja povezuje.
 */
import { googleAuthEnabled } from '../../auth/google-flag';
import type { AuthConfig, Session, SessionResult } from '../../auth/session';
import { callbackFrom, cleanedCallbackUrl, clearExpiredPkce, GOOGLE_PKCE_STORAGE_KEY, readPending, type PkceStore } from '../../auth/google-callback';
import { STORAGE_KEYS, safeStorageGet, safeStorageSet } from '../../shared/browser-storage';

/** PKCE verifier pod sigurnim omotacem pohrane (ne sirovi localStorage). */


export interface GoogleSignInDeps {
  enabled: boolean;
  config: AuthConfig;
  doc: Document;
  location: Pick<Location, 'origin' | 'pathname' | 'search' | 'hash' | 'href' | 'assign'>;
  history: Pick<History, 'replaceState'>;
  loadSession: () => Session | null;
  saveSession: (s: Session) => void;
  pkce: { load(): unknown; save(v: unknown): boolean | void };
  toast: (msg: string) => void;
  setStatus: (type: string, msg?: string) => void;
  track: (event: string, data: Record<string, unknown>) => void;
  afterSignIn: () => void;
  loadOAuth?: () => Promise<typeof import('../../auth/google-oauth')>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Anonimna sesija s popravcima koja bi se prijavom Googleom odvojila od racuna. Fail-closed: svaka
 * sesija s korisnikom a bez e-maila racuna se kao anonimna, i kad zastavica `isAnonymous` nedostaje.
 */
function anonymousToLink(s: Session | null): boolean {
  return !!(s && (s.isAnonymous === true || (s.userId && !s.email)));
}

/** Je li tok uopce aktivan: zastavica, konfiguriran Auth. Nepoznato je iskljuceno. */
export function googleSignInActive(deps: Pick<GoogleSignInDeps, 'enabled' | 'config'>): boolean {
  return deps.enabled === true && !!deps.config.supabaseUrl && !!deps.config.anonKey;
}

/**
 * Montira gumb u modal prijave svaki put kad se modal otvori, i obradi povratak s Googlea.
 * Vraca obecanje obrade povratka (testovi ga cekaju); bez zastavice ne radi nista.
 */
export async function mountGoogleSignIn(deps: GoogleSignInDeps): Promise<void> {
  const store = deps.pkce as PkceStore;
  const now = deps.now ?? Date.now;
  // Istekli verifier se cisti i kad je zastavica iskljucena (vlasnik ju je mogao ugasiti nakon
  // pokrenute prijave), prije provjere zastavice (Codex R7 runda 2 na #307).
  if (!googleSignInActive(deps)) { clearExpiredPkce(store, now()); return; }
  const loadOAuth = deps.loadOAuth ?? (() => import('../../auth/google-oauth'));
  const modal = deps.doc.getElementById('authModal');

  // SINKRONI DIO, prije prvog `await`: ruta ga izvrsi prije `openWorkspace`, koji cita fragment.
  // Povratak prijave pokrenute u ovom pregledniku cisti se iz URL-a i vraca fragment radne povrsine
  // (`#session=...`) iz zapisa verifiera (Codex R2). Bez valjanog zapisa URL se ne dira: tudja
  // poveznica nema ucinka. Bez povratka se samo cisti istekli verifier (Codex R7).
  const search = deps.location.search;
  const hash = deps.location.hash;
  const cb = callbackFrom(search, hash);
  const pending = readPending(store);
  if (!cb) clearExpiredPkce(store, now());
  else if (pending) {
    try { deps.history.replaceState(null, '', cleanedCallbackUrl(deps.location.href, pending.returnHash)); } catch { /* sesija ne ovisi o adresi */ }
  }

  const syncButton = async () => {
    if (!modal || modal.classList.contains('hidden')) return;
    const box = modal.querySelector('.modal-actions');
    const g = await loadOAuth();
    g.mountGoogleButton(box, !anonymousToLink(deps.loadSession()), () => {
      deps.setStatus('pending', 'Preusmjeravam na Google…');
      g.startGoogleSignIn(deps.config, {
        redirectTo: g.googleRedirectTo(deps.location),
        store,
        returnHash: deps.location.hash,
        assign: (u) => deps.location.assign(u),
      }).then((started) => {
        if (!started) deps.setStatus('error', 'Preglednik ne dopušta spremanje podataka prijave. Prijavi se e-mailom.');
      }).catch(() => deps.setStatus('error', 'Prijavu Googleom trenutačno nije moguće pokrenuti.'));
    });
  };
  if (modal && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { void syncButton(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  await syncButton();
  if (!cb || !pending) return;

  // Anonimna sesija (popravci) se ne zamjenjuje Google sesijom bez povezivanja identiteta (Codex R1):
  // provjera prije razmjene koda i ponovno neposredno prije spremanja, jer je druga kartica mogla
  // u medjuvremenu otvoriti anonimnu sesiju. Verifier se svejedno trosi.
  // Poruka obecava cuvanje popravaka SAMO kad ih prijava e-mailom stvarno povezuje: app.ts nudi
  // povezivanje (anonymousSessionForLink) samo sesiji oznacenoj `isAnonymous`. Starija sesija bez
  // oznake ovdje je odbijena (fail-closed), ali joj se ne obecava cuvanje (Codex runda 2 na #307).
  const odbijAnonimnu = () => {
    store.save(null);
    deps.toast(deps.loadSession()?.isAnonymous === true
      ? 'Prijava Googleom nije moguća dok traje anonimna sesija s popravcima. Prijavi se e-mailom da se popravci sačuvaju.'
      : 'Prijava Googleom nije moguća uz trenutnu sesiju bez e-maila. Prijavi se e-mailom.');
  };
  if (anonymousToLink(deps.loadSession())) { odbijAnonimnu(); return; }

  let out: SessionResult | null = null;
  try {
    const g = await loadOAuth();
    out = await g.completeGoogleSignIn(deps.config, search, { store, fetchImpl: deps.fetchImpl, hash, now: now() });
  } catch {
    out = { ok: false, message: 'prijava Googleom nije uspjela' };
  }
  if (!out) return;
  if (out.ok) {
    if (anonymousToLink(deps.loadSession())) { odbijAnonimnu(); return; }
    deps.saveSession(out.session);
    deps.toast('Prijava uspješna.');
    deps.track('auth_signed_in', { method: 'google' });
    deps.afterSignIn();
  } else {
    deps.toast(out.message);
  }
}

/** Zadane ovisnosti preglednika; app.ts daje toast, status i osvjezavanje. */
export function browserGoogleSignInDeps(
  config: AuthConfig,
  app: Pick<GoogleSignInDeps, 'toast' | 'setStatus' | 'track' | 'afterSignIn'>,
): GoogleSignInDeps {
  return {
    enabled: googleAuthEnabled(),
    config,
    doc: document,
    location,
    history,
    loadSession: () => safeStorageGet(STORAGE_KEYS.session, null),
    saveSession: (s) => safeStorageSet(STORAGE_KEYS.session, s),
    pkce: { load: () => safeStorageGet(GOOGLE_PKCE_STORAGE_KEY, null), save: (v) => safeStorageSet(GOOGLE_PKCE_STORAGE_KEY, v) },
    ...app,
  };
}
