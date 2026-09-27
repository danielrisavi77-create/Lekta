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
import { describe, it, expect, vi, afterEach } from 'vitest';
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
        // Stripe `payment_intent.succeeded` uvijek nosi status `succeeded`; handler bez njega ne
        // knjizi (classifyStripeEvent, spajanje mastera 2026-09-26).
        status: 'succeeded',
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
    // Postojeci redak pripada ISTOM korisniku (odluka vlasnika 2026-09-27: 23505 se provjerava).
    const dup = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'insert'
        ? { error: { message: 'duplicate key', code: '23505' } }
        : c.table === 'entitlements' && writeOp(c) === 'select'
          ? { data: { id: 'ent-1', user_id: 'user-1' } }
          : undefined,
    );
    const { res, body, calls, granted } = await run(signedRequest(succeeded()), dup);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'duplicate_ignored' });
    expect(entitlementWrites(calls)).toHaveLength(1);
    expect(granted, 'bonus preporucitelju se ne dodjeljuje drugi put').toEqual([]);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'entitlement_duplicate' });
  });

  /**
   * Masterov `needs_manual_link` (31b802ad, 81a89f2f), Stripe ekvivalent (nalaz pregleda kruga 2).
   * Naplata je potvrdjena, a korisnika nema: 200 (ne 400, dogadjaj ne smije nestati), vlastiti
   * ishod u inboxu i ERROR redak, a ne WARN uz `ignored` pomijesan s konfiguracijskim sumom.
   */
  it('placen PaymentIntent bez metadata[user_id]: 200 needs_manual_link, ERROR redak, bez prava', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { res, body, calls, granted } = await run(signedRequest(succeeded({}, { product_id: 'slot_diplomski' })));
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true, action: 'needs_manual_link', reason: 'missing_user_metadata' });
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(granted).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'needs_manual_link', outcome_detail: 'missing_user_metadata' });
      const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor needs_manual_link');
      expect(redak?.[1]).toMatchObject({ orderId: 'pi_1', productId: 'slot_diplomski', amountReceivedCents: 999 });
      // Ne smije se pojaviti i kao WARN sum: jedna uplata, jedan glasan redak.
      expect(warn.mock.calls.map((c) => String(c[0]))).not.toContain('webhook-mor foreign_event_ignored');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('placen PaymentIntent bez ikakve metadate je i dalje needs_manual_link (rucni Payment Link)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(signedRequest(succeeded({}, {})));
      expect(body).toEqual({ ok: true, action: 'needs_manual_link', reason: 'missing_user_metadata' });
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor needs_manual_link');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('NEPOTVRDJENA naplata bez user_id ostaje ignored (needs_manual_link je samo za stvaran novac)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(signedRequest(succeeded({ status: 'processing' }, {})));
      expect(body).toEqual({ ok: true, action: 'ignored', reason: 'payment_status:processing' });
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: 'payment_status:processing' });
    } finally {
      vi.restoreAllMocks();
    }
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
      if (c.table === 'entitlements' && writeOp(c) === 'select') return { data: { id: 'ent-1', user_id: 'user-1' } };
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

  it('placen Katedrin PaymentIntent bez user_id nije needs_manual_link nego tudji proizvod (WARN)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(signedRequest(succeeded({}, { product_id: 'katedra_pass_semestar' })));
      expect(body).toEqual({ ok: true, action: 'ignored', reason: 'foreign_product' });
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: 'foreign_product: katedra_pass_semestar' });
      expect(warn.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor foreign_event_ignored');
      expect(err.mock.calls.map((c) => String(c[0]))).not.toContain('webhook-mor needs_manual_link');
    } finally {
      vi.restoreAllMocks();
    }
  });

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

/**
 * KNJIZI SE SAMO STVARNO NAPLACENO (Stripe ekvivalent masterovih 31b802ad, 81a89f2f, daf5f53a).
 *
 * Mjeri se IZVRSEN handler: dogadjaj koji se zove `payment_intent.succeeded`, a objekt naplatu ne
 * potvrdjuje, ne smije dodijeliti pravo; ishod je 200 `ignored` s razlogom u inboxu i ERROR redak u
 * logu. Povrat se otvara samo iz `charge.refunded`.
 */
describe('webhook-mor handler: samo potvrdjena naplata knjizi pravo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const logLines = (spy: { mock: { calls: unknown[][] } }): string[] => spy.mock.calls.map((c) => String(c[0]));

  it.each([
    ['processing', 'payment_status:processing'],
    ['requires_payment_method', 'payment_status:requires_payment_method'],
  ])('status %s: 200 ignored, bez prava, inbox i ERROR log imenuju razlog', async (status, reason) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, body, calls, granted } = await run(signedRequest(succeeded({ status })));
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'ignored', reason });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(calls.some((c) => c.table === 'products')).toBe(false);
    expect(granted).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: reason });
    expect(logLines(err)).toContain('webhook-mor ignored_needs_attention');
    const detalji = err.mock.calls.find((c) => c[0] === 'webhook-mor ignored_needs_attention')?.[1];
    expect(detalji).toMatchObject({ reason, eventName: 'payment_intent.succeeded', status });
  });

  it('bez statusa u objektu se ne knjizi (prazno nije placeno)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bezStatusa = succeeded();
    const obj = (bezStatusa.data as { object: Record<string, unknown> }).object;
    delete obj.status;
    const { body, calls } = await run(signedRequest(bezStatusa));
    expect(body).toEqual({ ok: true, action: 'ignored', reason: 'payment_status:nepoznat' });
    expect(entitlementWrites(calls)).toHaveLength(0);
  });

  it.each([
    [{ amount_received: 0 }, 'amount_received:0'],
    [{ amount_received: undefined }, 'amount_received:nepoznat'],
  ])('amount_received %j: 200 ignored, bez prava', async (over, reason) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, body, calls } = await run(signedRequest(succeeded(over)));
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'ignored', reason });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: reason });
    expect(logLines(err)).toContain('webhook-mor ignored_needs_attention');
  });

  it('BASELINE: status succeeded (i velikim slovima) uz pozitivan amount_received knjizi pravo', async () => {
    const { body, calls } = await run(signedRequest(succeeded({ status: 'SUCCEEDED' })));
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    expect(entitlementWrites(calls).map(writeOp)).toEqual(['insert']);
  });

  it('payment_intent.succeeded sa zastavicom refunded NE otvara refund granu (povrat samo iz charge.refunded)', async () => {
    const { body, calls } = await run(signedRequest(succeeded({ refunded: true })));
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    expect(entitlementWrites(calls).map(writeOp)).toEqual(['insert']);
    // Refund grana bi prvo upisala oznaku refund_pending u inbox; toga ne smije biti.
    expect(settled(calls).some((u) => u.outcome_detail === 'refund_pending')).toBe(false);
  });

  it('charge.refunded ostaje jedini ulaz za povrat', async () => {
    const hit = baseResolver((c) =>
      c.table === 'entitlements' && writeOp(c) === 'select'
        ? { data: [{ id: 'ent-1', product_id: 'slot_diplomski' }] }
        : c.table === 'entitlements' && writeOp(c) === 'update'
          ? { data: [{ id: 'ent-1' }] }
          : undefined,
    );
    const { body } = await run(signedRequest(refunded(999)), hit);
    expect(body).toEqual({ ok: true, action: 'refunded' });
  });

  it('vrsta koju ne obradjujemo ostavlja WARN redak s imenom dogadjaja (nije tiha)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { body, calls } = await run(signedRequest({ ...succeeded(), type: 'charge.updated' }));
    expect(body).toMatchObject({ ok: true, action: 'ignored', reason: 'nepodrzan_dogadjaj:charge.updated' });
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: 'nepodrzan_dogadjaj:charge.updated' });
    const redak = warn.mock.calls.find((c) => c[0] === 'webhook-mor ignored_foreign_event');
    expect(redak?.[1]).toMatchObject({ eventName: 'charge.updated' });
    // Konfiguracijski sum ne ide u ERROR kanal, inace bi taj kanal oglusio.
    expect(err.mock.calls).toHaveLength(0);
  });
});

/**
 * POVRAT POD DRUGIM IMENOM, kroz IZVRSEN handler (nalaz pregleda kruga 2, 2026-09-26).
 *
 * Do ovog kruga je acceptEvent vrste izvan `STRIPE_HANDLED_EVENTS` odbijao kao `event_ignored`
 * PRIJE klasifikatora, pa razlog `povrat_bez_charge_refunded:` nije mogao nastati ni za jedan
 * primljen dogadjaj: operater koji pretplati `refund.created` umjesto `charge.refunded` dobio bi
 * WARN sum, entitlement bi ostao `paid`, a redak koji runbook trazi nikad se ne bi pojavio. Ovdje
 * se mjeri stvaran put: 200, `ignored` s tim razlogom, ERROR redak s PaymentIntentom, bez ijednog
 * upisa u entitlements i bez oznake refund_pending (refund grana se ne otvara).
 */
describe('webhook-mor handler: povrat pod drugim imenom je glasan, ne tih', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const refundObject = (type: string): Record<string, unknown> => ({
    id: 'evt_r',
    type,
    livemode: true,
    data: { object: { id: 're_1', object: 'refund', payment_intent: 'pi_1', amount: 999, currency: 'eur', status: 'succeeded' } },
  });

  it.each(['refund.created', 'refund.updated', 'charge.refund.updated'])(
    '%s: 200 ignored povrat_bez_charge_refunded, ERROR redak, bez upisa',
    async (type) => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { res, body, calls } = await run(signedRequest(refundObject(type)));
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true, action: 'ignored', reason: `povrat_bez_charge_refunded:${type}` });
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(calls.some((c) => c.table === 'entitlements')).toBe(false);
      expect(settled(calls).some((u) => u.outcome_detail === 'refund_pending')).toBe(false);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'ignored', outcome_detail: `povrat_bez_charge_refunded:${type}` });
      const inbox = calls.find((c) => c.table === 'webhook_events' && writeOp(c) === 'insert')!;
      expect(argOf(inbox, 'insert')).toMatchObject({ event_name: type, order_id: 'pi_1' });
      const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor ignored_needs_attention');
      expect(redak?.[1]).toMatchObject({ reason: `povrat_bez_charge_refunded:${type}`, eventName: type, orderId: 'pi_1' });
    },
  );

  it('charge.updated s trajnim tragom povrata (refunded, amount_refunded) je WARN sum, ne ERROR (Codex pregled kruga 2)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const payload = refunded(999);
    const { body, calls } = await run(signedRequest({ ...payload, type: 'charge.updated' }));
    expect(body).toEqual({ ok: true, action: 'ignored', reason: 'nepodrzan_dogadjaj:charge.updated' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(err.mock.calls).toHaveLength(0);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor ignored_foreign_event');
  });

  it('propao povrat (refund.failed) nije ERROR: WARN sum, bez upisa (Codex pregled kruga 2)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const payload = refundObject('refund.failed');
    ((payload.data as { object: Record<string, unknown> }).object).status = 'failed';
    const { body, calls } = await run(signedRequest(payload));
    expect(body).toEqual({ ok: true, action: 'ignored', reason: 'nepodrzan_dogadjaj:refund.failed' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(err.mock.calls).toHaveLength(0);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor ignored_foreign_event');
  });

  it('testni povrat pod drugim imenom i dalje zaustavlja gate porijekla (refused, ne ignored)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { body, calls } = await run(signedRequest({ ...refundObject('refund.created'), livemode: false }));
    expect(body).toEqual({ ok: true, action: 'event_refused', reason: 'test_mode_refused' });
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'refused', outcome_detail: 'test_mode_refused' });
  });
});

/**
 * IZNOS ISPOD KATALOGA (odluka vlasnika 2026-09-27: "Uplata manja od kataloske cijene ne daje
 * pravo nego ide na rucni pregled"). Dotad je handler odstupanje samo logirao (amount_mismatch) i
 * pravo svejedno upisivao. Mjeri se izvrsen handler: ishod, upis (kojeg ne smije biti), log i
 * granice (tocno kataloski iznos daje pravo, veci iznos daje pravo uz trag).
 */
describe('webhook-mor handler: iznos ispod kataloga ide na rucni pregled', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sporedno = (calls: FakeCall[]) =>
    calls.some((c) => ['manual_orders', 'coupon_grants', 'bonus_outbox'].includes(c.table));

  it('naplaceno manje od kataloga: 200 needs_manual_review, bez prava, oba iznosa i valuta u inboxu', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, body, calls, granted } = await run(signedRequest(succeeded({ amount: 500, amount_received: 500 })));
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'amount_below_catalog' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(calls.some((c) => c.table === 'entitlements')).toBe(false);
    expect(sporedno(calls)).toBe(false);
    expect(granted).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({
      outcome: 'needs_manual_review',
      outcome_detail: 'amount_below_catalog ocekivano=999 naplaceno=500 valuta=EUR',
    });
    const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor needs_manual_review');
    expect(redak?.[1]).toMatchObject({
      reason: 'amount_below_catalog',
      orderId: 'pi_1',
      ocekivanoCenti: 999,
      naplacenoCenti: 500,
      currency: 'EUR',
    });
  });

  it('jedan cent ispod kataloga je i dalje rucni pregled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { body, calls } = await run(signedRequest(succeeded({ amount: 998, amount_received: 998 })));
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'amount_below_catalog' });
    expect(entitlementWrites(calls)).toHaveLength(0);
  });

  it('GRANICA: tocno kataloski iznos (round(price_eur*100)) daje pravo bez traga odstupanja', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { body, calls } = await run(signedRequest(succeeded()));
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    expect(entitlementWrites(calls).map(writeOp)).toEqual(['insert']);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'entitlement_created' });
    const imena = err.mock.calls.map((c) => String(c[0]));
    expect(imena).not.toContain('webhook-mor needs_manual_review');
    expect(imena).not.toContain('webhook-mor amount_mismatch');
  });

  it('valuta koja nije EUR uz inace tocan iznos: rucni pregled, bez prava', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { body, calls, granted } = await run(signedRequest(succeeded({ currency: 'usd' })));
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'currency_not_eur' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(granted).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({
      outcome: 'needs_manual_review',
      outcome_detail: 'currency_not_eur ocekivano=999 naplaceno=999 valuta=USD',
    });
  });

  it('naplaceno VISE od kataloga i dalje daje pravo, uz postojeci trag amount_mismatch', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { body, calls, granted } = await run(signedRequest(succeeded({ amount: 1200, amount_received: 1200 })));
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    expect(entitlementWrites(calls).map(writeOp)).toEqual(['insert']);
    expect(granted).toEqual(['pi_1']);
    expect(settled(calls).at(-1)).toMatchObject({
      outcome: 'processed',
      outcome_detail: 'entitlement_created; amount_mismatch ocekivano=999 naplaceno=1200 valuta=EUR',
    });
    expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor amount_mismatch');
  });

  it('rucna narudzba (premium_human) placena ispod kataloga se NE otvara', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const premium = baseResolver((c) =>
      c.table === 'products'
        ? {
          data: { ...PRODUCT_ROW, id: 'premium_human', kind: 'premium_human', work_type: null, price_eur: 49, manual_fulfillment: true },
        }
        : undefined,
    );
    const { body, calls } = await run(
      signedRequest(succeeded({}, { user_id: 'user-1', product_id: 'premium_human' })),
      premium,
    );
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'amount_below_catalog' });
    expect(calls.some((c) => c.table === 'manual_orders')).toBe(false);
    expect(settled(calls).at(-1)).toMatchObject({
      outcome_detail: 'amount_below_catalog ocekivano=4900 naplaceno=999 valuta=EUR',
    });
  });

  it('uplata ispod kataloga uz vec zabiljezen povrat istog PaymentIntenta: rucni pregled, oznaka povrata netaknuta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refundedFirst = baseResolver((c) =>
      c.table === 'webhook_events' && writeOp(c) === 'select' ? { data: [{ id: 'inbox-refund' }] } : undefined,
    );
    const { body, calls } = await run(signedRequest(succeeded({ amount: 500, amount_received: 500 })), refundedFirst);
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'amount_below_catalog' });
    expect(calls.some((c) => c.table === 'entitlements')).toBe(false);
    // Jedini upis u inbox je u VLASTITI redak ovog dogadjaja; redak povrata (inbox-refund) se ne dira.
    const inboxUpdates = calls.filter((c) => c.table === 'webhook_events' && writeOp(c) === 'update');
    expect(inboxUpdates.length).toBeGreaterThan(0);
    for (const u of inboxUpdates) expect(eqs(u)).toEqual({ id: 'inbox-1' });
    expect(settled(calls).some((u) => REFUND_DETAILS.includes(String(u.outcome_detail)))).toBe(false);
  });
});

const REFUND_DETAILS = ['refund_pending', 'refund_without_entitlement', 'refunded'];

/**
 * Stanje za dva prolaza istog povrata: lazna baza pamti sto je prvi prolaz upisao u manual_orders i
 * coupon_grants i drugom prolazu vraca TO stanje. Tako se idempotencija dokazuje dvama stvarnim
 * prolazima (CLAUDE.md), a ne pretpostavkom o obliku upita.
 */
function refundWorld(opts: { entitlement: boolean; manualOrder: boolean; coupon: boolean; couponExpiresAt?: string | null }) {
  const state: { manualStatus: string | null; couponExpiresAt: string | null | undefined } = {
    manualStatus: opts.manualOrder ? 'pending' : null,
    couponExpiresAt: opts.coupon
      ? (opts.couponExpiresAt === undefined ? '2027-01-24T10:00:00.000Z' : opts.couponExpiresAt)
      : undefined,
  };
  const resolve = baseResolver((c) => {
    if (c.table === 'entitlements' && writeOp(c) === 'select') {
      return { data: opts.entitlement ? [{ id: 'ent-1', product_id: 'slot_diplomski' }] : [] };
    }
    if (c.table === 'entitlements' && writeOp(c) === 'update') return { data: opts.entitlement ? [{ id: 'ent-1' }] : [] };
    if (c.table === 'manual_orders' && writeOp(c) === 'select') {
      return { data: state.manualStatus === null ? [] : [{ id: 'mo-1', status: state.manualStatus }] };
    }
    if (c.table === 'manual_orders' && writeOp(c) === 'update') {
      state.manualStatus = String((argOf(c, 'update') as Record<string, unknown>).status);
      return { data: null };
    }
    if (c.table === 'coupon_grants' && writeOp(c) === 'select') {
      return { data: state.couponExpiresAt === undefined ? [] : [{ id: 'cg-1', expires_at: state.couponExpiresAt }] };
    }
    if (c.table === 'coupon_grants' && writeOp(c) === 'update') {
      state.couponExpiresAt = String((argOf(c, 'update') as Record<string, unknown>).expires_at);
      return { data: null };
    }
    return undefined;
  });
  return { state, resolve };
}

const writesTo = (calls: FakeCall[], table: string) => calls.filter((c) => c.table === table && writeOp(c) !== 'select');

describe('webhook-mor handler: puni povrat zatvara rucnu narudzbu i povlaci pass kupon', () => {
  const NOW_ISO = new Date(NOW_MS).toISOString();

  it('pass kupnja: puni povrat gasi pravo I povlaci pass kupon (istjece sada); drugi isti povrat je no-op', async () => {
    const w = refundWorld({ entitlement: true, manualOrder: false, coupon: true });
    const prvi = await run(signedRequest(refunded(999)), w.resolve);
    expect(prvi.res.status).toBe(200);
    expect(prvi.body).toEqual({ ok: true, action: 'refunded' });
    const kupon = writesTo(prvi.calls, 'coupon_grants');
    expect(kupon).toHaveLength(1);
    expect(argOf(kupon[0], 'update')).toEqual({ expires_at: NOW_ISO });
    expect(eqs(kupon[0])).toEqual({ source_order_id: 'pi_1', reason: 'pass_bonus' });
    expect(kupon[0].ops.find((o) => o.op === 'in')?.args).toEqual(['id', ['cg-1']]);
    expect(w.state.couponExpiresAt).toBe(NOW_ISO);
    expect(settled(prvi.calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded' });

    // DRUGI PROLAZ istog povrata: isti ishod, nijedan upis u manual_orders ni coupon_grants.
    const drugi = await run(signedRequest(refunded(999)), w.resolve);
    expect(drugi.res.status).toBe(200);
    expect(drugi.body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(drugi.calls, 'coupon_grants')).toHaveLength(0);
    expect(writesTo(drugi.calls, 'manual_orders')).toHaveLength(0);
    expect(w.state.couponExpiresAt).toBe(NOW_ISO);
  });

  it('rucna narudzba bez entitlementa: puni povrat je otkazuje (refunded), ne refund_without_entitlement; drugi prolaz no-op', async () => {
    const w = refundWorld({ entitlement: false, manualOrder: true, coupon: false });
    const prvi = await run(signedRequest(refunded(999)), w.resolve);
    expect(prvi.res.status).toBe(200);
    expect(prvi.body).toEqual({ ok: true, action: 'refunded' });
    const narudzba = writesTo(prvi.calls, 'manual_orders');
    expect(narudzba).toHaveLength(1);
    expect(argOf(narudzba[0], 'update')).toEqual({ status: 'refunded' });
    expect(eqs(narudzba[0])).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    expect(narudzba[0].ops.find((o) => o.op === 'in')?.args).toEqual(['id', ['mo-1']]);
    const lookup = prvi.calls.find((c) => c.table === 'manual_orders' && writeOp(c) === 'select')!;
    expect(eqs(lookup)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    expect(w.state.manualStatus).toBe('refunded');
    expect(entitlementWrites(prvi.calls)).toHaveLength(0);
    // `refunded` je u REFUND_MARKERS, pa uplata koja stigne kasnije pravo i dalje gasi.
    expect(settled(prvi.calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded' });

    const drugi = await run(signedRequest(refunded(999)), w.resolve);
    expect(drugi.body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(drugi.calls, 'manual_orders')).toHaveLength(0);
    expect(writesTo(drugi.calls, 'coupon_grants')).toHaveLength(0);
    expect(w.state.manualStatus).toBe('refunded');
  });

  it('pass kupon bez roka (expires_at null) se isto povlaci', async () => {
    const w = refundWorld({ entitlement: true, manualOrder: false, coupon: true, couponExpiresAt: null });
    const { body, calls } = await run(signedRequest(refunded(999)), w.resolve);
    expect(body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(calls, 'coupon_grants')).toHaveLength(1);
    expect(w.state.couponExpiresAt).toBe(NOW_ISO);
  });

  it('vec istekao pass kupon se ne dira', async () => {
    const w = refundWorld({ entitlement: true, manualOrder: false, coupon: true, couponExpiresAt: '2026-01-01T00:00:00.000Z' });
    const { body, calls } = await run(signedRequest(refunded(999)), w.resolve);
    expect(body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(calls, 'coupon_grants')).toHaveLength(0);
    expect(w.state.couponExpiresAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('DJELOMICNI povrat ne dira ni rucnu narudzbu ni kupon: ostaje partial_refund_noted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const w = refundWorld({ entitlement: true, manualOrder: true, coupon: true });
      const { body, calls } = await run(signedRequest(refunded(500)), w.resolve);
      expect(body).toEqual({ ok: true, action: 'partial_refund_noted' });
      expect(calls.some((c) => c.table === 'manual_orders' || c.table === 'coupon_grants')).toBe(false);
      expect(w.state).toEqual({ manualStatus: 'pending', couponExpiresAt: '2027-01-24T10:00:00.000Z' });
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'partial_refund_noted' });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it.each([
    ['manual_orders', 'select'],
    ['manual_orders', 'update'],
    ['coupon_grants', 'select'],
    ['coupon_grants', 'update'],
  ])('pad %s/%s je 500 uz ocuvanu oznaku refund_pending, bez teksta greske u odgovoru', async (table, op) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const w = refundWorld({ entitlement: true, manualOrder: true, coupon: true });
      const boom = (c: FakeCall): FakeResult | undefined =>
        c.table === table && writeOp(c) === op ? { error: { message: 'tajni_detalj_baze' } } : w.resolve(c);
      const { res, body, calls } = await run(signedRequest(refunded(999)), boom);
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'refund_failed' });
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_pending' });
      const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor refund_consequences_failed');
      expect(redak?.[1]).toMatchObject({ orderId: 'pi_1', error: 'tajni_detalj_baze' });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

/**
 * 23505 NIJE DOKAZ ISTE KUPNJE (odluka vlasnika 2026-09-27). unique(provider, order_id) kaze da
 * redak postoji, ne i ciji je. Nepodudaran vlasnik: `conflict_other_user`, ERROR, 200, bez bonusa.
 */
describe('webhook-mor handler: 23505 s drugim korisnikom', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const dupOwnedBy = (owner: FakeResult) =>
    baseResolver((c) => {
      if (c.table === 'entitlements' && writeOp(c) === 'insert') return { error: { message: 'duplicate key', code: '23505' } };
      if (c.table === 'entitlements' && writeOp(c) === 'select') return owner;
      return undefined;
    });

  it('postojece pravo drugog korisnika: 200 conflict_other_user, ERROR redak, bez bonusa i bez citanja oznake povrata', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, body, calls, granted } = await run(
      signedRequest(succeeded()),
      dupOwnedBy({ data: { id: 'ent-9', user_id: 'user-2' } }),
    );
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'conflict_other_user' });
    expect(entitlementWrites(calls).map(writeOp)).toEqual(['insert']);
    const vlasnik = calls.find((c) => c.table === 'entitlements' && writeOp(c) === 'select')!;
    expect(eqs(vlasnik)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    expect(calls.some((c) => ['bonus_outbox', 'coupon_grants', 'referrals'].includes(c.table))).toBe(false);
    expect(granted).toHaveLength(0);
    expect(calls.some((c) => c.table === 'webhook_events' && writeOp(c) === 'select')).toBe(false);
    expect(settled(calls).at(-1)).toMatchObject({
      outcome: 'conflict_other_user',
      outcome_detail: 'entitlement=ent-9 postojeci_korisnik=user-2 korisnik_dogadjaja=user-1',
    });
    const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor conflict_other_user');
    expect(redak?.[1]).toMatchObject({ orderId: 'pi_1', eventUserId: 'user-1', existingUserId: 'user-2' });
  });

  it('isti korisnik: i dalje duplicate_ignored uz ponovni upis obveza (tocka oporavka)', async () => {
    const { body, calls } = await run(signedRequest(succeeded()), dupOwnedBy({ data: { id: 'ent-1', user_id: 'user-1' } }));
    expect(body).toEqual({ ok: true, action: 'duplicate_ignored' });
    expect(calls.some((c) => c.table === 'bonus_outbox')).toBe(true);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'entitlement_duplicate' });
  });

  it('pad citanja vlasnika je 500 bez teksta greske i bez bonusa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, body, calls, granted } = await run(
      signedRequest(succeeded()),
      dupOwnedBy({ error: { message: 'tajni_detalj_baze' } }),
    );
    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'internal' });
    expect(calls.some((c) => c.table === 'bonus_outbox')).toBe(false);
    expect(granted).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({
      outcome: 'failed',
      outcome_detail: 'entitlement_owner_lookup: tajni_detalj_baze',
    });
  });

  it('23505 bez retka koji bi ga objasnio nije uspjeh: 500 (retry), bez bonusa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, calls } = await run(signedRequest(succeeded()), dupOwnedBy({ data: null }));
    expect(res.status).toBe(500);
    expect(calls.some((c) => c.table === 'bonus_outbox')).toBe(false);
    expect(settled(calls).at(-1)).toMatchObject({
      outcome: 'failed',
      outcome_detail: 'entitlement_owner_lookup: redak_ne_postoji',
    });
  });
});

/**
 * TEKST GRESKE BAZE NIKAD U ODGOVORU (odluka vlasnika 2026-09-27). Svaka 500 grana handlera koja
 * dolazi od baze izaziva se s prepoznatljivom porukom; odgovor ne smije nositi ni tu poruku ni polje
 * `detail`, a inbox (outcome_detail) i log je i dalje nose.
 */
describe('webhook-mor handler: 500 odgovori ne nose tekst greske baze', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const TAJNA = 'relation entitlements violates tajni_detalj_baze';
  const PREMIUM = {
    ...PRODUCT_ROW,
    id: 'premium_human',
    kind: 'premium_human',
    work_type: null,
    price_eur: 9.99,
    manual_fulfillment: true,
  };
  const premiumReq = () => signedRequest(succeeded({}, { user_id: 'user-1', product_id: 'premium_human' }));

  const slucajevi: Array<[string, () => Request, (c: FakeCall) => FakeResult | undefined, string]> = [
    [
      'upis rucne narudzbe',
      premiumReq,
      (c) => (c.table === 'products' ? { data: PREMIUM } : c.table === 'manual_orders' ? { error: { message: TAJNA } } : undefined),
      `manual_order_insert: ${TAJNA}`,
    ],
    [
      'upis entitlementa',
      () => signedRequest(succeeded()),
      (c) => (c.table === 'entitlements' && writeOp(c) === 'insert' ? { error: { message: TAJNA } } : undefined),
      `entitlement_insert: ${TAJNA}`,
    ],
    [
      'citanje kataloga',
      () => signedRequest(succeeded()),
      (c) => (c.table === 'products' ? { error: { message: TAJNA } } : undefined),
      `product_lookup: ${TAJNA}`,
    ],
    [
      'citanje oznake povrata',
      () => signedRequest(succeeded()),
      (c) => (c.table === 'webhook_events' && writeOp(c) === 'select' ? { error: { message: TAJNA } } : undefined),
      `refund_marker_lookup: ${TAJNA}`,
    ],
    [
      'citanje prava pri povratu',
      () => signedRequest(refunded(999)),
      (c) => (c.table === 'entitlements' && writeOp(c) === 'select' ? { error: { message: TAJNA } } : undefined),
      'refund_pending',
    ],
  ];

  it.each(slucajevi)('%s: 500 s generickim tijelom, detalj samo u inboxu i logu', async (_ime, req, over, detalj) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, body, calls } = await run(req(), baseResolver(over));
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('tajni_detalj_baze');
    expect(Object.keys(body)).toEqual(['error']);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: detalj });
    expect(err.mock.calls.some((c) => JSON.stringify(c[1] ?? '').includes('tajni_detalj_baze'))).toBe(true);
  });
});

/**
 * RUCNA NARUDZBA I POVRAT KOJI STIGNE PRIJE UPLATE (nalaz pregleda kruga 2, odluka vlasnika
 * 2026-09-27). Stripe ne jamci redoslijed, a prvi pokusaj uplate moze pasti i cekati retry. Grana
 * premium_human dotad nije citala oznaku punog povrata, pa je povrat obradjen PRIJE retryja uplate
 * nalazio praznu manual_orders, a retry je potom otvarao `pending` narudzbu za vec vracen novac.
 *
 * Lazna baza ovdje pamti stanje preko vise prolaza (inbox po retku dogadjaja, manual_orders), pa se
 * redoslijed dokazuje stvarnim nizom dogadjaja kroz isti handler, a ne pretpostavkom o upitu.
 */
const PREMIUM_ROW = {
  ...PRODUCT_ROW,
  id: 'premium_human',
  kind: 'premium_human',
  work_type: null,
  price_eur: 9.99,
  manual_fulfillment: true,
};
const premiumPayment = () => signedRequest(succeeded({}, { user_id: 'user-1', product_id: 'premium_human' }));

function manualOrderWorld(opts: { failFirstInsert?: boolean } = {}) {
  const inbox = new Map<string, string | null>();
  let nextInbox = 0;
  const state: { order: { id: string; status: string } | null; failInsert: boolean } = {
    order: null,
    failInsert: Boolean(opts.failFirstInsert),
  };
  const resolve = (c: FakeCall): FakeResult | undefined => {
    const op = writeOp(c);
    if (c.table === 'products') return { data: PREMIUM_ROW };
    if (c.table === 'webhook_events' && op === 'insert') {
      nextInbox += 1;
      const id = `inbox-${nextInbox}`;
      inbox.set(id, null);
      return { data: { id } };
    }
    if (c.table === 'webhook_events' && op === 'update') {
      const id = String(eqs(c).id);
      if (!inbox.has(id)) return { data: [] };
      inbox.set(id, ((argOf(c, 'update') as Record<string, unknown>).outcome_detail as string | null) ?? null);
      return { data: [{ id }] };
    }
    if (c.table === 'webhook_events' && op === 'select') {
      const wanted = (c.ops.find((o) => o.op === 'in')?.args[1] ?? []) as string[];
      const rows = [...inbox.entries()].filter(([, d]) => d !== null && wanted.includes(d)).map(([id]) => ({ id }));
      return { data: rows.slice(0, 1) };
    }
    if (c.table === 'entitlements' && op === 'select') return { data: [] };
    if (c.table === 'manual_orders' && op === 'insert') {
      if (state.failInsert) {
        state.failInsert = false;
        return { error: { message: 'prolazna_greska_baze' } };
      }
      if (state.order) return { error: { message: 'duplicate key', code: '23505' } };
      state.order = { id: 'mo-1', status: 'pending' };
      return { data: null };
    }
    if (c.table === 'manual_orders' && op === 'select') return { data: state.order ? [{ ...state.order }] : [] };
    if (c.table === 'manual_orders' && op === 'update') {
      const ids = (c.ops.find((o) => o.op === 'in')?.args[1] ?? []) as string[];
      if (state.order && ids.includes(state.order.id)) {
        state.order.status = String((argOf(c, 'update') as Record<string, unknown>).status);
      }
      return { data: null };
    }
    return undefined;
  };
  return { state, resolve };
}

describe('webhook-mor handler: rucna narudzba i povrat prije uplate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prvi pokusaj uplate padne, puni povrat stigne, retry uplate NE ostavlja pending narudzbu; drugi retry je no-op', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = manualOrderWorld({ failFirstInsert: true });

    // 1. prvi pokusaj uplate: prolazna greska upisa, 500, Stripe zakaze retry
    const prvi = await run(premiumPayment(), w.resolve);
    expect(prvi.res.status).toBe(500);
    expect(w.state.order).toBeNull();

    // 2. operater vrati novac u cijelosti: povrat ne nalazi ni pravo ni narudzbu, oznaka ostaje
    const povrat = await run(signedRequest(refunded(999)), w.resolve);
    expect(povrat.body).toEqual({ ok: true, action: 'refund_without_entitlement' });
    expect(w.state.order).toBeNull();

    // 3. Stripe retry uplate: narudzba se upise, oznaka procita, narudzba odmah zatvori
    const retry = await run(premiumPayment(), w.resolve);
    expect(retry.res.status).toBe(200);
    expect(retry.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(w.state.order).toEqual({ id: 'mo-1', status: 'refunded' });
    expect(settled(retry.calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded_before_payment' });
    // Redoslijed: upis narudzbe, pa citanje oznake, pa zatvaranje (isti dogovor kao za entitlement).
    const idx = (pred: (c: FakeCall) => boolean) => retry.calls.findIndex(pred);
    const upis = idx((c) => c.table === 'manual_orders' && writeOp(c) === 'insert');
    const oznaka = idx((c) => c.table === 'webhook_events' && writeOp(c) === 'select');
    const zatvori = idx((c) => c.table === 'manual_orders' && writeOp(c) === 'update');
    expect(upis).toBeGreaterThanOrEqual(0);
    expect(upis).toBeLessThan(oznaka);
    expect(oznaka).toBeLessThan(zatvori);
    const citanje = retry.calls[oznaka];
    expect(eqs(citanje)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    expect(citanje.ops.find((o) => o.op === 'in')?.args).toEqual(['outcome_detail', REFUND_DETAILS]);
    const zatvaranje = retry.calls[zatvori];
    expect(argOf(zatvaranje, 'update')).toEqual({ status: 'refunded' });
    expect(eqs(zatvaranje)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor manual_order_refunded_before_payment');
    expect(redak?.[1]).toMatchObject({ orderId: 'pi_1', productId: 'premium_human', manualOrdersClosed: 1 });

    // 4. jos jedan retry iste uplate (23505): isti ishod, jedini upis u manual_orders je pokusaj inserta
    const drugi = await run(premiumPayment(), w.resolve);
    expect(drugi.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(writesTo(drugi.calls, 'manual_orders').map(writeOp)).toEqual(['insert']);
    expect(w.state.order).toEqual({ id: 'mo-1', status: 'refunded' });
  });

  it('charge.refunded dostavljen prije payment_intent.succeeded: narudzba zavrsi zatvorena', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = manualOrderWorld();
    const povrat = await run(signedRequest(refunded(999)), w.resolve);
    expect(povrat.body).toEqual({ ok: true, action: 'refund_without_entitlement' });
    const uplata = await run(premiumPayment(), w.resolve);
    expect(uplata.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(w.state.order?.status).toBe('refunded');
  });

  it('zrcalni redoslijed (uplata, povrat, retry uplate) konvergira u isto stanje bez drugog upisa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = manualOrderWorld();
    const uplata = await run(premiumPayment(), w.resolve);
    expect(uplata.body).toEqual({ ok: true, action: 'manual_order_created' });
    expect(w.state.order?.status).toBe('pending');
    const povrat = await run(signedRequest(refunded(999)), w.resolve);
    expect(povrat.body).toEqual({ ok: true, action: 'refunded' });
    expect(w.state.order?.status).toBe('refunded');
    const retry = await run(premiumPayment(), w.resolve);
    expect(retry.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(writesTo(retry.calls, 'manual_orders').map(writeOp)).toEqual(['insert']);
    expect(w.state.order?.status).toBe('refunded');
  });

  it('bez oznake povrata ponasanje je nepromijenjeno: manual_order_created, pa duplicate_ignored', async () => {
    const w = manualOrderWorld();
    const prva = await run(premiumPayment(), w.resolve);
    expect(prva.body).toEqual({ ok: true, action: 'manual_order_created' });
    expect(settled(prva.calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'manual_order_created' });
    const druga = await run(premiumPayment(), w.resolve);
    expect(druga.body).toEqual({ ok: true, action: 'duplicate_ignored' });
    expect(settled(druga.calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'manual_order_duplicate' });
    expect(w.state.order).toEqual({ id: 'mo-1', status: 'pending' });
    expect(druga.calls.some((c) => c.table === 'manual_orders' && writeOp(c) === 'update')).toBe(false);
  });

  it('DJELOMICNI povrat prije uplate ne ostavlja oznaku: narudzba se otvara normalno', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = manualOrderWorld();
    const povrat = await run(signedRequest(refunded(500)), w.resolve);
    expect(povrat.body).toEqual({ ok: true, action: 'partial_refund_noted' });
    const uplata = await run(premiumPayment(), w.resolve);
    expect(uplata.body).toEqual({ ok: true, action: 'manual_order_created' });
    expect(w.state.order).toEqual({ id: 'mo-1', status: 'pending' });
  });

  it('pad citanja oznake je 500 bez teksta greske; retry kroz 23505 zatvara narudzbu', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = manualOrderWorld();
    await run(signedRequest(refunded(999)), w.resolve);
    const boom = (c: FakeCall): FakeResult | undefined =>
      c.table === 'webhook_events' && writeOp(c) === 'select' ? { error: { message: 'tajni_detalj_baze' } } : w.resolve(c);
    const pad = await run(premiumPayment(), boom);
    expect(pad.res.status).toBe(500);
    expect(pad.body).toEqual({ error: 'refund_marker_lookup_failed' });
    expect(settled(pad.calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_marker_lookup: tajni_detalj_baze' });
    expect(err.mock.calls.some((c) => c[0] === 'webhook-mor refund_marker_lookup_failed')).toBe(true);
    // Retry ne javlja duplicate_ignored dok je narudzba otvorena: prolazi kroz 23505 i zatvara je.
    const retry = await run(premiumPayment(), w.resolve);
    expect(retry.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(w.state.order?.status).toBe('refunded');
  });

  it('pad zatvaranja narudzbe je 500 bez teksta greske, detalj u inboxu i logu', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = manualOrderWorld();
    await run(signedRequest(refunded(999)), w.resolve);
    const boom = (c: FakeCall): FakeResult | undefined =>
      c.table === 'manual_orders' && writeOp(c) === 'update' ? { error: { message: 'tajni_detalj_baze' } } : w.resolve(c);
    const pad = await run(premiumPayment(), boom);
    expect(pad.res.status).toBe(500);
    expect(pad.body).toEqual({ error: 'refund_failed' });
    expect(settled(pad.calls).at(-1)).toMatchObject({
      outcome: 'failed',
      outcome_detail: 'refunded_before_payment: manual_orders_update: tajni_detalj_baze',
    });
    const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor refund_consequences_failed');
    expect(redak?.[1]).toMatchObject({ orderId: 'pi_1', step: 'manual_orders_update', error: 'tajni_detalj_baze' });
  });
});
