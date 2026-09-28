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
  // Monetizacija V1 (0207): ponuda i ugradjena prava, iz kojih webhook snapshotira pravo.
  offer_code: 'repair_v1',
  offer_codes: { capabilities: ['full_report', 'repair', 'repair_diff', 'recheck'] },
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
    // Djelomican povrat (Codex PR #217, M1): zadano pravo nije nadogradjeno.
    if (c.table === 'rpc:note_entitlement_partial_refund') return { data: 'noted' };
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
      return { granted: true };
    }) as never,
  });
  const res = await handler(req);
  const body = (await res.json()) as Record<string, unknown>;
  return { res, body, calls: db.calls, adminBuilt, granted };
}

/** Oznake punog povrata iz REFUND_MARKERS u handleru (isti redoslijed). */
const REFUND_DETAILS = ['refund_pending', 'refund_consequences_failed', 'refund_without_entitlement', 'refunded'];

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
    // Nijedan bonus se ne izdaje. Posljedice povrata se CITAJU (closePaymentAfterRefund zatvara ono
    // sto je izdao raniji pokusaj iste uplate), ali ovdje nema sto zatvoriti, pa nema ni upisa.
    expect(calls.some((c) => (c.table === 'bonus_outbox' || c.table === 'coupon_grants') && writeOp(c) !== 'select')).toBe(false);
    expect(granted).toHaveLength(0);
    const lookup = calls.find((c) => c.table === 'webhook_events' && writeOp(c) === 'select')!;
    expect(eqs(lookup)).toEqual({ provider: 'stripe', order_id: 'pi_1' });
    expect(lookup.ops.find((o) => o.op === 'in')?.args).toEqual(['outcome_detail', REFUND_DETAILS]);
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
    // Obveze se ne UPISUJU. Citanje je dopusteno: closeRefundConsequences provjerava ima li obveza
    // koja jos ceka da je otkaze (F21, stavka 1).
    expect(calls.some((c) => c.table === 'bonus_outbox' && writeOp(c) !== 'select')).toBe(false);
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

  it('Codex PR #217 M1: djelomicni povrat PRVO upise oznaku, pa note_entitlement_partial_refund vodi vraceni iznos', async () => {
    const { res, body, calls } = await run(signedRequest(refunded(500)));
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'partial_refund_noted' });
    const iOznaka = calls.findIndex((c) => c.table === 'webhook_events' && writeOp(c) === 'update'
      && (argOf(c, 'update') as Record<string, unknown>).outcome_detail === 'partial_refund_noted');
    const iRpc = calls.findIndex((c) => c.table === 'rpc:note_entitlement_partial_refund');
    expect(iOznaka).toBeGreaterThan(-1);
    expect(iRpc, 'oznaka mora biti upisana prije funkcije (pisi pa citaj)').toBeGreaterThan(iOznaka);
    expect(calls[iRpc].ops[0].args[1]).toEqual({ p_order_id: 'pi_1', p_refunded_cents: 500 });
    expect(settled(calls)[0]).toMatchObject({ outcome: null, outcome_detail: 'partial_refund_noted' });
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'partial_refund_noted' });
  });

  it('Codex PR #217 M1: djelomicni povrat NAKON pretvorbe u Final Pass ide na rucni pregled, pravo se ne dira', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const nadogradjeno = baseResolver((c) => (c.table === 'rpc:note_entitlement_partial_refund' ? { data: 'upgraded_needs_review' } : undefined));
      const { res, body, calls } = await run(signedRequest(refunded(500)), nadogradjeno);
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true, action: 'partial_refund_noted', review: 'partial_refund_after_upgrade' });
      expect(entitlementWrites(calls)).toHaveLength(0);
      const zadnji = settled(calls).at(-1);
      expect(zadnji).toMatchObject({ outcome: 'needs_manual_review', outcome_detail: 'partial_refund_noted' });
      expect(String(zadnji?.outcome_note)).toContain('partial_refund_after_upgrade: uplata=pi_1 vraceno=500 naplaceno=999');
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor partial_refund_after_upgrade');
    } finally {
      err.mockRestore();
    }
  });

  it('Codex PR #217 M1: pad note_entitlement_partial_refund je 500 (Stripe ponovi), oznaka ostaje', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const pad = baseResolver((c) => (c.table === 'rpc:note_entitlement_partial_refund' ? { error: { message: 'tajni_detalj_baze' } } : undefined));
      const { res, body, calls } = await run(signedRequest(refunded(500)), pad);
      expect(res.status).toBe(500);
      expect(JSON.stringify(body)).not.toContain('tajni_detalj_baze');
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'partial_refund_noted' });
    } finally {
      err.mockRestore();
    }
  });

  it('Codex PR #217 M1: bez upisane oznake djelomicnog povrata nema poziva funkcije, nego 500', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const bezOznake = baseResolver((c) => (c.table === 'webhook_events' && writeOp(c) === 'update' ? { data: [] } : undefined));
      const { res, calls } = await run(signedRequest(refunded(500)), bezOznake);
      expect(res.status).toBe(500);
      expect(calls.some((c) => c.table === 'rpc:note_entitlement_partial_refund')).toBe(false);
    } finally {
      err.mockRestore();
    }
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
    // Jedini pristup entitlements je CITANJE: je li ovo ponovljena dostava vec proknjizene uplate.
    const pravo = calls.filter((c) => c.table === 'entitlements');
    expect(pravo.map(writeOp)).toEqual(['select']);
    expect(eqs(pravo[0])).toEqual({ provider: 'stripe', order_id: 'pi_1' });
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
    // Narudzba se ne otvara; jedino citanje je provjera ponovljene dostave.
    expect(calls.filter((c) => c.table === 'manual_orders').map(writeOp)).toEqual(['select']);
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
    expect(entitlementWrites(calls)).toHaveLength(0);
    // Jedini upis u inbox je u VLASTITI redak ovog dogadjaja; redak povrata (inbox-refund) se ne dira.
    const inboxUpdates = calls.filter((c) => c.table === 'webhook_events' && writeOp(c) === 'update');
    expect(inboxUpdates.length).toBeGreaterThan(0);
    for (const u of inboxUpdates) expect(eqs(u)).toEqual({ id: 'inbox-1' });
    expect(settled(calls).some((u) => REFUND_DETAILS.includes(String(u.outcome_detail)))).toBe(false);
  });
});


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
  ])('pad %s/%s: pravo je VEC ugaseno, 500 uz oznaku refund_consequences_failed, bez teksta greske u odgovoru', async (table, op) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const w = refundWorld({ entitlement: true, manualOrder: true, coupon: true });
      const boom = (c: FakeCall): FakeResult | undefined =>
        c.table === table && writeOp(c) === op ? { error: { message: 'tajni_detalj_baze' } } : w.resolve(c);
      const { res, body, calls } = await run(signedRequest(refunded(999)), boom);
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'refund_failed' });
      expect(JSON.stringify(body)).not.toContain('tajni_detalj_baze');
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_consequences_failed' });
      // Nalaz 2026-09-27: opoziv prava ne ovisi o sporednim tablicama. Entitlement je ugasen PRIJE
      // prvog pristupa manual_orders ili coupon_grants.
      const ugasi = calls.findIndex((c) => c.table === 'entitlements' && writeOp(c) === 'update');
      const sporedno = calls.findIndex((c) => c.table === 'manual_orders' || c.table === 'coupon_grants');
      expect(ugasi).toBeGreaterThanOrEqual(0);
      expect(argOf(calls[ugasi], 'update')).toEqual({ status: 'refunded' });
      expect(sporedno).toBeGreaterThan(ugasi);
      expect(REFUND_DETAILS).toContain('refund_consequences_failed');
      const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor refund_consequences_failed');
      expect(redak?.[1]).toMatchObject({ orderId: 'pi_1', error: 'tajni_detalj_baze', entitlementRefunded: true });
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
    // Rucna narudzba nema pravo, pa djelomican povrat (M1) ne nalazi redak.
    if (c.table === 'rpc:note_entitlement_partial_refund') return { data: 'not_found' };
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

/**
 * NEUPOTREBLJIVA KATALOSKA CIJENA (nalaz pregleda 2026-09-27). mapProductRow cijenu null ili
 * neispravnu pretvara u 0 i proizvod oznacava neaktivnim; ocekivani iznos je tada bio 0 centi, pa je
 * svaka pozitivna uplata prolazila kao `above_catalog` i dobivala pravo. Mjeri se izvrsen handler.
 */
describe('webhook-mor handler: neupotrebljiva kataloska cijena ne daje pravo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    // mapProductRow: null i neispravna cijena daju neaktivan proizvod; 0 i 0.004 ostaju AKTIVNI uz
    // ocekivanih 0 centi, pa bi bez ove provjere svaka pozitivna uplata bila `above_catalog`.
    ['cijena null', { price_eur: null }, false],
    ['cijena 0', { price_eur: 0 }, true],
    ['cijena koja se zaokruzi na 0 centi', { price_eur: 0.004 }, true],
    ['neispravna cijena', { price_eur: 'abc' }, false],
    ['neaktivan proizvod uz ispravnu cijenu', { active: false }, false],
  ])('%s: 200 needs_manual_review catalog_price_unusable, bez prava i bez bonusa', async (_ime, over, aktivan) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolve = baseResolver((c) => (c.table === 'products' ? { data: { ...PRODUCT_ROW, ...over } } : undefined));
    const { res, body, calls, granted } = await run(signedRequest(succeeded()), resolve);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'catalog_price_unusable' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(calls.some((c) => ['manual_orders', 'coupon_grants', 'bonus_outbox'].includes(c.table))).toBe(false);
    expect(granted).toHaveLength(0);
    const zadnji = settled(calls).at(-1)!;
    expect(zadnji.outcome).toBe('needs_manual_review');
    const detalj = String(zadnji.outcome_detail);
    expect(detalj.startsWith(`catalog_price_unusable aktivan=${String(aktivan)} ocekivano=`)).toBe(true);
    expect(detalj.endsWith(' naplaceno=999 valuta=EUR')).toBe(true);
    const redak = err.mock.calls.find((c) => c[0] === 'webhook-mor needs_manual_review');
    expect(redak?.[1]).toMatchObject({ reason: 'catalog_price_unusable', orderId: 'pi_1', productId: 'slot_diplomski' });
  });

  it('rucna narudzba (premium_human) bez upotrebljive cijene se NE otvara', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolve = baseResolver((c) =>
      c.table === 'products'
        ? { data: { ...PRODUCT_ROW, id: 'premium_human', kind: 'premium_human', work_type: null, price_eur: null, manual_fulfillment: true } }
        : undefined,
    );
    const { body, calls } = await run(signedRequest(succeeded({}, { user_id: 'user-1', product_id: 'premium_human' })), resolve);
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'catalog_price_unusable' });
    expect(calls.filter((c) => c.table === 'manual_orders').map(writeOp)).toEqual(['select']);
  });

  it('BASELINE: aktivan proizvod s pozitivnom cijenom i dalje daje pravo', async () => {
    const { body, calls } = await run(signedRequest(succeeded()));
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    expect(entitlementWrites(calls).map(writeOp)).toEqual(['insert']);
  });
});

/**
 * PONOVLJENA DOSTAVA VEC PROKNJIZENE UPLATE (nalaz pregleda 2026-09-27). Stripe retry iste uplate
 * nakon sto se cjenik promijenio (ili je proizvod povucen) ne smije zavrsiti na rucnom pregledu:
 * pravo je vec upisano, a `duplicate_ignored` je tocka oporavka obveza bonusa (audit P1-07).
 */
describe('webhook-mor handler: ponovljena dostava nakon promjene cijene', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const PASS_ROW = { ...PRODUCT_ROW, id: 'pass_diplomski', kind: 'pass', price_eur: 9.99 };

  /** Svijet u kojem entitlement za pi_1 vec postoji; cijena u katalogu je od tada promijenjena. */
  const vecProknjizeno = (productRow: Record<string, unknown>, owner = 'user-1') =>
    baseResolver((c) => {
      if (c.table === 'products') return { data: productRow };
      if (c.table === 'entitlements' && writeOp(c) === 'select') return { data: { id: 'ent-1', user_id: owner } };
      if (c.table === 'entitlements' && writeOp(c) === 'insert') return { error: { message: 'duplicate key', code: '23505' } };
      return undefined;
    });

  it.each([
    ['cijena podignuta nakon kupnje', { price_eur: 12.99 }],
    ['proizvod povucen nakon kupnje', { active: false }],
    ['cijena obrisana nakon kupnje', { price_eur: null }],
  ])('%s: duplicate_ignored uz ponovni upis obveza, ne needs_manual_review; drugi prolaz isti', async (_ime, over) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolve = vecProknjizeno({ ...PRODUCT_ROW, ...over });
    for (const prolaz of [1, 2]) {
      const { res, body, calls, granted } = await run(signedRequest(succeeded()), resolve);
      expect(res.status, `prolaz ${prolaz}`).toBe(200);
      expect(body, `prolaz ${prolaz}`).toEqual({ ok: true, action: 'duplicate_ignored' });
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'entitlement_duplicate' });
      // Nista se ne pise u entitlements (redak istog korisnika vec postoji), bonusi se ne izdaju
      // izravno, ali obveze se ponovno osiguraju u outboxu.
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(granted).toHaveLength(0);
      const outbox = calls.find((c) => c.table === 'bonus_outbox' && writeOp(c) === 'upsert');
      expect(outbox).toBeDefined();
      // Oznaka povrata se i dalje cita prije izlaza (povrat nakon kupnje mora ugasiti pravo).
      expect(calls.some((c) => c.table === 'webhook_events' && writeOp(c) === 'select')).toBe(true);
    }
    expect(err.mock.calls.map((c) => String(c[0]))).not.toContain('webhook-mor needs_manual_review');
  });

  it('pass kupnja s referral kodom: obveze bonusa su iste kao prije promjene cijene', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const req = signedRequest(succeeded({}, { user_id: 'user-1', product_id: 'pass_diplomski', referral_code: 'REF1' }));
    const { body, calls } = await run(req, vecProknjizeno({ ...PASS_ROW, price_eur: 19.99 }));
    expect(body).toEqual({ ok: true, action: 'duplicate_ignored' });
    const outbox = calls.find((c) => c.table === 'bonus_outbox' && writeOp(c) === 'upsert')!;
    const vrste = (argOf(outbox, 'upsert') as Array<Record<string, unknown>>).map((r) => r.kind);
    expect(vrste).toEqual(['referrer_reward', 'pass_coupon', 'referral_attribution']);
  });

  it('postojece pravo DRUGOG korisnika nije ponavljanje: uplata ispod kataloga ide na rucni pregled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { body, calls } = await run(signedRequest(succeeded()), vecProknjizeno({ ...PRODUCT_ROW, price_eur: 12.99 }, 'user-2'));
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'amount_below_catalog' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(calls.some((c) => c.table === 'bonus_outbox')).toBe(false);
  });

  it('rucna narudzba istog korisnika nakon promjene cijene: duplicate_ignored bez novog upisa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolve = baseResolver((c) => {
      if (c.table === 'products') {
        return { data: { ...PRODUCT_ROW, id: 'premium_human', kind: 'premium_human', work_type: null, price_eur: 59, manual_fulfillment: true } };
      }
      if (c.table === 'manual_orders' && writeOp(c) === 'select') return { data: { id: 'mo-1', user_id: 'user-1' } };
      return undefined;
    });
    const { body, calls } = await run(signedRequest(succeeded({}, { user_id: 'user-1', product_id: 'premium_human' })), resolve);
    expect(body).toEqual({ ok: true, action: 'duplicate_ignored' });
    expect(calls.filter((c) => c.table === 'manual_orders').map(writeOp)).toEqual(['select']);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'manual_order_duplicate' });
  });

  it('pad provjere ponovljene dostave je 500 bez teksta greske (retry), bez prava i bez rucnog pregleda', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolve = baseResolver((c) => {
      if (c.table === 'products') return { data: { ...PRODUCT_ROW, price_eur: 12.99 } };
      if (c.table === 'entitlements' && writeOp(c) === 'select') return { error: { message: 'tajni_detalj_baze' } };
      return undefined;
    });
    const { res, body, calls } = await run(signedRequest(succeeded()), resolve);
    expect(res.status).toBe(500);
    expect(body).toEqual({ error: 'internal' });
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'replay_lookup: tajni_detalj_baze' });
  });

  it('BASELINE: prva dostava uplate ispod NOVE cijene bez postojeceg prava ostaje rucni pregled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resolve = baseResolver((c) => (c.table === 'products' ? { data: { ...PRODUCT_ROW, price_eur: 12.99 } } : undefined));
    const { body, calls } = await run(signedRequest(succeeded()), resolve);
    expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'amount_below_catalog' });
    expect(entitlementWrites(calls)).toHaveLength(0);
  });
});

/**
 * PROZOR ISTODOBNOG POVRATA ZA BONUSE (nalaz pregleda 2026-09-27). Uplata cita oznaku povrata
 * PRIJE bonusa; puni povrat koji stigne u prozoru izmedju tog citanja i upisa kupona i nagrade
 * preporucitelju gasi pravo, a coupon_grants i referral_signups cita dok su jos prazni.
 *
 * Redoslijed se ne pretpostavlja nego IZVRSAVA: uplata se zaustavi na dodjeli nagrade
 * preporucitelju (prvi bonus), povrat se u tom trenutku obradi do kraja istim handlerom nad istim
 * stanjem, pa se uplata pusti dalje.
 */
describe('webhook-mor handler: povrat stigne dok uplata izdaje bonuse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const PASS_ROW = { ...PRODUCT_ROW, id: 'pass_diplomski', kind: 'pass', price_eur: 9.99 };
  const NOW_ISO = new Date(NOW_MS).toISOString();

  function bonusWorld() {
    const inbox = new Map<string, string | null>();
    let nextInbox = 0;
    const state = {
      entitlement: null as null | { id: string; status: string },
      coupon: null as null | { id: string; expires_at: string },
      signup: null as null | { id: string; status: string; referrer_reward_entitlement_id: string },
      rewardStatus: null as null | string,
    };
    const resolve = (c: FakeCall): FakeResult | undefined => {
      const op = writeOp(c);
      const e = eqs(c);
      if (c.table === 'products') return { data: PASS_ROW };
      if (c.table === 'webhook_events' && op === 'insert') {
        nextInbox += 1;
        const id = `inbox-${nextInbox}`;
        inbox.set(id, null);
        return { data: { id } };
      }
      if (c.table === 'webhook_events' && op === 'update') {
        const id = String(e.id);
        inbox.set(id, ((argOf(c, 'update') as Record<string, unknown>).outcome_detail as string | null) ?? null);
        return { data: [{ id }] };
      }
      if (c.table === 'webhook_events' && op === 'select') {
        const wanted = (c.ops.find((o) => o.op === 'in')?.args[1] ?? []) as string[];
        return { data: [...inbox.entries()].filter(([, d]) => d !== null && wanted.includes(d)).map(([id]) => ({ id })).slice(0, 1) };
      }
      if (c.table === 'entitlements' && op === 'insert') {
        if (state.entitlement) return { error: { message: 'duplicate key', code: '23505' } };
        state.entitlement = { id: 'ent-1', status: 'paid' };
        return { data: null };
      }
      if (c.table === 'entitlements' && op === 'select') {
        if (e.id === 'ent-reward') return { data: state.rewardStatus ? { id: 'ent-reward', slots_used: 0 } : null };
        if (e.provider === 'internal') return { data: null };
        // povrat cita retke (niz), provjera vlasnika jedan redak
        if (c.ops.some((o) => o.op === 'maybeSingle')) return { data: state.entitlement ? { id: 'ent-1', user_id: 'user-1' } : null };
        return { data: state.entitlement ? [{ id: 'ent-1', product_id: 'pass_diplomski' }] : [] };
      }
      if (c.table === 'entitlements' && op === 'update') {
        const status = String((argOf(c, 'update') as Record<string, unknown>).status);
        if (e.id === 'ent-reward') {
          state.rewardStatus = status;
          return { data: null };
        }
        if (state.entitlement) state.entitlement.status = status;
        return { data: state.entitlement ? [{ id: 'ent-1' }] : [] };
      }
      if (c.table === 'coupon_grants' && op === 'upsert') {
        if (!state.coupon) state.coupon = { id: 'cg-1', expires_at: '2027-01-24T10:00:00.000Z' };
        return { data: null };
      }
      if (c.table === 'coupon_grants' && op === 'select') return { data: state.coupon ? [{ ...state.coupon }] : [] };
      if (c.table === 'coupon_grants' && op === 'update') {
        if (state.coupon) state.coupon.expires_at = String((argOf(c, 'update') as Record<string, unknown>).expires_at);
        return { data: null };
      }
      if (c.table === 'referral_signups' && op === 'select') {
        return { data: state.signup && state.signup.status === 'rewarded' ? [{ ...state.signup }] : [] };
      }
      if (c.table === 'referral_signups' && op === 'update') {
        if (state.signup) state.signup.status = String((argOf(c, 'update') as Record<string, unknown>).status);
        return { data: null };
      }
      if (c.table === 'manual_orders') return { data: [] };
      return undefined;
    };
    return { state, resolve };
  }

  /** Handler nad zadanim svijetom; `grant` je nagrada preporucitelju (upis u svijet). */
  async function runIn(req: Request, resolve: (c: FakeCall) => FakeResult | undefined, grant: () => Promise<void>) {
    const db = fakeAdmin(resolve);
    const handler = createWebhookHandler({
      admin: () => db.admin,
      webhookSecret: SECRET,
      allowTestMode: false,
      now: () => NOW_MS,
      grantReferrerReward: (async () => {
        await grant();
        return { granted: true };
      }) as never,
    });
    const res = await handler(req);
    return { res, body: (await res.json()) as Record<string, unknown>, calls: db.calls };
  }

  const passPayment = () => signedRequest(succeeded({}, { user_id: 'user-1', product_id: 'pass_diplomski' }));

  it('povrat u prozoru izmedju citanja oznake i bonusa: kupon i nagrada preporucitelju se opozivaju', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = bonusWorld();
    let pusti!: () => void;
    const zaustavljeno = new Promise<void>((r) => { pusti = r; });
    let stigla!: () => void;
    const naBonusu = new Promise<void>((r) => { stigla = r; });

    const uplata = runIn(passPayment(), w.resolve, async () => {
      stigla();
      await zaustavljeno;
      // nagrada preporucitelju nastaje TEK nakon sto je povrat vec procitao referral_signups
      w.state.signup = { id: 'rs-1', status: 'rewarded', referrer_reward_entitlement_id: 'ent-reward' };
      w.state.rewardStatus = 'paid';
    });
    await naBonusu;
    // Uplata je upisala pravo i procitala oznaku (nema je); sada stize puni povrat i obradi se do kraja.
    expect(w.state.entitlement).toEqual({ id: 'ent-1', status: 'paid' });
    const povrat = await runIn(signedRequest(refunded(999)), w.resolve, async () => undefined);
    expect(povrat.body).toEqual({ ok: true, action: 'refunded' });
    expect(w.state.entitlement?.status).toBe('refunded');
    expect(w.state.coupon, 'povrat je citao coupon_grants dok je jos prazan').toBeNull();
    expect(w.state.signup).toBeNull();

    pusti();
    const gotovo = await uplata;
    expect(gotovo.res.status).toBe(200);
    expect(gotovo.body).toEqual({ ok: true, action: 'refunded_during_payment' });
    // Kupon je izdan u prozoru i odmah povucen; nagrada preporucitelju je ponistena.
    expect(w.state.coupon).toEqual({ id: 'cg-1', expires_at: NOW_ISO });
    expect(w.state.rewardStatus).toBe('void');
    expect(w.state.signup?.status).toBe('converted');
    expect(w.state.entitlement?.status).toBe('refunded');
    expect(settled(gotovo.calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded_during_payment' });
    // Pisi-pa-citaj: drugo citanje oznake ide TEK nakon upisa kupona, opoziv tek nakon citanja.
    const idx = (pred: (c: FakeCall) => boolean, from = 0) => gotovo.calls.findIndex((c, i) => i >= from && pred(c));
    const upisKupona = idx((c) => c.table === 'coupon_grants' && writeOp(c) === 'upsert');
    const drugoCitanje = idx((c) => c.table === 'webhook_events' && writeOp(c) === 'select', upisKupona);
    const opoziv = idx((c) => c.table === 'coupon_grants' && writeOp(c) === 'update');
    expect(upisKupona).toBeGreaterThanOrEqual(0);
    expect(drugoCitanje).toBeGreaterThan(upisKupona);
    expect(opoziv).toBeGreaterThan(drugoCitanje);

    // IDEMPOTENCIJA: Stripe ponovi i povrat i uplatu; nista se vise ne mijenja.
    const povrat2 = await runIn(signedRequest(refunded(999)), w.resolve, async () => undefined);
    expect(povrat2.body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(povrat2.calls, 'coupon_grants')).toHaveLength(0);
    const uplata2 = await runIn(passPayment(), w.resolve, async () => undefined);
    expect(uplata2.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(writesTo(uplata2.calls, 'coupon_grants')).toHaveLength(0);
    // Obveze se ne upisuju; citanje radi closeRefundConsequences (F21: otkazivanje obveze koja ceka).
    expect(uplata2.calls.some((c) => c.table === 'bonus_outbox' && writeOp(c) !== 'select')).toBe(false);
    expect(w.state.coupon).toEqual({ id: 'cg-1', expires_at: NOW_ISO });
  });

  it('BASELINE: bez povrata kupon i nagrada ostaju aktivni (entitlement_created)', async () => {
    const w = bonusWorld();
    const { body } = await runIn(passPayment(), w.resolve, async () => {
      w.state.signup = { id: 'rs-1', status: 'rewarded', referrer_reward_entitlement_id: 'ent-reward' };
      w.state.rewardStatus = 'paid';
    });
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    expect(w.state.coupon).toEqual({ id: 'cg-1', expires_at: '2027-01-24T10:00:00.000Z' });
    expect(w.state.rewardStatus).toBe('paid');
    expect(w.state.signup?.status).toBe('rewarded');
  });

  it('isti prozor, a drugo citanje oznake padne: 500 bez teksta greske; retry kroz 23505 opoziva izdano', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = bonusWorld();
    let citanjaUplate = 0;
    // Pada SAMO citanje oznake NAKON bonusa u prvom pokusaju uplate; povrat i retry citaju normalno.
    // Citanja uplate: 1. prije prava, 2. prije nagrade preporucitelju (krug 4), 3. nakon bonusa.
    const uplataBoom = (c: FakeCall): FakeResult | undefined => {
      if (c.table === 'webhook_events' && writeOp(c) === 'select') {
        citanjaUplate += 1;
        if (citanjaUplate === 3) return { error: { message: 'tajni_detalj_baze' } };
      }
      return w.resolve(c);
    };
    let pusti!: () => void;
    const zaustavljeno = new Promise<void>((r) => { pusti = r; });
    let stigla!: () => void;
    const naBonusu = new Promise<void>((r) => { stigla = r; });
    const uplata = runIn(passPayment(), uplataBoom, async () => {
      stigla();
      await zaustavljeno;
      w.state.signup = { id: 'rs-1', status: 'rewarded', referrer_reward_entitlement_id: 'ent-reward' };
      w.state.rewardStatus = 'paid';
    });
    await naBonusu;
    const povrat = await runIn(signedRequest(refunded(999)), w.resolve, async () => undefined);
    expect(povrat.body).toEqual({ ok: true, action: 'refunded' });
    pusti();
    const pad = await uplata;
    expect(pad.res.status).toBe(500);
    expect(pad.body).toEqual({ error: 'refund_marker_lookup_failed' });
    expect(JSON.stringify(pad.body)).not.toContain('tajni_detalj_baze');
    expect(settled(pad.calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_marker_recheck: tajni_detalj_baze' });
    // Kupon i nagrada su izdani nakon sto ih je povrat trazio, i jos su aktivni.
    expect(w.state.coupon).toEqual({ id: 'cg-1', expires_at: '2027-01-24T10:00:00.000Z' });
    expect(w.state.rewardStatus).toBe('paid');

    // Stripe retry uplate: 23505, isti vlasnik, oznaka procitana PRIJE bonusa, pa se izdano opoziva.
    const retry = await runIn(passPayment(), w.resolve, async () => undefined);
    expect(retry.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(w.state.coupon).toEqual({ id: 'cg-1', expires_at: NOW_ISO });
    expect(w.state.rewardStatus).toBe('void');
    expect(w.state.signup?.status).toBe('converted');
    // Obveze se ne upisuju; citanje radi closeRefundConsequences (F21: otkazivanje obveze koja ceka).
    expect(retry.calls.some((c) => c.table === 'bonus_outbox' && writeOp(c) !== 'select')).toBe(false);
  });

  /**
   * KRUG 4, nalaz 6a. Obveza `referrer_reward` u bonus_outbox, s uvjetnim UPDATE-om kao u Postgresu:
   * redak se mijenja samo ako prolazi SVE .eq filtre (pa `status = 'pending'` stiti `cancelled`).
   */
  function outboxResolve(w: ReturnType<typeof bonusWorld>, outbox: { status: string }) {
    return (c: FakeCall): FakeResult | undefined => {
      if (c.table === 'bonus_outbox' && writeOp(c) === 'update') {
        const e = eqs(c);
        if (e.kind === 'referrer_reward' && (e.status === undefined || e.status === outbox.status)) {
          outbox.status = String((argOf(c, 'update') as Record<string, unknown>).status);
        }
        return { data: null };
      }
      if (c.table === 'bonus_outbox') return { data: [] };
      return w.resolve(c);
    };
  }

  it('krug 4 (6a): povrat stigne izmedju upisa obveza i nagrade: nagrada se inline NE izdaje, obveza ostaje otkazana', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = bonusWorld();
    const outbox = { status: 'pending' };
    let citanja = 0;
    const resolve = (c: FakeCall): FakeResult | undefined => {
      // Obveze su upisane (upsert), a zatim puni povrat obradi i otkaze obvezu te upise oznaku.
      if (c.table === 'bonus_outbox' && writeOp(c) === 'upsert') {
        outbox.status = 'cancelled';
        return { data: null };
      }
      if (c.table === 'webhook_events' && writeOp(c) === 'select') {
        citanja += 1;
        // Prvo citanje (prije prava) oznake nema; citanje prije nagrade je vec vidi.
        if (citanja >= 2) return { data: [{ id: 'inbox-refund' }] };
      }
      return outboxResolve(w, outbox)(c);
    };
    let dodijeljeno = 0;
    const { res } = await runIn(passPayment(), resolve, async () => { dodijeljeno += 1; });
    expect(res.status).toBe(200);
    expect(dodijeljeno, 'nagrada preporucitelju izdana inline za vracen novac').toBe(0);
    expect(outbox.status, 'otkazana obveza prepisana u done').toBe('cancelled');
  });

  it('krug 4 (6a): obveza otkazana DOK se nagrada izdaje: markBonusDone ne prepisuje cancelled (uvjet pending)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = bonusWorld();
    const outbox = { status: 'pending' };
    const { res, calls } = await runIn(passPayment(), outboxResolve(w, outbox), async () => {
      // Povrat u prozoru dodjele otkaze obvezu (closeRefundConsequences).
      outbox.status = 'cancelled';
    });
    expect(res.status).toBe(200);
    expect(outbox.status).toBe('cancelled');
    const done = calls.filter((c) => c.table === 'bonus_outbox' && writeOp(c) === 'update'
      && (argOf(c, 'update') as Record<string, unknown>).status === 'done');
    expect(done.length).toBeGreaterThan(0);
    for (const d of done) expect(eqs(d).status).toBe('pending');
  });

  it('krug 4 (6a) BASELINE: bez povrata obveza prelazi pending -> done i nagrada se izdaje jednom', async () => {
    const w = bonusWorld();
    const outbox = { status: 'pending' };
    let dodijeljeno = 0;
    const { res } = await runIn(passPayment(), outboxResolve(w, outbox), async () => { dodijeljeno += 1; });
    expect(res.status).toBe(200);
    expect(dodijeljeno).toBe(1);
    expect(outbox.status).toBe('done');
  });
});

/**
 * PRAVO SE GASI PRIJE SPOREDNIH POSLJEDICA (nalaz pregleda 2026-09-27). Pad sporednog koraka ne
 * ostavlja aktivno pravo, ide u inbox kao `refund_consequences_failed` (i dalje oznaka punog
 * povrata) uz 500, a ponovljeni povrat dovrsi posljedice bez drugog upisa onoga sto je zatvoreno.
 */
describe('webhook-mor handler: pad sporednih posljedica povrata', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pad povlacenja kupona: pravo ugaseno, 500; ponovljen povrat dovrsi; treci prolaz no-op', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = refundWorld({ entitlement: true, manualOrder: true, coupon: true });
    let padni = true;
    const resolve = (c: FakeCall): FakeResult | undefined => {
      if (padni && c.table === 'coupon_grants' && writeOp(c) === 'update') {
        padni = false;
        return { error: { message: 'tajni_detalj_baze' } };
      }
      return w.resolve(c);
    };
    const prvi = await run(signedRequest(refunded(999)), resolve);
    expect(prvi.res.status).toBe(500);
    expect(entitlementWrites(prvi.calls).map((c) => argOf(c, 'update'))).toEqual([{ status: 'refunded' }]);
    expect(w.state.manualStatus).toBe('refunded');
    expect(w.state.couponExpiresAt).toBe('2027-01-24T10:00:00.000Z');
    expect(settled(prvi.calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_consequences_failed' });

    const drugi = await run(signedRequest(refunded(999)), resolve);
    expect(drugi.body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(drugi.calls, 'manual_orders')).toHaveLength(0);
    expect(writesTo(drugi.calls, 'coupon_grants')).toHaveLength(1);
    expect(w.state.couponExpiresAt).toBe(new Date(NOW_MS).toISOString());

    const treci = await run(signedRequest(refunded(999)), resolve);
    expect(treci.body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(treci.calls, 'manual_orders')).toHaveLength(0);
    expect(writesTo(treci.calls, 'coupon_grants')).toHaveLength(0);
  });

  it('uplata nakon povrata kojem su posljedice pale i dalje vidi puni povrat (refund_consequences_failed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = manualOrderWorld();
    const uplata = await run(premiumPayment(), w.resolve);
    expect(uplata.body).toEqual({ ok: true, action: 'manual_order_created' });
    const boom = (c: FakeCall): FakeResult | undefined =>
      c.table === 'manual_orders' && writeOp(c) === 'update' ? { error: { message: 'tajni_detalj_baze' } } : w.resolve(c);
    const povrat = await run(signedRequest(refunded(999)), boom);
    expect(povrat.res.status).toBe(500);
    expect(w.state.order?.status).toBe('pending');
    // Stripe retry uplate stigne prije retryja povrata: oznaka refund_consequences_failed je
    // oznaka punog povrata, pa se narudzba zatvara odmah.
    const retry = await run(premiumPayment(), w.resolve);
    expect(retry.body).toEqual({ ok: true, action: 'refunded_before_payment' });
    expect(w.state.order?.status).toBe('refunded');
  });
});

/**
 * Monetizacija V1 (M2): snapshot prava pri kupnji (docs/decisions/MONETIZACIJA_V1.md odjeljci 13 i
 * 29). Kriterij je izvan diffa: "offer_code se snapshotira pri kupnji" i "promjena buduceg kataloga
 * ne oduzima staro pravo". Mjeri se izvrseni handler, ne samo buildEntitlementInsert.
 */
describe('webhook-mor handler: snapshot prava pri kupnji', () => {
  it('entitlement nosi offer_code, prava i stvarno naplaceni iznos iz trenutka kupnje', async () => {
    const { res, calls } = await run(signedRequest(succeeded()));
    expect(res.status).toBe(200);
    const product = calls.find((c) => c.table === 'products')!;
    expect(argOf(product, 'select'), 'prava se citaju u istom upitu kao cijena').toBe('*, offer_codes(capabilities)');
    const insert = entitlementWrites(calls).find((c) => writeOp(c) === 'insert')!;
    expect(argOf(insert, 'insert')).toMatchObject({
      offer_code: 'repair_v1',
      capabilities: ['full_report', 'repair', 'repair_diff', 'recheck'],
      paid_amount_cents: 999,
    });
  });

  it('specijalisticki Repair: jedan slot vrste specijalisticki (bez mapiranja na diplomski ili doktorski)', async () => {
    const SPEC = { ...PRODUCT_ROW, id: 'slot_specijalisticki', work_type: 'specijalisticki', price_eur: 16.99, slot_window_days: 21 };
    const resolve = baseResolver((c) => (c.table === 'products' ? { data: SPEC } : undefined));
    const { res, body, calls } = await run(
      signedRequest(succeeded({ amount: 1699, amount_received: 1699 }, { user_id: 'user-1', product_id: 'slot_specijalisticki' })),
      resolve,
    );
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    const insert = entitlementWrites(calls).find((c) => writeOp(c) === 'insert')!;
    expect(argOf(insert, 'insert')).toMatchObject({
      work_type: 'specijalisticki',
      product_id: 'slot_specijalisticki',
      slots_total: 1,
      offer_code: 'repair_v1',
      paid_amount_cents: 1699,
    });
  });

  it.each([
    ['bez offer_code', { offer_code: null }],
    ['bez ugradjenih prava', { offer_codes: null }],
  ])('proizvod %s: 500 product_misconfigured, bez prava i bez bonusa (Stripe ponovi)', async (_ime, over) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const resolve = baseResolver((c) => (c.table === 'products' ? { data: { ...PRODUCT_ROW, ...over } } : undefined));
      const { res, body, calls, granted } = await run(signedRequest(succeeded()), resolve);
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'product_misconfigured' });
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(granted).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'product_without_offer: slot_diplomski' });
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor product_without_offer');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

/**
 * Monetizacija V1 (M2): uplata nadogradnje Repair -> Final Pass (odjeljak 14). Kriteriji iz
 * odjeljka 29: "upgrade ne naplacuje ponovno vec placeni Repair iznos", "Final Pass ne moze se
 * primijeniti na drugi rad" (pretvara se ISTO pravo, ne stvara se drugo) i "refund zatvara
 * entitlement".
 */
describe('webhook-mor handler: nadogradnja Repair -> Final Pass', () => {
  const SOURCE_ID = '11111111-2222-4333-8444-555555555555';
  const PASS_ROW = {
    ...PRODUCT_ROW,
    id: 'pass_diplomski',
    kind: 'pass',
    slot_window_days: 180,
    purchase_window_days: 180,
    price_eur: 19.99,
    offer_code: 'final_pass_v1',
    offer_codes: { capabilities: ['full_report', 'repair', 'revision_history'] },
  };
  const SOURCE_ROW = {
    id: SOURCE_ID,
    user_id: 'user-1',
    work_type: 'diplomski',
    status: 'active',
    provider: 'stripe',
    slots_total: 1,
    slots_used: 1,
    offer_code: 'repair_v1',
    paid_amount_cents: 999,
    purchase_expires_at: new Date(NOW_MS + 30 * 86_400_000).toISOString(),
    upgrade_order_id: null,
    order_id: 'pi_repair',
  };

  function upgradeEvent(amount = 1000): Request {
    return signedRequest(
      succeeded(
        { id: 'pi_up', amount, amount_received: amount },
        { user_id: 'user-1', product_id: 'pass_diplomski', upgrade_from_entitlement_id: SOURCE_ID },
      ),
    );
  }

  /** `markerFrom`: od kojeg citanja oznake (0 = prvog) je povrat vec zabiljezen; null = nikad. */
  function upgradeResolve(over: { source?: unknown; rpc?: FakeResult; revert?: FakeResult; markerFrom?: number | null; slot?: FakeResult; partial?: FakeResult } = {}) {
    let citanja = 0;
    return baseResolver((c) => {
      if (c.table === 'products') return { data: PASS_ROW };
      // Zadano: vezani slot ima netaknut otisak (nije anonimiziran).
      if (c.table === 'document_slots') return over.slot ?? { data: [{ id: 'slot-1', fingerprint: { titleNorm: 'rad', authorNorm: 'autor', headings: ['uvod'], sectionCount: 1 } }] };
      if (c.table === 'entitlements' && writeOp(c) === 'select') return { data: 'source' in over ? over.source : SOURCE_ROW };
      if (c.table === 'rpc:apply_entitlement_upgrade') return over.rpc ?? { data: 'upgraded' };
      if (c.table === 'rpc:revert_entitlement_upgrade') return over.revert ?? { data: 'reverted' };
      // Oznaka djelomicnog povrata izvorne uplate (krug 4) je zasebno citanje, ne oznaka punog povrata.
      if (c.table === 'webhook_events' && writeOp(c) === 'select' && eqs(c).outcome_detail === 'partial_refund_noted') {
        return over.partial ?? { data: [] };
      }
      if (c.table === 'webhook_events' && writeOp(c) === 'select') {
        const povrat = over.markerFrom != null && citanja >= over.markerFrom;
        citanja += 1;
        return { data: povrat ? [{ id: 'inbox-refund' }] : [] };
      }
      return undefined;
    });
  }

  const rpcCalls = (calls: FakeCall[]) => calls.filter((c) => c.table === 'rpc:apply_entitlement_upgrade');
  const revertCalls = (calls: FakeCall[]) => calls.filter((c) => c.table === 'rpc:revert_entitlement_upgrade');

  it('placena razlika (10,00) pretvara ISTO pravo kroz apply_entitlement_upgrade, bez novog retka i bez bonusa', async () => {
    const { res, body, calls, granted } = await run(upgradeEvent(1000), upgradeResolve());
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'entitlement_upgraded' });
    expect(entitlementWrites(calls), 'nadogradnja ne umece drugo pravo').toHaveLength(0);
    const rpc = rpcCalls(calls);
    expect(rpc).toHaveLength(1);
    expect(rpc[0].ops[0].args[1]).toEqual({
      p_entitlement_id: SOURCE_ID,
      p_user_id: 'user-1',
      p_upgrade_order_id: 'pi_up',
      p_target_product_id: 'pass_diplomski',
      p_upgrade_paid_cents: 1000,
      p_purchase_expires_at: new Date(NOW_MS + 180 * 86_400_000).toISOString(),
      p_slot_expires_at: new Date(NOW_MS + 180 * 86_400_000).toISOString(),
    });
    expect(granted, 'nadogradnja ne izdaje nagradu preporucitelju').toHaveLength(0);
    expect(calls.some((c) => (c.table === 'bonus_outbox' || c.table === 'coupon_grants') && writeOp(c) !== 'select')).toBe(false);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'entitlement_upgraded' });
    // Oznaka povrata se cita PRIJE pretvorbe (povrat koji je stigao prvi) i PONOVNO nakon nje
    // (pisi pa citaj, istodobni povrat).
    const iRpc = calls.findIndex((c) => c.table === 'rpc:apply_entitlement_upgrade');
    const citanja = calls.map((c, i) => (c.table === 'webhook_events' && writeOp(c) === 'select' ? i : -1)).filter((i) => i >= 0);
    expect(iRpc).toBeGreaterThan(-1);
    expect(citanja.some((i) => i < iRpc)).toBe(true);
    expect(citanja.some((i) => i > iRpc)).toBe(true);
  });

  it('puna cijena Final Passa za nadogradnju je above_catalog trag, ne druga naplata istog prava', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(upgradeEvent(1999), upgradeResolve());
      expect(body).toEqual({ ok: true, action: 'entitlement_upgraded' });
      expect(String(settled(calls).at(-1)?.outcome_detail)).toContain('amount_mismatch ocekivano=1000 naplaceno=1999');
    } finally {
      err.mockRestore();
    }
  });

  it.each([
    ['uplata manja od razlike', 999, {}, 'amount_below_catalog'],
    ['pravo vec nadogradjeno drugom uplatom (jednom)', 1000, { source: { ...SOURCE_ROW, upgrade_order_id: 'pi_drugi' } }, 'upgrade_already_applied'],
    ['tudje pravo', 1000, { source: { ...SOURCE_ROW, user_id: 'user-2' } }, 'upgrade_source_not_found'],
    ['pravo ne postoji', 1000, { source: null }, 'upgrade_source_not_found'],
    ['pravo vraceno u medjuvremenu', 1000, { source: { ...SOURCE_ROW, status: 'refunded' } }, 'upgrade_source_inactive'],
    // Krug 4: cron je anonimizirao otisak izmedju checkouta i uplate (istek prozora nije granica).
    ['vezani slot anonimiziran', 1000, { slot: { data: [{ id: 'slot-1', fingerprint: { sectionCount: 1 } }] } }, 'upgrade_slot_anonymized'],
    // Krug 4 (6b): djelomican povrat izvorne uplate zabiljezen izmedju checkouta i uplate; odluka
    // se ponavlja nad STVARNOM oznakom, ne nad nepoznatim partiallyRefunded.
    ['izvorna uplata djelomicno vracena u medjuvremenu', 1000, { partial: { data: [{ id: 'inbox-partial' }] } }, 'upgrade_source_partially_refunded'],
  ])('%s: needs_manual_review, bez pretvorbe', async (_ime, amount, over, reason) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, body, calls } = await run(upgradeEvent(amount), upgradeResolve(over));
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason });
      expect(rpcCalls(calls)).toHaveLength(0);
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'needs_manual_review' });
      expect(String(settled(calls).at(-1)?.outcome_detail)).toContain(`upgrade:${reason}`);
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor upgrade_needs_manual_review');
    } finally {
      err.mockRestore();
    }
  });

  it('apply_entitlement_upgrade vrati slot_anonymized (purge u medjuvremenu): rucni pregled s ishodom u detalju', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(upgradeEvent(1000), upgradeResolve({ rpc: { data: 'slot_anonymized' } }));
      expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'upgrade_source_unavailable' });
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'needs_manual_review' });
      expect(String(settled(calls).at(-1)?.outcome_detail)).toContain('ishod=slot_anonymized');
    } finally {
      err.mockRestore();
    }
  });

  it('krug 4 (6b): oznaka djelomicnog povrata se cita po PaymentIntentu IZVORNE uplate, prije pretvorbe', async () => {
    const { body, calls } = await run(upgradeEvent(1000), upgradeResolve());
    expect(body).toEqual({ ok: true, action: 'entitlement_upgraded' });
    const i = calls.findIndex((c) => c.table === 'webhook_events' && writeOp(c) === 'select' && eqs(c).outcome_detail === 'partial_refund_noted');
    expect(i).toBeGreaterThan(-1);
    expect(eqs(calls[i])).toEqual({ provider: 'stripe', order_id: 'pi_repair', outcome_detail: 'partial_refund_noted' });
    expect(i).toBeLessThan(calls.findIndex((c) => c.table === 'rpc:apply_entitlement_upgrade'));
  });

  it('krug 4 (6b): pad citanja oznake djelomicnog povrata je 500 (Stripe ponovi), bez pretvorbe', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, body, calls } = await run(upgradeEvent(1000), upgradeResolve({ partial: { error: { message: 'tajni_detalj_baze' } } }));
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'internal' });
      expect(rpcCalls(calls)).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed' });
    } finally {
      err.mockRestore();
    }
  });

  it('pad citanja vezanog slota je 500 (Stripe ponovi), bez pretvorbe', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, body, calls } = await run(upgradeEvent(1000), upgradeResolve({ slot: { error: { message: 'tajni_detalj_baze' } } }));
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'internal' });
      expect(rpcCalls(calls)).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed' });
    } finally {
      err.mockRestore();
    }
  });

  it('apply_entitlement_upgrade vrati unavailable (utrka s drugom uplatom): rucni pregled', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(upgradeEvent(1000), upgradeResolve({ rpc: { data: 'unavailable' } }));
      expect(body).toEqual({ ok: true, action: 'needs_manual_review', reason: 'upgrade_source_unavailable' });
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'needs_manual_review' });
    } finally {
      err.mockRestore();
    }
  });

  it('ponovljena dostava iste uplate (pravo vec nosi ovaj PaymentIntent): duplicate_ignored bez upisa', async () => {
    const { body, calls } = await run(upgradeEvent(1000), upgradeResolve({ source: { ...SOURCE_ROW, upgrade_order_id: 'pi_up', offer_code: 'final_pass_v1' } }));
    expect(body).toEqual({ ok: true, action: 'duplicate_ignored' });
    expect(rpcCalls(calls)).toHaveLength(0);
    expect(entitlementWrites(calls)).toHaveLength(0);
    expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'upgrade_duplicate' });
  });

  it('pad RPC-a je 500 (Stripe ponovi), bez teksta greske u odgovoru', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, body } = await run(upgradeEvent(1000), upgradeResolve({ rpc: { error: { message: 'tajni_detalj_baze' } } }));
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'insert_failed' });
    } finally {
      err.mockRestore();
    }
  });

  it('povrat ove uplate zabiljezen PRIJE nje: pravo se ne pretvara, placeni Repair ostaje netaknut', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(upgradeEvent(1000), upgradeResolve({ markerFrom: 0 }));
      expect(body).toEqual({ ok: true, action: 'refunded_before_payment' });
      expect(rpcCalls(calls)).toHaveLength(0);
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded_before_payment' });
    } finally {
      err.mockRestore();
    }
  });

  it('povrat stigao ISTODOBNO (izmedju prvog citanja i pretvorbe): pretvorba se vraca na Repair, pravo se NE gasi', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(upgradeEvent(1000), upgradeResolve({ markerFrom: 1 }));
      expect(body).toEqual({ ok: true, action: 'refunded_before_payment' });
      expect(rpcCalls(calls)).toHaveLength(1);
      const vracanje = revertCalls(calls);
      expect(vracanje).toHaveLength(1);
      expect(vracanje[0].ops[0].args[1]).toEqual({ p_upgrade_order_id: 'pi_up' });
      // Krug 4 (nalaz pregleda): placeni Repair ostaje, nema gasenja prava u refunded.
      expect(entitlementWrites(calls)).toHaveLength(0);
      const zadnji = settled(calls).at(-1)!;
      expect(zadnji).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded_before_payment' });
      expect(String(zadnji.outcome_note)).toBe(`upgrade_reverted: pravo=${SOURCE_ID} izvorna_uplata=pi_repair naplaceno_repair=999 ishod=reverted`);
    } finally {
      warn.mockRestore();
    }
  });

  it('povrat ISTODOBNO, a stanje prije pretvorbe nije zapamceno (no_snapshot): pravo se gasi i ide na trajan rucni pregled', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(upgradeEvent(1000), upgradeResolve({ markerFrom: 1, revert: { data: 'no_snapshot' } }));
      expect(body).toEqual({ ok: true, action: 'refunded_before_payment', review: 'upgrade_refunded' });
      const writes = entitlementWrites(calls);
      expect(writes).toHaveLength(1);
      expect(argOf(writes[0], 'update')).toEqual({ status: 'refunded' });
      expect(eqs(writes[0])).toEqual({ id: SOURCE_ID, upgrade_order_id: 'pi_up' });
      const zadnji = settled(calls).at(-1)!;
      expect(zadnji).toMatchObject({ outcome: 'needs_manual_review', outcome_detail: 'refunded_before_payment' });
      expect(String(zadnji.outcome_note)).toBe(`upgrade_refunded: pravo=${SOURCE_ID} izvorna_uplata=pi_repair naplaceno_repair=999 ishod=no_snapshot`);
    } finally {
      err.mockRestore();
    }
  });

  it('pad vracanja nadogradnje nakon istodobnog povrata je 500 (Stripe ponovi), bez gasenja prava', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, body, calls } = await run(upgradeEvent(1000), upgradeResolve({ markerFrom: 1, revert: { error: { message: 'tajni_detalj_baze' } } }));
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'refund_failed' });
      expect(entitlementWrites(calls)).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed' });
    } finally {
      err.mockRestore();
    }
  });

  /** Povrat uplate nadogradnje: po order_id nema retka (nadogradnja ne stvara svoj), po upgrade_order_id ima. */
  function upgradeRefundResolve(revert: FakeResult) {
    return baseResolver((c) => {
      if (c.table === 'entitlements' && writeOp(c) === 'select') {
        return eqs(c).upgrade_order_id === 'pi_up' ? { data: [{ id: SOURCE_ID, order_id: 'pi_repair', paid_amount_cents: 999 }] } : { data: [] };
      }
      if (c.table === 'rpc:revert_entitlement_upgrade') return revert;
      if (c.table === 'entitlements' && writeOp(c) === 'update') return { data: [{ id: SOURCE_ID }] };
      return undefined;
    });
  }

  it('krug 4: puni povrat uplate nadogradnje VRACA pravo na Repair (ne gasi ga): Final Pass nestaje, placeni Repair ostaje', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { res, body, calls } = await run(signedRequest(refunded(999, 'pi_up')), upgradeRefundResolve({ data: 'reverted' }));
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true, action: 'refunded', upgrade: 'reverted' });
      const vracanje = revertCalls(calls);
      expect(vracanje).toHaveLength(1);
      expect(vracanje[0].ops[0].args[1]).toEqual({ p_upgrade_order_id: 'pi_up' });
      // Nijedan upis statusa prava: Repair uplata je i dalje naplacena (odjeljak 14).
      expect(entitlementWrites(calls).filter((c) => writeOp(c) === 'update')).toHaveLength(0);
      expect(warn.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor upgrade_reverted');
      // Nista ne ceka operatera, ali trag ostaje; oznaka punog povrata ostaje doslovna.
      const zadnji = settled(calls).at(-1)!;
      expect(zadnji).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded' });
      expect(String(zadnji.outcome_note)).toBe(`upgrade_reverted: pravo=${SOURCE_ID} izvorna_uplata=pi_repair naplaceno_repair=999 ishod=reverted`);
      expect(REFUND_DETAILS).toContain(zadnji.outcome_detail);
    } finally {
      warn.mockRestore();
    }
  });

  it('krug 4: ponovljena dostava povrata nadogradnje (revert vrati duplicate) je isti ishod, bez gasenja', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(signedRequest(refunded(999, 'pi_up')), upgradeRefundResolve({ data: 'duplicate' }));
      expect(body).toEqual({ ok: true, action: 'refunded', upgrade: 'reverted' });
      expect(entitlementWrites(calls).filter((c) => writeOp(c) === 'update')).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded' });
    } finally {
      warn.mockRestore();
    }
  });

  it('krug 4: pad vracanja nadogradnje u grani povrata je 500 uz ocuvanu oznaku, bez gasenja prava', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, calls } = await run(signedRequest(refunded(999, 'pi_up')), upgradeRefundResolve({ error: { message: 'tajni_detalj_baze' } }));
      expect(res.status).toBe(500);
      expect(entitlementWrites(calls).filter((c) => writeOp(c) === 'update')).toHaveLength(0);
      expect(settled(calls).at(-1)).toMatchObject({ outcome: 'failed', outcome_detail: 'refund_pending' });
    } finally {
      err.mockRestore();
    }
  });

  it('krug 4: povrat izvorne Repair uplate prava cija je nadogradnja vec vracena: obican povrat, bez rucnog pregleda', async () => {
    const resolve = baseResolver((c) => {
      if (c.table === 'entitlements' && writeOp(c) === 'select' && eqs(c).order_id === 'pi_repair') {
        return { data: [{ id: SOURCE_ID, product_id: 'slot_diplomski', upgrade_order_id: 'pi_up', upgrade_paid_cents: 1000, upgrade_reverted_at: '2026-09-20T00:00:00.000Z' }] };
      }
      if (c.table === 'entitlements' && writeOp(c) === 'update') return { data: [{ id: SOURCE_ID }] };
      return undefined;
    });
    const { body, calls } = await run(signedRequest(refunded(999, 'pi_repair')), resolve);
    expect(body).toEqual({ ok: true, action: 'refunded' });
    const zadnji = settled(calls).at(-1)!;
    expect(zadnji).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded' });
    expect(zadnji.outcome_note).toBeUndefined();
  });

  it('povrat uplate nadogradnje bez zapamcenog stanja (no_snapshot): pravo se gasi cijelo i ide na trajan rucni pregled', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { body, calls } = await run(signedRequest(refunded(999, 'pi_up')), upgradeRefundResolve({ data: 'no_snapshot' }));
      expect(body).toEqual({ ok: true, action: 'refunded', review: 'upgrade_refunded' });
      const update = entitlementWrites(calls).find((c) => writeOp(c) === 'update')!;
      expect(argOf(update, 'update')).toEqual({ status: 'refunded' });
      expect(eqs(update)).toEqual({ upgrade_order_id: 'pi_up' });
      expect(update.ops.find((o) => o.op === 'in')?.args).toEqual(['id', [SOURCE_ID]]);
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor upgrade_refunded');
      // Trajan trag (nalaz pregleda kruga 3): placeni Repair dio ostaje bez prava, pa rucni pregled
      // u inboxu, a oznaka punog povrata ostaje `refunded` (REFUND_MARKERS).
      const zadnji = settled(calls).at(-1)!;
      expect(zadnji).toMatchObject({ outcome: 'needs_manual_review', outcome_detail: 'refunded' });
      expect(String(zadnji.outcome_note)).toBe(`upgrade_refunded: pravo=${SOURCE_ID} izvorna_uplata=pi_repair naplaceno_repair=999`);
    } finally {
      err.mockRestore();
    }
  });

  it('puni povrat IZVORNE Repair uplate vec nadogradjenog prava: pravo se gasi, uplata nadogradnje ide na trajan rucni pregled', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const resolve = baseResolver((c) => {
        if (c.table === 'entitlements' && writeOp(c) === 'select' && eqs(c).order_id === 'pi_repair') {
          return { data: [{ id: SOURCE_ID, product_id: 'pass_diplomski', upgrade_order_id: 'pi_up', upgrade_paid_cents: 1000 }] };
        }
        if (c.table === 'entitlements' && writeOp(c) === 'update') return { data: [{ id: SOURCE_ID }] };
        return undefined;
      });
      const { res, body, calls } = await run(signedRequest(refunded(999, 'pi_repair')), resolve);
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true, action: 'refunded', review: 'refund_of_upgraded_entitlement' });
      const update = entitlementWrites(calls).find((c) => writeOp(c) === 'update' && eqs(c).order_id === 'pi_repair')!;
      expect(argOf(update, 'update')).toEqual({ status: 'refunded' });
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor refund_of_upgraded_entitlement');
      const zadnji = settled(calls).at(-1)!;
      expect(zadnji).toMatchObject({ outcome: 'needs_manual_review', outcome_detail: 'refunded' });
      expect(String(zadnji.outcome_note)).toBe(`refund_of_upgraded_entitlement: pravo=${SOURCE_ID} nadogradnja=pi_up naplaceno_nadogradnje=1000`);
      // Oznaka punog povrata ostaje doslovna, pa je uplata i radnik bonusa i dalje vide.
      expect(REFUND_DETAILS).toContain(zadnji.outcome_detail);
    } finally {
      err.mockRestore();
    }
  });

  it('BASELINE: puni povrat nenadogradjenog prava ostaje processed/refunded, bez rucnog pregleda', async () => {
    const resolve = baseResolver((c) => {
      if (c.table === 'entitlements' && writeOp(c) === 'select') {
        return { data: [{ id: SOURCE_ID, product_id: 'slot_diplomski', upgrade_order_id: null, upgrade_paid_cents: null }] };
      }
      if (c.table === 'entitlements' && writeOp(c) === 'update') return { data: [{ id: SOURCE_ID }] };
      return undefined;
    });
    const { body, calls } = await run(signedRequest(refunded(999, 'pi_repair')), resolve);
    expect(body).toEqual({ ok: true, action: 'refunded' });
    const zadnji = settled(calls).at(-1)!;
    expect(zadnji).toMatchObject({ outcome: 'processed', outcome_detail: 'refunded' });
    expect(zadnji.outcome_note).toBeUndefined();
  });
});

/**
 * F21 (docs/agents/orchestrator-backlog.md): stavka 1, puni povrat otkazuje obvezu iz bonus_outbox
 * koja jos ceka (druga strana je process-bonus-outbox, tests/process-bonus-outbox.test.ts), i
 * stavka 2, korak i greska sporednog pada idu u inbox (`outcome_note`), a ne samo u log.
 */
describe('webhook-mor handler: F21, bonus_outbox i dijagnostika povrata', () => {
  function outboxWorld(pending: boolean) {
    const w = refundWorld({ entitlement: true, manualOrder: false, coupon: false });
    const state = { status: pending ? 'pending' : 'done' };
    const resolve = (c: FakeCall): FakeResult | undefined => {
      if (c.table === 'bonus_outbox' && writeOp(c) === 'select') {
        return { data: state.status === 'pending' ? [{ id: 'ob-1' }] : [] };
      }
      if (c.table === 'bonus_outbox' && writeOp(c) === 'update') {
        state.status = String((argOf(c, 'update') as Record<string, unknown>).status);
        return { data: null };
      }
      return w.resolve(c);
    };
    return { state, resolve };
  }

  it('puni povrat otkazuje obvezu koja jos ceka (cancelled), samo pending, i drugi prolaz je no-op', async () => {
    const w = outboxWorld(true);
    const prvi = await run(signedRequest(refunded(999)), w.resolve);
    expect(prvi.body).toEqual({ ok: true, action: 'refunded' });
    const obveze = writesTo(prvi.calls, 'bonus_outbox');
    expect(obveze).toHaveLength(1);
    expect(argOf(obveze[0], 'update')).toEqual({ status: 'cancelled', last_error: 'refunded' });
    expect(eqs(obveze[0])).toEqual({ order_id: 'pi_1', status: 'pending' });
    expect(obveze[0].ops.find((o) => o.op === 'in')?.args).toEqual(['id', ['ob-1']]);
    expect(w.state.status).toBe('cancelled');
    // Otkazivanje ide TEK nakon gasenja prava (opoziv prava ne ovisi o sporednim tablicama).
    const ugasi = prvi.calls.findIndex((c) => c.table === 'entitlements' && writeOp(c) === 'update');
    const outbox = prvi.calls.findIndex((c) => c.table === 'bonus_outbox');
    expect(outbox).toBeGreaterThan(ugasi);

    const drugi = await run(signedRequest(refunded(999)), w.resolve);
    expect(drugi.body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(drugi.calls, 'bonus_outbox')).toHaveLength(0);
  });

  it('vec izvrsena obveza (done) se ne dira', async () => {
    const w = outboxWorld(false);
    const { body, calls } = await run(signedRequest(refunded(999)), w.resolve);
    expect(body).toEqual({ ok: true, action: 'refunded' });
    expect(writesTo(calls, 'bonus_outbox')).toHaveLength(0);
    expect(w.state.status).toBe('done');
  });

  it.each([
    ['bonus_outbox', 'select', 'bonus_outbox_lookup'],
    ['bonus_outbox', 'update', 'bonus_outbox_update'],
    ['coupon_grants', 'select', 'coupon_grants_lookup'],
  ])('pad %s/%s: 500, oznaka ostaje refund_consequences_failed, a korak i greska su u outcome_note', async (table, op, step) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const w = outboxWorld(true);
      const boom = (c: FakeCall): FakeResult | undefined =>
        c.table === table && writeOp(c) === op ? { error: { message: 'tajni_detalj_baze' } } : w.resolve(c);
      const { res, body, calls } = await run(signedRequest(refunded(999)), boom);
      expect(res.status).toBe(500);
      expect(body).toEqual({ error: 'refund_failed' });
      expect(JSON.stringify(body)).not.toContain('tajni_detalj_baze');
      expect(settled(calls).at(-1)).toMatchObject({
        outcome: 'failed',
        outcome_detail: 'refund_consequences_failed',
        outcome_note: `${step}: tajni_detalj_baze`,
      });
    } finally {
      err.mockRestore();
    }
  });

  it('uspjesan povrat ne pise outcome_note (stupac se dira samo uz dijagnostiku)', async () => {
    const w = outboxWorld(true);
    const { calls } = await run(signedRequest(refunded(999)), w.resolve);
    for (const s of settled(calls)) expect(s).not.toHaveProperty('outcome_note');
  });
});

/**
 * Codex pregled PR #217, M2: inline nagrada preporucitelju cita ishod. Prolazan pad ne oznacava
 * obvezu `done` (ostaje `pending` za radnika), trajna odluka je zatvara `done` uz razlog.
 */
describe('webhook-mor handler: ishod nagrade preporucitelju (M2)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function uplataSNagradom(rezultat: unknown) {
    const db = fakeAdmin(baseResolver());
    const handler = createWebhookHandler({
      admin: () => db.admin,
      webhookSecret: SECRET,
      allowTestMode: false,
      now: () => NOW_MS,
      grantReferrerReward: (async () => rezultat) as never,
    });
    const res = await handler(signedRequest(succeeded()));
    const nagradaDone = db.calls.filter((c) => c.table === 'bonus_outbox' && writeOp(c) === 'update' && eqs(c).kind === 'referrer_reward');
    return { res, calls: db.calls, nagradaDone };
  }

  it.each(['grant_failed', 'error'])('%s: obveza referrer_reward NE prelazi u done (radnik je ponovi)', async (reason) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, nagradaDone } = await uplataSNagradom({ granted: false, reason });
    expect(res.status).toBe(200);
    expect(nagradaDone).toHaveLength(0);
    expect(err.mock.calls.find((c) => c[0] === 'webhook-mor referrer_reward_retry')?.[1]).toEqual({ orderId: 'pi_1', reason });
  });

  it('trajna odluka (ip_match_fraud): done uz razlog, samo dok obveza ceka', async () => {
    const { res, nagradaDone } = await uplataSNagradom({ granted: false, reason: 'ip_match_fraud' });
    expect(res.status).toBe(200);
    expect(nagradaDone).toHaveLength(1);
    expect(argOf(nagradaDone[0], 'update')).toMatchObject({ status: 'done', last_error: null, done_reason: 'ip_match_fraud' });
    expect(eqs(nagradaDone[0])).toEqual({ order_id: 'pi_1', kind: 'referrer_reward', status: 'pending' });
  });

  it('negativna kontrola: dodijeljena nagrada je done bez razloga', async () => {
    const { nagradaDone } = await uplataSNagradom({ granted: true });
    expect(nagradaDone).toHaveLength(1);
    const upd = argOf(nagradaDone[0], 'update') as Record<string, unknown>;
    expect(upd.status).toBe('done');
    expect('done_reason' in upd).toBe(false);
  });
});
