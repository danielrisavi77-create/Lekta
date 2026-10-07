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

/**
 * Koliko se najdulje ceka ucitavanje api.js (Codex T89-01). Zahtjev koji nikad ne zavrsi (ni load
 * ni error) inace bi zadrzao Auth poziv zauvijek, jer rok tokena krece tek nakon ucitavanja.
 */
const SCRIPT_TIMEOUT_MS = 20_000;

interface TurnstileRenderOptions {
  sitekey: string;
  appearance: 'interaction-only';
  language: string;
  retry: 'never';
  'refresh-expired': 'never';
  'refresh-timeout': 'never';
  callback: (token: string) => void;
  'error-callback': (code?: string) => boolean;
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
  scriptTimeoutMs?: number;
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

function withinTimeout<T>(promise: Promise<T | undefined>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(undefined); },
    );
  });
}

/** Poruka kad Auth odbije poziv zbog captche (Codex T89-02). */
export const CAPTCHA_REJECTED_MESSAGE =
  'Sigurnosna provjera nije dovršena. Pokušaj ponovno.';

/**
 * Vidljiva obavijest za tok koji nema vlastiti obrazac (anonimna prijava iza popravka): bez nje bi
 * razlog nestao, a korisnik bi vidio samo e-mail prijavu. Jedna obavijest, `role="alert"`.
 */
export function showCaptchaRejectedNotice(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (!doc?.body || doc.querySelector('[data-lekta-captcha-odbijen]')) return;
  const note = doc.createElement('div');
  note.setAttribute('data-lekta-captcha-odbijen', '');
  note.setAttribute('role', 'alert');
  note.textContent = CAPTCHA_REJECTED_MESSAGE;
  note.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;max-width:min(92vw,480px);padding:12px 16px;border-radius:8px;background:#1f2937;color:#fff;font:14px/1.4 system-ui,sans-serif';
  doc.body.appendChild(note);
  setTimeout(() => note.remove(), 12_000);
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
  const api = await withinTimeout((deps.loadApi ?? loadTurnstileApi)(doc), deps.scriptTimeoutMs ?? SCRIPT_TIMEOUT_MS);
  if (!api) {
    // Visece ili palo ucitavanje ne smije ostati u predmemoriji: sljedeci pokusaj krece ispocetka.
    if (!deps.loadApi) apiPromise = null;
    return undefined;
  }

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
      // Callback moze stici tijekom rendera. Cekaj njegov zavrsetak i dodjelu widgetId.
      // Uklanjanje izvan callbacka izbjegava promjenu DOM-a usred Turnstile obrade.
      queueMicrotask(() => {
        try {
          if (widgetId !== undefined) api.remove(widgetId);
        } catch {
          /* widget je vec uklonjen */
        }
        container.remove();
        resolve(token || undefined);
      });
    };
    const timer = setTimeout(() => finish(undefined), deps.timeoutMs ?? TOKEN_TIMEOUT_MS);
    try {
      widgetId = api.render(container, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        language: 'hr',
        // Svaki Auth pokusaj ima svoj widget; nakon zavrsetka nema automatskog reseta.
        retry: 'never',
        'refresh-expired': 'never',
        'refresh-timeout': 'never',
        callback: (token) => finish(token),
        'error-callback': (code) => {
          if (!done) {
            // Samo javni numericki kod; nikad token, poruka providera ni tajni kljuc.
            console.warn('[Lekta CAPTCHA] Turnstile error', /^\d{6}$/.test(code ?? '') ? code : 'unknown');
            finish(undefined);
          }
          return true;
        },
        'expired-callback': () => finish(undefined),
        'timeout-callback': () => finish(undefined),
      });
    } catch {
      finish(undefined);
    }
  });
}
