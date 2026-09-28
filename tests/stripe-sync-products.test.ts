/**
 * scripts/stripe-sync-products.mjs: zrcalo kataloga u Stripeu (Monetizacija V1, M2).
 *
 * Kriteriji iz zadatka M2: "idempotentno (lookup_key = product id), s --dry-run kao zadanim; NE
 * pokreci je protiv ikojeg Stripe racuna". Test zato nikad ne zove pravi Stripe: dry-run mora
 * proci s fetchom koji baca, a --apply se vrti nad laznim Stripeom koji pamti stanje, pa se drugi
 * prolaz mjeri kao no-op.
 */
import { describe, it, expect } from 'vitest';

import {
  main,
  parseArgs,
  catalogFromMigrations,
  desiredStripeCatalog,
  planStripeSync,
  retiredStripeCatalog,
  stripeLookupKey,
  stripeProductId,
} from '../scripts/stripe-sync-products.mjs';
import { seededProducts } from './helpers/product-seeds';

const zabranjenFetch = (async () => {
  throw new Error('dry-run ne smije zvati mrezu');
}) as unknown as typeof fetch;

/** Lazan Stripe s memorijom: products po id-u, prices po lookup_key. */
function fakeStripe() {
  const products = new Map<string, Record<string, unknown>>();
  const prices: Array<Record<string, unknown>> = [];
  const posts: string[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/v1/, '');
    const method = init.method ?? 'GET';
    const body = new URLSearchParams(String(init.body ?? ''));
    const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (method === 'GET' && path.startsWith('/products/')) {
      const p = products.get(decodeURIComponent(path.slice('/products/'.length)));
      return p ? ok(p) : ok({ error: {} }, 404);
    }
    if (method === 'GET' && path === '/prices') {
      const key = u.searchParams.get('lookup_keys[]');
      return ok({ data: prices.filter((p) => p.lookup_key === key && p.active) });
    }
    posts.push(`${method} ${path}`);
    if (path === '/products') {
      const id = String(body.get('id'));
      products.set(id, { id, name: body.get('name'), active: true, metadata: metadataOf(body) });
      return ok(products.get(id));
    }
    if (path.startsWith('/products/')) {
      const id = decodeURIComponent(path.slice('/products/'.length));
      const prije = products.get(id) ?? {};
      products.set(id, {
        ...prije, id,
        ...(body.has('name') ? { name: body.get('name'), metadata: metadataOf(body) } : {}),
        active: body.get('active') !== 'false',
      });
      return ok(products.get(id));
    }
    if (path === '/prices') {
      const key = body.get('lookup_key');
      if (body.get('transfer_lookup_key') === 'true') for (const p of prices) if (p.lookup_key === key) p.lookup_key = null;
      const price = { id: `price_${prices.length + 1}`, product: body.get('product'), unit_amount: Number(body.get('unit_amount')), currency: body.get('currency'), lookup_key: key, active: true };
      prices.push(price);
      return ok(price);
    }
    if (path.startsWith('/prices/')) {
      const id = decodeURIComponent(path.slice('/prices/'.length));
      const p = prices.find((x) => x.id === id);
      if (p) p.active = body.get('active') !== 'false';
      if (p && body.has('lookup_key')) p.lookup_key = body.get('lookup_key') || null;
      return ok(p ?? {});
    }
    return ok({ error: {} }, 400);
  }) as unknown as typeof fetch;
  return { f, products, prices, posts };
}

const DB_URL = 'https://db.test.example';
const DB_ENV = { SUPABASE_URL: DB_URL, SUPABASE_SERVICE_ROLE_KEY: 'service-role-test' };

/** Omata lazan Stripe fetch tako da `--from=db` prvo dobije katalog iz migracija preko PostgREST-a. */
function fakeDb(stripeFetch: typeof fetch, rows: unknown[] = catalogFromMigrations()) {
  return (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.origin === DB_URL && u.pathname === '/rest/v1/products') {
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    return stripeFetch(url, init as RequestInit);
  }) as unknown as typeof fetch;
}

function metadataOf(body: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of body) {
    const m = /^metadata\[(.+)\]$/.exec(k);
    if (m) out[m[1]] = v;
  }
  return out;
}

const TEST_KEY = ['sk', 'test', 'sync'].join('_');
const LIVE_KEY = ['sk', 'live', 'sync'].join('_');
const quiet = () => undefined;

describe('stripe-sync-products: katalog', () => {
  const desired = desiredStripeCatalog(catalogFromMigrations());
  const ids = desired.map((d) => d.productId);

  it('generator: katalog iz migracija je isti kao onaj koji vidi parser testova (dva neovisna parsera)', () => {
    const iz = new Set(catalogFromMigrations().map((r: { id: string }) => r.id));
    const test = new Set(seededProducts().map((s) => String(s.row.id)));
    expect(iz).toEqual(test);
  });

  it('SKU-ovi V1 s iznosom u centima iz products.price_eur (ciljno stanje 0207)', () => {
    const amount = (id: string) => desired.find((d) => d.productId === id)?.unitAmount;
    expect(amount('slot_seminarski')).toBe(399);
    expect(amount('slot_zavrsni')).toBe(599);
    expect(amount('slot_diplomski')).toBe(999);
    expect(amount('slot_specijalisticki')).toBe(1699);
    expect(amount('slot_doktorski')).toBe(2499);
    expect(amount('pass_zavrsni')).toBe(1299);
    expect(amount('pass_diplomski')).toBe(1999);
    expect(amount('pass_specijalisticki')).toBe(2999);
    expect(amount('pass_doktorski')).toBe(3999);
    expect(amount('pass_semestralni')).toBe(1499);
  });

  it('neaktivni do_obrane, Katedrini i partnerski proizvodi se ne zrcale', () => {
    expect(ids.some((id) => id.endsWith('_do_obrane'))).toBe(false);
    expect(ids.some((id) => id.startsWith('katedra_'))).toBe(false);
    expect(ids.some((id) => id.startsWith('partner_'))).toBe(false);
  });

  it('lookup_key je products.id, Product id je stabilan', () => {
    expect(stripeLookupKey('pass_diplomski')).toBe('pass_diplomski');
    expect(stripeProductId('pass_diplomski')).toBe('lekta_pass_diplomski');
  });
});

describe('stripe-sync-products: dry-run je zadan i ne dira mrezu', () => {
  it('bez argumenata je dry-run', () => {
    expect(parseArgs([])).toMatchObject({ apply: false, from: 'migrations' });
    expect(() => parseArgs(['--nesto'])).toThrow();
  });

  it('dry-run s kljucem u okolini i dalje ne zove Stripe; neaktivni SKU-ovi su u planu', async () => {
    const out = await main([], { STRIPE_SECRET_KEY: LIVE_KEY }, zabranjenFetch, quiet);
    expect(out.mode).toBe('dry-run');
    const akcije = out.plan.map((s: { action: string }) => s.action);
    expect(akcije.every((a: string) => a.startsWith('create_') || a === 'noop_archived')).toBe(true);
    expect(out.plan.filter((s: { action: string }) => s.action === 'noop_archived').map((s: { productId: string }) => s.productId))
      .toEqual(['slot_diplomski_do_obrane', 'slot_zavrsni_do_obrane']);
  });

  it('--apply bez kljuca i live kljuc bez --live se odbijaju prije ikakvog poziva (i uz --from=db)', async () => {
    await expect(main(['--apply', '--from=db'], {}, zabranjenFetch, quiet)).rejects.toThrow(/STRIPE_SECRET_KEY/);
    await expect(main(['--apply', '--from=db'], { STRIPE_SECRET_KEY: LIVE_KEY }, zabranjenFetch, quiet)).rejects.toThrow(/--live/);
  });

  it('krug 4: --apply bez eksplicitnog --from se odbija i trazi --from=db, prije ikakvog poziva', async () => {
    await expect(main(['--apply'], { STRIPE_SECRET_KEY: TEST_KEY }, zabranjenFetch, quiet)).rejects.toThrow(/--from=db/);
    expect(parseArgs(['--apply']).fromExplicit).toBe(false);
    expect(parseArgs(['--apply', '--from=db']).fromExplicit).toBe(true);
  });

  it('M2: --apply --from=migrations se odbija (samo --from=db zrcali zivi katalog), prije ikakvog poziva', async () => {
    await expect(main(['--apply', '--from=migrations'], { STRIPE_SECRET_KEY: TEST_KEY }, zabranjenFetch, quiet)).rejects.toThrow(/--from=db/);
    expect(parseArgs(['--apply', '--from=migrations']).fromExplicit).toBe(true);
  });
});

describe('stripe-sync-products: neaktivan SKU se arhivira (krug 4)', () => {
  it('generator: katalog iz migracija ima neaktivne Lektine SKU-ove (do_obrane), ne Katedrine', () => {
    expect(retiredStripeCatalog(catalogFromMigrations())).toEqual(['slot_diplomski_do_obrane', 'slot_zavrsni_do_obrane']);
  });

  it('plan: aktivan Product i Price s lookup_key -> archive_product i archive_price; vec arhiviran -> noop_archived', () => {
    const aktivan = new Map([['slot_zavrsni_do_obrane', {
      product: { id: 'lekta_slot_zavrsni_do_obrane', name: 'x', active: true, metadata: {} },
      price: { id: 'price_old', unit_amount: 999, currency: 'eur' },
    }]]);
    expect(planStripeSync([], aktivan, ['slot_zavrsni_do_obrane'])).toEqual([
      { action: 'archive_product', productId: 'slot_zavrsni_do_obrane', stripeProductId: 'lekta_slot_zavrsni_do_obrane' },
      { action: 'archive_price', productId: 'slot_zavrsni_do_obrane', stripeProductId: 'lekta_slot_zavrsni_do_obrane', previousPriceId: 'price_old' },
    ]);
    const arhiviran = new Map([['slot_zavrsni_do_obrane', { product: { id: 'lekta_slot_zavrsni_do_obrane', name: 'x', active: false, metadata: {} } }]]);
    expect(planStripeSync([], arhiviran, ['slot_zavrsni_do_obrane'])).toEqual([
      { action: 'noop_archived', productId: 'slot_zavrsni_do_obrane', stripeProductId: 'lekta_slot_zavrsni_do_obrane' },
    ]);
  });

  it('--apply: Product active=false, Price neaktivna i bez lookup_key; drugi prolaz ne salje nijedan POST', async () => {
    const s = fakeStripe();
    s.products.set('lekta_slot_zavrsni_do_obrane', { id: 'lekta_slot_zavrsni_do_obrane', name: 'Lekta slot_zavrsni_do_obrane', active: true, metadata: {} });
    s.prices.push({ id: 'price_obrana', product: 'lekta_slot_zavrsni_do_obrane', unit_amount: 999, currency: 'eur', lookup_key: 'slot_zavrsni_do_obrane', active: true });
    const prvi = await main(['--apply', '--from=db'], { STRIPE_SECRET_KEY: TEST_KEY, ...DB_ENV }, fakeDb(s.f), quiet);
    expect(prvi.plan.map((st: { action: string; productId: string }) => `${st.action}:${st.productId}`))
      .toEqual(expect.arrayContaining(['archive_product:slot_zavrsni_do_obrane', 'archive_price:slot_zavrsni_do_obrane', 'noop_archived:slot_diplomski_do_obrane']));
    expect(s.products.get('lekta_slot_zavrsni_do_obrane')?.active).toBe(false);
    const cijena = s.prices.find((p) => p.id === 'price_obrana');
    expect(cijena).toMatchObject({ active: false, lookup_key: null });
    const postova = s.posts.length;
    const drugi = await main(['--apply', '--from=db'], { STRIPE_SECRET_KEY: TEST_KEY, ...DB_ENV }, fakeDb(s.f), quiet);
    expect(drugi.applied).toBe(0);
    expect(s.posts.length).toBe(postova);
  });
});

describe('stripe-sync-products: idempotencija (dva prolaza, drugi je no-op)', () => {
  it('prvi --apply stvori Product i Price po SKU-u; drugi ne salje nijedan POST', async () => {
    const s = fakeStripe();
    const prvi = await main(['--apply', '--from=db'], { STRIPE_SECRET_KEY: TEST_KEY, ...DB_ENV }, fakeDb(s.f), quiet);
    const broj = desiredStripeCatalog(catalogFromMigrations()).length;
    expect(prvi.applied).toBe(broj * 2);
    expect(s.products.size).toBe(broj);
    const postsPrvi = s.posts.length;

    const drugi = await main(['--apply', '--from=db'], { STRIPE_SECRET_KEY: TEST_KEY, ...DB_ENV }, fakeDb(s.f), quiet);
    expect(drugi.applied).toBe(0);
    expect(drugi.plan.every((st: { action: string }) => st.action.startsWith('noop'))).toBe(true);
    expect(s.posts.length).toBe(postsPrvi);
  });

  it('promjena cijene: nova Price s prenesenim lookup_key, stara se gasi', () => {
    const desired = [{ productId: 'pass_diplomski', name: 'Lekta pass_diplomski', unitAmount: 1999, metadata: { product_id: 'pass_diplomski', kind: 'pass', work_type: 'diplomski', offer_code: 'final_pass_v1' } }];
    const existing = new Map([['pass_diplomski', {
      product: { id: 'lekta_pass_diplomski', name: 'Lekta pass_diplomski', active: true, metadata: desired[0].metadata },
      price: { id: 'price_old', unit_amount: 1499, currency: 'eur' },
    }]]);
    expect(planStripeSync(desired, existing)).toEqual([
      { action: 'noop_product', productId: 'pass_diplomski', stripeProductId: 'lekta_pass_diplomski' },
      {
        action: 'replace_price', productId: 'pass_diplomski', stripeProductId: 'lekta_pass_diplomski', unitAmount: 1999,
        lookupKey: 'pass_diplomski', previousPriceId: 'price_old', previousUnitAmount: 1499,
      },
    ]);
  });
});

describe('stripe-sync-products: gard zastita (krug 4, baseline za gate-mutations)', () => {
  it('parseArgs, applyGuard i redoslijed u main su cisti', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { applyGuard } = await import('../scripts/stripe-sync-products.mjs');
    const { stripeSyncSafetyProblems } = await import('./helpers/monetizacija-v1-guards');
    const src = readFileSync(resolve(process.cwd(), 'scripts', 'stripe-sync-products.mjs'), 'utf8');
    expect(stripeSyncSafetyProblems(parseArgs, applyGuard, src)).toEqual([]);
  });
});
