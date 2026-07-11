// Lekta Edge Function: create-checkout (Deno, Supabase).
// Spec: docs/MONETIZATION_PLAN.md sekcija 5, korak 15.2. Merchant of Record: Lemon Squeezy.
//
// Ulaz: { productId, referralCode? }. Auth (Supabase JWT) je obavezan (401 bez njega).
// Cijena je serverska odluka: klijent salje samo productId, server cita `products` (0002).
// Partner proizvod trazi aktivan partner_accounts red (403 inace; tablica dolazi u koraku 4).
// Tanki omotac: odluka i tijelo LS poziva su u testiranom coreu src/report/checkout.ts.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import { resolveCheckout, buildLemonSqueezyCheckout } from '../../../src/report/checkout.ts';
import { mapProductRow } from '../../../src/catalog/products-catalog.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const LS_API_KEY = Deno.env.get('LEMONSQUEEZY_API_KEY') ?? '';
const LS_STORE_ID = Deno.env.get('LEMONSQUEEZY_STORE_ID') ?? '';
const REDIRECT_URL = Deno.env.get('CHECKOUT_REDIRECT_URL') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
 try {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // auth: Supabase JWT obavezan (sekcija 5, korak 1)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  // input guard (P0 5.4): odbij predimenzioniran payload prije parsiranja
  const MAX_BODY = 32 * 1024;
  const clen = Number(req.headers.get('content-length') ?? '0');
  if (clen && clen > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'payload_too_large' }, 413);
  let body: any = {};
  try { body = JSON.parse(raw); } catch { body = {}; }
  const productId = String(body.productId ?? '');
  const referralCode = body.referralCode ? String(body.referralCode) : null;
  if (!productId) return json({ error: 'bad_request' }, 400);

  // consent gate (P0 1-1): digitalni pass se ne prodaje bez pristanka na trenutnu isporuku
  // i odricanja od 14-dnevnog prava na odustanak. Tekst + timestamp trajno se biljeze.
  const consent = body.consent;
  if (!consent || consent.immediateDelivery !== true || consent.withdrawalWaived !== true || !String(consent.text ?? '').trim()) {
    return json({ error: 'consent_required' }, 400);
  }
  let consentedAt = new Date().toISOString();
  if (consent.timestamp) {
    const t = new Date(consent.timestamp);
    if (!Number.isNaN(t.getTime())) consentedAt = t.toISOString();
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // proizvod iz kataloga (jedina istina o cijenama, sekcija 5 korak 2)
  const { data: prow } = await admin.from('products').select('*').eq('id', productId).eq('active', true).maybeSingle();
  const product = prow ? mapProductRow(prow as Record<string, unknown>) : null;

  // partner grana (sekcija 5 korak 3): aktivan partner racun je uvjet
  let isPartnerActive = false;
  if (product?.audience === 'partner') {
    const { data: pa } = await admin
      .from('partner_accounts')
      .select('status')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    isPartnerActive = !!pa;
  }

  const resolution = resolveCheckout(product, { isPartnerActive });
  if (!resolution.ok) return json({ error: resolution.error }, resolution.status);
  if (!product!.morProductId) return json({ error: 'product_not_mapped' }, 409); // popuni products.mor_product_id

  // trajno zabiljezi pristanak PRIJE redirecta na placanje (P0 1-1). Ako se ne moze zapisati,
  // ne saljemo korisnika na placanje bez zapisanog pristanka.
  const { error: consentErr } = await admin.from('checkout_consents').insert({
    user_id: user.id,
    product_id: productId,
    immediate_delivery: true,
    withdrawal_waived: true,
    consent_text: String(consent.text).slice(0, 2000),
    terms_version: consent.termsVersion ? String(consent.termsVersion).slice(0, 64) : null,
    consented_at: consentedAt,
  });
  if (consentErr) return json({ error: 'consent_not_recorded' }, 500);

  // Lemon Squeezy checkout create (mor_product_id = LS variant id)
  const lsBody = buildLemonSqueezyCheckout({
    storeId: LS_STORE_ID,
    variantId: product!.morProductId,
    userId: user.id,
    productId,
    referralCode,
    redirectUrl: REDIRECT_URL || undefined,
  });
  const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
      Authorization: `Bearer ${LS_API_KEY}`,
    },
    body: JSON.stringify(lsBody),
  });
  if (!lsRes.ok) return json({ error: 'checkout_failed', detail: await lsRes.text() }, 502);
  const lsJson = (await lsRes.json()) as any;
  const checkoutUrl = lsJson?.data?.attributes?.url;
  if (!checkoutUrl) return json({ error: 'no_checkout_url' }, 502);

  return json({ checkoutUrl });
 } catch (e) {
  console.error('[create-checkout]', e); // Supabase Edge Function logovi = error tracking (P0 8-1)
  return json({ error: 'internal' }, 500);
 }
});
