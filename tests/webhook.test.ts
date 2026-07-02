import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  parseLemonEvent,
  verifyLemonSignature,
  isoAfterDays,
  isPassProduct,
  makePassCouponCode,
  PASS_COUPON_VALID_DAYS,
  type LemonWebhookPayload,
} from '../src/report/webhook';

describe('parseLemonEvent', () => {
  it('order_created: izvlaci orderId, userId, variantId (mor_product_id)', () => {
    const payload: LemonWebhookPayload = {
      meta: { event_name: 'order_created', custom_data: { user_id: 'u1', product_id: 'slot_diplomski' } },
      data: { id: 999, attributes: { status: 'paid', first_order_item: { variant_id: 555 } } },
    };
    expect(parseLemonEvent(payload)).toEqual({
      eventName: 'order_created',
      orderId: '999',
      userId: 'u1',
      variantId: '555',
      refunded: false,
    });
  });
  it('order_refunded -> refunded true', () => {
    const payload: LemonWebhookPayload = {
      meta: { event_name: 'order_refunded', custom_data: { user_id: 'u1' } },
      data: { id: 999, attributes: { status: 'refunded' } },
    };
    expect(parseLemonEvent(payload).refunded).toBe(true);
  });
  it('prazan payload ne baca (prazni stringovi)', () => {
    const ev = parseLemonEvent({});
    expect(ev.orderId).toBe('');
    expect(ev.userId).toBe('');
  });
});

describe('verifyLemonSignature (HMAC-SHA256)', () => {
  const secret = 'whsec_test';
  const raw = '{"meta":{"event_name":"order_created"}}';
  const validSig = createHmac('sha256', secret).update(raw).digest('hex');

  it('ispravan potpis -> true', async () => {
    expect(await verifyLemonSignature(raw, validSig, secret)).toBe(true);
  });
  it('pogresan secret -> false', async () => {
    expect(await verifyLemonSignature(raw, validSig, 'krivi')).toBe(false);
  });
  it('pogresan potpis -> false', async () => {
    expect(await verifyLemonSignature(raw, 'deadbeef', secret)).toBe(false);
  });
  it('prazan secret ili potpis -> false', async () => {
    expect(await verifyLemonSignature(raw, validSig, '')).toBe(false);
    expect(await verifyLemonSignature(raw, null, secret)).toBe(false);
  });
  it('velika/mala slova potpisa ne mijenjaju rezultat', async () => {
    expect(await verifyLemonSignature(raw, validSig.toUpperCase(), secret)).toBe(true);
  });
});

describe('isoAfterDays', () => {
  it('dodaje dane u ISO', () => {
    const base = Date.UTC(2026, 0, 1); // 2026-01-01
    expect(isoAfterDays(base, 90)).toBe(new Date(base + 90 * 86400000).toISOString());
  });
});

describe('pass kupon', () => {
  it('isPassProduct samo za kind=pass', () => {
    expect(isPassProduct('pass')).toBe(true);
    expect(isPassProduct('slot')).toBe(false);
    expect(isPassProduct('bundle')).toBe(false);
  });
  it('makePassCouponCode deterministican i prefiksiran', () => {
    expect(makePassCouponCode('order-1234567890')).toBe(makePassCouponCode('order-1234567890'));
    expect(makePassCouponCode('order-1234567890').startsWith('PASS-')).toBe(true);
    expect(makePassCouponCode('')).toBe('PASS-BONUS');
  });
  it('kupon vrijedi 120 dana', () => {
    expect(PASS_COUPON_VALID_DAYS).toBe(120);
  });
});
