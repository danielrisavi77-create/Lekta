// Lekta Edge Function: webhook-mor (Deno, Supabase). Merchant of Record: Lemon Squeezy.
// Spec: docs/MONETIZATION_PLAN.md sekcija 6 (webhook delte) + MONETIZATION_AND_ANTI_ABUSE.md 7.
//
// Na uspjesnu kupnju kreira entitlement; idempotentno preko unique (provider, order_id)
// (migracija 0001). Proizvod se mapira iz baze `products` po mor_product_id (LS variant),
// ne vise iz hardkodirane liste. Rok potrosnje je po proizvodu (purchase_window_days).
// manual_fulfillment (premium_human) -> manual_orders. Pass -> izdaje -20% kupon (coupon_grants).
// Nepoznat proizvod -> log + 200 (bez entitlementa) da provider ne retry-a beskonacno (6.2).
// Odluke (potpis, parsiranje, rok, kupon) su u testiranom coreu src/report/webhook.ts.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  verifyLemonSignature,
  parseLemonEvent,
  isoAfterDays,
  isPassProduct,
  makePassCouponCode,
  PASS_COUPON_VALID_DAYS,
} from '../../../src/report/webhook.ts';
import { mapProductRow } from '../../../src/catalog/products-catalog.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('MOR_WEBHOOK_SECRET') ?? '';
const PROVIDER = 'lemonsqueezy';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  if (!(await verifyLemonSignature(raw, req.headers.get('X-Signature'), WEBHOOK_SECRET))) {
    return json({ error: 'invalid_signature' }, 401);
  }
  const ev = parseLemonEvent(JSON.parse(raw));
  if (!ev.orderId || !ev.userId) return json({ error: 'bad_request' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // refund: blokiraj daljnje vezivanje slotova iz tog entitlementa (sekcija 6.7)
  if (ev.refunded) {
    await admin.from('entitlements').update({ status: 'refunded' }).eq('provider', PROVIDER).eq('order_id', ev.orderId);
    return json({ ok: true, action: 'refunded' });
  }

  // proizvod iz kataloga po mor_product_id (sekcija 6.2)
  const { data: prow } = await admin.from('products').select('*').eq('mor_product_id', ev.variantId).maybeSingle();
  const product = prow ? mapProductRow(prow as Record<string, unknown>) : null;
  if (!product) {
    // Nepoznat id -> log ERROR + alert; 200 bez entitlementa da provider ne retry-a (6.2).
    console.error('webhook-mor unknown_product', { variantId: ev.variantId, orderId: ev.orderId });
    return json({ ok: true, action: 'unknown_product_logged' }, 200);
  }

  // rucni fulfillment (premium_human): otvori manual_orders, bez entitlementa (6.3)
  if (product.manualFulfillment) {
    const { error } = await admin
      .from('manual_orders')
      .insert({ user_id: ev.userId, product_id: product.id, order_id: ev.orderId, provider: PROVIDER });
    if (error && (error as any).code === '23505') return json({ ok: true, action: 'duplicate_ignored' });
    if (error) return json({ error: 'insert_failed', detail: error.message }, 500);
    return json({ ok: true, action: 'manual_order_created' });
  }

  if (!product.workType) {
    console.error('webhook-mor product_without_work_type', { productId: product.id });
    return json({ error: 'product_misconfigured' }, 500);
  }

  // entitlement (6.4); idempotentno preko unique (provider, order_id)
  const purchaseExpiresAt = isoAfterDays(Date.now(), product.purchaseWindowDays);
  const { error } = await admin.from('entitlements').insert({
    user_id: ev.userId,
    work_type: product.workType,
    slots_total: product.slotsTotal,
    product_id: product.id,
    order_id: ev.orderId,
    provider: PROVIDER,
    purchase_expires_at: purchaseExpiresAt,
  });
  if (error && (error as any).code === '23505') return json({ ok: true, action: 'duplicate_ignored' });
  if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

  // pass bonus kupon (6.5): samo uz tek kreiran entitlement (ne na duplikat)
  if (isPassProduct(product.kind)) {
    await admin.from('coupon_grants').insert({
      user_id: ev.userId,
      code: makePassCouponCode(ev.orderId),
      reason: 'pass_bonus',
      source_order_id: ev.orderId,
      expires_at: isoAfterDays(Date.now(), PASS_COUPON_VALID_DAYS),
    });
    // TODO(integracija): kreiraj -20% Lemon Squeezy discount (vrijedi na slot_zavrsni/slot_diplomski)
    // i posalji kod korisniku mailom. Zakljucaj da ne vrijedi na partner proizvode (sekcija 7).
  }

  return json({ ok: true, action: 'entitlement_created' });
});
