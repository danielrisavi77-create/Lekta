import {
  opportunitySignalForEvent,
  repairNoOpSignals,
  repairNoOpSummarySignal,
  structureGapSignalsForEvent,
  type OpportunityAnalysisLike,
  type OpportunityGapContext,
} from './opportunity-signal';

type TrackOpportunityEvent = (event: string, data?: Record<string, unknown>) => unknown;

/** Opportunity dijagnostika nakon uspjesne analize; product-journey event ostaje u app.ts. */
export function emitAnalysisOpportunitySignals(
  track: TrackOpportunityEvent,
  result: OpportunityAnalysisLike,
  profileStatus: string,
): void {
  void track('opportunity_summary', opportunitySignalForEvent(result, profileStatus));
  for (const gap of structureGapSignalsForEvent(result)) void track('analysis_structure_gap', gap);
}

/** Jedan neovisni summary + detaljni sigurni enum breakdown za parity dokaz. */
export function emitRepairNoOpSignals(
  track: TrackOpportunityEvent,
  skippedReasons: unknown,
  context: OpportunityGapContext = {},
): void {
  void track('repair_noop_summary', repairNoOpSummarySignal(skippedReasons, context));
  for (const signal of repairNoOpSignals(skippedReasons, context)) void track('repair_noop_reason', signal);
}
