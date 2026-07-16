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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';
import {
  verifyLemonSignature,
  parseLemonEvent,
  isoAfterDays,
  isPassProduct,
  makePassCouponCode,
  PASS_COUPON_VALID_DAYS,
  buildEntitlementInsert,
  type LemonEvent,
} from '../../../src/report/webhook.ts';
import { mapProductRow } from '../../../src/catalog/products-catalog.ts';
import {
  validateReferral,
  referralRewardEntitlement,
  rewardIsPullable,
  semesterStart,
  REFERRAL_WELCOME_DISCOUNT,
} from '../../../src/report/referral.ts';
import { tryGrantReferrerReward } from '../_shared/grant-referrer-reward.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('MOR_WEBHOOK_SECRET') ?? '';
const PROVIDER = 'lemonsqueezy';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// Razrijesi referrer iz koda. Partner kodovi u partner_accounts.referral_code.
// TODO(integracija): registar retail korisnickih kodova (zasad samo partnerski).
async function resolveReferrer(admin: any, code: string): Promise<string | null> {
  const { data } = await admin.from('partner_accounts').select('user_id').eq('referral_code', code).maybeSingle();
  return data?.user_id ?? null;
}

// Atribucija referala (sekcija 8): tek uz TEK kreiran entitlement (pozivatelj to jamci).
async function attributeReferral(admin: any, ev: LemonEvent): Promise<void> {
  const referrerUserId = await resolveReferrer(admin, ev.referralCode);
  if (!referrerUserId) return; // nepoznat kod

  // referred smije imati referral samo na PRVU kupnju (bez ranijeg entitlementa osim ovog ordera)
  const { count: prior } = await admin
    .from('entitlements')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ev.userId)
    .neq('order_id', ev.orderId);

  // krediti referrera u tekucem semestru (cap 5)
  const { count: credits } = await admin
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_user_id', referrerUserId)
    .eq('status', 'credited')
    .gte('credited_at', semesterStart(Date.now()));

  const decision = validateReferral({
    referrerUserId,
    referredUserId: ev.userId,
    referredHasPriorEntitlement: (prior ?? 0) > 0,
    referrerCreditsThisSemester: credits ?? 0,
  });
  if (!decision.ok) {
    console.warn('webhook-mor referral rejected', { reason: decision.reason, orderId: ev.orderId });
    return;
  }

  const { data: ref } = await admin
    .from('referrals')
    .insert({
      referrer_user_id: referrerUserId,
      referred_user_id: ev.userId,
      code: ev.referralCode,
      status: 'credited',
      converted_order_id: ev.orderId,
      credited_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  // nagrada referreru: interni entitlement (1 seminarski slot); unique(provider,order_id) stiti od duplog
  const reward = referralRewardEntitlement(ref.id);
  await admin.from('entitlements').insert({
    user_id: referrerUserId,
    work_type: reward.workType,
    slots_total: reward.slotsTotal,
    product_id: reward.productId,
    order_id: reward.orderId,
    provider: reward.provider,
    purchase_expires_at: isoAfterDays(Date.now(), 90),
  });

  // welcome kupon za referred (zapis; primjena -20% na LS checkoutu je integracija)
  await admin.from('coupon_grants').insert({
    user_id: ev.userId,
    code: `WELCOME-${ev.referralCode}`,
    reason: 'referral_welcome',
    source_order_id: ev.orderId,
    expires_at: isoAfterDays(Date.now(), 120),
  });
  void REFERRAL_WELCOME_DISCOUNT; // -20% se postavlja u LS discount konfiguraciji (TODO)
}

// Refund izvorne kupnje povlaci NEPOTROSENU referral nagradu (potrosenu pusti, false-allow).
async function pullReferralReward(admin: any, orderId: string): Promise<void> {
  const { data: refs } = await admin.from('referrals').select('id').eq('converted_order_id', orderId);
  for (const r of refs ?? []) {
    const { data: ent } = await admin
      .from('entitlements')
      .select('id, slots_used')
      .eq('provider', 'internal')
      .eq('order_id', `reward:referral:${r.id}`)
      .maybeSingle();
    if (ent && rewardIsPullable(ent.slots_used)) {
      await admin.from('entitlements').update({ status: 'void' }).eq('id', ent.id);
    }
  }
}

// Isto za "pozovi-prijatelja" nagradu (0013): refund kupnje koja je okinula preporuciteljevu
// nagradu povlaci tu nagradu ako je NEPOTROSENA (potrosenu pusti, false-allow, 6.7). Precizno preko
// converted_order_id; status signupa se vraca na 'converted' pa vise ne trosi mjesecni strop.
async function pullReferralSignupReward(admin: any, orderId: string): Promise<void> {
  const { data: signups } = await admin
    .from('referral_signups')
    .select('id, referrer_reward_entitlement_id')
    .eq('converted_order_id', orderId)
    .eq('status', 'rewarded');
  for (const s of signups ?? []) {
    if (!s.referrer_reward_entitlement_id) continue;
    const { data: ent } = await admin
      .from('entitlements')
      .select('id, slots_used')
      .eq('id', s.referrer_reward_entitlement_id)
      .maybeSingle();
    if (ent && rewardIsPullable(ent.slots_used)) {
      await admin.from('entitlements').update({ status: 'void' }).eq('id', ent.id);
      await admin.from('referral_signups').update({ status: 'converted' }).eq('id', s.id);
    }
  }
}

Deno.serve(async (req: Request) => {
 try {
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
    await pullReferralReward(admin, ev.orderId); // povuci nepotrosenu referral nagradu (0005, 6.7)
    await pullReferralSignupReward(admin, ev.orderId); // isto za pozovi-prijatelja nagradu (0013)
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
  const { error } = await admin
    .from('entitlements')
    .insert(buildEntitlementInsert(product, ev, PROVIDER, Date.now()));
  if (error && (error as any).code === '23505') return json({ ok: true, action: 'duplicate_ignored' });
  if (error) return json({ error: 'insert_failed', detail: error.message }, 500);

  // AUD-28: entitlement je JEZGRA i vec je kreiran (idempotentan preko unique(provider,order_id)).
  // Post-entitlement bonusi (referrer nagrada, pass kupon, referral atribucija) NE SMIJU srusiti
  // handler u 500 ako transientno padnu: LS bi retryjao, pogodio 23505 na entitlementu gore i vratio
  // 'duplicate_ignored', pa bi kupon/atribucija za taj order ostali TRAJNO nekreirani. Zato svaki
  // bonus lovi svoju gresku i nastavlja (logira se), a jezgra ostaje uspjesna (200). Pred-entitlement
  // greske i dalje idu na top-level catch -> 500 -> LS retry (tada entitlement bude kreiran).

  // Referral (pozovi-prijatelja, 0013): kupceva placena kupnja nagraduje preporucitelja internim
  // entitlementom. Fail-safe (interni try/catch); ZASEBAN od attributeReferral (0005 program).
  await tryGrantReferrerReward(admin, ev.userId, product.workType, ev.orderId);

  // pass bonus kupon (6.5): samo uz tek kreiran entitlement (ne na duplikat)
  if (isPassProduct(product.kind)) {
    try {
      await admin.from('coupon_grants').insert({
        user_id: ev.userId,
        code: makePassCouponCode(ev.orderId),
        reason: 'pass_bonus',
        source_order_id: ev.orderId,
        expires_at: isoAfterDays(Date.now(), PASS_COUPON_VALID_DAYS),
      });
    } catch (e) {
      console.error('webhook-mor pass_coupon_failed', { orderId: ev.orderId, error: String(e) });
    }
    // TODO(integracija): kreiraj -20% Lemon Squeezy discount (vrijedi na slot_zavrsni/slot_diplomski)
    // i posalji kod korisniku mailom. Zakljucaj da ne vrijedi na partner proizvode (sekcija 7).
  }

  // referral atribucija (sekcija 6.6 / 8): samo uz tek kreiran entitlement (duplikat je vec izasao gore)
  if (ev.referralCode) {
    try {
      await attributeReferral(admin, ev);
    } catch (e) {
      console.error('webhook-mor attribute_referral_failed', { orderId: ev.orderId, error: String(e) });
    }
  }

  return json({ ok: true, action: 'entitlement_created' });
 } catch (e) {
  // Pred-entitlement greska (potpis, parsiranje, entitlement insert): vrati 500 pa LS retryja i
  // entitlement na kraju bude kreiran. Post-entitlement bonusi su vec ulovljeni gore, ne dolaze ovamo.
  console.error('[webhook-mor]', e);
  return json({ error: 'internal' }, 500);
 }
});
