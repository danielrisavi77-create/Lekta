import { describe, expect, it } from 'vitest';
import type { ThesisProfile } from '../src/profiles/profile-schema';
import { auditAiEvidence } from '../src/verification/ai-evidence-audit';
import { applyAiEvidenceProfile } from '../src/verification/apply-ai-evidence-profile';
import { computeWorklist, ruleEvidenceKey } from '../src/verification/worklist';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';

// Code PR fixture: these names and quotes are invented test data, not institutional evidence.
function syntheticPackage(count: number) {
  const base = createAiEvidenceAuditFixture();
  const entries = Array.from({ length: count }, (_, index) => {
    const ruleId = `${base.profileId}--synthetic-${index + 1}`;
    const rule = { ...base.rule, ruleId, scored: true, status: 'verified' as const,
      confirmedVia: 'ai-1pass-batch' as const, verifiedBy: 'legacy-batch' };
    const manifestId = `closed-loop:${base.profileId}:${ruleId}:${base.manifest.inputHash}:${base.manifest.outputHash}:pass`;
    const evidence = { ...base.evidence, ruleId, execution: { ...base.evidence.execution, manifestId } };
    const manifest = { ...base.manifest, manifestId, ruleId };
    return { rule: { ...rule, aiEvidence: evidence }, evidence, manifest };
  });
  const profile = { id: base.profileId, rules: {}, ruleEntries: entries.map(({ rule }) => rule) } as ThesisProfile;
  const context = {
    now: '2026-09-25',
    sourcesById: { [base.source.id]: base.source },
    snapshotBytesBySourceId: { [base.source.id]: base.snapshotBytes },
    snapshotTextsBySourceId: { [base.source.id]: base.snapshotText },
    snapshotHashesBySourceId: { [base.source.id]: base.snapshotSha256 },
    currentRepairSourceHash: base.currentRepairSourceHash,
    ruleValueHashesByRule: Object.fromEntries(entries.map(({ rule }) => [ruleEvidenceKey(base.profileId, rule.ruleId), base.ruleValueSha256])),
    manifestsById: Object.fromEntries(entries.map(({ manifest }) => [manifest.manifestId, manifest])),
  };
  return { base, entries, profile, context };
}

describe('synthetic multi-rule AI evidence migration', () => {
  for (const count of [5, 2]) {
    it(`validates and applies all ${count} scored rules with matching snapshots and manifests`, () => {
      const { base, entries, profile, context } = syntheticPackage(count);
      const resultsByRule = Object.fromEntries(entries.map(({ rule, evidence, manifest }) => {
        const result = auditAiEvidence({ ...base, rule, evidence, manifest });
        expect(result, rule.ruleId).toEqual({ valid: true, reasons: [] });
        return [ruleEvidenceKey(profile.id, rule.ruleId), result];
      }));
      expect(profile.ruleEntries).toHaveLength(count);
      expect(Object.values(context.manifestsById)).toHaveLength(count);
      const applied = applyAiEvidenceProfile(profile, context);
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      expect(applied.profile.ruleEntries?.every((rule) => rule.confirmedVia === 'ai-evidence-audit')).toBe(true);
      expect(applied.ledger).toHaveLength(count);
      expect(applied.ledger.every((event) => event.action === 'ai-confirmed')).toBe(true);
      const worklist = computeWorklist([applied.profile], [base.source], [], { aiEvidenceResults: resultsByRule });
      expect(worklist.rows[0].pendingEvidence).toBe(0);
    });
  }

  it('rejects the complete five-rule package when one manifest identifies another rule', () => {
    const { profile, context, entries } = syntheticPackage(5);
    const badManifest = { ...entries[3].manifest, ruleId: 'other-rule' };
    const result = applyAiEvidenceProfile(profile, {
      ...context,
      manifestsById: { ...context.manifestsById, [badManifest.manifestId]: badManifest },
    });
    expect(result.ok).toBe(false);
  });
});
