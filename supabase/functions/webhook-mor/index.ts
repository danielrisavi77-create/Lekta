// Lekta Edge Function: webhook-mor (Deno, Supabase).
// Spec: docs/MONETIZATION_AND_ANTI_ABUSE.md sekcija 7. Merchant of Record (Paddle ili
// Lemon Squeezy) rjesava EU PDV. Na uspjesnu kupnju kreira entitlement; idempotentno
// preko unique (provider, order_id) u bazi (migracija 0001). Ponovljena dostava ne
// udvostrucuje slotove (kriterij 11.10). Na refund postavlja status 'refunded'.
//
// Mapiranje proizvod -> (work_type, slots_total) drzi se u jednoj konfiguraciji ispod.
// Potpis webhooka MORA se provjeriti prije obrade (placeholder verifySignature).
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isReportWorkType } from '../../../src/report/pricing.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('MOR_WEBHOOK_SECRET') ?? '';

// proizvod (MoR) -> naplatni profil. Drzi na jednom mjestu (sekcija 7).
const PRODUCT_MAP: Record<string, { workType: string; slotsTotal: number }> = {
  'lekta-seminarski-1': { workType: 'seminarski', slotsTotal: 1 },
  'lekta-zavrsni-1': { workType: 'zavrsni', slotsTotal: 1 },
  'lekta-diplomski-1': { workType: 'diplomski', slotsTotal: 1 },
  'lekta-diplomski-3': { workType: 'diplomski', slotsTotal: 3 },
  'lekta-doktorski-1': { workType: 'doktorski', slotsTotal: 1 },
};

const PURCHASE_WINDOW_DAYS = 90; // rok da se slotovi POTROSE

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Placeholder: zamijeni stvarnom HMAC provjerom potpisa providera prije produkcije.
function verifySignature(_raw: string, _signature: string | null): boolean {
  return WEBHOOK_SECRET.length > 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-signature'))) {
    return json({ error: 'invalid_signature' }, 401);
  }
  const event = JSON.parse(raw);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  const provider = event.provider ?? 'paddle';
  const orderId = String(event.order_id ?? event.id ?? '');
  const userId = String(event.user_id ?? event.custom_data?.user_id ?? '');
  if (!orderId || !userId) return json({ error: 'bad_request' }, 400);

  // refund: blokiraj daljnje vezivanje slotova iz tog entitlementa
  if (event.type === 'refund' || event.event_type === 'refund') {
    await admin.from('entitlements').update({ status: 'refunded' }).eq('provider', provider).eq('order_id', orderId);
    return json({ ok: true, action: 'refunded' });
  }

  const map = PRODUCT_MAP[String(event.product_id ?? event.product ?? '')];
  if (!map || !isReportWorkType(map.workType)) return json({ error: 'unknown_product' }, 400);

  const purchaseExpiresAt = new Date(Date.now() + PURCHASE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

  // Idempotentno: unique (provider, order_id) u bazi. Ponovljena dostava -> 23505 -> ok.
  const { error } = await admin.from('entitlements').insert({
    user_id: userId,
    work_type: map.workType,
    slots_total: map.slotsTotal,
    order_id: orderId,
    provider,
    purchase_expires_at: purchaseExpiresAt,
  });

  if (error && (error as any).code === '23505') {
    return json({ ok: true, action: 'duplicate_ignored' }); // idempotencija
  }
  if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

  return json({ ok: true, action: 'entitlement_created' });
});
