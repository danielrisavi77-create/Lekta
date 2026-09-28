/**
 * Cloudflare Turnstile za Supabase Auth (T89, odluka vlasnika 2026-09-28).
 *
 * Zasto: produkcijski Auth ima ukljucene anonimne prijave, a captcha je bio iskljucen (T84), pa
 * je svaki skripteni klijent mogao otvarati racune bez ogranicenja. Supabase Auth ima ugradjenu
 * podrsku za Turnstile: klijent dobije jednokratni token i posalje ga uz Auth poziv, a GoTrue ga
 * provjerava tajnim kljucem koji je SAMO u Supabase dashboardu. Ovdje nema nijedne tajne: site
 * key je javan i dolazi iz `VITE_TURNSTILE_SITE_KEY`.
 *
 * FAIL-OPEN BEZ KLJUCA, I TO SAMO PRIVREMENO. Bez site keyja `getCaptchaToken` odmah vraca
 * `undefined`: nema skripte, nema DOM-a, nema mreze, pa ulaz i prijava rade tocno kao prije. To
 * je ispravno SAMO dok captcha nije ukljucen na Authu. Kad se ukljuci, GoTrue odbija svaki poziv
 * bez tokena, pa build bez kljuca vise ne moze prijaviti nikoga. Zato redoslijed iz
 * docs/deploy/AUTH_CAPTCHA.md: PRVO deploy frontenda s kljucem, TEK ONDA captcha na Authu.
 *
 * Isto vrijedi za kvar ucitavanja (CSP, mreza, blokator) i istek cekanja: vraca se `undefined`, a
 * odluku donosi server. Klijent nikad ne glumi da je captcha prosao.
 */

export const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Koliko se najdulje ceka token; izazov s interakcijom trazi klik korisnika. */
const TOKEN_TIMEOUT_MS = 120_000;

interface TurnstileRenderOptions {
  sitekey: string;
  appearance: 'interaction-only';
  language: string;
  callback: (token: string) => void;
  'error-callback': () => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileRenderOptions): string | undefined;
  remove(widgetId: string): void;
}

export interface CaptchaDeps {
  siteKey?: string;
  doc?: Document;
  /** Vraca Turnstile API nakon ucitavanja skripte; testovi ga podmecu. */
  loadApi?: (doc: Document) => Promise<TurnstileApi | undefined>;
  timeoutMs?: number;
}

export function turnstileSiteKey(): string {
  return String(import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim();
}

let apiPromise: Promise<TurnstileApi | undefined> | null = null;

function loadTurnstileApi(doc: Document): Promise<TurnstileApi | undefined> {
  apiPromise ??= new Promise<TurnstileApi | undefined>((resolve) => {
    const win = doc.defaultView as (Window & { turnstile?: TurnstileApi }) | null;
    if (win?.turnstile) return resolve(win.turnstile);
    const script = doc.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    const fail = () => {
      // Sljedeci pokusaj smije ponovno ucitati skriptu (npr. nakon povratka mreze).
      apiPromise = null;
      script.remove();
      resolve(undefined);
    };
    script.onload = () => (win?.turnstile ? resolve(win.turnstile) : fail());
    script.onerror = fail;
    doc.head.appendChild(script);
  });
  return apiPromise;
}

/**
 * Jednokratni Turnstile token za jedan Auth poziv, ili `undefined` (bez kljuca, kvar, istek).
 * Widget je `interaction-only`: vidi se samo kad Cloudflare trazi klik, inace korisnik nista ne
 * primijeti. Nakon tokena widget i spremnik se uklanjaju, jer je token jednokratan.
 */
export async function getCaptchaToken(deps: CaptchaDeps = {}): Promise<string | undefined> {
  const siteKey = (deps.siteKey ?? turnstileSiteKey()).trim();
  if (!siteKey) return undefined;
  const doc = deps.doc ?? (typeof document === 'undefined' ? undefined : document);
  if (!doc?.body) return undefined;
  const api = await (deps.loadApi ?? loadTurnstileApi)(doc);
  if (!api) return undefined;

  const container = doc.createElement('div');
  container.setAttribute('data-lekta-captcha', '');
  container.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000';
  doc.body.appendChild(container);

  return new Promise<string | undefined>((resolve) => {
    let widgetId: string | undefined;
    let done = false;
    const finish = (token: string | undefined) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        if (widgetId !== undefined) api.remove(widgetId);
      } catch {
        /* widget je vec uklonjen */
      }
      container.remove();
      resolve(token || undefined);
    };
    const timer = setTimeout(() => finish(undefined), deps.timeoutMs ?? TOKEN_TIMEOUT_MS);
    try {
      widgetId = api.render(container, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        language: 'hr',
        callback: (token) => finish(token),
        'error-callback': () => finish(undefined),
        'expired-callback': () => finish(undefined),
        'timeout-callback': () => finish(undefined),
      });
    } catch {
      finish(undefined);
    }
  });
}
