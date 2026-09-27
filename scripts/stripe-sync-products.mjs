#!/usr/bin/env node
// scripts/stripe-sync-products.mjs
//
// Zrcalo Lektinog kataloga u Stripeu: jedan Stripe Product i jedna aktivna Price po SKU-u
// (Monetizacija V1, M2; docs/GO_LIVE_NAPLATA.md, korak 4.3).
//
// STO OVO NIJE. Stripe Price NIJE izvor iznosa. create-checkout iznos PaymentIntenta racuna iz
// `products.price_eur` pri svakom pozivu, a webhook proizvod trazi po `metadata[product_id]`. Zrcalo
// sluzi Stripe izvjestajima, racunima i Stripe Taxu; njegov kvar ne mijenja nijednu naplatu.
//
// IDEMPOTENTNO. Product ima stabilan id `lekta_<products.id>`, a aktivna Price nosi
// `lookup_key = <products.id>`. Drugi prolaz nad nepromijenjenim katalogom ne mijenja nista (plan je
// sav `noop`). Promjena cijene stvara NOVU Price (Stripe cijenu ne mijenja na postojecoj) s
// `transfer_lookup_key=true`, a staru gasi.
//
// ZADANO JE --dry-run. Bez `--apply` skripta ne salje nijedan zahtjev Stripeu: ispise plan nad
// katalogom i (ako se ne zada stanje) pretpostavi prazan Stripe racun. `--apply` trazi
// STRIPE_SECRET_KEY, a live kljuc (`sk_live_`) dodatno i `--live`. Tijekom bete je naplata
// iskljucena i skripta se NE pokrece protiv ijednog racuna.
//
// Izvor kataloga:
//   --from=migrations (zadano)  sjeme iz supabase/migrations + ciljno stanje V1 iz 0206; offline
//   --from=db                   zivi `products` preko PostgREST-a (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
//
// Pokretanje: node scripts/stripe-sync-products.mjs [--from=migrations|db] [--apply [--live]] [--json]

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STRIPE_API = 'https://api.stripe.com/v1';

/** Proizvodi drugog proizvoda iz iste tablice; Lektin checkout ih ne prodaje (products-catalog.ts). */
const FOREIGN_PREFIXES = ['katedra_'];

/** Stabilan id Stripe Producta za Lektin SKU. */
export function stripeProductId(productId) {
  return `lekta_${productId}`;
}

/** lookup_key aktivne Price je katalozni products.id. */
export function stripeLookupKey(productId) {
  return productId;
}

// ---------------------------------------------------------------------------------------------
// Katalog iz migracija
// ---------------------------------------------------------------------------------------------

function parseValue(tok, file) {
  const t = tok.trim();
  if (/^'.*'$/s.test(t)) return t.slice(1, -1).replace(/''/g, "'");
  if (/^null$/i.test(t)) return null;
  if (/^true$/i.test(t)) return true;
  if (/^false$/i.test(t)) return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  throw new Error(`${file}: nepoznata vrijednost u products insertu: ${t}`);
}

function splitTuple(body, file) {
  const out = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") {
      if (inStr && body[i + 1] === "'") { cur += "''"; i++; continue; }
      inStr = !inStr;
      cur += ch;
      continue;
    }
    if (ch === ',' && !inStr) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (inStr) throw new Error(`${file}: nezatvoren navodnik`);
  out.push(cur);
  return out.map((v) => parseValue(v, file));
}

/**
 * Katalog kakav migracije ostavljaju: `insert into products` iz svih migracija, zatim ciljno stanje
 * V1 (popis iz 0206) i gasenje do_obrane. Nepoznat oblik BACA: djelomican katalog ne smije izgledati
 * kao manji katalog.
 */
export function catalogFromMigrations(dir = join(ROOT, 'supabase', 'migrations')) {
  const byId = new Map();
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').replace(/--[^\n]*/g, '');
    const re = /insert\s+into\s+(?:public\.)?products\s*\(([^)]*)\)\s*values\s*([\s\S]*?)(?:on\s+conflict|;)/gi;
    for (const m of sql.matchAll(re)) {
      const cols = m[1].split(',').map((c) => c.trim());
      for (const t of m[2].matchAll(/\(([^()]*)\)/g)) {
        const vals = splitTuple(t[1], file);
        if (vals.length !== cols.length) throw new Error(`${file}: ${vals.length} vrijednosti za ${cols.length} stupaca`);
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        if (!byId.has(row.id)) byId.set(row.id, { active: true, audience: 'retail', ...row });
      }
    }
  }
  const v1 = readFileSync(join(dir, '0206_monetizacija_v1.sql'), 'utf8').replace(/\r\n/g, '\n');
  const target = /select \* from \(values([\s\S]*?)\)\s*as t\(id, price_eur, slot_window_days, purchase_window_days, offer_code\)/.exec(v1);
  if (!target) throw new Error('0206: ciljno stanje V1 nije pronadjeno');
  for (const t of target[1].matchAll(/\('([a-z_]+)',\s*([\d.]+),\s*(\d+),\s*(\d+),\s*'([a-z_0-9]+)'\)/g)) {
    const row = byId.get(t[1]);
    if (!row) throw new Error(`0206: ${t[1]} nije sijan`);
    Object.assign(row, { price_eur: Number(t[2]), slot_window_days: Number(t[3]), purchase_window_days: Number(t[4]), offer_code: t[5] });
  }
  const off = /set active = false\s*where id in \(([^)]*)\)/.exec(v1.replace(/--[^\n]*/g, ''));
  if (!off) throw new Error('0206: deaktivacija do_obrane nije pronadjena');
  for (const id of [...off[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])) {
    const row = byId.get(id);
    if (row) row.active = false;
  }
  return [...byId.values()];
}

/** Katalog iz zive baze (service role). */
export async function catalogFromDb(env = process.env, fetchImpl = fetch) {
  const url = String(env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  if (!url || !key) throw new Error('--from=db trazi SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetchImpl(`${url}/rest/v1/products?select=*&order=sort.asc`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`products fetch ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) throw new Error('products fetch: odgovor nije niz');
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

/**
 * Sto Stripe treba imati: aktivni retail proizvodi koje Lekta prodaje, s pozitivnom cijenom. Iznos je
 * `round(price_eur * 100)`, isto zaokruzivanje kao stripeAmountCents u src/report/checkout.ts.
 */
export function desiredStripeCatalog(rows) {
  return rows
    .filter((r) => r && r.active !== false && (r.audience ?? 'retail') === 'retail')
    .filter((r) => !FOREIGN_PREFIXES.some((p) => String(r.id).startsWith(p)))
    .map((r) => ({
      productId: String(r.id),
      name: `Lekta ${String(r.id)}`,
      unitAmount: Math.round(Number(r.price_eur) * 100),
      metadata: {
        product_id: String(r.id),
        kind: String(r.kind ?? ''),
        work_type: r.work_type == null ? '' : String(r.work_type),
        offer_code: r.offer_code == null ? '' : String(r.offer_code),
      },
    }))
    .filter((d) => Number.isFinite(d.unitAmount) && d.unitAmount > 0)
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

/**
 * Plan nad trenutnim stanjem Stripea. `existing` je mapa productId -> { product?, price? } gdje je
 * `product` Stripe Product (id, name, active, metadata), a `price` aktivna Price s tim lookup_key
 * (id, unit_amount, currency). Cista funkcija: isti ulaz, isti plan.
 */
export function planStripeSync(desired, existing = new Map()) {
  const plan = [];
  for (const d of desired) {
    const cur = existing.get(d.productId) ?? {};
    const stripeId = stripeProductId(d.productId);
    if (!cur.product) {
      plan.push({ action: 'create_product', productId: d.productId, stripeProductId: stripeId, name: d.name, metadata: d.metadata });
    } else if (cur.product.active === false || cur.product.name !== d.name || !sameMetadata(cur.product.metadata, d.metadata)) {
      plan.push({ action: 'update_product', productId: d.productId, stripeProductId: stripeId, name: d.name, metadata: d.metadata });
    } else {
      plan.push({ action: 'noop_product', productId: d.productId, stripeProductId: stripeId });
    }
    const price = cur.price;
    if (!price) {
      plan.push({ action: 'create_price', productId: d.productId, stripeProductId: stripeId, unitAmount: d.unitAmount, lookupKey: stripeLookupKey(d.productId) });
    } else if (price.unit_amount !== d.unitAmount || String(price.currency).toLowerCase() !== 'eur') {
      plan.push({
        action: 'replace_price', productId: d.productId, stripeProductId: stripeId, unitAmount: d.unitAmount,
        lookupKey: stripeLookupKey(d.productId), previousPriceId: price.id, previousUnitAmount: price.unit_amount,
      });
    } else {
      plan.push({ action: 'noop_price', productId: d.productId, priceId: price.id, unitAmount: d.unitAmount });
    }
  }
  return plan;
}

function sameMetadata(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) if (String(a?.[k] ?? '') !== String(b?.[k] ?? '')) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Stripe (samo uz --apply)
// ---------------------------------------------------------------------------------------------

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === 'object') form(v, key, out);
    else if (v !== undefined) out.set(key, String(v));
  }
  return out;
}

async function stripe(fetchImpl, secret, method, path, body, idempotencyKey) {
  const res = await fetchImpl(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? form(body).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

/** Trenutno stanje Stripea za zeljene SKU-ove (samo citanje). */
export async function readStripeState(desired, secret, fetchImpl = fetch) {
  const state = new Map();
  for (const d of desired) {
    const p = await stripe(fetchImpl, secret, 'GET', `/products/${encodeURIComponent(stripeProductId(d.productId))}`);
    const product = p.status === 200 ? p.data : undefined;
    if (p.status !== 200 && p.status !== 404) throw new Error(`Stripe product ${d.productId}: ${p.status}`);
    const q = await stripe(fetchImpl, secret, 'GET', `/prices?active=true&lookup_keys[]=${encodeURIComponent(stripeLookupKey(d.productId))}`);
    if (q.status !== 200) throw new Error(`Stripe price ${d.productId}: ${q.status}`);
    const price = Array.isArray(q.data?.data) ? q.data.data[0] : undefined;
    state.set(d.productId, { product, price });
  }
  return state;
}

/** Idempotency-Key koraka: izveden iz plana, pa retry istog koraka ne stvara drugu Price. */
export function stepIdempotencyKey(step) {
  return `lekta:stripe-sync:${step.action}:${step.productId}:${step.unitAmount ?? ''}:${step.previousPriceId ?? ''}`;
}

/** Izvrsi plan. Svaki POST nosi Idempotency-Key izveden iz koraka, pa retry ne udvostrucuje. */
export async function applyStripePlan(plan, secret, fetchImpl = fetch) {
  const done = [];
  for (const step of plan) {
    if (step.action.startsWith('noop')) continue;
    const key = stepIdempotencyKey(step);
    let r;
    if (step.action === 'create_product') {
      r = await stripe(fetchImpl, secret, 'POST', '/products', { id: step.stripeProductId, name: step.name, metadata: step.metadata }, key);
    } else if (step.action === 'update_product') {
      r = await stripe(fetchImpl, secret, 'POST', `/products/${encodeURIComponent(step.stripeProductId)}`, { name: step.name, active: true, metadata: step.metadata }, key);
    } else if (step.action === 'create_price' || step.action === 'replace_price') {
      r = await stripe(fetchImpl, secret, 'POST', '/prices', {
        product: step.stripeProductId, currency: 'eur', unit_amount: step.unitAmount,
        lookup_key: step.lookupKey, transfer_lookup_key: true, metadata: { product_id: step.productId },
      }, key);
      if (r.status < 300 && step.previousPriceId) {
        const off = await stripe(fetchImpl, secret, 'POST', `/prices/${encodeURIComponent(step.previousPriceId)}`, { active: false }, `${key}:off`);
        if (off.status >= 300) throw new Error(`Stripe ${step.productId}: gasenje stare cijene ${off.status}`);
      }
    }
    if (!r || r.status >= 300) throw new Error(`Stripe ${step.action} ${step.productId}: ${r?.status}`);
    done.push(step);
  }
  return done;
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { apply: false, live: false, from: 'migrations', json: false };
  for (const a of argv) {
    if (a === '--apply') opts.apply = true;
    else if (a === '--dry-run') opts.apply = false;
    else if (a === '--live') opts.live = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--from=')) opts.from = a.slice('--from='.length);
    else throw new Error(`nepoznat argument: ${a}`);
  }
  if (!['migrations', 'db'].includes(opts.from)) throw new Error(`--from mora biti migrations ili db, ne ${opts.from}`);
  return opts;
}

/**
 * Tijek. U dry-runu nema nijednog Stripe poziva: plan je nad praznim stanjem (sve `create_*`), osim
 * ako pozivatelj preda stanje. `--apply` cita stanje, planira i izvrsava.
 */
export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch, log = console.log) {
  const opts = parseArgs(argv);
  const rows = opts.from === 'db' ? await catalogFromDb(env, fetchImpl) : catalogFromMigrations();
  const desired = desiredStripeCatalog(rows);
  if (!opts.apply) {
    const plan = planStripeSync(desired);
    log(opts.json ? JSON.stringify({ mode: 'dry-run', plan }, null, 2) : formatPlan('dry-run', plan));
    return { mode: 'dry-run', plan };
  }
  const secret = String(env.STRIPE_SECRET_KEY ?? '');
  if (!secret) throw new Error('--apply trazi STRIPE_SECRET_KEY');
  if (secret.startsWith('sk_live_') && !opts.live) throw new Error('live kljuc trazi i --live (naplata je u beti iskljucena)');
  const state = await readStripeState(desired, secret, fetchImpl);
  const plan = planStripeSync(desired, state);
  const done = await applyStripePlan(plan, secret, fetchImpl);
  log(opts.json ? JSON.stringify({ mode: 'apply', plan, applied: done.length }, null, 2) : formatPlan('apply', plan));
  return { mode: 'apply', plan, applied: done.length };
}

function formatPlan(mode, plan) {
  const lines = [`[stripe-sync-products] ${mode}: ${plan.length} koraka`];
  for (const s of plan) {
    const amount = s.unitAmount != null ? ` ${(s.unitAmount / 100).toFixed(2)} EUR` : '';
    lines.push(`  ${s.action.padEnd(15)} ${s.productId}${amount}`);
  }
  return lines.join('\n');
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`[stripe-sync-products] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
