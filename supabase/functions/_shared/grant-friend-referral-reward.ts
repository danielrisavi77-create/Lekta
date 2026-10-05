// supabase/functions/_shared/grant-friend-referral-reward.ts
//
// UGRADI u generate-report, TOCNO na mjesto gdje bi inace vratio 402 payment_required:
//
//   let decision = await decide();
//   if (decision.decision === 'payment_required') {
//     const friend = await tryGrantFriendReferralReward(admin, user.id, workType, friendRewardCaller(user));
//     if (friend.granted) decision = await decide();   // sad postoji entitlement -> new_slot
//   }
//   if (decision.decision === 'payment_required') { ... return 402 }
//
// NAGRADA = interni entitlement (1 slot toga work_typea), isti obrazac kao grant_rulebook_reward
// (0006) i referralRewardEntitlement (webhook-mor). NAMJERNO ne coupon_grants: to je popust-kupon
// tablica (code NOT NULL, reason CHECK), a generate-report gleda iskljucivo entitlements/slots.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.110.2';

const REWARD_WINDOW_DAYS = 90;
const isoAfterDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** Server-side identitet pozivatelja (iz `auth.getUser`), ne iz tijela zahtjeva. */
export interface FriendRewardCaller {
  isAnonymous: boolean;
}

/**
 * Pozivatelj iz Auth korisnika. Samo izricit `is_anonymous === false` znaci pravi racun; nepoznato
 * (undefined ili null, npr. drukciji oblik odgovora Auth usluge) se tretira kao anonimno, pa se
 * slot u sumnji NE dodjeljuje (T84 RF-1A).
 */
export function friendRewardCaller(user: { is_anonymous?: boolean | null }): FriendRewardCaller {
  return { isAnonymous: user.is_anonymous !== false };
}

export async function tryGrantFriendReferralReward(
  supabase: SupabaseClient,
  userId: string,
  workType: string,
  caller: FriendRewardCaller,
): Promise<{ granted: boolean; reason?: string }> {
  // T84 RF-1: anonimni Auth racun (uloga authenticated, is_anonymous=true) nastaje bez e-maila i
  // captche, pa bi svaki novi anonimni racun s istim kodom dobio placeni slot. Isto pravilo vec
  // vrijedi za nagradu preporucitelju (grant-referrer-reward.ts, ineligible_buyer). Signup ostaje
  // u stanju signed_up, pa racun nakon nadogradnje na pravi (e-mail) dobiva nagradu.
  if (caller.isAnonymous !== false) return { granted: false, reason: 'ineligible_anonymous' };

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
