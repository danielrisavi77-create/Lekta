/**
 * supabase/functions/create-checkout/handler.ts: IZVRSEN put handlera (F18 krug 2).
 *
 * Kriterij (1) "create-checkout vraca clientSecret iz Stripe PaymentIntenta s iznosom iz
 * products.price_eur, nema 409 product_not_mapped" se dotad mjerio samo na
 * buildStripePaymentIntentParams. Vracen `intent.id` umjesto `intent.client_secret`, iznos iz
 * klijentskog tijela ili vracen uvjet na mor_product_id prosli bi sve ostale provjere. Ovdje se
 * handler vrti nad laznom bazom i laznim Stripeom i tvrdi se sto je stvarno poslano i vraceno.
 */
import { describe, it, expect } from 'vitest';

import { createCheckoutHandler } from '../supabase/functions/create-checkout/handler';
import { CHECKOUT_CONSENT_TEXTS } from '../src/legal/consent-text';
import { fakeAdmin, argOf, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';

const NOW_MS = Date.UTC(2026, 8, 26, 10, 0, 0);
// Sinteticke vrijednosti sastavljene iz dijelova: gitleaks generic-api-key hvata literal oblika
// kljuca i u testu (vidi .gitleaksignore, 70548aef), a ovdje nema nicega stvarnog.
const FAKE_CLIENT_SECRET = ['pi_abc', 'secret', 'xyz'].join('_');
const FAKE_SK = ['sk', 'test', 'x'].join('_');
const FAKE_PK = ['pk', 'test', 'x'].join('_');
const TERMS = Object.keys(CHECKOUT_CONSENT_TEXTS)[0];

const PRODUCT_ROW = {
  id: 'slot_diplomski',
  kind: 'slot',
  audience: 'retail',
  work_type: 'diplomski',
  slots_total: 1,
  purchase_window_days: 90,
  price_eur: 9.99,
  // Naslijedjena kolona je NAMJERNO prazna: checkout ne smije o njoj ovisiti.
  mor_product_id: null,
  manual_fulfillment: false,
  active: true,
};

function request(body: Record<string, unknown>, token = 'jwt-user'): Request {
  return new Request('https://edge.test/functions/v1/create-checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json', Origin: 'https://lektahr.netlify.app' },
    body: JSON.stringify(body),
  });
}

const CONSENT = {
  immediateDelivery: true,
  withdrawalWaived: true,
  text: CHECKOUT_CONSENT_TEXTS[TERMS],
  timestamp: new Date(NOW_MS).toISOString(),
  termsVersion: TERMS,
};

interface StripeSeen {
  url: string;
  headers: Record<string, string>;
  body: URLSearchParams;
}

async function run(
  body: Record<string, unknown>,
  opts: {
    resolve?: (c: FakeCall) => FakeResult | undefined;
    stripe?: { status: number; json: unknown };
    keys?: { secret: string; publishable: string };
  } = {},
) {
  const db = fakeAdmin((c) => {
    const o = opts.resolve?.(c);
    if (o) return o;
    if (c.table === 'checkout_consents' && writeOp(c) === 'select') return { count: 0 };
    if (c.table === 'products') return { data: PRODUCT_ROW };
    return undefined;
  });
  const stripeCalls: StripeSeen[] = [];
  const handler = createCheckoutHandler({
    asUser: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'kupac@example.com' } } }) } }),
    admin: () => db.admin,
    stripeSecretKey: opts.keys?.secret ?? FAKE_SK,
    stripePublishableKey: opts.keys?.publishable ?? FAKE_PK,
    dailyCap: 20,
    allowedOrigins: ['https://lektahr.netlify.app'],
    now: () => NOW_MS,
    fetchImpl: (async (url: string, init: RequestInit) => {
      stripeCalls.push({
        url,
        headers: init.headers as Record<string, string>,
        body: new URLSearchParams(String(init.body)),
      });
      const s = opts.stripe ?? {
        status: 200,
        json: { id: 'pi_abc', client_secret: FAKE_CLIENT_SECRET, amount: 999, currency: 'eur' },
      };
      return new Response(JSON.stringify(s.json), { status: s.status });
    }) as unknown as typeof fetch,
  });
  const res = await handler(request(body));
  const out = (await res.json()) as Record<string, unknown>;
  return { res, out, calls: db.calls, stripeCalls };
}

describe('create-checkout handler', () => {
  it('vraca clientSecret IZ PaymentIntenta, iznos iz products.price_eur, bez mor_product_id uvjeta', async () => {
    const { res, out, stripeCalls, calls } = await run({
      productId: 'slot_diplomski',
      consent: CONSENT,
      // Klijentov iznos se nikad ne cita (kriterij 14.1/14.2).
      amount: 1,
      priceEur: 0.01,
    });
    expect(res.status, JSON.stringify(out)).toBe(200);
    expect(out).toEqual({
      clientSecret: FAKE_CLIENT_SECRET,
      paymentIntentId: 'pi_abc',
      amountCents: 999,
      currency: 'eur',
      publishableKey: FAKE_PK,
    });

    expect(stripeCalls).toHaveLength(1);
    const call = stripeCalls[0];
    expect(call.url).toBe('https://api.stripe.com/v1/payment_intents');
    expect(call.headers.Authorization).toBe(`Bearer ${FAKE_SK}`);
    expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(call.headers['Idempotency-Key']).toBeTruthy();
    expect(call.body.get('amount')).toBe('999');
    expect(call.body.get('currency')).toBe('eur');
    expect(call.body.get('metadata[user_id]')).toBe('user-1');
    expect(call.body.get('metadata[product_id]'), 'webhook trazi proizvod po OVOM id-u').toBe('slot_diplomski');
    expect(call.body.get('receipt_email')).toBe('kupac@example.com');
    // Placanje ne smije napustiti stranicu: Stripe ne nudi nacine s preusmjeravanjem (Z36).
    expect(call.body.get('automatic_payment_methods[allow_redirects]')).toBe('never');

    // Pristanak je zapisan PRIJE Stripe poziva, sa serverskim vremenom.
    const consent = calls.find((c) => c.table === 'checkout_consents' && writeOp(c) === 'insert')!;
    expect(argOf(consent, 'insert')).toMatchObject({
      user_id: 'user-1',
      product_id: 'slot_diplomski',
      consented_at: new Date(NOW_MS).toISOString(),
    });
  });

  it('proizvod bez mor_product_id NIJE 409 product_not_mapped (uvjet je uklonjen)', async () => {
    const { res, out } = await run({ productId: 'slot_diplomski', consent: CONSENT });
    expect(res.status).not.toBe(409);
    expect(out.error).toBeUndefined();
  });

  it('Stripe odgovor bez client_secret je 502, ne 200 s praznim kljucem', async () => {
    const { res, out } = await run(
      { productId: 'slot_diplomski', consent: CONSENT },
      { stripe: { status: 200, json: { id: 'pi_abc' } } },
    );
    expect(res.status).toBe(502);
    expect(out).toEqual({ error: 'no_client_secret' });
  });

  it('greska Stripea je 502 bez sirovog tijela providera', async () => {
    const { res, out } = await run(
      { productId: 'slot_diplomski', consent: CONSENT },
      { stripe: { status: 402, json: { error: { message: 'interna poruka providera' } } } },
    );
    expect(res.status).toBe(502);
    expect(out).toEqual({ error: 'checkout_failed' });
  });

  it('bez Stripe kljuceva je 503 i Stripe se ne zove', async () => {
    const { res, stripeCalls } = await run(
      { productId: 'slot_diplomski', consent: CONSENT },
      { keys: { secret: '', publishable: 'pk' } },
    );
    expect(res.status).toBe(503);
    expect(stripeCalls).toHaveLength(0);
  });

  it('nepoznat ili neaktivan proizvod je 404 i Stripe se ne zove', async () => {
    const { res, stripeCalls } = await run(
      { productId: 'nema', consent: CONSENT },
      { resolve: (c) => (c.table === 'products' ? { data: null } : undefined) },
    );
    expect(res.status).toBe(404);
    expect(stripeCalls).toHaveLength(0);
  });

  it('Katedra pass (retail, aktivan, s cijenom, bez mor_product_id) je 404: nema PaymentIntenta ni privole', async () => {
    // Redak doslovno iz migracije 0071. Prije F18 ga je blokirao samo prazan mor_product_id.
    const katedra = {
      id: 'katedra_pass_diplomski',
      kind: 'pass',
      audience: 'retail',
      work_type: 'diplomski',
      slots_total: 1,
      slot_window_days: 14,
      purchase_window_days: 365,
      price_eur: 129.9,
      mor_product_id: null,
      manual_fulfillment: false,
      active: true,
    };
    const { res, out, stripeCalls, calls } = await run(
      { productId: 'katedra_pass_diplomski', consent: CONSENT },
      { resolve: (c) => (c.table === 'products' ? { data: katedra } : undefined) },
    );
    expect(res.status).toBe(404);
    expect(out).toEqual({ error: 'unknown_product' });
    expect(stripeCalls).toHaveLength(0);
    expect(calls.some((c) => c.table === 'checkout_consents' && writeOp(c) === 'insert')).toBe(false);
  });

  it('dnevni cap je 429 prije pristanka i Stripe poziva', async () => {
    const { res, stripeCalls, calls } = await run(
      { productId: 'slot_diplomski', consent: CONSENT },
      { resolve: (c) => (c.table === 'checkout_consents' && writeOp(c) === 'select' ? { count: 20 } : undefined) },
    );
    expect(res.status).toBe(429);
    expect(stripeCalls).toHaveLength(0);
    expect(calls.some((c) => c.table === 'checkout_consents' && writeOp(c) === 'insert')).toBe(false);
  });

  it('bez privole je 400 i Stripe se ne zove', async () => {
    const { res, stripeCalls } = await run({ productId: 'slot_diplomski' });
    expect(res.status).toBe(400);
    expect(stripeCalls).toHaveLength(0);
  });
});
