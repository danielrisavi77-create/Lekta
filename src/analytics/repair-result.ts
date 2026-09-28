import { emitRepairNoOpSignals } from './opportunity-emit';
import { opportunityContextFor, type OpportunityGapContext } from './opportunity-signal';

export { opportunityContextFor };

type TrackRepairEvent = (event: string, data?: Record<string, unknown>) => unknown;

/**
 * Uspjesan repair rezultat (serverski ili lokalni put, nakon integrity gatea).
 *
 * `repair_result_ok` je NEOVISNI brojac: salje ga ovaj pozivatelj, ne emitter, pa se utihli ili
 * dvostruki `repair_noop_summary` vidi kao parity razlika u Opportunity Reportu (Codex V3-02 na #163).
 */
export function trackRepairResultOk(
  track: TrackRepairEvent,
  skippedReasons: unknown,
  context: OpportunityGapContext = {},
): void {
  void track('repair_result_ok', { ...context });
  emitRepairNoOpSignals(track, skippedReasons, context);
}
