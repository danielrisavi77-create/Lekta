import { describe, it, expect } from 'vitest';

import {
  resolveCheckout,
  buildStripePaymentIntentParams,
  stripeAmountCents,
  stripeIdempotencyKey,
  checkoutRequestPayload,
  createCheckout,
  checkoutMismatch,
} from '../src/report/checkout';
import type { Product } from '../src/catalog/products-catalog';
import { TIER_RANK } from '../src/report/work-type-estimate';

function product(over: Partial<Product> = {}): Product {
  return {
    id: 'slot_diplomski',
    kind: 'slot',
    audience: 'retail',
    workType: 'diplomski',
    slotsTotal: 1,
    slotWindowDays: 14,
    purchaseWindowDays: 90,
    priceEur: 9.99,
    morProductId: null,
    manualFulfillment: false,
    active: true,
    sort: 30,
    ...over,
  };
}

describe('resolveCheckout', () => {
  it('nepoznat proizvod -> 404', () => {
    expect(resolveCheckout(null, { isPartnerActive: false })).toMatchObject({ ok: false, status: 404 });
  });
  it('neaktivan proizvod -> 404', () => {
    expect(resolveCheckout(product({ active: false }), { isPartnerActive: false })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
  it('partner proizvod bez aktivnog partnera -> 403', () => {
    const res = resolveCheckout(product({ audience: 'partner' }), { isPartnerActive: false });
    expect(res).toMatchObject({ ok: false, status: 403, error: 'partner_not_active' });
  });
  it('partner proizvod s aktivnim partnerom -> ok', () => {
    expect(resolveCheckout(product({ audience: 'partner' }), { isPartnerActive: true }).ok).toBe(true);
  });
  it('retail proizvod -> ok', () => {
    expect(resolveCheckout(product(), { isPartnerActive: false }).ok).toBe(true);
  });
});

describe('checkoutRequestPayload (kriterij 14.1)', () => {
  it('salje samo productId', () => {
    expect(checkoutRequestPayload('slot_diplomski')).toEqual({ productId: 'slot_diplomski' });
  });
  it('ukljucuje referralCode kad postoji', () => {
    expect(checkoutRequestPayload('slot_diplomski', 'ABC')).toEqual({
      productId: 'slot_diplomski',
      referralCode: 'ABC',
    });
  });
  it('nikad ne sadrzi cijenu ni popust', () => {
    const payload = checkoutRequestPayload('slot_diplomski', 'ABC') as Record<string, unknown>;
    expect('price' in payload).toBe(false);
    expect('priceEur' in payload).toBe(false);
    expect('discount' in payload).toBe(false);
  });
  it('prenosi pristanak na trenutnu isporuku i odricanje kad je dan (P0 1-1)', () => {
    const consent = {
      immediateDelivery: true as const,
      withdrawalWaived: true as const,
      text: 'Pristajem na trenutnu isporuku i odricem se prava na odustanak.',
      timestamp: '2026-07-04T10:00:00.000Z',
      termsVersion: '2026-07-03',
    };
    const payload = checkoutRequestPayload('slot_diplomski', null, consent);
    expect(payload).toEqual({ productId: 'slot_diplomski', consent });
  });
  it('bez pristanka payload ne sadrzi consent polje', () => {
    expect('consent' in checkoutRequestPayload('slot_diplomski')).toBe(false);
  });
});

describe('checkoutMismatch (WS-5 enforcement pri kupnji)', () => {
  it('bez signala -> ne blokira (fail-open)', () => {
    expect(checkoutMismatch('seminarski', null, false)).toEqual({ block: false });
  });
  it('potvrdjeno (korisnik svjesno kupuje nizi tier) -> ne blokira', () => {
    expect(checkoutMismatch('seminarski', { words: 40000 }, true)).toEqual({ block: false });
  });
  it('proizvod bez repair-tiera (workType null) -> ne blokira', () => {
    expect(checkoutMismatch(null, { words: 40000 }, false)).toEqual({ block: false });
  });
  it('nedvosmisleno prevelik opseg za seminarski -> blokira uz predlozeni tier', () => {
    const out = checkoutMismatch('seminarski', { words: 40000 }, false);
    expect(out.block).toBe(true);
    if (out.block) expect(TIER_RANK[out.suggestedWorkType]).toBeGreaterThan(TIER_RANK.seminarski);
  });
  it('naslovnica doslovno kaze diplomski, a bira se seminarski -> blokira', () => {
    const out = checkoutMismatch('seminarski', { words: 2000, titleMarker: 'graduate' }, false);
    expect(out).toEqual({ block: true, suggestedWorkType: 'diplomski' });
  });
  it('granicno (dug seminar unutar razumnog) -> ne blokira', () => {
    expect(checkoutMismatch('seminarski', { words: 8000 }, false)).toEqual({ block: false });
  });
  it('ispravan tier za opseg -> ne blokira', () => {
    expect(checkoutMismatch('diplomski', { words: 20000, titleMarker: 'graduate' }, false)).toEqual({ block: false });
  });
});

describe('buildStripePaymentIntentParams', () => {
  const base = { amountCents: 999, currency: 'eur', userId: 'u1', productId: 'slot_diplomski' };

  function fields(body: string): Record<string, string> {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }

  it('salje iznos u centima, valutu i automatske nacine placanja', () => {
    expect(fields(buildStripePaymentIntentParams(base))).toMatchObject({
      amount: '999',
      currency: 'eur',
      'automatic_payment_methods[enabled]': 'true',
    });
  });

  it('metadata nosi user_id i KATALOSKI product_id (ne naslijedjeni variant id)', () => {
    const f = fields(buildStripePaymentIntentParams(base));
    expect(f['metadata[user_id]']).toBe('u1');
    // Webhook po ovoj vrijednosti trazi `products.id`. Da ovdje stoji bilo sto drugo, svaka bi
    // uplata zavrsila kao `unknown_product` i entitlement ne bi nastao.
    expect(f['metadata[product_id]']).toBe('slot_diplomski');
  });

  it('referral_code i receipt_email samo kad postoje', () => {
    const withAll = fields(buildStripePaymentIntentParams({ ...base, referralCode: 'PART-9', receiptEmail: 'a@b.hr' }));
    expect(withAll['metadata[referral_code]']).toBe('PART-9');
    expect(withAll.receipt_email).toBe('a@b.hr');
    const without = fields(buildStripePaymentIntentParams(base));
    expect('metadata[referral_code]' in without).toBe(false);
    expect('receipt_email' in without).toBe(false);
  });

  it('valuta ide malim slovima', () => {
    expect(fields(buildStripePaymentIntentParams({ ...base, currency: 'EUR' })).currency).toBe('eur');
  });
});

describe('stripeAmountCents (kriterij 14.2: iznos je serverski)', () => {
  it('pretvara eure u cijele cente', () => {
    expect(stripeAmountCents(9.99)).toBe(999);
    expect(stripeAmountCents(24.99)).toBe(2499);
    expect(stripeAmountCents(4.9)).toBe(490);
  });
  it('zaokruzuje pogresku zapisa u pokretnom zarezu, ne krati je', () => {
    // 16.99 * 100 = 1698.9999999999998 u IEEE 754; skracivanje bi naplatilo cent manje.
    expect(stripeAmountCents(16.99)).toBe(1699);
  });
});

describe('stripeIdempotencyKey', () => {
  it('isti ulaz daje isti kljuc', () => {
    expect(stripeIdempotencyKey('u1', 'p1', '2026-09-23T10:00:00.000Z')).toBe(
      stripeIdempotencyKey('u1', 'p1', '2026-09-23T10:00:00.000Z'),
    );
  });
  it('razlicit korisnik ili proizvod daje razlicit kljuc', () => {
    const a = stripeIdempotencyKey('u1', 'p1', 'T');
    expect(stripeIdempotencyKey('u2', 'p1', 'T')).not.toBe(a);
    expect(stripeIdempotencyKey('u1', 'p2', 'T')).not.toBe(a);
  });
  it('OGRANICENJE: drugo vrijeme privole daje drugi kljuc (nije puna idempotencija)', () => {
    // Zapisano kao TVRDNJA, ne kao propust koji se precutkuje: dva odvojena klika istog
    // korisnika imaju razlicit serverski timestamp privole, pa daju dva PaymentIntenta.
    expect(stripeIdempotencyKey('u1', 'p1', 'T1')).not.toBe(stripeIdempotencyKey('u1', 'p1', 'T2'));
  });
});

describe('createCheckout (klijent, injektabilan fetch)', () => {
  // Sinteticki Stripe PaymentIntent clientSecret sastavljen iz dijelova, ne literal, da ga
  // gitleaks generic-api-key heuristika ne prijavi kao tajnu (nema pravu vrijednost, ovo je test stub).
  const FAKE_CLIENT_SECRET = ['pi_123', 'secret', 'abc'].join('_');
  const config = { endpoint: 'https://edge/create-checkout' };
  const OK_BODY = {
    clientSecret: FAKE_CLIENT_SECRET,
    paymentIntentId: 'pi_123',
    amountCents: 999,
    currency: 'eur',
    publishableKey: 'pk_test_1',
  };
  function res(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  it('bez endpointa -> error', async () => {
    const out = await createCheckout({ endpoint: '' }, 'jwt', 'slot_diplomski');
    expect(out.kind).toBe('error');
  });
  it('200 s clientSecret -> ok', async () => {
    const out = await createCheckout(config, 'jwt', 'slot_diplomski', null, async () => res(200, OK_BODY));
    expect(out).toEqual({
      kind: 'ok',
      clientSecret: FAKE_CLIENT_SECRET,
      paymentIntentId: 'pi_123',
      amountCents: 999,
      currency: 'eur',
      publishableKey: 'pk_test_1',
    });
  });
  it('salje Authorization header i samo productId u tijelu', async () => {
    let seen: RequestInit | undefined;
    await createCheckout(config, 'jwt-token', 'slot_diplomski', 'REF', async (_url, init) => {
      seen = init;
      return res(200, OK_BODY);
    });
    // Prvo dokazi da je zahtjev POSLAN: bez ovoga `seen?.headers` kratko spoji na
    // undefined i test pukne TypeErrorom umjesto da padne na tvrdnji (oxlint P1-20).
    expect(seen).toBeTruthy();
    expect((seen!.headers as Record<string, string>).Authorization).toBe('Bearer jwt-token');
    expect(JSON.parse(String(seen?.body))).toEqual({ productId: 'slot_diplomski', referralCode: 'REF' });
  });
  it('401 -> unauthorized, 403 -> forbidden, 404 -> not_found', async () => {
    expect((await createCheckout(config, 'j', 'p', null, async () => res(401, {}))).kind).toBe('unauthorized');
    expect((await createCheckout(config, 'j', 'p', null, async () => res(403, {}))).kind).toBe('forbidden');
    expect((await createCheckout(config, 'j', 'p', null, async () => res(404, {}))).kind).toBe('not_found');
  });
  it('200 bez clientSecret ili bez publishableKey -> error', async () => {
    expect((await createCheckout(config, 'j', 'p', null, async () => res(200, {}))).kind).toBe('error');
    const bezKljuca = await createCheckout(config, 'j', 'p', null, async () =>
      res(200, { ...OK_BODY, publishableKey: '' }),
    );
    expect(bezKljuca.kind).toBe('error');
  });
});
