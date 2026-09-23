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
}

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
 * Skripta se ne ubacuje ako je vec prisutna (npr. drugi ekran ju je ucitao): tada se ceka njezin
 * `load`. Neuspjeh se ne kesira kao uspjeh; sljedeci poziv smije pokusati ponovno.
 */
export function loadStripeJs(host: StripeLoaderHost = defaultHost()): Promise<StripeFactory> {
  const ready = host.getStripe();
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;
  loading = new Promise<StripeFactory>((resolve, reject) => {
    const done = (): void => {
      const factory = host.getStripe();
      if (factory) resolve(factory);
      else reject(new Error('Stripe.js ucitan, ali globalni Stripe ne postoji'));
    };
    const existing = host.document.querySelector(`script[src="${STRIPE_JS_URL}"]`);
    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => reject(new Error('Stripe.js se nije ucitao')), { once: true });
      return;
    }
    const el = host.document.createElement('script');
    el.src = STRIPE_JS_URL;
    el.async = true;
    el.addEventListener('load', done, { once: true });
    el.addEventListener('error', () => reject(new Error('Stripe.js se nije ucitao')), { once: true });
    host.document.head.appendChild(el);
  }).catch((e) => {
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
    take('--line', 'colorTextPlaceholder');
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
  | { kind: 'redirected' }
  | { kind: 'error'; message: string };

/**
 * Potvrdi placanje BEZ napustanja stranice kad god je moguce (`redirect: 'if_required'`).
 *
 * Nacini placanja koji obavezno traze bankovnu stranicu (npr. 3D Secure preusmjerenje) i dalje
 * odvedu korisnika na `returnUrl`; tada ovaj poziv ne vrati nista korisno, pa je ishod
 * `redirected`, a ne lazni uspjeh.
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
  if (status === 'succeeded' || status === 'processing') {
    return { kind: 'ok', paymentIntentId: String(out?.paymentIntent?.id ?? '') };
  }
  if (!status) return { kind: 'redirected' };
  return { kind: 'error', message: `Plaćanje nije dovršeno (${status}).` };
}
