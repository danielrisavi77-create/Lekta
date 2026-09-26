/**
 * supabase/functions/webhook-mor/handler.ts: IZVRSEN put handlera, ne samo ciste funkcije.
 *
 * Zasto (F18 krug 2, nalaz pregleda): kriteriji "payment_intent.succeeded stvara entitlement s
 * provider='stripe' i order_id=pi_...", "ponovljeni dogadjaj ne duplira" i "puni povrat daje
 * refunded, djelomicni partial_refund_noted" su se dotad mjerili samo na parseStripeEvent i
 * isFullRefund. Zamjena `.eq('provider', PROVIDER)` drugim providerom, obrnut uvjet povrata ili
 * krivi kljuc knjizenja prosli bi tsc, oxlint, check-edge i sve ciljane testove. Ovdje se handler
 * vrti nad laznom bazom (tests/helpers/fake-supabase.ts) i tvrdi se STVARNI upit prema bazi.
 *
 * Potpis se racuna ISTIM postupkom kao Stripe (HMAC-SHA256 nad `${t}.${raw}`), s injektiranim
 * satom, pa se ne testira lazan put pokraj provjere potpisa nego onaj koji produkcija prolazi.
 */
import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';

import { createWebhookHandler } from '../supabase/functions/webhook-mor/handler';
import { fakeAdmin, argOf, eqs, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';

// Sastavljeno iz dijelova da ga gitleaks generic-api-key ne uzme za tajnu (vidi 70548aef).
const SECRET = ['whsec', 'handler', 'test'].join('_');
const NOW_MS = Date.UTC(2026, 8, 26, 10, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

const PRODUCT_ROW = {
  id: 'slot_diplomski',
  kind: 'slot',
  audience: 'retail',
  work_type: 'diplomski',
  slots_total: 1,
  slot_window_days: 14,
  purchase_window_days: 90,
  price_eur: 9.99,
  mor_product_id: null,
  manual_fulfillment: false,
  active: true,
};

function succeeded(over: Record<string, unknown> = {}, meta: Record<string, string> | null = null): Record<string, unknown> {
  return {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    livemode: true,
    data: {
      object: {
        id: 'pi_1',
        object: 'payment_intent',
        amount: 999,
        amount_received: 999,
        currency: 'eur',
        metadata: meta ?? { user_id: 'user-1', product_id: 'slot_diplomski' },
        ...over,
      },
    },
  };
}

function refunded(amountRefunded: number, paymentIntent: string | null = 'pi_1'): Record<string, unknown> {
  return {
    id: 'evt_2',
    type: 'charge.refunded',
    livemode: true,
    data: {
      object: {
        id: 'ch_1',
        object: 'charge',
        amount: 999,
        amount_refunded: amountRefunded,
        currency: 'eur',
        refunded: amountRefunded >= 999,
        payment_intent: paymentIntent,
        metadata: {},
      },
    },
  };
}

function signedRequest(payload: unknown, opts: { secret?: string; t?: number } = {}): Request {
  const raw = JSON.stringify(payload);
  const t = opts.t ?? NOW_S;
  const v1 = createHmac('sha256', opts.secret ?? SECRET).update(`${t}.${raw}`).digest('hex');
  return new Request('https://edge.test/functions/v1/webhook-mor', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${t},v1=${v1}`, 'content-type': 'application/json' },
    body: raw,
  });
}

/** Zadani odgovori baze za uspjesan put; test ih prepisuje po tablici i operaciji. */
function baseResolver(over: (c: FakeCall) => FakeResult | undefined = () => undefined) {
  return (c: FakeCall): FakeResult | undefined => {
    const o = over(c);
    if (o) return o;
    if (c.table === 'webhook_events' && writeOp(c) === 'insert') return { data: { id: 'inbox-1' } };
    // settle potvrdjuje da je update pogodio redak inboxa; prazan odgovor znaci da nije.
    if (c.table === 'webhook_events' && writeOp(c) === 'update') return { data: [{ id: 'inbox-1' }] };
    if (c.table === 'products') return { data: PRODUCT_ROW };
    return undefined;
  };
}

async function run(req: Request, resolve = baseResolver(), extra: { allowTestMode?: boolean } = {}) {
  const db = fakeAdmin(resolve);
  let adminBuilt = 0;
  const granted: string[] = [];
  const handler = createWebhookHandler({
    admin: () => {
      adminBuilt += 1;
      return db.admin;
    },
    webhookSecret: SECRET,
    accountId: '',
    allowTestMode: extra.allowTestMode ?? false,
    now: () => NOW_MS,
    grantReferrerReward: (async (_a: unknown, _u: string, _w: string, orderId: string) => {
      granted.push(orderId);
    }) as never,
  });
  const res = await handler(req);
  const body = (await res.json()) as Record<string, unknown>;
  return { res, body, calls: db.calls, adminBuilt, granted };
}

const entitlementWrites = (calls: FakeCall[]) =>
  calls.filter((c) => c.table === 'entitlements' && writeOp(c) !== 'select');
const settled = (calls: FakeCall[]) =>
  calls
    .filter((c) => c.table === 'webhook_events' && writeOp(c) === 'update')
    .map((c) => argOf(c, 'update') as Record<string, unknown>);

describe('webhook-mor handler: uplata', () => {
  it('payment_intent.succeeded knjizi entitlement s provider=stripe i order_id=PaymentIntent id', async () => {
    const { res, body, calls, granted } = await run(signedRequest(succeeded()));
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });

    const product = calls.find((c) => c.table === 'products')!;
    expect(eqs(product), 'proizvod se trazi po KATALOSKOM id-u, ne po mor_product_id').toEqual({ id: 'slot_diplomski' });

    const writes = entitlementWrites(calls);
    expect(writes).toHaveLength(1);
    const row = argOf(writes[0], 'insert') as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: 'user-1',
      product_id: 'slot_diplomski',
      work_type: 'diplomski',
      order_id: 'pi_1',
      provider: 'stripe',
      slots_total: 1,
    });
    expect(granted).toEqual(['pi_1']);

    const inbox = calls.find((c) => c.table === 'webhook_events' && writeOp(c) === 'insert')!;
    expect(argOf(inbox, 'insert')).toMatchObject({
      provider: 'stripe',
      event_name: 'payment_intent.succeeded',
      order_id: 'pi_1',
      test_mode: false,
      signature_valid: true,
    });
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'entitlement_created' });
  });

  it('ponovljen isti dogadjaj (23505 na unique(provider, order_id)) ne stvara drugo pravo', async () => {
    const dup = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'insert'
        ? { error: { message: 'duplicate key', code: '23505' } }
        : undefined,
    );
    const { res, body, calls, granted } = await run(signedRequest(succeeded()), dup);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'duplicate_ignored' });
    expect(entitlementWrites(calls)).toHaveLength(1);
    expect(granted, 'bonus preporucitelju se ne dodjeljuje drugi put').toEqual([]);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'entitlement_duplicate' });
  });

  it('tudji PaymentIntent bez metadata[user_id] (npr. rucni Payment Link) je 200 ignored, ne 400', async () => {
    const { res, body, calls } = await run(signedRequest(succeeded({}, {})));
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, action: 'ignored', reason: 'missing_user_metadata' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: 'missing_user_metadata' });
  });

  it('prolazna greska citanja kataloga je 500 (Stripe ponovi), ne unknown_product s 200', async () => {
    const boom = baseResolver((c) => (c.table === 'products' ? { error: { message: 'db down' } } : undefined));
    const { res, body, calls } = await run(signedRequest(succeeded()), boom);
    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'product_lookup_failed' });
    expect(entitlementWrites(calls)).toHaveLength(0);
  });

  it('uplata nakon vec zabiljezenog punog povrata istog PaymentIntenta gasi pravo i ne daje bonuse', async () => {
    const refundedFirst = baseResolver((c) =>
      c.table === 'webhook_events' && writeOp(c) === 'select' ? { data: [{ id: 'inbox-refund' }] } : undefined,
    );
    const { res, body, calls, granted } = await run(signedRequest(succeeded()), refundedFirst);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'refunded_before_payment' });
    // Pravo se prvo upise (pa povrat koji stize istodobno ima sto ugasiti), zatim se ugasi.
    const writes = entitlementWrites(calls);
    expect(writes.map(writeOp)).toEqual(['insert', 'update']);
    expect(argOf(writes[1], 'update')).toEqual({ status: 'refunded' });
    expect(eqs(writes[1])).toEqual({ provider: 'stripe', order_id: 'pi_1', product_id: 'slot_diplomski' });
    expect(calls.some((c) => c.table === 'bonus_outbox' || c.table === 'coupon_grants')).toBe(false);
    expect(granted).toHaveLength(0);
    const lookup = calls.find((c) => c.table === 'webhook_events' && writeOp(c) === 'select')!;
    expect(eqs(lookup)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    expect(lookup.ops.find((o) => o.op === 'in')?.args).toEqual([
      'outcome_detail',
      ['refund_pending', 'refund_without_entitlement', 'refunded'],
    ]);
    // Oznaka se cita TEK nakon upisa prava (zrcalno povratu: oznaka pa citanje prava).
    const iInsert = calls.findIndex((c) => c.table === 'entitlements' && writeOp(c) === 'insert');
    const iMarker = calls.findIndex((c) => c.table === 'webhook_events' && writeOp(c) === 'select');
    expect(iInsert).toBeGreaterThanOrEqual(0);
    expect(iMarker).toBeGreaterThan(iInsert);
  });

  it('ponovljena uplata (23505) uz zabiljezen povrat ne upisuje obveze bonusa', async () => {
    const dupRefunded = baseResolver((c) => {
      if (c.table === 'entitlements' && writeOp(c) === 'insert') return { error: { message: 'dup', code: '23505' } };
      if (c.table === 'webhook_events' && writeOp(c) === 'select') return { data: [{ id: 'inbox-refund' }] };
      return undefined;
    });
    const { body, calls, granted } = await run(signedRequest(succeeded()), dupRefunded);
    expect(body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(calls.some((c) => c.table === 'bonus_outbox')).toBe(false);
    expect(granted).toHaveLength(0);
  });

  it('greska citanja oznake povrata je 500 i nijedan bonus se ne izdaje naslijepo', async () => {
    const boom = baseResolver((c) =>
      c.table === 'webhook_events' && writeOp(c) === 'select' ? { error: { message: 'db down' } } : undefined,
    );
    const { res, calls, granted } = await run(signedRequest(succeeded()), boom);
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.table === 'bonus_outbox' || c.table === 'coupon_grants')).toBe(false);
    expect(granted).toHaveLength(0);
  });

  it('nepoznat katalozni id je 200 bez prava, uz trajan zapis u inboxu', async () => {
    const none = baseResolver((c) => (c.table === 'products' ? { data: null } : undefined));
    const { res, body, calls } = await run(signedRequest(succeeded()), none);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'unknown_product_logged' });
    expect(entitlementWrites(calls)).toHaveLength(0);
  });
});

describe('webhook-mor handler: tudji proizvod na istom racunu (Katedra)', () => {
  const KATEDRA_ROW = {
    ...PRODUCT_ROW,
    id: 'katedra_pass_diplomski',
    kind: 'pass',
    purchase_window_days: 365,
    price_eur: 129.9,
  };

  it('uplata za Katedra pass se NE knjizi: 200 ignored, bez prava, kupona i nagrade', async () => {
    const katedra = baseResolver((c) => (c.table === 'products' ? { data: KATEDRA_ROW } : undefined));
    const { res, body, calls, granted } = await run(
      signedRequest(succeeded({ amount: 12990, amount_received: 12990 }, { user_id: 'user-1', product_id: 'katedra_pass_diplomski' })),
      katedra,
    );
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'ignored', reason: 'foreign_product' });
    // unique(provider, order_id) ostaje slobodan za Katedrin vlastiti upis.
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(calls.some((c) => c.table === 'coupon_grants' || c.table === 'bonus_outbox')).toBe(false);
    expect(granted).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: 'foreign_product: katedra_pass_diplomski' });
  });

  it('puni povrat Katedrinog PaymentIntenta ne dira Katedrino pravo', async () => {
    const katedraRefund = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select'
        ? { data: [{ id: 'ent-k', product_id: 'katedra_pass_zavrsni' }] }
        : c.table === 'entitlements' && writeOp(c) === 'update'
          ? { data: [{ id: 'ent-k' }] }
          : undefined,
    );
    const { res, body, calls } = await run(signedRequest(refunded(999)), katedraRefund);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'ignored', reason: 'foreign_product' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    const lookup = calls.find((c) => c.table === 'entitlements' && writeOp(c) === 'select')!;
    expect(eqs(lookup)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
  });

  it('puni povrat Lektinog PaymentIntenta i dalje gasi pravo nakon provjere vlasnistva', async () => {
    const lektaRefund = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select'
        ? { data: [{ id: 'ent-1', product_id: 'slot_diplomski' }] }
        : c.table === 'entitlements' && writeOp(c) === 'update'
          ? { data: [{ id: 'ent-1' }] }
          : undefined,
    );
    const { body, calls } = await run(signedRequest(refunded(999)), lektaRefund);
    expect(body).toEqual({ ok: true, action: 'refunded' });
    expect(argOf(entitlementWrites(calls)[0], 'update')).toEqual({ status: 'refunded' });
  });
});

describe('webhook-mor handler: povrat', () => {
  it('puni povrat gasi entitlement TOG PaymentIntenta (status refunded, provider stripe)', async () => {
    const hit = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select'
        ? { data: [{ id: 'ent-1', product_id: 'slot_diplomski' }] }
        : c.table === 'entitlements' && writeOp(c) === 'update'
          ? { data: [{ id: 'ent-1' }] }
          : undefined,
    );
    const { res, body, calls } = await run(signedRequest(refunded(999)), hit);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'refunded' });
    const writes = entitlementWrites(calls);
    expect(writes).toHaveLength(1);
    expect(argOf(writes[0], 'update')).toEqual({ status: 'refunded' });
    expect(eqs(writes[0])).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    // Upis je vezan uz id-ove Lektinih redaka procitanih prije, ne samo uz PaymentIntent.
    expect(writes[0].ops.find((o) => o.op === 'in')?.args).toEqual(['id', ['ent-1']]);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded' });
  });

  it('pad citanja prije povrata je 500 (retry), ne "nema entitlementa"', async () => {
    const boom = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select' ? { error: { message: 'db down' } } : undefined,
    );
    const { res, calls } = await run(signedRequest(refunded(999)), boom);
    expect(res.status).toBe(500);
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_pending' });
  });

  it('djelomicni povrat NE dira pravo pristupa: partial_refund_noted', async () => {
    const { res, body, calls } = await run(signedRequest(refunded(500)));
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'partial_refund_noted' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'partial_refund_noted' });
  });

  it('povrat bez nasega entitlementa je 200 s glasnim tragom, ne lazni "refunded"', async () => {
    const miss = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'update' ? { data: [] } : undefined,
    );
    const { res, body, calls } = await run(signedRequest(refunded(999)), miss);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'refund_without_entitlement' });
    expect(settled(calls).at(-1)).toMatchObject({ outcome_detail: 'refund_without_entitlement' });
  });

  it('puni povrat PRVO upise oznaku refund_pending, a tek onda cita prava (zrcalno uplati)', async () => {
    const hit = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select'
        ? { data: [{ id: 'ent-1', product_id: 'slot_diplomski' }] }
        : c.table === 'entitlements' && writeOp(c) === 'update'
          ? { data: [{ id: 'ent-1' }] }
          : undefined,
    );
    const { calls } = await run(signedRequest(refunded(999)), hit);
    const iMarker = calls.findIndex(
      (c) => c.table === 'webhook_events' && writeOp(c) === 'update'
        && (argOf(c, 'update') as Record<string, unknown>).outcome_detail === 'refund_pending',
    );
    const iRead = calls.findIndex((c) => c.table === 'entitlements' && writeOp(c) === 'select');
    expect(iMarker).toBeGreaterThanOrEqual(0);
    expect(iRead).toBeGreaterThan(iMarker);
    // Dok povrat traje, ishod je NULL: zapeo povrat je u indeksu neobradjenih (0092).
    expect(argOf(calls[iMarker], 'update')).toMatchObject({ outcome: null, outcome_detail: 'refund_pending' });
  });

  it('bez upisane oznake (inbox pao ili update nije pogodio redak) povrat je 500, ne 200', async () => {
    const noInbox = baseResolver((c) =>
      c.table === 'webhook_events' && writeOp(c) === 'insert' ? { error: { message: 'inbox down' } } : undefined,
    );
    const a = await run(signedRequest(refunded(999)), noInbox);
    expect(a.res.status).toBe(500);
    expect(a.body).toEqual({ error: 'refund_marker_failed' });
    expect(entitlementWrites(a.calls)).toHaveLength(0);

    const rowGone = baseResolver((c) =>
      c.table === 'webhook_events' && writeOp(c) === 'update' ? { data: [] } : undefined,
    );
    const b = await run(signedRequest(refunded(999)), rowGone);
    expect(b.res.status).toBe(500);
    expect(b.body).toEqual({ error: 'refund_marker_failed' });
  });

  it('pad gasenja NE brise oznaku: ostaje refund_pending dok Stripe ne ponovi', async () => {
    const boom = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select'
        ? { data: [{ id: 'ent-1', product_id: 'slot_diplomski' }] }
        : c.table === 'entitlements' && writeOp(c) === 'update'
          ? { error: { message: 'db down' } }
          : undefined,
    );
    const { res, calls } = await run(signedRequest(refunded(999)), boom);
    expect(res.status).toBe(500);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_pending' });
  });

  it('pad upisa povrata je 500 da Stripe ponovi, ne tihi uspjeh', async () => {
    const boom = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select'
        ? { data: [{ id: 'ent-1', product_id: 'slot_diplomski' }] }
        : c.table === 'entitlements' && writeOp(c) === 'update'
          ? { error: { message: 'db down' } }
          : undefined,
    );
    const { res } = await run(signedRequest(refunded(999)), boom);
    expect(res.status).toBe(500);
  });

  it('povrat naplate bez PaymentIntenta je 200 ignored, bez ijednog upisa u entitlements', async () => {
    const { res, body, calls } = await run(signedRequest(refunded(999, null)));
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, action: 'ignored', reason: 'missing_payment_intent' });
    expect(entitlementWrites(calls)).toHaveLength(0);
  });
});

describe('webhook-mor handler: porijeklo', () => {
  it('potpis krivim kljucem: 401 i baza se uopce ne otvara', async () => {
    const { res, adminBuilt, calls } = await run(signedRequest(succeeded(), { secret: ['whsec', 'napadac'].join('_') }));
    expect(res.status).toBe(401);
    expect(adminBuilt).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('potpis stariji od 300 s: 401 (replay), baza se ne otvara', async () => {
    const { res, adminBuilt } = await run(signedRequest(succeeded(), { t: NOW_S - 301 }));
    expect(res.status).toBe(401);
    expect(adminBuilt).toBe(0);
  });

  it('testni dogadjaj bez STRIPE_ALLOW_TEST_MODE ne knjizi nista', async () => {
    const { res, body, calls } = await run(signedRequest({ ...succeeded(), livemode: false }));
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ action: 'event_refused', reason: 'test_mode_refused' });
    expect(entitlementWrites(calls)).toHaveLength(0);
  });

  it('testni dogadjaj UZ zastavicu knjizi (staging), s test_mode u inboxu', async () => {
    const { body, calls } = await run(signedRequest({ ...succeeded(), livemode: false }), baseResolver(), {
      allowTestMode: true,
    });
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    const inbox = calls.find((c) => c.table === 'webhook_events' && writeOp(c) === 'insert')!;
    expect(argOf(inbox, 'insert')).toMatchObject({ test_mode: true });
  });

  it('vrsta koju ne obradjujemo je 200 ignored uz zapis u inboxu', async () => {
    const { res, body, calls } = await run(signedRequest({ ...succeeded(), type: 'customer.created' }));
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ action: 'ignored' });
    expect(calls.some((c) => c.table === 'webhook_events' && writeOp(c) === 'insert')).toBe(true);
    expect(entitlementWrites(calls)).toHaveLength(0);
  });
});
