// supabase/functions/_shared/grant-friend-referral-reward.ts
//
// UGRADI u generate-report, TOCNO na mjesto gdje bi inace vratio 402 payment_required:
//
//   let decision = await decide();
//   if (decision.decision === 'payment_required') {
//     const friend = await tryGrantFriendReferralReward(admin, user.id, workType);
//     if (friend.granted) decision = await decide();   // sad postoji entitlement -> new_slot
//   }
//   if (decision.decision === 'payment_required') { ... return 402 }
//
// NAGRADA = interni entitlement (1 slot toga work_typea), isti obrazac kao grant_rulebook_reward
// (0006) i referralRewardEntitlement (webhook-mor). NAMJERNO ne coupon_grants: to je popust-kupon
// tablica (code NOT NULL, reason CHECK), a generate-report gleda iskljucivo entitlements/slots.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REWARD_WINDOW_DAYS = 90;
const isoAfterDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

export async function tryGrantFriendReferralReward(
  supabase: SupabaseClient,
  userId: string,
  workType: string,
): Promise<{ granted: boolean }> {
  // Prijatelj ima aktivan signup koji jos nije nagraden?
  const { data: signup } = await supabase
    .from('referral_signups')
    .select('id')
    .eq('referred_user_id', userId)
    .eq('status', 'signed_up')
    .maybeSingle();

  if (!signup) return { granted: false };

  // Interni entitlement = 1 slot ovog work_typea. Idempotentno preko unique(provider, order_id).
  const { data: ent, error: entError } = await supabase
    .from('entitlements')
    .insert({
      user_id: userId,
      work_type: workType,
      slots_total: 1,
      product_id: `slot_${workType}`,
      order_id: `reward:ref-friend:${signup.id}`,
      provider: 'internal',
      purchase_expires_at: isoAfterDays(REWARD_WINDOW_DAYS),
    })
    .select('id')
    .single();

  if (entError || !ent) return { granted: false };

  await supabase
    .from('referral_signups')
    .update({
      status: 'friend_rewarded',
      friend_rewarded_at: new Date().toISOString(),
      friend_reward_entitlement_id: ent.id,
    })
    .eq('id', signup.id);

  return { granted: true };
}
