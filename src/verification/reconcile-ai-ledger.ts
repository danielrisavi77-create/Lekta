import type { RuleEntry, VerificationLedgerEntry } from '../profiles/profile-schema.ts';

/** Old AI events stay in the ledger; a matching correction neutralizes only its referenced event. */
export function unreconciledAiConfirmations(
  profileId: string,
  entries: readonly RuleEntry[],
  ledger: readonly VerificationLedgerEntry[],
): VerificationLedgerEntry[] {
  const confirmed = new Set(entries.filter((entry) => entry.confirmedVia === 'ai-evidence-audit')
    .map((entry) => entry.ruleId));
  const corrections = new Set(ledger.filter((entry) => entry.profileId === profileId
    && entry.action === 'ai-confirmation-revoked' && typeof entry.revokesLedgerId === 'string')
    .map((entry) => JSON.stringify([entry.ruleId, entry.revokesLedgerId])));
  return ledger.filter((entry) => entry.profileId === profileId && entry.action === 'ai-confirmed'
    && !confirmed.has(entry.ruleId)
    && !corrections.has(JSON.stringify([entry.ruleId, entry.id])));
}

/** Pure plan: the caller can inspect it before explicitly appending it. */
export function planAiLedgerReconciliation(
  profileId: string,
  entries: readonly RuleEntry[],
  ledger: readonly VerificationLedgerEntry[],
  now: string,
): VerificationLedgerEntry[] {
  const usedIds = new Set(ledger.map((entry) => entry.id));
  return unreconciledAiConfirmations(profileId, entries, ledger).map((entry) => {
    const id = `ai-confirmation-revoked:${entry.id}`;
    if (usedIds.has(id)) throw new Error(`${profileId}: korektivni ledger ID je već zauzet: ${id}`);
    usedIds.add(id);
    return {
      id,
      ruleId: entry.ruleId,
      profileId,
      action: 'ai-confirmation-revoked' as const,
      actor: 'ai-ledger-reconcile',
      timestamp: now,
      sourceId: entry.sourceId,
      sourcePage: entry.sourcePage,
      quote: entry.quote,
      revokesLedgerId: entry.id,
      note: `Append-only korekcija starog AI-confirmed događaja ${entry.id} bez potvrđenog dokaznog pravila.`,
    };
  });
}

/** Show the original event beside the rule's current state before a correction is written. */
export function formatAiLedgerReconciliationPreview(
  correction: VerificationLedgerEntry,
  ledger: readonly VerificationLedgerEntry[],
  entries: readonly RuleEntry[],
): string {
  const original = ledger.find((event) => event.id === correction.revokesLedgerId
    && event.profileId === correction.profileId && event.ruleId === correction.ruleId);
  const current = entries.find((entry) => entry.ruleId === correction.ruleId);
  return `${correction.revokesLedgerId} -> ${correction.id}; event=${original?.timestamp ?? 'missing'}; `
    + `status=${current?.status ?? 'missing'}; confirmedVia=${current?.confirmedVia ?? 'missing'}`;
}
