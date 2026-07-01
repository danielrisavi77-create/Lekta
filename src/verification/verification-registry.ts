/**
 * Registar verifikacije iz tipiziranog data/** (VERIFICATION_PIPELINE.md sekcije 7 i 8).
 * Tanak prolaz: import plus tipiziranje, bez logike (kao profile-registry.ts).
 */
import rawSources from '../../data/sources/source-registry.json';
import rawLedger from '../../data/verification/ledger.json';
import type { SourceEntry, VerificationLedgerEntry } from '../profiles/profile-schema';

export const SOURCE_REGISTRY = rawSources as unknown as SourceEntry[];

export const VERIFICATION_LEDGER = rawLedger as unknown as VerificationLedgerEntry[];

/** Izvor po id-u, ili undefined. */
export function findSource(id: string): SourceEntry | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}

/** Svi ledger zapisi za jedno pravilo, redom kojim su upisani (append-only). */
export function ledgerForRule(ruleId: string): VerificationLedgerEntry[] {
  return VERIFICATION_LEDGER.filter((e) => e.ruleId === ruleId);
}
