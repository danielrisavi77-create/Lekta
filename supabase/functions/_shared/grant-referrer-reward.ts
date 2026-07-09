// supabase/functions/_shared/grant-referrer-reward.ts
//
// UGRADI u webhook-mor, NAKON sto je entitlement uspjesno kreiran za kupca:
//
//   await tryGrantReferrerReward(admin, ev.userId, product.workType, ev.orderId);
//
// Fail-safe: nikad ne baca (obavijen u try/catch), tiho ne nagradi ako fraud/strop to zahtijevaju.
// NAGRADA = interni entitlement (1 slot kupceva work_typea), isti obrazac kao grant_rulebook_reward.
// NAMJERNO ne coupon_grants (popust-kupon tablica, ne slot).
//
// Fraud (salt): usporeduje referral_signups.referred_ip_hash s report_generations.ip_hash. Oba se
// sada racunaju kroz _shared/hash-ip.ts (ista ekstrakcija + IP_HASH_SALT) u redeem-referral-signup
// i generate-report, pa se vrijednosti poklapaju i provjera stvarno okida.
//
// buyerOrderId se biljezi u converted_order_id da refund te kupnje (webhook-mor refund grana)
// moze povuci nepotrosenu nagradu preporucitelju.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_REWARDED_PER_MONTH = 10;
const REWARD_WINDOW_DAYS = 90;
const isoAfterDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export async function tryGrantReferrerReward(
  supabase: SupabaseClient,
  buyerUserId: string,
  buyerWorkType: string,
  buyerOrderId: string,
): Promise<{ granted: boolean; reason?: string }> {
  try {
    const { data: signup } = await supabase
      .from('referral_signups')
      .select('*')
      .eq('referred_user_id', buyerUserId)
      .eq('status', 'friend_rewarded')
      .maybeSingle();

    if (!signup) return { granted: false, reason: 'no_pending_referral' };

    // Fraud: ista mreza je vjerojatno stvorila oba racuna. Usporedi referred_ip_hash (iz signupa)
    // s poznatim ip_hash vrijednostima PREPORUCITELJA iz report_generations. Blokiraj SAMO
    // preporuciteljevu nagradu; prijateljevo iskustvo je vec zavrseno i ostaje nepromijenjeno.
    const { data: referrerIpRows } = await supabase
      .from('report_generations')
      .select('ip_hash')
      .eq('user_id', signup.referrer_user_id)
      .not('ip_hash', 'is', null);

    const referrerIpHashes = new Set((referrerIpRows ?? []).map((r: { ip_hash: string }) => r.ip_hash));
    if (signup.referred_ip_hash && referrerIpHashes.has(signup.referred_ip_hash)) {
      await supabase.from('referral_signups').update({ status: 'fraud_blocked' }).eq('id', signup.id);
      return { granted: false, reason: 'ip_match_fraud' };
    }

    // Mjesecni strop nagradenih po preporucitelju.
    const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { count } = await supabase
      .from('referral_signups')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_user_id', signup.referrer_user_id)
      .eq('status', 'rewarded')
      .gte('rewarded_at', monthAgo);

    if ((count ?? 0) >= MAX_REWARDED_PER_MONTH) {
      // Prijatelj i dalje broji kao stvarna konverzija, samo bez nagrade iznad stropa.
      await supabase
        .from('referral_signups')
        .update({ status: 'converted', converted_at: new Date().toISOString(), converted_order_id: buyerOrderId })
        .eq('id', signup.id);
      return { granted: false, reason: 'monthly_cap_reached' };
    }

    // Interni entitlement = 1 slot kupceva work_typea. Idempotentno preko unique(provider, order_id).
    const { data: ent, error: entError } = await supabase
      .from('entitlements')
      .insert({
        user_id: signup.referrer_user_id,
        work_type: buyerWorkType,
        slots_total: 1,
        product_id: `slot_${buyerWorkType}`,
        order_id: `reward:ref-signup:${signup.id}`,
        provider: 'internal',
        purchase_expires_at: isoAfterDays(REWARD_WINDOW_DAYS),
      })
      .select('id')
      .single();

    if (entError || !ent) return { granted: false, reason: 'grant_failed' };

    await supabase
      .from('referral_signups')
      .update({
        status: 'rewarded',
        converted_at: new Date().toISOString(),
        rewarded_at: new Date().toISOString(),
        referrer_reward_entitlement_id: ent.id,
        converted_order_id: buyerOrderId,
      })
      .eq('id', signup.id);

    return { granted: true };
  } catch (_e) {
    // Fail-safe: referral nagrada nikad ne smije srusiti webhook obradu kupnje.
    return { granted: false, reason: 'error' };
  }
}
