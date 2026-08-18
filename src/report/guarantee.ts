/**
 * Garancija povrata + coverage tier (MONETIZATION_PLAN.md sekcije 3, 10). Ciste, testabilne
 * odluke; intake i odluka o povratu su u Edge Functionu / admin toku.
 *
 * Garancija vrijedi samo za T2/T3 (verificirano): ako referada vrati rad zbog pravila koje
 * je Lekta oznacila prolaznim, povrat + besplatan rucni popravak. Uvjeti ulaza: slot tier>=2
 * u trenutku vezivanja, claim unutar 30 dana od bound_at, dokaz i sporni rule_key.
 */

export const GUARANTEE_TIER_MIN = 2;
export const GUARANTEE_WINDOW_DAYS = 30;

/** Coverage tier iz statusa profila: verified=2 (T2/T3), partial=1 (T1), ostalo=0 (T0). */
export function coverageTierForStatus(status: string | null | undefined): number {
  switch (status) {
    case 'verified':
      return 2;
    case 'partial':
      return 1;
    default:
      return 0;
  }
}

/**
 * Vrijedi li garancija za profil ovog statusa.
 *
 * Postoji da UI ne mora sam ponavljati pravilo "T2/T3". Do 2026-08-16 je uvjet bio naveden samo
 * u cjeniku i modalu kao "T2/T3", a badge profila je govorio "Potvrđeni profil" / "Službene
 * tehničke provjere": korisnik je sam morao povezati te dvije oznake, pa na `partial` profilu
 * nikad nije doznao da za njega garancija ne vrijedi.
 */
export function guaranteeAppliesToStatus(status: string | null | undefined): boolean {
  return coverageTierForStatus(status) >= GUARANTEE_TIER_MIN;
}

/** Jedna recenica za korisnika, uz badge profila. */
export function guaranteeStatusNote(status: string | null | undefined): string {
  return guaranteeAppliesToStatus(status)
    ? `Garancija vrijedi za ovaj profil: ako referada vrati rad zbog bodovanog pravila koje smo označili prolaznim, vraćamo novac (rok ${GUARANTEE_WINDOW_DAYS} dana).`
    : 'Za ovaj profil garancija ne vrijedi, jer njegova pravila još nisu u cijelosti potvrđena prema službenom izvoru. Provjera i popravak rade normalno.';
}

export type GuaranteeRejection =
  | 'tier_too_low'
  | 'window_expired'
  | 'missing_evidence'
  | 'missing_rule_key';

export interface GuaranteeClaimContext {
  /** coverage_tier snimljen na slotu pri vezivanju. */
  coverageTier: number;
  boundAtMs: number;
  nowMs: number;
  hasEvidence: boolean;
  ruleKey: string | null;
}

export type GuaranteeDecision = { ok: true } | { ok: false; reason: GuaranteeRejection };

/** Ulazni gate za garancijski zahtjev (kriterij 14.9). Odluka o povratu je poslije, rucna. */
export function canFileGuaranteeClaim(ctx: GuaranteeClaimContext): GuaranteeDecision {
  if (ctx.coverageTier < GUARANTEE_TIER_MIN) return { ok: false, reason: 'tier_too_low' };
  const ageDays = (ctx.nowMs - ctx.boundAtMs) / (24 * 3600 * 1000);
  if (ageDays > GUARANTEE_WINDOW_DAYS) return { ok: false, reason: 'window_expired' };
  if (!ctx.hasEvidence) return { ok: false, reason: 'missing_evidence' };
  if (!ctx.ruleKey) return { ok: false, reason: 'missing_rule_key' };
  return { ok: true };
}
