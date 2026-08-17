import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  parseLemonEvent,
  verifyLemonSignature,
  isoAfterDays,
  isPassProduct,
  makePassCouponCode,
  PASS_COUPON_VALID_DAYS,
  buildEntitlementInsert,
  acceptEvent,
  isFullRefund,
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
      referralCode: '',
      refunded: false,
      // Polja porijekla i iznosa (audit PAY-03..05, PAY-09). Kad ih payload ne nosi, moraju biti
      // prazna/null, NIKAD izmisljena vrijednost: `acceptEvent` na temelju praznog storeId odbija
      // dogadjaj, a to je ispravno, jer neprovjerljivo porijeklo nije isto sto i ispravno.
      storeId: '',
      testMode: false,
      totalCents: null,
      refundedCents: null,
      currency: '',
    });
  });
  it('izvlaci referral_code iz custom_data', () => {
    const payload: LemonWebhookPayload = {
      meta: { event_name: 'order_created', custom_data: { user_id: 'u1', referral_code: 'PART-9' } },
      data: { id: 1, attributes: { first_order_item: { variant_id: 5 } } },
    };
    expect(parseLemonEvent(payload).referralCode).toBe('PART-9');
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

describe('buildEntitlementInsert (kriteriji 14.3/14.4)', () => {
  const now = Date.UTC(2026, 0, 1);
  it('slot proizvod: tocan product_id/work_type/slots_total + rok = now + purchase_window_days', () => {
    const row = buildEntitlementInsert(
      { id: 'slot_diplomski', workType: 'diplomski', slotsTotal: 1, purchaseWindowDays: 90 },
      { userId: 'u1', orderId: 'o1' },
      'lemonsqueezy',
      now,
    );
    expect(row).toEqual({
      user_id: 'u1',
      work_type: 'diplomski',
      slots_total: 1,
      product_id: 'slot_diplomski',
      order_id: 'o1',
      provider: 'lemonsqueezy',
      purchase_expires_at: new Date(now + 90 * 86400000).toISOString(),
    });
  });
  it('pass proizvod nosi 6 seminarskih slotova', () => {
    const row = buildEntitlementInsert(
      { id: 'pass_semestralni', workType: 'seminarski', slotsTotal: 6, purchaseWindowDays: 180 },
      { userId: 'u1', orderId: 'o2' },
      'lemonsqueezy',
      now,
    );
    expect(row.slots_total).toBe(6);
    expect(row.work_type).toBe('seminarski');
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

/**
 * PAY-04 / PAY-05: ispravan HMAC potpis dokazuje samo da posiljatelj zna tajnu. Ne dokazuje da
 * dogadjaj pripada NASOJ trgovini ni da dolazi iz produkcijskog nacina rada. Bez ovog gatea bi
 * valjano potpisan dogadjaj tudje trgovine, ili testna kupnja, proizveli pravo pravo pristupa.
 */
describe('acceptEvent (porijeklo dogadjaja)', () => {
  const OPTS = { expectedStoreId: '42', allowTestMode: false };

  it('prihvaca dogadjaj nase trgovine iz produkcijskog nacina', () => {
    expect(acceptEvent({ storeId: '42', testMode: false }, OPTS)).toEqual({ ok: true });
  });

  it('odbija tudju trgovinu', () => {
    expect(acceptEvent({ storeId: '99', testMode: false }, OPTS)).toEqual({ ok: false, reason: 'store_mismatch' });
  });

  it('odbija testni nacin rada dok nije izricito dopusten', () => {
    expect(acceptEvent({ storeId: '42', testMode: true }, OPTS)).toEqual({ ok: false, reason: 'test_mode_refused' });
    expect(acceptEvent({ storeId: '42', testMode: true }, { ...OPTS, allowTestMode: true })).toEqual({ ok: true });
  });

  /**
   * Fail-closed: nekonfiguriran ili nedostajuci store id NE SMIJE znaciti "propusti sve". Tise
   * propustanje bi znacilo da webhook prima dogadjaje bilo koje trgovine, a da nitko ne zna da
   * gate uopce nije aktivan.
   */
  it('odbija kad porijeklo nije provjerljivo', () => {
    expect(acceptEvent({ storeId: '42', testMode: false }, { ...OPTS, expectedStoreId: '' }))
      .toEqual({ ok: false, reason: 'store_unverifiable' });
    expect(acceptEvent({ storeId: '', testMode: false }, OPTS))
      .toEqual({ ok: false, reason: 'store_unverifiable' });
  });
});

/**
 * PAY-09: djelomican povrat ne smije oduzeti cijelo pravo pristupa. Korisnik kojem je vracen dio
 * iznosa i dalje je platio uslugu.
 */
describe('isFullRefund', () => {
  it('nije povrat dok refunded nije postavljen', () => {
    expect(isFullRefund({ refunded: false, totalCents: 1699, refundedCents: 1699 })).toBe(false);
  });

  it('djelomican povrat nije potpun', () => {
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: 500 })).toBe(false);
  });

  it('puni povrat je potpun, kao i povrat veci od iznosa', () => {
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: 1699 })).toBe(true);
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: 1700 })).toBe(true);
  });

  it('bez poznatih iznosa tretira povrat kao potpun (sigurnije za korisnika)', () => {
    expect(isFullRefund({ refunded: true, totalCents: null, refundedCents: null })).toBe(true);
    expect(isFullRefund({ refunded: true, totalCents: 1699, refundedCents: null })).toBe(true);
  });
});
