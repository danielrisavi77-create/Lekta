/**
 * Stripe Payment Element u stranici (F18, odluka vlasnika 2026-09-23).
 *
 * Zasto ovako, a ne npm paket: Stripe izricito trazi da se `js.stripe.com/v3/` ucita s njihove
 * domene (PCI SAQ A), pa bi bundlani paket ionako samo ucitao istu skriptu. Ovdje nema paketa,
 * samo jedan `<script src>` i tanki omotaci oko API-ja, s injektabilnim globalom da se sve moze
 * testirati bez mreze (happy-dom nikad ne izvrsi stvarni Stripe kod).
 *
 * CSP: `script-src` i `frame-src` moraju dopustati js.stripe.com, `frame-src` i hooks.stripe.com,
 * a `connect-src` api.stripe.com (vidi public/_headers).
 */

export const STRIPE_JS_URL = 'https://js.stripe.com/v3/';

/** Minimalna granica prema Stripe.js; opisujemo samo ono sto stvarno zovemo. */
export interface StripeElement {
  mount(container: HTMLElement | string): void;
  unmount?(): void;
  destroy?(): void;
}

export interface StripeElements {
  create(type: 'payment', options?: Record<string, unknown>): StripeElement;
}

export interface StripeConfirmResult {
  error?: { message?: string; type?: string };
  paymentIntent?: { id?: string; status?: string };
}

export interface StripeLike {
  elements(options: Record<string, unknown>): StripeElements;
  confirmPayment(options: Record<string, unknown>): Promise<StripeConfirmResult>;
}

export type StripeFactory = (publishableKey: string) => StripeLike;

/** Globali koje modul dira; injektabilni da test ne ovisi o stvarnom `window`. */
export interface StripeLoaderHost {
  document: Document;
  getStripe(): StripeFactory | undefined;
  /** Koliko se najdulje ceka `load` ili `error`; zadano {@link STRIPE_JS_TIMEOUT_MS}. */
  timeoutMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/**
 * Gornja granica cekanja na Stripe.js. Bez nje bi obecanje koje ceka dogadjaj koji se vise nikad
 * nece dogoditi (npr. tudji tag koji je vec pao ili se vec ucitao) visjelo zauvijek, a s njim i
 * gumb za placanje koji ostaje iskljucen do ponovnog ucitavanja stranice.
 */
export const STRIPE_JS_TIMEOUT_MS = 20_000;

function defaultHost(): StripeLoaderHost {
  return {
    document,
    getStripe: () => (globalThis as { Stripe?: StripeFactory }).Stripe,
  };
}

/** Jedan zajednicki pokusaj ucitavanja po stranici; drugi poziv ceka isti Promise. */
let loading: Promise<StripeFactory> | null = null;

/** Samo za testove: zaboravi zapamcen pokusaj ucitavanja. */
export function resetStripeJsLoader(): void {
  loading = null;
}

/**
 * Ucitaj `js.stripe.com/v3/` tocno jednom i vrati tvornicu `Stripe(publishableKey)`.
 *
 * Neuspjeh se ne kesira kao uspjeh i NE ostavlja trag u DOM-u: pali `<script>` se uklanja, pa
 * sljedeci poziv umece svjez tag umjesto da ceka `load` ili `error` koji su vec prosli. Isto
 * vrijedi kad se skripta ucita, a globalni `Stripe` ne postoji, i kad istekne
 * {@link STRIPE_JS_TIMEOUT_MS}. Ako je tag vec prisutan (npr. umetnuo ga je drugi ekran), ceka se
 * njegov ishod, ali najdulje do isteka; tada se i taj tag uklanja kao pali.
 */
export function loadStripeJs(host: StripeLoaderHost = defaultHost()): Promise<StripeFactory> {
  const ready = host.getStripe();
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  const arm = host.setTimeout ?? ((fn: () => void, ms: number): unknown => setTimeout(fn, ms));
  const disarm = host.clearTimeout ?? ((h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>));
  loading = new Promise<StripeFactory>((resolve, reject) => {
    const existing = host.document.querySelector(`script[src="${STRIPE_JS_URL}"]`);
    let el: HTMLScriptElement;
    if (existing) {
      el = existing as HTMLScriptElement;
    } else {
      el = host.document.createElement('script');
      el.src = STRIPE_JS_URL;
      el.async = true;
    }
    let settled = false;
    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      disarm(timer);
      el.remove();
      reject(new Error(message));
    };
    const done = (): void => {
      if (settled) return;
      const factory = host.getStripe();
      if (!factory) {
        fail('Stripe.js ucitan, ali globalni Stripe ne postoji');
        return;
      }
      settled = true;
      disarm(timer);
      resolve(factory);
    };
    const timer = arm(() => fail('Stripe.js se nije ucitao na vrijeme'), host.timeoutMs ?? STRIPE_JS_TIMEOUT_MS);
    el.addEventListener('load', done, { once: true });
    el.addEventListener('error', () => fail('Stripe.js se nije ucitao'), { once: true });
    if (!existing) host.document.head.appendChild(el);
  }).catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}

/**
 * Izgled Payment Elementa iz ZIVIH CSS varijabli teme (design-system.css), a ne iz zakucanih
 * boja: tako polje placanja prati svijetlu i tamnu temu bez druge liste vrijednosti koja bi
 * otisla u drift. Bez novih webfontova: uzima se font koji stranica vec koristi.
 */
export function paymentAppearance(el: Element | null, view: { getComputedStyle(e: Element): CSSStyleDeclaration } = window): Record<string, unknown> {
  const variables: Record<string, string> = {};
  if (el) {
    const cs = view.getComputedStyle(el);
    const take = (cssVar: string, key: string): void => {
      const value = cs.getPropertyValue(cssVar).trim();
      if (value) variables[key] = value;
    };
    take('--text', 'colorText');
    take('--panel', 'colorBackground');
    take('--brand', 'colorPrimary');
    take('--danger', 'colorDanger');
    // Placeholder je sekundarni TEKST, pa nosi token sekundarnog teksta (--muted), a ne boju
    // crte (--line): na bijelom polju papira --line ima kontrast oko 1,5:1 i nije citljiv.
    // tests/stripe-payment.test.ts racuna kontrast iz stvarnih tokena (>= 4,5:1, WCAG AA).
    take('--muted', 'colorTextPlaceholder');
    const family = cs.fontFamily?.trim();
    if (family) variables.fontFamily = family;
  }
  return { theme: 'stripe', variables };
}

export interface MountPaymentArgs {
  stripe: StripeLike;
  clientSecret: string;
  container: HTMLElement;
  appearance?: Record<string, unknown>;
}

/** Stvori Elements skupinu za ovaj PaymentIntent i montiraj Payment Element u spremnik. */
export function mountPaymentElement(args: MountPaymentArgs): { elements: StripeElements; element: StripeElement } {
  const elements = args.stripe.elements({
    clientSecret: args.clientSecret,
    appearance: args.appearance ?? paymentAppearance(args.container),
  });
  const element = elements.create('payment');
  element.mount(args.container);
  return { elements, element };
}

export type ConfirmPaymentOutcome =
  | { kind: 'ok'; paymentIntentId: string }
  | { kind: 'processing'; paymentIntentId: string }
  | { kind: 'error'; message: string };

/**
 * Poruka kad Stripe vrati odgovor bez greske i bez statusa PaymentIntenta. Uz
 * `allow_redirects=never` to se ne smije dogoditi, pa se ne prikazuje kao uspjeh ni kao
 * "dovrsava se kod banke", nego kao greska koja kaze sto je poznato: potvrda nije stigla.
 */
export const UNEXPECTED_REDIRECT_MESSAGE =
  'Neočekivano preusmjeravanje: plaćanje nije potvrđeno. Ne plaćaj ponovno dok ne provjeriš potvrdu na e-pošti.';

/**
 * Potvrdi placanje BEZ napustanja stranice (`redirect: 'if_required'`).
 *
 * PaymentIntent nosi `automatic_payment_methods[allow_redirects]=never` (vidi
 * buildStripePaymentIntentParams u src/report/checkout.ts), pa Stripe ne nudi nijedan nacin
 * placanja koji vodi na bankovnu ili vanjsku stranicu. 3D Secure kartice Stripe.js uz
 * `if_required` rjesava u vlastitom okviru na stranici, ne preusmjeravanjem. `return_url` se i
 * dalje salje obrambeno, jer `confirmParams` to polje trazi; uz `allow_redirects=never` do
 * preusmjeravanja ne bi smjelo doci. Stvarno ponasanje Stripe.js u pregledniku nije provjereno
 * ovim testovima. Odgovor bez statusa zato nije "odlazak kod banke" nego greska.
 */
export async function confirmPayment(args: {
  stripe: StripeLike;
  elements: StripeElements;
  returnUrl: string;
}): Promise<ConfirmPaymentOutcome> {
  const out = await args.stripe.confirmPayment({
    elements: args.elements,
    confirmParams: { return_url: args.returnUrl },
    redirect: 'if_required',
  });
  if (out?.error) return { kind: 'error', message: String(out.error.message ?? 'Plaćanje nije uspjelo.') };
  const status = out?.paymentIntent?.status ?? '';
  const paymentIntentId = String(out?.paymentIntent?.id ?? '');
  if (status === 'succeeded') return { kind: 'ok', paymentIntentId };
  // `processing` NIJE uspjeh: novac jos nije naplacen (npr. odgodjeni bankovni nacini bez
  // preusmjeravanja, ako su ukljuceni u Stripe nadzornoj ploci), webhook-mor na njega ne knjizi nista, a
  // payment_intent.succeeded moze stici tek za nekoliko dana. Zato poseban ishod.
  if (status === 'processing') return { kind: 'processing', paymentIntentId };
  if (!status) return { kind: 'error', message: UNEXPECTED_REDIRECT_MESSAGE };
  return { kind: 'error', message: `Plaćanje nije dovršeno (${status}).` };
}

/** Gdje i kojim kljucem pitati bazu je li webhook vec knjizio pravo za ovaj PaymentIntent. */
export interface EntitlementPollConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

/**
 * `booked`: webhook je upisao pravo, otkljucavanje smije krenuti.
 * `pending`: placanje je potvrdjeno, ali pravo jos nije vidljivo nakon cijelog cekanja.
 * `unknown`: okruzenje nema Supabase konfiguraciju ili prijavu, pa se provjera ne moze napraviti.
 */
export type EntitlementWait = 'booked' | 'pending' | 'unknown';

/**
 * Razmaci izmedju upita, ukupno oko 30 s. Stripe webhook obicno stize u sekundi ili dvije, ali
 * pri ponovnom pokusaju zna kasniti; dulje od ovoga se ne drzi korisnika u neizvjesnosti.
 */
export const ENTITLEMENT_POLL_DELAYS_MS: readonly number[] = [800, 1200, 2000, 3000, 4000, 5000, 6000, 8000];

/**
 * Cekaj da webhook `payment_intent.succeeded` knjizi pravo za dani PaymentIntent.
 *
 * Zasto: `confirmPayment` na klijentu zavrsi PRIJE nego Stripe isporuci webhook, a pravo stvara
 * tek webhook. Da se odmah zove generate-report, dobio bi `payment_required` i placeni korisnik bi
 * opet vidio gumb za kupnju (uz rizik druge naplate, jer novi klik stvara novi PaymentIntent).
 *
 * Pita se izravno tablica `entitlements` kroz PostgREST (RLS `entitlements_select_own`), a ne
 * generate-report: svaki odbijeni poziv generate-reporta se biljezi u `report_generations` i
 * trosi dnevni cap korisnika, pa bi cekanje kroz njega kaznjavalo upravo onoga tko je platio.
 * Greska mreze ili odgovor koji nije 2xx ne prekida cekanje; broji se samo nadjen redak.
 */
export async function waitForEntitlement(
  config: EntitlementPollConfig,
  accessToken: string | null | undefined,
  paymentIntentId: string,
  deps: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    delaysMs?: readonly number[];
  } = {},
): Promise<EntitlementWait> {
  const base = String(config.supabaseUrl ?? '').trim().replace(/\/+$/, '');
  const anonKey = String(config.supabaseAnonKey ?? '').trim();
  if (!base || !anonKey || !accessToken || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) return 'unknown';
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const url =
    `${base}/rest/v1/entitlements?select=id&provider=eq.stripe` +
    `&order_id=eq.${encodeURIComponent(paymentIntentId)}&limit=1`;
  const probe = async (): Promise<boolean> => {
    try {
      const res = await fetchImpl(url, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return false;
      const rows = (await res.json()) as unknown;
      return Array.isArray(rows) && rows.length > 0;
    } catch {
      return false;
    }
  };
  if (await probe()) return 'booked';
  for (const ms of deps.delaysMs ?? ENTITLEMENT_POLL_DELAYS_MS) {
    await sleep(ms);
    if (await probe()) return 'booked';
  }
  return 'pending';
}
