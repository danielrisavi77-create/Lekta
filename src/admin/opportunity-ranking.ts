import type { OpportunityRow } from './admin-types';

export interface RankedOpportunityRow extends OpportunityRow {
  sample: 'enough' | 'low';
}

/**
 * Ne izmisljamo kompozitni "AI priority score". Redoslijed je dokaziv:
 * 1) signali s barem 20 opažanja, 2) veci udio zahvacenih, 3) veci broj zahvacenih.
 * Mali uzorak ostaje vidljiv, ali ide iza stabilnijeg signala.
 */
export function rankOpportunityRows(rows: readonly OpportunityRow[]): RankedOpportunityRow[] {
  return rows
    .map((row) => ({ ...row, sample: row.denominator >= 20 ? 'enough' as const : 'low' as const }))
    .sort((a, b) => {
      if (a.sample !== b.sample) return a.sample === 'enough' ? -1 : 1;
      const ar = a.ratePct ?? -1;
      const br = b.ratePct ?? -1;
      if (ar !== br) return br - ar;
      return b.affected - a.affected;
    });
}
