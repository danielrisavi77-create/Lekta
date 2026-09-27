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


type OpportunityHealthKind = 'no-data' | 'healthy' | 'partial';

export interface OpportunityMeasurementHealth {
  /** Ukupno: partial ako je ijedna povrsina partial; healthy samo ako su sve postojece zdrave. */
  kind: OpportunityHealthKind;
  /** Zdravlje analiticke telemetrije (analysis_completed, opportunity_summary, structure breakdown). */
  analysis: OpportunityHealthKind;
  /** Zdravlje repair telemetrije (repair_result_ok, repair_noop_summary, repair_noop_reason). */
  repair: OpportunityHealthKind;
  analysisDelta: number;
  structureDelta: number;
  repairNoOpDelta: number;
  /** repair_noop_summary dogadjaja minus repair_result_ok dogadjaja od V3 epohe. */
  repairAttemptDelta: number;
  /** Broj (profileId, workType) obuhvata u kojima summary i breakdown ne odgovaraju. */
  scopeMismatches: number;
}

type HealthInput = Pick<
  OpportunityBucket,
  'analysisCompletedEvents' | 'opportunityEvents' | 'structureGapItems' | 'structureBreakdownItems'
  | 'repairAttemptEvents' | 'repairNoOpSummaryEvents' | 'repairNoOpSummaryItems' | 'repairNoOpItems'
  | 'scopeParityMismatches'
>;

/**
 * Neovisni brojači dokazuju da instrumentation nije utihnuo.
 * Exact parity je namjerno strog: kratki prijelaz preko granice vremenskog prozora može dati
 * privremeni mismatch, ali to je bolji ishod nego proglasiti nepotpun report zelenim.
 *
 * Parity vrijedi ukupno I po (profileId, workType): isti zbroj s krivo pripisanim profilom nije
 * zdravo mjerenje. Analiza i repair imaju zasebno zdravlje: repair-only prozor bez ijedne analize
 * nije dokaz ranga analitickih signala (vidi `strongestMeasuredOpportunity`).
 */
export function opportunityMeasurementHealth(bucket: HealthInput): OpportunityMeasurementHealth {
  const analysisDelta = bucket.opportunityEvents - bucket.analysisCompletedEvents;
  const structureDelta = bucket.structureBreakdownItems - bucket.structureGapItems;
  const repairNoOpDelta = bucket.repairNoOpItems - bucket.repairNoOpSummaryItems;
  const repairAttemptDelta = bucket.repairNoOpSummaryEvents - bucket.repairAttemptEvents;
  const mismatches = bucket.scopeParityMismatches ?? [];
  const structureScope = mismatches.filter((m) => m.surface === 'structure').length;
  const repairScope = mismatches.length - structureScope;

  const hasAnalysis = bucket.analysisCompletedEvents > 0 || bucket.opportunityEvents > 0
    || bucket.structureGapItems > 0 || bucket.structureBreakdownItems > 0 || structureScope > 0;
  const hasRepair = bucket.repairAttemptEvents > 0 || bucket.repairNoOpSummaryEvents > 0
    || bucket.repairNoOpSummaryItems > 0 || bucket.repairNoOpItems > 0 || repairScope > 0;

  const analysis: OpportunityHealthKind = !hasAnalysis
    ? 'no-data'
    : analysisDelta === 0 && structureDelta === 0 && structureScope === 0 ? 'healthy' : 'partial';
  const repair: OpportunityHealthKind = !hasRepair
    ? 'no-data'
    : repairNoOpDelta === 0 && repairAttemptDelta === 0 && repairScope === 0 ? 'healthy' : 'partial';
  const kind: OpportunityHealthKind = analysis === 'partial' || repair === 'partial'
    ? 'partial'
    : analysis === 'healthy' || repair === 'healthy' ? 'healthy' : 'no-data';

  return {
    kind,
    analysis,
    repair,
    analysisDelta,
    structureDelta,
    repairNoOpDelta,
    repairAttemptDelta,
    scopeMismatches: mismatches.length,
  };
}

/** Prvi rangirani red s izmjerenom stopom; prazan nazivnik nije 0 %, nego nema signala. */
export function strongestMeasuredOpportunity<T extends OpportunityRow>(ranked: readonly T[]): T | undefined {
  return ranked.find((row) => row.ratePct != null && row.denominator > 0);
}
