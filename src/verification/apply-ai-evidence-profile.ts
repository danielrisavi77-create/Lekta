import type { ThesisProfile, RuleEntry, SourceEntry, VerificationLedgerEntry } from '../profiles/profile-schema';
import type { AiEvidenceExecutionManifest } from './ai-evidence-audit';
import { stableJson } from './ai-evidence-audit.ts';
import { approveFromAi } from './verification-actions';

export interface AiEvidenceProfileApplyContext {
  now: string;
  sourcesById: Readonly<Record<string, SourceEntry | undefined>>;
  snapshotBytesBySourceId: Readonly<Record<string, Uint8Array | undefined>>;
  snapshotTextsBySourceId: Readonly<Record<string, string | undefined>>;
  snapshotHashesBySourceId?: Readonly<Record<string, string | undefined>>;
  currentRepairSourceHash?: string;
  currentAnalysisSourceHash?: string;
  ruleValueHashesByRule?: Readonly<Record<string, string>>;
  manifestsById: Readonly<Record<string, AiEvidenceExecutionManifest | undefined>>;
}

export type AiEvidenceProfileApplyResult =
  | { ok: true; profile: ThesisProfile; ledger: VerificationLedgerEntry[]; skipped: Array<{ ruleId: string; reasons: string[] }> }
  | { ok: false; errors: string[] };

/**
 * Primjenjuje novi AI dokaz atomski unutar skupa pravila koja ga nose.
 */
export function applyAiEvidenceProfile(
  profile: ThesisProfile,
  context: AiEvidenceProfileApplyContext,
): AiEvidenceProfileApplyResult {
  const candidates = (profile.ruleEntries ?? []).filter((entry) => entry.aiEvidence != null
    && !(entry.status === 'verified' && entry.confirmedVia === 'ai-evidence-audit'
      && entry.aiEvidenceApprovedCanonical === stableJson(entry.aiEvidence)));
  if (!candidates.length) return { ok: true, profile, ledger: [], skipped: [] };

  const seenRuleIds = new Set<string>();
  const updatedEntries = new Map<RuleEntry, RuleEntry>();
  const ledger: VerificationLedgerEntry[] = [];
  const errors: string[] = [];
  const skipped: Array<{ ruleId: string; reasons: string[] }> = [];

  for (const entry of candidates) {
    if (seenRuleIds.has(entry.ruleId)) {
      errors.push(`${profile.id}/${entry.ruleId}: dupliciran ruleId u kandidatima.`);
      continue;
    }
    seenRuleIds.add(entry.ruleId);

    const evidence = entry.aiEvidence ?? undefined;
    const sourceId = entry.sourceId ?? '';
    const manifestId = evidence?.execution?.manifestId ?? '';
    const result = approveFromAi(
      profile.id,
      entry,
      context.sourcesById[sourceId],
      {
        now: context.now,
        snapshotBytes: context.snapshotBytesBySourceId[sourceId] ?? new Uint8Array(),
        snapshotSha256: context.snapshotHashesBySourceId?.[sourceId],
        currentRepairSourceHash: context.currentRepairSourceHash,
        currentAnalysisSourceHash: context.currentAnalysisSourceHash,
        ruleValueSha256: context.ruleValueHashesByRule?.[JSON.stringify([profile.id, entry.ruleId])],
        snapshotText: context.snapshotTextsBySourceId[sourceId] ?? '',
        manifest: context.manifestsById[manifestId] ?? null,
      },
      evidence,
    );

    if (!result.ok || !result.entry || !result.ledger) {
      const reasons = result.errors ?? ['AI-audit prijelaz nije proizveo rezultat.'];
      errors.push(...reasons.map((reason) => `${profile.id}/${entry.ruleId}: ${reason}`));
      continue;
    }
    updatedEntries.set(entry, result.entry);
    ledger.push(...result.ledger);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    profile: {
      ...profile,
      ruleEntries: (profile.ruleEntries ?? []).map((entry) => updatedEntries.get(entry) ?? entry),
    },
    ledger,
    skipped,
  };
}
