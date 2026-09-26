import type { ThesisProfile, RuleEntry, SourceEntry, VerificationLedgerEntry } from '../profiles/profile-schema';
import type { AiEvidenceExecutionManifest } from './ai-evidence-audit';
import { approveFromAi } from './verification-actions';

export interface AiEvidenceProfileApplyContext {
  now: string;
  sourcesById: Readonly<Record<string, SourceEntry | undefined>>;
  snapshotBytesBySourceId: Readonly<Record<string, Uint8Array | undefined>>;
  snapshotTextsBySourceId: Readonly<Record<string, string | undefined>>;
  snapshotHashesBySourceId?: Readonly<Record<string, string | undefined>>;
  currentRepairSourceHash?: string;
  ruleValueHashesByRule?: Readonly<Record<string, string>>;
  manifestsById: Readonly<Record<string, AiEvidenceExecutionManifest | undefined>>;
}

export type AiEvidenceProfileApplyResult =
  | { ok: true; profile: ThesisProfile; ledger: VerificationLedgerEntry[] }
  | { ok: false; errors: string[] };

/**
 * Primjenjuje AI-audit na bodovana pravila profila atomski: nijedna promjena ni ledger dodatak
 * ne izlaze ako ijedno pravilo nema valjan paket, službeni snapshot ili stvarni manifest.
 */
export function applyAiEvidenceProfile(
  profile: ThesisProfile,
  context: AiEvidenceProfileApplyContext,
): AiEvidenceProfileApplyResult {
  const scoredEntries = (profile.ruleEntries ?? []).filter((entry) => entry.scored === true);
  if (!scoredEntries.length) {
    return { ok: false, errors: [`${profile.id}: profil nema bodovanih pravila za AI-audit.`] };
  }

  const seenRuleIds = new Set<string>();
  const updatedByRuleId = new Map<string, RuleEntry>();
  const ledger: VerificationLedgerEntry[] = [];
  const errors: string[] = [];

  for (const entry of scoredEntries) {
    if (seenRuleIds.has(entry.ruleId)) {
      errors.push(`${profile.id}/${entry.ruleId}: dupliciran ruleId u bodovanim pravilima.`);
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
    updatedByRuleId.set(entry.ruleId, result.entry);
    ledger.push(...result.ledger);
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    profile: {
      ...profile,
      ruleEntries: (profile.ruleEntries ?? []).map((entry) => updatedByRuleId.get(entry.ruleId) ?? entry),
    },
    ledger,
  };
}
