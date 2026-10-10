// @vitest-environment node
/**
 * ISTI RACUN U OBJE FUNKCIJE NAPLATE: create-checkout i webhook-mor se ne smiju razici oko toga
 * na cijem je Stripe racunu kupnja.
 *
 * PORIJEKLO: drugi dio masterove zastite 4addb5db. Na masteru su checkout i webhook citali istu
 * tajnu trgovine, jer su se prije toga razilazili: checkout je otvarao narudzbu u jednoj trgovini,
 * webhook ocekivao drugu, a svaka kupnja je zavrsila kao 200 bez retryja i bez prava pristupa.
 *
 * STRIPE OBLIK KVARA (nalaz pregleda kruga 3 spajanja, 2026-09-27): webhook-mor je citao
 * `STRIPE_ACCOUNT_ID` i uz postavljenu vrijednost odbijao svaki dogadjaj bez istog polja
 * `account`, a create-checkout tu tajnu nije citao i PaymentIntent stvarao bez `Stripe-Account`,
 * dakle na vlastitom racunu. Stripe polje `account` salje SAMO za dogadjaj povezanog (Connect)
 * racuna, pa bi operater koji slijedi runbook ("opcionalno STRIPE_ACCOUNT_ID") ugasio sav prihod,
 * uz zeleni preflight. Popravak: Lekta ne koristi Connect; racun je onaj kljuca, u OBJE funkcije.
 * Webhook odbija svaki dogadjaj s poljem `account`, checkout ga nikad ne stvara, a preflight odbija
 * postavljen `STRIPE_ACCOUNT_ID`.
 *
 * Mjeri se IZVRSENI put obje funkcije: checkout salje PaymentIntent laznom Stripeu, lazni Stripe
 * iz tog zahtjeva izvodi dogadjaj po Stripe pravilu (polje `account` postoji tocno kad je zahtjev
 * nosio `Stripe-Account`), a webhook taj dogadjaj obradjuje nad laznom bazom. Granica tvrdnje:
 * pravilo "account tocno uz Stripe-Account" je Stripe dokumentacija prenesena u lazni Stripe, a ne
 * mjerenje zivog Stripea; nad zivim racunom u ovoj grani NIJE provjereno.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createCheckoutHandler } from '../supabase/functions/create-checkout/handler';
import { createWebhookHandler } from '../supabase/functions/webhook-mor/handler';
import { acceptEvent } from '../src/report/webhook';
import { CHECKOUT_CONSENT_TEXTS } from '../src/legal/consent-text';
import { fakeAdmin, argOf, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import {
  accountIdentityProblems,
  checkoutAccountScopeProblems,
  envNames,
  FORBIDDEN_PAYMENT_ENV_NAMES,
  readTextLf,
} from './helpers/naplata-env';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOW_MS = Date.UTC(2026, 8, 27, 10, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
// Sinteticke vrijednosti sastavljene iz dijelova: gitleaks generic-api-key hvata literal oblika
// kljuca i u testu (vidi .gitleaksignore, 70548aef), a ovdje nema nicega stvarnog.
const WHSEC = ['whsec', 'racun', 'test'].join('_');
const FAKE_SK = ['sk', 'test', 'racun'].join('_');
const FAKE_PK = ['pk', 'test', 'racun'].join('_');
const FAKE_CLIENT_SECRET = ['pi_racun', 'secret', 'xyz'].join('_');
const TERMS = Object.keys(CHECKOUT_CONSENT_TEXTS)[0];

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
  // Monetizacija V1 (0207): webhook snapshotira ponudu i prava uz entitlement.
  offer_code: 'repair_v1',
  offer_codes: { capabilities: ['full_report', 'repair', 'repair_diff', 'recheck'] },
};

interface StripePoziv {
  headers: Record<string, string>;
  body: string;
}

/**
 * Lazni Stripe: prima zahtjev za PaymentIntent i iz njega izvodi `payment_intent.succeeded` kakav
 * bi Stripe poslao nakon uspjesne naplate. Polje `account` postoji TOCNO kad je zahtjev nosio
 * zaglavlje `Stripe-Account` (Stripe: `account` je "the connected account that originated the
 * event", izostaje za dogadjaj vlastitog racuna).
 */
function stripeDogadjajIz(poziv: StripePoziv): Record<string, unknown> {
  const params = new URLSearchParams(poziv.body);
  const connect = Object.entries(poziv.headers).find(([k]) => k.toLowerCase() === 'stripe-account')?.[1];
  const amount = Number(params.get('amount'));
  return {
    id: 'evt_racun',
    type: 'payment_intent.succeeded',
    livemode: true,
    ...(connect ? { account: connect } : {}),
    data: {
      object: {
        id: 'pi_racun',
        object: 'payment_intent',
        status: 'succeeded',
        amount,
        amount_received: amount,
        currency: params.get('currency'),
        metadata: {
          user_id: params.get('metadata[user_id]'),
          product_id: params.get('metadata[product_id]'),
        },
      },
    },
  };
}

/** Izvrsi create-checkout; `umetni` je MUTACIJA koja prije slanja mijenja Stripe zahtjev. */
async function checkout(umetni?: (headers: Record<string, string>) => Record<string, string>): Promise<StripePoziv> {
  const db = fakeAdmin((c) => {
    if (c.table === 'checkout_consents' && writeOp(c) === 'select') return { count: 0 };
    if (c.table === 'products') return { data: PRODUCT_ROW };
    return undefined;
  });
  const pozivi: StripePoziv[] = [];
  const handler = createCheckoutHandler({
    asUser: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'kupac@example.com' } } }) } }),
    admin: () => db.admin,
    stripeSecretKey: FAKE_SK,
    stripePublishableKey: FAKE_PK,
    dailyCap: 20,
    allowedOrigins: ['https://lektahr.netlify.app'],
    now: () => NOW_MS,
    fetchImpl: (async (_url: string, init: RequestInit) => {
      const headers = { ...(init.headers as Record<string, string>) };
      pozivi.push({ headers: umetni ? umetni(headers) : headers, body: String(init.body) });
      return new Response(
        JSON.stringify({ id: 'pi_racun', client_secret: FAKE_CLIENT_SECRET, amount: 999, currency: 'eur' }),
        { status: 200 },
      );
    }) as unknown as typeof fetch,
  });
  const res = await handler(
    new Request('https://edge.test/functions/v1/create-checkout', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-user', 'content-type': 'application/json', Origin: 'https://lektahr.netlify.app' },
      body: JSON.stringify({
        productId: 'slot_diplomski',
        consent: {
          immediateDelivery: true,
          withdrawalWaived: true,
          text: CHECKOUT_CONSENT_TEXTS[TERMS],
          timestamp: new Date(NOW_MS).toISOString(),
          termsVersion: TERMS,
        },
      }),
    }),
  );
  expect(res.status, await res.clone().text()).toBe(200);
  expect(pozivi).toHaveLength(1);
  return pozivi[0];
}

/** Izvrsi webhook-mor nad potpisanim dogadjajem, kao Stripe (HMAC-SHA256 nad `${t}.${raw}`). */
async function webhook(payload: Record<string, unknown>) {
  const raw = JSON.stringify(payload);
  const v1 = createHmac('sha256', WHSEC).update(`${NOW_S}.${raw}`).digest('hex');
  const db = fakeAdmin((c: FakeCall): FakeResult | undefined => {
    if (c.table === 'webhook_events' && writeOp(c) === 'insert') return { data: { id: 'inbox-1' } };
    if (c.table === 'webhook_events' && writeOp(c) === 'update') return { data: [{ id: 'inbox-1' }] };
    if (c.table === 'products') return { data: PRODUCT_ROW };
    return undefined;
  });
  const handler = createWebhookHandler({
    admin: () => db.admin,
    webhookSecret: WHSEC,
    allowTestMode: false,
    now: () => NOW_MS,
    grantReferrerReward: (async () => undefined) as never,
  });
  const res = await handler(
    new Request('https://edge.test/functions/v1/webhook-mor', {
      method: 'POST',
      headers: { 'Stripe-Signature': `t=${NOW_S},v1=${v1}`, 'content-type': 'application/json' },
      body: raw,
    }),
  );
  const body = (await res.json()) as Record<string, unknown>;
  const prava = db.calls.filter((c) => c.table === 'entitlements' && writeOp(c) === 'insert');
  return { res, body, prava };
}

describe('naplata: checkout i webhook na istom Stripe racunu', () => {
  it('BASELINE: kupnja iz naseg checkouta prolazi webhook i dobije pravo pristupa', async () => {
    const poziv = await checkout();
    expect(checkoutAccountScopeProblems(poziv)).toEqual([]);
    const dogadjaj = stripeDogadjajIz(poziv);
    expect(dogadjaj).not.toHaveProperty('account');

    const { res, body, prava } = await webhook(dogadjaj);
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, action: 'entitlement_created' });
    expect(prava).toHaveLength(1);
    expect(argOf(prava[0], 'insert')).toMatchObject({ user_id: 'user-1', order_id: 'pi_racun', provider: 'stripe' });
  });

  /**
   * MUTACIJA: checkout PaymentIntent stvara na povezanom racunu (Stripe-Account), a webhook ostaje
   * kakav jest. To je razilazenje koje zastita mora uciniti GLASNIM: izvrseni checkout gard ga
   * imenuje, a webhook takav dogadjaj odbija s ERROR retkom, ne tiho.
   */
  it('gard grize: checkout na povezanom racunu se imenuje, a webhook njegov dogadjaj glasno odbija', async () => {
    const poziv = await checkout((h) => ({ ...h, 'Stripe-Account': 'acct_1Povezani' }));
    expect(checkoutAccountScopeProblems(poziv).join('; ')).toContain('Stripe-Account');
    const dogadjaj = stripeDogadjajIz(poziv);
    expect(dogadjaj).toHaveProperty('account', 'acct_1Povezani');

    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { res, body, prava } = await webhook(dogadjaj);
      expect(res.status).toBe(200);
      expect(body).toEqual({ ok: true, action: 'event_refused', reason: 'account_mismatch' });
      expect(prava).toHaveLength(0);
      expect(err.mock.calls.map((c) => String(c[0]))).toContain('webhook-mor event_refused');
    } finally {
      err.mockRestore();
    }
  });

  it('checkout gard vidi i Connect parametre u tijelu, ne samo zaglavlje', () => {
    const body = new URLSearchParams({ amount: '999', on_behalf_of: 'acct_x', 'transfer_data[destination]': 'acct_x' });
    const problems = checkoutAccountScopeProblems({ headers: {}, body: body.toString() }).join('; ');
    expect(problems).toContain('on_behalf_of');
    expect(problems).toContain('transfer_data');
  });
});

describe('naplata: gate porijekla i povezani racun', () => {
  it('BASELINE: acceptEvent prihvaca dogadjaj bez account, a odbija svaki povezani racun', () => {
    const problems = accountIdentityProblems(acceptEvent);
    expect(problems, problems.join('; ')).toEqual([]);
  });

  /** Stanje do kruga 3: provjera racuna samo uz postavljeno ocekivanje, inace preskocena. */
  it('gard grize: gate koji povezani racun provjerava samo uz postavljenu tajnu', () => {
    const stari = (ocekivan: string) =>
      (ev: { livemode: boolean | null; accountId: string }, opts: { allowTestMode: boolean }) => {
        if (ev.livemode === null) return { ok: false, reason: 'livemode_unverifiable' };
        if (!ev.livemode && !opts.allowTestMode) return { ok: false, reason: 'test_mode_refused' };
        if (ocekivan && ev.accountId !== ocekivan) return { ok: false, reason: 'account_mismatch' };
        return { ok: true };
      };
    // Bez tajne: tudji povezani racun prolazi.
    expect(accountIdentityProblems(stari('')).join('; ')).toContain('prihvaca payment_intent.succeeded s povezanim racunom');
    // S tajnom (runbook do kruga 3): nasa kupnja iz checkouta se odbija.
    expect(accountIdentityProblems(stari('acct_1Nas')).join('; ')).toContain('odbija dogadjaj bez polja account');
  });
});

describe('naplata: racun se ne konfigurira ni u jednoj funkciji', () => {
  const izvor = (rel: string) => readTextLf(resolve(ROOT, rel));
  const FUNKCIJE = [
    'supabase/functions/create-checkout/index.ts',
    'supabase/functions/create-checkout/handler.ts',
    'supabase/functions/webhook-mor/index.ts',
    'supabase/functions/webhook-mor/handler.ts',
  ];

  it('nijedna funkcija naplate ne cita STRIPE_ACCOUNT_ID', () => {
    const procitano = FUNKCIJE.flatMap((f) => [...envNames(izvor(f))].map((n) => `${f}:${n}`));
    // Netrivijalnost: mjerenje mora vidjeti imena koja funkcije stvarno citaju.
    expect(procitano.some((p) => p.endsWith(':STRIPE_WEBHOOK_SECRET'))).toBe(true);
    expect(procitano.some((p) => p.endsWith(':STRIPE_SECRET_KEY'))).toBe(true);
    const zabranjeno = procitano.filter((p) => FORBIDDEN_PAYMENT_ENV_NAMES.some((n) => p.endsWith(`:${n}`)));
    expect(zabranjeno).toEqual([]);
  });

  it('webhook-mor handler vise ne prima ocekivani racun izvana', () => {
    const handler = izvor('supabase/functions/webhook-mor/handler.ts');
    expect(handler).not.toContain('expectedAccountId');
    expect(handler).toContain('acceptEvent(ev, { allowTestMode: deps.allowTestMode })');
  });
});
