import type { OpportunityBucket, OpportunityRow } from './admin-types';

export interface RankedOpportunityRow extends OpportunityRow {
  sample: 'enough' | 'low';
  evidence: 'direct' | 'proxy';
}

/**
 * Ne izmisljamo kompozitni "AI priority score". Redoslijed je dokaziv:
 * 1) izravna mjerenja prije event-count proxyja, 2) barem 20 opažanja,
 * 3) veci udio zahvacenih, 4) veci broj zahvacenih.
 * Proxy nikad ne postaje "najveca prilika" samo zato sto mu je sirovi postotak veci.
 */
export function rankOpportunityRows(rows: readonly OpportunityRow[]): RankedOpportunityRow[] {
  return rows
    .map((row) => ({
      ...row,
      sample: row.denominator >= 20 ? 'enough' as const : 'low' as const,
      evidence: row.basis === 'event_count_proxy' ? 'proxy' as const : 'direct' as const,
    }))
    .sort((a, b) => {
      // Event-count proxy nije jednako jak dokaz kao signal vezan uz jednu analizu/profil/repair run.
      // Bez ove granice bi npr. 80% paywall event-gapa mogao postati "najjaci signal" ispred
      // stvarnog 30% manual gapa, iako prvi nije cohort mjera.
      if (a.evidence !== b.evidence) return a.evidence === 'direct' ? -1 : 1;
      if (a.sample !== b.sample) return a.sample === 'enough' ? -1 : 1;
      const ar = a.ratePct ?? -1;
      const br = b.ratePct ?? -1;
      if (ar !== br) return br - ar;
      return b.affected - a.affected;
    });
}


export interface OpportunityMeasurementHealth {
  kind: 'no-data' | 'healthy' | 'partial';
  analysisDelta: number;
  structureDelta: number;
  repairNoOpDelta: number;
}

/**
 * Neovisni brojači dokazuju da instrumentation nije utihnuo.
 * Exact parity je namjerno strog: kratki prijelaz preko granice vremenskog prozora može dati
 * privremeni mismatch, ali to je bolji ishod nego proglasiti nepotpun report zelenim.
 */
export function opportunityMeasurementHealth(
  bucket: Pick<
    OpportunityBucket,
    'analysisCompletedEvents' | 'opportunityEvents' | 'structureGapItems' | 'structureBreakdownItems'
    | 'repairNoOpSummaryEvents' | 'repairNoOpSummaryItems' | 'repairNoOpItems'
  >,
): OpportunityMeasurementHealth {
  const analysisDelta = bucket.opportunityEvents - bucket.analysisCompletedEvents;
  const structureDelta = bucket.structureBreakdownItems - bucket.structureGapItems;
  const repairNoOpDelta = bucket.repairNoOpItems - bucket.repairNoOpSummaryItems;
  const hasAnalysis = bucket.analysisCompletedEvents > 0 || bucket.opportunityEvents > 0
    || bucket.structureGapItems > 0 || bucket.structureBreakdownItems > 0;
  const hasRepairNoOp = bucket.repairNoOpSummaryEvents > 0
    || bucket.repairNoOpSummaryItems > 0 || bucket.repairNoOpItems > 0;
  if (!hasAnalysis && !hasRepairNoOp) {
    return { kind: 'no-data', analysisDelta, structureDelta, repairNoOpDelta };
  }
  return {
    kind: analysisDelta === 0 && structureDelta === 0 && repairNoOpDelta === 0 ? 'healthy' : 'partial',
    analysisDelta,
    structureDelta,
    repairNoOpDelta,
  };
}
