/**
 * "Donesi pravilnik" core (MONETIZATION_PLAN.md sekcija 9). Ciste, testabilne odluke;
 * atomska dodjela je SQL grant_rulebook_reward (migracija 0006), admin je zove CLI/SQL.
 * Ovaj modul je kanonska specifikacija pravila (mora zrcaliti SQL funkciju).
 *
 * Nagrada: 1 besplatni slot odgovarajuceg work_typea (interni entitlement), TEK nakon
 * statusa 'verified', max 1 po korisniku ikad; duplikat/odbijen bez nagrade.
 */

const SLOT_WORK_TYPES = ['seminarski', 'zavrsni', 'diplomski', 'doktorski'];

/** Slot proizvod za work_type, ili null ako work_type nije naplatni tip. */
export function slotProductForWorkType(workType: string | null | undefined): string | null {
  return workType && SLOT_WORK_TYPES.includes(workType) ? `slot_${workType}` : null;
}

export interface RulebookRewardContext {
  status: string;
  rewardAlreadyGranted: boolean;
  /** Korisnik je vec ikad dobio rulebook nagradu (max 1 po korisniku). */
  userHasPriorRulebookReward: boolean;
  workType: string | null;
}

export type RulebookRejection =
  | 'not_verified'
  | 'already_granted'
  | 'user_cap'
  | 'invalid_work_type';

export type RulebookDecision =
  | { ok: true; productId: string }
  | { ok: false; reason: RulebookRejection };

/** Smije li se dodijeliti rulebook nagrada (kriterij 14.8). Zrcali SQL grant_rulebook_reward. */
export function canGrantRulebookReward(ctx: RulebookRewardContext): RulebookDecision {
  if (ctx.status !== 'verified') return { ok: false, reason: 'not_verified' };
  if (ctx.rewardAlreadyGranted) return { ok: false, reason: 'already_granted' };
  if (ctx.userHasPriorRulebookReward) return { ok: false, reason: 'user_cap' };
  const productId = slotProductForWorkType(ctx.workType);
  if (!productId) return { ok: false, reason: 'invalid_work_type' };
  return { ok: true, productId };
}

export interface RulebookReward {
  provider: 'internal';
  orderId: string;
  productId: string;
  workType: string;
  slotsTotal: 1;
}

/** Interni entitlement kojim se rulebook nagrada isplacuje. */
export function rulebookRewardEntitlement(submissionId: string, workType: string): RulebookReward {
  return {
    provider: 'internal',
    orderId: `reward:rulebook:${submissionId}`,
    productId: `slot_${workType}`,
    workType,
    slotsTotal: 1,
  };
}
