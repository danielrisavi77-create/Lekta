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

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

const MAX_REWARDED_PER_MONTH = 10;
const REWARD_WINDOW_DAYS = 90;
const isoAfterDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/**
 * TRAJNE ODLUKE (Codex pregled PR #217, M2): ishod koji se ponovnim pokusajem ne mijenja, pa obveza
 * `referrer_reward` u bonus_outboxu smije zavrsiti kao `done` s tim razlogom. `no_pending_referral`
 * pokriva i kupca bez preporuke i vec nagradjenu preporuku (status vise nije friend_rewarded).
 * `already_granted` (nas pregled M2): insert prava je pao na 23505 (jedinstveni order_id vec
 * postoji), a idempotentno dovrsavanje azuriranja referral_signups nije bilo moguce; pravo je vec
 * izdano, ponovni pokusaj ga ne bi promijenio, pa obveza zavrsava kao done s ovim razlogom.
 */
const TRAJNI_RAZLOZI = new Set(['no_pending_referral', 'ip_match_fraud', 'monthly_cap_reached', 'already_granted']);

/**
 * Smije li se obveza nagrade zatvoriti. `grant_failed`, `error` i svaki nepoznat oblik rezultata NISU
 * zatvaranje: obveza ostaje `pending` i radnik (process-bonus-outbox) je ponovi. Prije je rezultat
 * zanemaren, pa je prolazan pad upisa nagrade zavrsavao kao `done` i nagrada se nikad nije ponovila.
 */
export function referrerRewardSettlement(result: unknown): { settled: boolean; reason: string } {
  if (typeof result !== 'object' || result === null) return { settled: false, reason: 'nepoznat_ishod' };
  const r = result as { granted?: unknown; reason?: unknown };
  if (r.granted === true) return { settled: true, reason: 'granted' };
  const reason = typeof r.reason === 'string' && r.reason !== '' ? r.reason : 'nepoznat_ishod';
  return { settled: r.granted === false && TRAJNI_RAZLOZI.has(reason), reason };
}

export async function tryGrantReferrerReward(
  supabase: SupabaseClient,
  buyerUserId: string,
  buyerWorkType: string,
  buyerOrderId: string,
): Promise<{ granted: boolean; reason?: string }> {
  try {
    const { data: signup, error: signupError } = await supabase
      .from('referral_signups')
      .select('*')
      .eq('referred_user_id', buyerUserId)
      .eq('status', 'friend_rewarded')
      .maybeSingle();

    // Pad citanja nije "nema preporuke" (trajno), nego prolazna greska: obveza se ponavlja (M2).
    if (signupError) return { granted: false, reason: 'error' };
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
    const rewardOrderId = `reward:ref-signup:${signup.id}`;
    const { data: ent, error: entError } = await supabase
      .from('entitlements')
      .insert({
        user_id: signup.referrer_user_id,
        work_type: buyerWorkType,
        slots_total: 1,
        product_id: `slot_${buyerWorkType}`,
        order_id: rewardOrderId,
        provider: 'internal',
        purchase_expires_at: isoAfterDays(REWARD_WINDOW_DAYS),
      })
      .select('id')
      .single();

    if (entError) {
      // 23505 = unique(provider, order_id) je vec pogodjen: pravo je vec izdano (raniji pokusaj),
      // samo referral_signups nije nuzno dovrsen. Procitaj postojece pravo i dovrsi azuriranje
      // idempotentno umjesto da javis grant_failed i ponavljas insert zauvijek.
      if ((entError as { code?: string }).code === '23505') {
        const { data: existingEnt, error: existingEntError } = await supabase
          .from('entitlements')
          .select('id')
          .eq('provider', 'internal')
          .eq('order_id', rewardOrderId)
          .maybeSingle();

        if (existingEntError || !existingEnt) return { granted: false, reason: 'already_granted' };

        const { error: completeError } = await supabase
          .from('referral_signups')
          .update({
            status: 'rewarded',
            converted_at: new Date().toISOString(),
            rewarded_at: new Date().toISOString(),
            referrer_reward_entitlement_id: existingEnt.id,
            converted_order_id: buyerOrderId,
          })
          .eq('id', signup.id);

        if (completeError) return { granted: false, reason: 'already_granted' };
        return { granted: true };
      }
      return { granted: false, reason: 'grant_failed' };
    }
    if (!ent) return { granted: false, reason: 'grant_failed' };

    const { error: updateError } = await supabase
      .from('referral_signups')
      .update({
        status: 'rewarded',
        converted_at: new Date().toISOString(),
        rewarded_at: new Date().toISOString(),
        referrer_reward_entitlement_id: ent.id,
        converted_order_id: buyerOrderId,
      })
      .eq('id', signup.id);

    // Pravo je upisano, ali azuriranje signupa nije: NE javljaj tiho granted:true bez traga. Vrati
    // gresku da se obveza ponovi; ponovni insert tada pada na 23505 i ide kroz gornju granu.
    if (updateError) return { granted: false, reason: 'error' };

    return { granted: true };
  } catch (_e) {
    // Fail-safe: referral nagrada nikad ne smije srusiti webhook obradu kupnje.
    return { granted: false, reason: 'error' };
  }
}
