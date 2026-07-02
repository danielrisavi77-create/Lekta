/**
 * Referral core (MONETIZATION_PLAN.md sekcija 8). Ciste, testabilne odluke; DB I/O i
 * razrjesavanje koda -> referrer su u webhook omotacu.
 *
 * Pravila: novi korisnik s kodom dobiva -20% welcome kupon; referrer dobiva 1 besplatni
 * seminarski slot NAKON prve PLACENE kupnje referala. Nagrada je INTERNI entitlement
 * (provider='internal', order_id='reward:referral:{id}'), nikad gotovina. Anti-gaming:
 * self-referral, kod samo za korisnika bez ijednog prethodnog entitlementa, cap 5 kredita
 * po referreru po semestru, refund izvorne kupnje povlaci nepotrosenu nagradu.
 */

export const REFERRAL_WELCOME_DISCOUNT = 20;
export const REFERRAL_SEMESTER_CAP = 5;

export type ReferralRejection =
  | 'unknown_code'
  | 'self_referral'
  | 'not_first_purchase'
  | 'cap_reached';

export interface ReferralContext {
  /** Referrer razrijesen iz koda; null ako kod nije prepoznat. */
  referrerUserId: string | null;
  referredUserId: string;
  /** Referral vrijedi samo za korisnika bez ijednog prethodnog entitlementa. */
  referredHasPriorEntitlement: boolean;
  /** Broj vec dodijeljenih referral kredita ovom referreru u tekucem semestru. */
  referrerCreditsThisSemester: number;
}

export type ReferralDecision = { ok: true } | { ok: false; reason: ReferralRejection };

/** Odluka o valjanosti referala (kriterij 14.7). */
export function validateReferral(ctx: ReferralContext): ReferralDecision {
  if (!ctx.referrerUserId) return { ok: false, reason: 'unknown_code' };
  if (ctx.referrerUserId === ctx.referredUserId) return { ok: false, reason: 'self_referral' };
  if (ctx.referredHasPriorEntitlement) return { ok: false, reason: 'not_first_purchase' };
  if (ctx.referrerCreditsThisSemester >= REFERRAL_SEMESTER_CAP) return { ok: false, reason: 'cap_reached' };
  return { ok: true };
}

export interface RewardEntitlement {
  provider: 'internal';
  orderId: string;
  productId: 'slot_seminarski';
  workType: 'seminarski';
  slotsTotal: 1;
}

/** Interni entitlement kojim se nagrada isplacuje (1 seminarski slot). */
export function referralRewardEntitlement(referralId: string): RewardEntitlement {
  return {
    provider: 'internal',
    orderId: `reward:referral:${referralId}`,
    productId: 'slot_seminarski',
    workType: 'seminarski',
    slotsTotal: 1,
  };
}

/** Nepotrosena nagrada (slotsUsed===0) povlaci se na refund izvorne kupnje; potrosenu pusti (false-allow). */
export function rewardIsPullable(slotsUsed: number): boolean {
  return slotsUsed === 0;
}

/**
 * Pocetak tekuceg akademskog semestra (ISO), za cap po semestru. Zimski semestar krece
 * 1.10., ljetni 1.3. (sijecanj i veljaca pripadaju zimskom prosle godine).
 */
export function semesterStart(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0 = sijecanj
  if (m >= 9) return new Date(Date.UTC(y, 9, 1)).toISOString(); // listopad-prosinac -> 1.10.
  if (m <= 1) return new Date(Date.UTC(y - 1, 9, 1)).toISOString(); // sijecanj-veljaca -> 1.10. prosle
  return new Date(Date.UTC(y, 2, 1)).toISOString(); // ozujak-rujan -> 1.3.
}
