/**
 * supabase/functions/create-checkout/handler.ts: IZVRSEN put handlera (F18 krug 2).
 *
 * Kriterij (1) "create-checkout vraca clientSecret iz Stripe PaymentIntenta s iznosom iz
 * products.price_eur, nema 409 product_not_mapped" se dotad mjerio samo na
 * buildStripePaymentIntentParams. Vracen `intent.id` umjesto `intent.client_secret`, iznos iz
 * klijentskog tijela ili vracen uvjet na mor_product_id prosli bi sve ostale provjere. Ovdje se
 * handler vrti nad laznom bazom i laznim Stripeom i tvrdi se sto je stvarno poslano i vraceno.
 */
import { describe, it, expect, vi } from 'vitest';

import { createCheckoutHandler } from '../supabase/functions/create-checkout/handler';
import { CHECKOUT_CONSENT_TEXTS } from '../src/legal/consent-text';
import { fakeAdmin, argOf, eqs, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';

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

/**
 * TEKST GRESKE BAZE NIKAD U ODGOVORU (odluka vlasnika 2026-09-27). create-checkout je vec bio cist;
 * ovo zakljucava to stanje: svaka 5xx grana koja dolazi od baze ili iznimke izaziva se s
 * prepoznatljivom porukom, a odgovor nosi samo genericki kod. Detalj ostaje u logu.
 */
describe('create-checkout handler: 5xx odgovori ne nose tekst greske baze', () => {
  const TAJNA = 'relation checkout_consents violates tajni_detalj_baze';

  it('pad upisa privole: 500 consent_not_recorded, detalj samo u logu', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, out, stripeCalls } = await run(
        { productId: 'slot_diplomski', consent: CONSENT },
        {
          resolve: (c) =>
            c.table === 'checkout_consents' && writeOp(c) === 'insert' ? { error: { message: TAJNA } } : undefined,
        },
      );
      expect(res.status).toBe(500);
      expect(out).toEqual({ error: 'consent_not_recorded' });
      expect(JSON.stringify(out)).not.toContain('tajni_detalj_baze');
      expect(stripeCalls).toHaveLength(0);
      expect(err.mock.calls.some((c) => JSON.stringify(c[1] ?? '').includes('tajni_detalj_baze'))).toBe(true);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('iznimka baze usred obrade: 500 internal, bez poruke iznimke', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, out } = await run(
        { productId: 'slot_diplomski', consent: CONSENT },
        {
          resolve: (c) => {
            if (c.table === 'products') throw new Error(TAJNA);
            return undefined;
          },
        },
      );
      expect(res.status).toBe(500);
      expect(out).toEqual({ error: 'internal' });
    } finally {
      vi.restoreAllMocks();
    }
  });
});

/**
 * Monetizacija V1 (M2): nadogradnja Repair -> Final Pass i katalog V1 na izvrsenom handleru.
 * Kriteriji iz docs/decisions/MONETIZACIJA_V1.md odjeljka 29: "upgrade ne naplacuje ponovno vec
 * placeni Repair iznos", "Stripe iznos dolazi samo iz serverskog products.price_eur" i
 * "deaktivirani *_do_obrane proizvodi vise se ne nude".
 */
describe('create-checkout handler: nadogradnja Repair -> Final Pass', () => {
  const SOURCE_ID = '11111111-2222-4333-8444-555555555555';
  const PASS_ROW = {
    id: 'pass_diplomski',
    kind: 'pass',
    audience: 'retail',
    work_type: 'diplomski',
    slots_total: 1,
    slot_window_days: 180,
    purchase_window_days: 180,
    price_eur: 19.99,
    offer_code: 'final_pass_v1',
    manual_fulfillment: false,
    active: true,
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

  function upgradeResolve(over: { source?: unknown; product?: unknown; partial?: unknown[]; slot?: FakeResult } = {}) {
    return (c: FakeCall): FakeResult | undefined => {
      if (c.table === 'products') return { data: 'product' in over ? over.product : PASS_ROW };
      if (c.table === 'entitlements') return { data: 'source' in over ? over.source : SOURCE_ROW };
      if (c.table === 'webhook_events') return { data: over.partial ?? [] };
      // Zadano: vezani slot je jos ziv (unutar prozora).
      if (c.table === 'document_slots') return over.slot ?? { data: [{ id: 'slot-1' }] };
      return undefined;
    };
  }

  it('naplacuje razliku (19,99 - placenih 9,99 = 10,00), a iznos iz tijela zahtjeva ignorira', async () => {
    const { res, out, stripeCalls, calls } = await run(
      { productId: 'pass_diplomski', upgradeFromEntitlementId: SOURCE_ID, consent: CONSENT, amount: 1, alreadyPaidCents: 1999, priceEur: 0.01, referralCode: 'PART-1' },
      { resolve: upgradeResolve(), stripe: { status: 200, json: { id: 'pi_up', client_secret: FAKE_CLIENT_SECRET, amount: 1000, currency: 'eur' } } },
    );
    expect(res.status, JSON.stringify(out)).toBe(200);
    expect(stripeCalls).toHaveLength(1);
    const body = stripeCalls[0].body;
    expect(body.get('amount')).toBe('1000');
    expect(body.get('metadata[product_id]')).toBe('pass_diplomski');
    expect(body.get('metadata[upgrade_from_entitlement_id]')).toBe(SOURCE_ID);
    expect(body.get('metadata[referral_code]'), 'referral vrijedi za prvu kupnju, ne nadogradnju').toBeNull();
    // Kljuc bez vremena privole: drugi klik na istu nadogradnju daje isti PaymentIntent.
    expect(stripeCalls[0].headers['Idempotency-Key']).toBe(`lekta:pi:upgrade:user-1:${SOURCE_ID}:pass_diplomski`);
    // Pravo se trazi SAMO medju pravima prijavljenog korisnika.
    const lookup = calls.find((c) => c.table === 'entitlements')!;
    expect(eqs(lookup)).toEqual({ id: SOURCE_ID, user_id: 'user-1' });
    // Provjera djelomicnog povrata ide po PaymentIntentu izvorne uplate.
    const partial = calls.find((c) => c.table === 'webhook_events')!;
    expect(eqs(partial)).toEqual({ provider: 'stripe', order_id: 'pi_repair', outcome_detail: 'partial_refund_noted' });
    // Vezani rad se provjerava po ISTOM pravu i po isteku slota u trenutku zahtjeva.
    const slot = calls.find((c) => c.table === 'document_slots')!;
    expect(eqs(slot)).toEqual({ entitlement_id: SOURCE_ID });
    expect(slot.ops.find((o) => o.op === 'gt')?.args).toEqual(['slot_expires_at', new Date(NOW_MS).toISOString()]);
  });

  it('nevezan Repair (slots_used 0, bez slota) se smije nadograditi: slot nastaje tek pri upotrebi, s prozorom Final Passa', async () => {
    // Citanje slota bi palo; nevezanom pravu ono ne treba, pa se ni ne radi (Codex pregled kruga 3).
    const { res, stripeCalls, calls } = await run(
      { productId: 'pass_diplomski', upgradeFromEntitlementId: SOURCE_ID, consent: CONSENT },
      { resolve: upgradeResolve({ source: { ...SOURCE_ROW, slots_used: 0 }, slot: { error: { message: 'ne bi smjelo biti citano' } } }), stripe: { status: 200, json: { id: 'pi_up', client_secret: FAKE_CLIENT_SECRET, amount: 1000, currency: 'eur' } } },
    );
    expect(res.status).toBe(200);
    expect(stripeCalls[0].body.get('amount')).toBe('1000');
    expect(calls.some((c) => c.table === 'document_slots')).toBe(false);
  });

  it('pad citanja vezanog slota je 500 bez teksta greske i bez PaymentIntenta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, out, stripeCalls } = await run(
        { productId: 'pass_diplomski', upgradeFromEntitlementId: SOURCE_ID, consent: CONSENT },
        { resolve: upgradeResolve({ slot: { error: { message: 'tajni_detalj_baze' } } }) },
      );
      expect(res.status).toBe(500);
      expect(out).toEqual({ error: 'internal' });
      expect(stripeCalls).toHaveLength(0);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('specijalisticki: 29,99 - 16,99 = 13,00', async () => {
    const { res, stripeCalls } = await run(
      { productId: 'pass_specijalisticki', upgradeFromEntitlementId: SOURCE_ID, consent: CONSENT },
      {
        resolve: upgradeResolve({
          product: { ...PASS_ROW, id: 'pass_specijalisticki', work_type: 'specijalisticki', price_eur: 29.99 },
          source: { ...SOURCE_ROW, work_type: 'specijalisticki', paid_amount_cents: 1699 },
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(stripeCalls[0].body.get('amount')).toBe('1300');
  });

  it.each([
    ['tudje ili nepostojece pravo', { source: null }, 404, 'upgrade_source_not_found'],
    ['vec nadogradjeno pravo (jednom)', { source: { ...SOURCE_ROW, upgrade_order_id: 'pi_prije' } }, 409, 'upgrade_already_applied'],
    ['istekao rok prava', { source: { ...SOURCE_ROW, purchase_expires_at: new Date(NOW_MS - 1000).toISOString() } }, 409, 'upgrade_source_expired'],
    ['druga vrsta rada', { source: { ...SOURCE_ROW, work_type: 'zavrsni' } }, 409, 'upgrade_work_type_mismatch'],
    ['staro pravo bez placenog iznosa', { source: { ...SOURCE_ROW, paid_amount_cents: null } }, 409, 'upgrade_paid_amount_unknown'],
    ['djelomicno vracena izvorna uplata', { partial: [{ id: 'evt' }] }, 409, 'upgrade_source_partially_refunded'],
    // Nalaz pregleda kruga 3: istekao slot cron 30 dana kasnije anonimizira, pa bi Final Pass bio neupotrebljiv.
    ['vezani slot istekao ili anonimiziran', { slot: { data: [] } }, 409, 'upgrade_slot_expired'],
    [
      'cilj je Semester Pass',
      { product: { ...PASS_ROW, id: 'pass_semestralni', work_type: 'seminarski', offer_code: 'semester_pass_v1' }, source: { ...SOURCE_ROW, work_type: 'seminarski' } },
      409,
      'upgrade_target_invalid',
    ],
  ])('%s: odbijeno bez PaymentIntenta i bez privole', async (_ime, over, status, error) => {
    const { res, out, stripeCalls, calls } = await run(
      { productId: 'pass_diplomski', upgradeFromEntitlementId: SOURCE_ID, consent: CONSENT },
      { resolve: upgradeResolve(over) },
    );
    expect(res.status).toBe(status);
    expect(out).toEqual({ error });
    expect(stripeCalls).toHaveLength(0);
    expect(calls.some((c) => c.table === 'checkout_consents' && writeOp(c) === 'insert')).toBe(false);
  });

  it('id prava koji nije uuid je 400 prije ikakvog upita prava', async () => {
    const { res, calls, stripeCalls } = await run(
      { productId: 'pass_diplomski', upgradeFromEntitlementId: 'ent-1 or 1=1', consent: CONSENT },
      { resolve: upgradeResolve() },
    );
    expect(res.status).toBe(400);
    expect(calls.some((c) => c.table === 'entitlements')).toBe(false);
    expect(stripeCalls).toHaveLength(0);
  });

  it('pad citanja prava je 500 bez teksta greske', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, out, stripeCalls } = await run(
        { productId: 'pass_diplomski', upgradeFromEntitlementId: SOURCE_ID, consent: CONSENT },
        { resolve: (c) => (c.table === 'entitlements' ? { error: { message: 'tajni_detalj_baze' } } : upgradeResolve()(c)) },
      );
      expect(res.status).toBe(500);
      expect(out).toEqual({ error: 'internal' });
      expect(stripeCalls).toHaveLength(0);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('create-checkout handler: katalog V1', () => {
  it('specijalisticka naslovnica ne kupuje diplomski slot (odjeljak 18): 409 s prijedlogom specijalisticki, bez PaymentIntenta', async () => {
    const { res, out, stripeCalls, calls } = await run({
      productId: 'slot_diplomski',
      consent: CONSENT,
      signals: { words: 25_000, titleMarker: 'specialist' },
    });
    expect(res.status).toBe(409);
    expect(out).toEqual({ error: 'tier_mismatch', suggestedWorkType: 'specijalisticki' });
    expect(stripeCalls).toHaveLength(0);
    expect(calls.some((c) => c.table === 'checkout_consents' && writeOp(c) === 'insert')).toBe(false);
  });

  it('svjesna potvrda nize vrste (confirmedMismatch) i dalje prolazi, kao za ostale vrste', async () => {
    const { res, stripeCalls } = await run({
      productId: 'slot_diplomski',
      consent: CONSENT,
      signals: { words: 25_000, titleMarker: 'specialist' },
      confirmedMismatch: true,
    });
    expect(res.status).toBe(200);
    expect(stripeCalls[0].body.get('amount')).toBe('999');
  });

  it('specijalisticki Repair prolazi checkout s iznosom iz products.price_eur (16,99)', async () => {
    const SPEC = {
      id: 'slot_specijalisticki', kind: 'slot', audience: 'retail', work_type: 'specijalisticki', slots_total: 1,
      slot_window_days: 21, purchase_window_days: 90, price_eur: 16.99, offer_code: 'repair_v1', manual_fulfillment: false, active: true,
    };
    const { res, stripeCalls } = await run(
      { productId: 'slot_specijalisticki', consent: CONSENT, amount: 1 },
      { resolve: (c) => (c.table === 'products' ? { data: SPEC } : undefined) },
    );
    expect(res.status).toBe(200);
    expect(stripeCalls[0].body.get('amount')).toBe('1699');
    expect(stripeCalls[0].body.get('metadata[upgrade_from_entitlement_id]'), 'obicna kupnja nije nadogradnja').toBeNull();
  });

  it('deaktivirani do_obrane SKU: upit trazi active=true, a neaktivan redak je 404 bez PaymentIntenta', async () => {
    const DO_OBRANE = { ...PRODUCT_ROW, id: 'slot_zavrsni_do_obrane', work_type: 'zavrsni', price_eur: 9.99, active: false };
    const { res, out, stripeCalls, calls } = await run(
      { productId: 'slot_zavrsni_do_obrane', consent: CONSENT },
      { resolve: (c) => (c.table === 'products' ? { data: DO_OBRANE } : undefined) },
    );
    const upit = calls.find((c) => c.table === 'products')!;
    expect(eqs(upit)).toEqual({ id: 'slot_zavrsni_do_obrane', active: true });
    expect(res.status).toBe(404);
    expect(out).toEqual({ error: 'unknown_product' });
    expect(stripeCalls).toHaveLength(0);
  });
});
