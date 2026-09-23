/**
 * src/report/stripe-payment.ts: ucitavanje Stripe.js, montiranje Payment Elementa i potvrda.
 *
 * Nista se ne izvrsava sa stvarne mreze: `loadStripeJs` prima injektabilan host, pa se skripta
 * umece u lazan document i dogadjaji joj se okidaju rucno. Time se dokazuje ponasanje (jedan tag,
 * jedan pokusaj), a ne cinjenica da Stripe postoji.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import {
  STRIPE_JS_URL,
  loadStripeJs,
  resetStripeJsLoader,
  mountPaymentElement,
  confirmPayment,
  paymentAppearance,
  type StripeFactory,
  type StripeLike,
  type StripeElements,
} from '../src/report/stripe-payment';

/**
 * Lazan document: happy-dom bi stvarni `<script>` pokusao DOHVATITI cim se spoji na stablo i sam
 * bi okinuo `error`, pa bi test mjerio njegovu mrezu umjesto nase logike. Ovdje se dogadjaji
 * okidaju rucno, a nijedan bajt ne ode van.
 */
interface FakeScript {
  src: string;
  async: boolean;
  addEventListener(type: string, fn: () => void, opts?: unknown): void;
  fire(type: string): void;
}

function fakeDoc(): { doc: Document; scripts: FakeScript[] } {
  const scripts: FakeScript[] = [];
  const doc = {
    createElement(): FakeScript {
      const listeners: Record<string, Array<() => void>> = {};
      return {
        src: '',
        async: false,
        addEventListener(type: string, fn: () => void) {
          (listeners[type] ??= []).push(fn);
        },
        fire(type: string) {
          for (const fn of listeners[type] ?? []) fn();
        },
      };
    },
    head: { appendChild: (el: FakeScript) => { scripts.push(el); } },
    querySelector: (sel: string) => scripts.find((sc) => sc.src && sel.includes(sc.src)) ?? null,
  };
  return { doc: doc as unknown as Document, scripts };
}

describe('loadStripeJs', () => {
  beforeEach(() => {
    resetStripeJsLoader();
  });

  it('umece tocno jedan <script> s Stripe URL-om i razrjesava se tvornicom', async () => {
    const { doc, scripts } = fakeDoc();
    const factory: StripeFactory = () => ({}) as StripeLike;
    let ready: StripeFactory | undefined;
    const p = loadStripeJs({ document: doc, getStripe: () => ready });
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(STRIPE_JS_URL);
    ready = factory;
    scripts[0].fire('load');
    expect(await p).toBe(factory);
  });

  it('drugi poziv ne umece drugi tag (dva ekrana, jedan Stripe.js)', async () => {
    const { doc, scripts } = fakeDoc();
    let ready: StripeFactory | undefined;
    const host = { document: doc, getStripe: () => ready };
    const a = loadStripeJs(host);
    const b = loadStripeJs(host);
    expect(a).toBe(b);
    expect(scripts).toHaveLength(1);
    ready = (() => ({}) as StripeLike) as StripeFactory;
    scripts[0].fire('load');
    await a;
  });

  it('kad je Stripe vec ucitan, ne dira DOM', async () => {
    const { doc, scripts } = fakeDoc();
    const factory: StripeFactory = () => ({}) as StripeLike;
    expect(await loadStripeJs({ document: doc, getStripe: () => factory })).toBe(factory);
    expect(scripts).toHaveLength(0);
  });

  it('ucitan Stripe.js bez globalnog Stripea je greska, ne tihi uspjeh', async () => {
    const { doc, scripts } = fakeDoc();
    const p = loadStripeJs({ document: doc, getStripe: () => undefined });
    scripts[0].fire('load');
    await expect(p).rejects.toThrow(/globalni Stripe/);
  });

  it('neuspjeh ucitavanja se ne pamti kao uspjeh; sljedeci poziv smije pokusati ponovno', async () => {
    const { doc, scripts } = fakeDoc();
    const host = { document: doc, getStripe: () => undefined };
    const p = loadStripeJs(host);
    scripts[0].fire('error');
    await expect(p).rejects.toThrow();
    scripts.length = 0;
    const drugi = loadStripeJs(host);
    expect(scripts).toHaveLength(1);
    scripts[0].fire('error');
    await expect(drugi).rejects.toThrow();
  });
});

describe('mountPaymentElement', () => {
  it('stvara Elements s clientSecretom i montira Payment Element u zadani spremnik', () => {
    const calls: Record<string, unknown> = {};
    const element = { mount: (c: unknown) => { calls.mounted = c; } };
    const elements: StripeElements = { create: (type) => { calls.type = type; return element; } };
    const stripe: StripeLike = {
      elements: (opts) => { calls.opts = opts; return elements; },
      confirmPayment: async () => ({}),
    };
    const container = document.createElement('div');
    const out = mountPaymentElement({ stripe, clientSecret: 'pi_1_secret', container });
    expect((calls.opts as Record<string, unknown>).clientSecret).toBe('pi_1_secret');
    expect(calls.type).toBe('payment');
    expect(calls.mounted).toBe(container);
    expect(out.elements).toBe(elements);
  });

  it('bez spremnika izgled je prazan skup varijabli, ne baca', () => {
    expect(paymentAppearance(null)).toEqual({ theme: 'stripe', variables: {} });
  });

  it('izgled se cita iz zivih CSS varijabli, ne iz zakucanih boja', () => {
    const el = document.createElement('div');
    const view = {
      getComputedStyle: () =>
        ({
          getPropertyValue: (name: string) => (name === '--text' ? ' #123456 ' : ''),
          fontFamily: 'Inter Tight',
        }) as unknown as CSSStyleDeclaration,
    };
    expect(paymentAppearance(el, view)).toEqual({
      theme: 'stripe',
      variables: { colorText: '#123456', fontFamily: 'Inter Tight' },
    });
  });
});

describe('confirmPayment (redirect: if_required)', () => {
  const elements = {} as StripeElements;

  function stripeReturning(result: unknown): { stripe: StripeLike; seen: Record<string, unknown> } {
    const seen: Record<string, unknown> = {};
    return {
      seen,
      stripe: {
        elements: () => elements,
        confirmPayment: async (opts) => {
          Object.assign(seen, opts);
          return result as never;
        },
      },
    };
  }

  it('trazi potvrdu bez preusmjeravanja kad god je moguce', async () => {
    const { stripe, seen } = stripeReturning({ paymentIntent: { id: 'pi_1', status: 'succeeded' } });
    const out = await confirmPayment({ stripe, elements, returnUrl: 'https://lekta.hr/rad/' });
    expect(seen.redirect).toBe('if_required');
    expect((seen.confirmParams as Record<string, unknown>).return_url).toBe('https://lekta.hr/rad/');
    expect(out).toEqual({ kind: 'ok', paymentIntentId: 'pi_1' });
  });

  it('status processing se racuna kao uspjeh (sredstva su rezervirana)', async () => {
    const { stripe } = stripeReturning({ paymentIntent: { id: 'pi_2', status: 'processing' } });
    expect(await confirmPayment({ stripe, elements, returnUrl: 'x' })).toEqual({ kind: 'ok', paymentIntentId: 'pi_2' });
  });

  it('greska Stripea vraca poruku, nikad tihi uspjeh', async () => {
    const { stripe } = stripeReturning({ error: { message: 'Kartica je odbijena.' } });
    expect(await confirmPayment({ stripe, elements, returnUrl: 'x' })).toEqual({
      kind: 'error',
      message: 'Kartica je odbijena.',
    });
  });

  it('prazan odgovor znaci odlazak na bankovnu stranicu, ne uspjeh', async () => {
    const { stripe } = stripeReturning({});
    expect(await confirmPayment({ stripe, elements, returnUrl: 'x' })).toEqual({ kind: 'redirected' });
  });

  it('nedovrseno placanje nije uspjeh', async () => {
    const { stripe } = stripeReturning({ paymentIntent: { id: 'pi_3', status: 'requires_payment_method' } });
    const out = await confirmPayment({ stripe, elements, returnUrl: 'x' });
    expect(out.kind).toBe('error');
  });
});
