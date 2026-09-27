import {
  opportunitySignalForEvent,
  repairNoOpSignals,
  structureGapSignalsForEvent,
  type OpportunityAnalysisLike,
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

/** Razloge repair no-opova šalje samo kao agregirane sigurne enum signale. */
export function emitRepairNoOpSignals(
  track: TrackOpportunityEvent,
  skippedReasons: unknown,
): void {
  for (const signal of repairNoOpSignals(skippedReasons)) void track('repair_noop_reason', signal);
}
