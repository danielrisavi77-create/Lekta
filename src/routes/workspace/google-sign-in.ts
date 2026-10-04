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
import type { AuthConfig, Session } from '../../auth/session';
import { STORAGE_KEYS, safeStorageGet, safeStorageSet } from '../../shared/browser-storage';

/** PKCE verifier pod sigurnim omotacem pohrane (ne sirovi localStorage). */
const PKCE_STORAGE_KEY = 'lekta.oauth.pkce';

export interface GoogleSignInDeps {
  enabled: boolean;
  config: AuthConfig;
  doc: Document;
  location: Pick<Location, 'origin' | 'pathname' | 'search' | 'href' | 'assign'>;
  history: Pick<History, 'replaceState'>;
  loadSession: () => Session | null;
  saveSession: (s: Session) => void;
  pkce: { load(): unknown; save(v: unknown): void };
  toast: (msg: string) => void;
  setStatus: (type: string, msg?: string) => void;
  track: (event: string, data: Record<string, unknown>) => void;
  afterSignIn: () => void;
  loadOAuth?: () => Promise<typeof import('../../auth/google-oauth')>;
  fetchImpl?: typeof fetch;
}

/** Anonimna sesija s popravcima koja bi se prijavom Googleom odvojila od racuna. */
function anonymousToLink(s: Session | null): boolean {
  return !!(s && s.isAnonymous === true && s.userId && !s.email);
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
  if (!googleSignInActive(deps)) return;
  const loadOAuth = deps.loadOAuth ?? (() => import('../../auth/google-oauth'));
  const modal = deps.doc.getElementById('authModal');
  const store = deps.pkce as import('../../auth/google-oauth').PkceStore;

  const syncButton = async () => {
    if (!modal || modal.classList.contains('hidden')) return;
    const box = modal.querySelector('.modal-actions');
    const g = await loadOAuth();
    g.mountGoogleButton(box, !anonymousToLink(deps.loadSession()), () => {
      deps.setStatus('pending', 'Preusmjeravam na Google…');
      g.startGoogleSignIn(deps.config, {
        redirectTo: g.googleRedirectTo(deps.location),
        store,
        assign: (u) => deps.location.assign(u),
      }).catch(() => deps.setStatus('error', 'Prijavu Googleom trenutačno nije moguće pokrenuti.'));
    });
  };
  if (modal && typeof MutationObserver !== 'undefined') {
    new MutationObserver(() => { void syncButton(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  await syncButton();

  let out: Awaited<ReturnType<typeof import('../../auth/google-oauth').completeGoogleSignIn>> = null;
  try {
    const g = await loadOAuth();
    out = await g.completeGoogleSignIn(deps.config, deps.location.search, { store, fetchImpl: deps.fetchImpl });
    if (out) {
      try { deps.history.replaceState(null, '', g.cleanedCallbackUrl(deps.location.href)); } catch { /* fragment ostaje, sesija ne ovisi o tome */ }
    }
  } catch {
    out = { ok: false, message: 'prijava Googleom nije uspjela' };
  }
  if (!out) return;
  if (out.ok) {
    deps.saveSession(out.session);
    deps.toast('Prijava uspješna.');
    deps.track('auth_signed_in', { method: 'google' });
    deps.afterSignIn();
  } else {
    deps.toast('Prijava Googleom nije uspjela. Pokušaj ponovno ili se prijavi e-mailom.');
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
    pkce: { load: () => safeStorageGet(PKCE_STORAGE_KEY, null), save: (v) => safeStorageSet(PKCE_STORAGE_KEY, v) },
    ...app,
  };
}
