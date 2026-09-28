import type { ThesisProfile } from './profile-schema';
import { compileEffectiveRules } from './rule-compiler';
import type { AiEvidenceAuditResult } from '../verification/ai-evidence-audit';
import type { RuleEntry } from './profile-schema';

type PublishedProfile = Record<string, unknown> & { id: string; rules?: Record<string, unknown> };

function evidenceKey(profileId: string, ruleId: string): string {
  return JSON.stringify([profileId, ruleId]);
}

/** Return only rule IDs whose evidence package was deterministically revalidated. */
function selectAiAuditedRuleEntries(
  profile: ThesisProfile,
  auditResultsByRule: Readonly<Record<string, AiEvidenceAuditResult>>,
): RuleEntry[] {
  const aiEntries = (profile.ruleEntries ?? []).filter((entry) => entry.confirmedVia === 'ai-evidence-audit');
  const seenRuleIds = new Set<string>();
  for (const entry of aiEntries) {
    if (!entry.ruleId || seenRuleIds.has(entry.ruleId)) {
      throw new Error(`Dupli ili prazan AI ruleId u profilu ${profile.id}: ${entry.ruleId || '(prazan)'}`);
    }
    seenRuleIds.add(entry.ruleId);
    if (entry.status !== 'verified') {
      throw new Error(`AI-potvrđeno pravilo nije verified: ${profile.id}/${entry.ruleId}`);
    }
    const result = auditResultsByRule[evidenceKey(profile.id, entry.ruleId)];
    if (!result?.valid) {
      const reasons = result && !result.valid ? result.reasons.map((reason) => reason.code).join(', ') : 'rezultat nedostaje';
      throw new Error(`Nedostaje valjan AI-evidence rezultat za ${profile.id}/${entry.ruleId}: ${reasons}`);
    }
  }
  return aiEntries;
}

/** Zadrzava postojece opcije popravka; novi AI unos mora proci dokazni audit. */
export function filterRepairEntriesToAiAuditedRules(
  repairMap: Record<string, unknown[]>,
  evidenceProfiles: readonly ThesisProfile[],
  auditResultsByRule: Readonly<Record<string, AiEvidenceAuditResult>>,
): Record<string, unknown[]> {
  for (const profile of evidenceProfiles) {
    selectAiAuditedRuleEntries(profile, auditResultsByRule);
  }
  return repairMap;
}

/**
 * Compile AI-confirmed rule entries into the private server-side profile projection.
 * `auditResultsByRule` must come from `resolveAiEvidenceContext`, which resolves the
 * registered snapshot bytes/text and a harness manifest before returning `valid: true`.
 * Ordinary drafts and legacy batch approvals never change published runtime rules.
 */
export function publishAiAuditedRules(
  publishedProfiles: readonly PublishedProfile[],
  evidenceProfiles: readonly ThesisProfile[],
  auditResultsByRule: Readonly<Record<string, AiEvidenceAuditResult>>,
): PublishedProfile[] {
  const publishedById = new Map<string, PublishedProfile>();
  for (const profile of publishedProfiles) {
    if (!profile.id || publishedById.has(profile.id)) {
      throw new Error(`Profil objave nema jedinstven ID: ${profile.id || '(prazan)'}`);
    }
    publishedById.set(profile.id, profile);
  }

  const evidenceById = new Map<string, ThesisProfile>();
  for (const profile of evidenceProfiles) {
    if (evidenceById.has(profile.id)) throw new Error(`Dupli profil dokaznog nacrta: ${profile.id}`);
    evidenceById.set(profile.id, profile);
    if (!publishedById.has(profile.id) && profile.ruleEntries?.some((entry) => entry.confirmedVia === 'ai-evidence-audit')) {
      throw new Error(`AI-potvrđeno pravilo nije prisutno u registru objave: ${profile.id}`);
    }
  }

  return publishedProfiles.map((published) => {
    const evidenceProfile = evidenceById.get(published.id);
    const aiEntries = evidenceProfile
      ? selectAiAuditedRuleEntries(evidenceProfile, auditResultsByRule)
      : [];
    if (!aiEntries.length) return published;

    const compiled = compileEffectiveRules({
      ...published,
      ruleEntries: aiEntries,
    } as ThesisProfile);
    return { ...published, rules: compiled };
  });
}
