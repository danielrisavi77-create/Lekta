import { describe, it, expect } from 'vitest';

import {
  resolveCheckout,
  buildLemonSqueezyCheckout,
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
    morProductId: 'ls-variant-123',
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

describe('buildLemonSqueezyCheckout', () => {
  it('nosi user_id i product_id u custom podacima', () => {
    const body = buildLemonSqueezyCheckout({
      storeId: '1',
      variantId: 'v9',
      userId: 'u1',
      productId: 'slot_diplomski',
    });
    expect(body.data.attributes.checkout_data).toEqual({ custom: { user_id: 'u1', product_id: 'slot_diplomski' } });
    expect(body.data.relationships.variant.data.id).toBe('v9');
    expect(body.data.relationships.store.data.id).toBe('1');
  });
  it('dodaje referral_code samo kad postoji', () => {
    const withRef = buildLemonSqueezyCheckout({ storeId: '1', variantId: 'v', userId: 'u', productId: 'p', referralCode: 'R' });
    expect((withRef.data.attributes.checkout_data as any).custom.referral_code).toBe('R');
    const withoutRef = buildLemonSqueezyCheckout({ storeId: '1', variantId: 'v', userId: 'u', productId: 'p' });
    expect('referral_code' in (withoutRef.data.attributes.checkout_data as any).custom).toBe(false);
  });
  it('dodaje redirect_url samo kad postoji', () => {
    const body = buildLemonSqueezyCheckout({ storeId: '1', variantId: 'v', userId: 'u', productId: 'p', redirectUrl: 'https://lekta.hr/ok' });
    expect((body.data.attributes as any).product_options).toEqual({ redirect_url: 'https://lekta.hr/ok' });
  });
});

describe('createCheckout (klijent, injektabilan fetch)', () => {
  const config = { endpoint: 'https://edge/create-checkout' };
  function res(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }

  it('bez endpointa -> error', async () => {
    const out = await createCheckout({ endpoint: '' }, 'jwt', 'slot_diplomski');
    expect(out.kind).toBe('error');
  });
  it('200 s checkoutUrl -> ok', async () => {
    const out = await createCheckout(config, 'jwt', 'slot_diplomski', null, async () =>
      res(200, { checkoutUrl: 'https://ls/checkout/x' }),
    );
    expect(out).toEqual({ kind: 'ok', checkoutUrl: 'https://ls/checkout/x' });
  });
  it('salje Authorization header i samo productId u tijelu', async () => {
    let seen: RequestInit | undefined;
    await createCheckout(config, 'jwt-token', 'slot_diplomski', 'REF', async (_url, init) => {
      seen = init;
      return res(200, { checkoutUrl: 'x' });
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
  it('200 bez checkoutUrl -> error', async () => {
    const out = await createCheckout(config, 'j', 'p', null, async () => res(200, {}));
    expect(out.kind).toBe('error');
  });
});
