import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import {
  parseStripeEvent,
  parseStripeSignatureHeader,
  verifyStripeSignature,
  STRIPE_SIGNATURE_TOLERANCE_SECONDS,
  STRIPE_HANDLED_EVENTS,
  isoAfterDays,
  isPassProduct,
  makePassCouponCode,
  PASS_COUPON_VALID_DAYS,
  buildEntitlementInsert,
  acceptEvent,
  isFullRefund,
  type StripeWebhookPayload,
} from '../src/report/webhook';

describe('parseStripeEvent', () => {
  it('payment_intent.succeeded: orderId je PaymentIntent id, metadata daje korisnika i proizvod', () => {
    const payload: StripeWebhookPayload = {
      type: 'payment_intent.succeeded',
      livemode: true,
      data: {
        object: {
          id: 'pi_123',
          amount: 999,
          amount_received: 999,
          currency: 'eur',
          metadata: { user_id: 'u1', product_id: 'slot_diplomski' },
        },
      },
    };
    expect(parseStripeEvent(payload)).toEqual({
      eventName: 'payment_intent.succeeded',
      orderId: 'pi_123',
      userId: 'u1',
      productId: 'slot_diplomski',
      referralCode: '',
      refunded: false,
      livemode: true,
      testMode: false,
      accountId: '',
      totalCents: 999,
      refundedCents: null,
      currency: 'EUR',
    });
  });

  it('izvlaci referral_code iz metadata', () => {
    const payload: StripeWebhookPayload = {
      type: 'payment_intent.succeeded',
      livemode: true,
      data: { object: { id: 'pi_1', metadata: { user_id: 'u1', referral_code: 'PART-9' } } },
    };
    expect(parseStripeEvent(payload).referralCode).toBe('PART-9');
  });

  it('charge.refunded: orderId je payment_intent iz naplate, ne charge id', () => {
    // KLJUCNO: uplata i njezin povrat moraju dijeliti kljuc, inace refund ne pogodi entitlement.
    const payload: StripeWebhookPayload = {
      type: 'charge.refunded',
      livemode: true,
      data: {
        object: { id: 'ch_999', payment_intent: 'pi_123', amount: 1699, amount_refunded: 1699, currency: 'eur' },
      },
    };
    const ev = parseStripeEvent(payload);
    expect(ev.orderId).toBe('pi_123');
    expect(ev.refunded).toBe(true);
    expect(ev.totalCents).toBe(1699);
    expect(ev.refundedCents).toBe(1699);
  });

  it('charge.refunded bez payment_intent ne izmislja kljuc (ostaje prazan)', () => {
    // Kljuc koji ne moze pogoditi nijedan entitlement lagao bi da je povrat proveden; Edge
    // funkcija na prazan orderId vraca 400 i zapisuje failed, umjesto tihog 'refunded'.
    const ev = parseStripeEvent({
      type: 'charge.refunded',
      livemode: true,
      data: { object: { id: 'ch_bez_pi', amount: 500, amount_refunded: 500 } },
    });
    expect(ev.orderId).toBe('');
  });

  it('djelomican povrat nosi manji refundedCents od totalCents', () => {
    const ev = parseStripeEvent({
      type: 'charge.refunded',
      livemode: true,
      data: { object: { payment_intent: 'pi_5', amount: 1699, amount_refunded: 500 } },
    });
    expect(isFullRefund(ev)).toBe(false);
  });

  it('livemode koji payload ne nosi ostaje null, NIKAD izmisljen', () => {
    // `acceptEvent` na temelju null livemode odbija dogadjaj; neprovjerljivo porijeklo nije
    // isto sto i ispravno (PAY-04/05).
    const ev = parseStripeEvent({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } });
    expect(ev.livemode).toBeNull();
    expect(ev.testMode).toBe(false);
  });

  it('prazan payload ne baca (prazni stringovi)', () => {
    const ev = parseStripeEvent({});
    expect(ev.orderId).toBe('');
    expect(ev.userId).toBe('');
    expect(ev.eventName).toBe('');
  });
});

describe('parseStripeSignatureHeader', () => {
  it('rastavlja t i vise v1 vrijednosti', () => {
    expect(parseStripeSignatureHeader('t=1700000000,v1=aa,v1=BB')).toEqual({
      timestamp: 1700000000,
      signatures: ['aa', 'bb'],
    });
  });
  it('ignorira sheme koje ne razumijemo (npr. v0)', () => {
    expect(parseStripeSignatureHeader('t=1,v0=zz,v1=aa').signatures).toEqual(['aa']);
  });
  it('zaglavlje bez t ili bez v1 je neispravno', () => {
    expect(parseStripeSignatureHeader('v1=aa').timestamp).toBeNull();
    expect(parseStripeSignatureHeader('t=1').signatures).toEqual([]);
  });
});

/**
 * PAY-04: potpis je JEDINI dokaz da dogadjaj dolazi od Stripea. Ovdje se dokazuje i da nosi
 * vrijeme, pa presretnut valjan zahtjev ne vrijedi zauvijek.
 */
describe('verifyStripeSignature (HMAC-SHA256 nad `t.tijelo`)', () => {
  const secret = 'whsec_test';
  const raw = '{"type":"payment_intent.succeeded"}';
  const nowMs = Date.UTC(2026, 8, 23, 12, 0, 0);
  const t = Math.floor(nowMs / 1000);
  const sign = (ts: number, key = secret, body = raw): string =>
    createHmac('sha256', key).update(`${ts}.${body}`).digest('hex');

  it('ispravan potpis unutar tolerancije -> ok', async () => {
    expect(await verifyStripeSignature(raw, `t=${t},v1=${sign(t)}`, secret, nowMs)).toEqual({ ok: true });
  });

  it('pogresan tajni kljuc -> odbijen', async () => {
    const out = await verifyStripeSignature(raw, `t=${t},v1=${sign(t, 'krivi')}`, secret, nowMs);
    expect(out).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('izmijenjeno tijelo -> odbijen', async () => {
    const out = await verifyStripeSignature('{"type":"drugo"}', `t=${t},v1=${sign(t)}`, secret, nowMs);
    expect(out).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('potpis stariji od tolerancije -> odbijen (replay)', async () => {
    const old = t - STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1;
    // Potpis je matematicki ISPRAVAN za taj t; odbija ga iskljucivo provjera tolerancije.
    const out = await verifyStripeSignature(raw, `t=${old},v1=${sign(old)}`, secret, nowMs);
    expect(out).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('potpis iz buducnosti izvan tolerancije -> odbijen', async () => {
    const future = t + STRIPE_SIGNATURE_TOLERANCE_SECONDS + 1;
    const out = await verifyStripeSignature(raw, `t=${future},v1=${sign(future)}`, secret, nowMs);
    expect(out).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' });
  });

  it('tocno na granici tolerancije jos prolazi', async () => {
    const edge = t - STRIPE_SIGNATURE_TOLERANCE_SECONDS;
    expect(await verifyStripeSignature(raw, `t=${edge},v1=${sign(edge)}`, secret, nowMs)).toEqual({ ok: true });
  });

  it('vise v1 vrijednosti: dovoljno je da se JEDNA podudara (rotacija tajne)', async () => {
    const header = `t=${t},v1=${'0'.repeat(64)},v1=${sign(t)}`;
    expect(await verifyStripeSignature(raw, header, secret, nowMs)).toEqual({ ok: true });
  });

  it('prazan tajni kljuc ili nedostajuce zaglavlje -> odbijen (fail-closed)', async () => {
    expect(await verifyStripeSignature(raw, `t=${t},v1=${sign(t)}`, '', nowMs)).toEqual({
      ok: false,
      reason: 'missing_secret',
    });
    expect(await verifyStripeSignature(raw, null, secret, nowMs)).toEqual({ ok: false, reason: 'missing_signature' });
  });

  it('neispravno zaglavlje -> odbijen', async () => {
    expect(await verifyStripeSignature(raw, 'bezicega', secret, nowMs)).toEqual({
      ok: false,
      reason: 'malformed_header',
    });
  });

  it('velika slova potpisa ne mijenjaju rezultat', async () => {
    const header = `t=${t},v1=${sign(t).toUpperCase()}`;
    expect(await verifyStripeSignature(raw, header, secret, nowMs)).toEqual({ ok: true });
  });
});

describe('buildEntitlementInsert (kriteriji 14.3/14.4)', () => {
  const now = Date.UTC(2026, 0, 1);
  it('slot proizvod: tocan product_id/work_type/slots_total + rok = now + purchase_window_days', () => {
    const row = buildEntitlementInsert(
      { id: 'slot_diplomski', workType: 'diplomski', slotsTotal: 1, purchaseWindowDays: 90 },
      { userId: 'u1', orderId: 'pi_123' },
      'stripe',
      now,
    );
    expect(row).toEqual({
      user_id: 'u1',
      work_type: 'diplomski',
      slots_total: 1,
      product_id: 'slot_diplomski',
      order_id: 'pi_123',
      provider: 'stripe',
      purchase_expires_at: new Date(now + 90 * 86400000).toISOString(),
    });
  });
  it('pass proizvod nosi 6 seminarskih slotova', () => {
    const row = buildEntitlementInsert(
      { id: 'pass_semestralni', workType: 'seminarski', slotsTotal: 6, purchaseWindowDays: 180 },
      { userId: 'u1', orderId: 'pi_2' },
      'stripe',
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
 * PAY-04 / PAY-05: ispravan potpis dokazuje samo da posiljatelj zna tajnu. Ne dokazuje da
 * dogadjaj dolazi iz produkcijskog nacina rada ni da je vrsta koju uopce znamo knjiziti. Bez
 * ovog gatea bi valjano potpisana TESTNA kupnja proizvela pravo pravo pristupa.
 */
describe('acceptEvent (porijeklo i vrsta dogadjaja)', () => {
  const OPTS = { allowTestMode: false };
  const ok = { livemode: true, eventName: 'payment_intent.succeeded', accountId: '' };

  it('prihvaca produkcijski dogadjaj vrste koju obradjujemo', () => {
    expect(acceptEvent(ok, OPTS)).toEqual({ ok: true });
    expect(acceptEvent({ ...ok, eventName: 'charge.refunded' }, OPTS)).toEqual({ ok: true });
  });

  it('odbija testni nacin rada dok nije izricito dopusten', () => {
    expect(acceptEvent({ ...ok, livemode: false }, OPTS)).toEqual({ ok: false, reason: 'test_mode_refused' });
    expect(acceptEvent({ ...ok, livemode: false }, { allowTestMode: true })).toEqual({ ok: true });
  });

  /**
   * Fail-closed: livemode koji payload ne nosi NE SMIJE znaciti "vjerojatno produkcija".
   * Isti duh kao raniji prazan store id koji je odbijao sve.
   */
  it('odbija kad porijeklo nije provjerljivo', () => {
    expect(acceptEvent({ ...ok, livemode: null }, OPTS)).toEqual({ ok: false, reason: 'livemode_unverifiable' });
    expect(acceptEvent({ ...ok, livemode: null }, { allowTestMode: true })).toEqual({
      ok: false,
      reason: 'livemode_unverifiable',
    });
  });

  it('odbija tudji Connect racun kad je ocekivani postavljen', () => {
    expect(acceptEvent({ ...ok, accountId: 'acct_tudji' }, { ...OPTS, expectedAccountId: 'acct_nas' })).toEqual({
      ok: false,
      reason: 'account_mismatch',
    });
    expect(acceptEvent({ ...ok, accountId: 'acct_nas' }, { ...OPTS, expectedAccountId: 'acct_nas' })).toEqual({
      ok: true,
    });
  });

  it('vrstu koju ne obradjujemo tiho ignorira, ne knjizi', () => {
    expect(acceptEvent({ ...ok, eventName: 'customer.created' }, OPTS)).toEqual({ ok: false, reason: 'event_ignored' });
    expect(acceptEvent({ ...ok, eventName: '' }, OPTS)).toEqual({ ok: false, reason: 'event_ignored' });
  });

  it('obradjuju se tocno dvije vrste dogadjaja', () => {
    expect([...STRIPE_HANDLED_EVENTS]).toEqual(['payment_intent.succeeded', 'charge.refunded']);
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
