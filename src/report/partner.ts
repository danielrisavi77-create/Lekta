/**
 * Partner program core (MONETIZATION_PLAN.md sekcija 7). Ciste, testabilne odluke koje
 * Edge Functions zovu; DB I/O je u omotacima.
 *
 * DAILY_CAP (sekcija 3, amandman): retail 30 generacija/24h, aktivan partner 100 (ili
 * njegov daily_cap). Neaktivan/nepostojaci partner pada na retail cap.
 */

export interface PartnerAccountRow {
  status: 'pending' | 'active' | 'suspended' | string;
  dailyCap: number;
}

export function isPartnerActive(partner: PartnerAccountRow | null | undefined): boolean {
  return !!partner && partner.status === 'active';
}

/** Cap generacija u 24h: aktivan partner dobiva svoj daily_cap, inace retail default. */
export function resolveDailyCap(
  partner: PartnerAccountRow | null | undefined,
  defaultCap: number,
): number {
  return isPartnerActive(partner) ? partner!.dailyCap : defaultCap;
}
