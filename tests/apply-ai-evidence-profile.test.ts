import { describe, expect, it } from 'vitest';
import type { ThesisProfile } from '../src/profiles/profile-schema';
import { applyAiEvidenceProfile } from '../src/verification/apply-ai-evidence-profile';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';

function legacyEntryWithEvidence() {
  const fixture = createAiEvidenceAuditFixture();
  return {
    fixture,
    entry: {
      ...fixture.rule,
      status: 'verified' as const,
      scored: true,
      confirmedVia: 'ai-1pass-batch',
      verifiedBy: 'legacy-batch',
      aiEvidence: fixture.evidence,
    },
    context: {
      now: '2026-09-25',
      sourcesById: { [fixture.source.id]: fixture.source },
      snapshotBytesBySourceId: { [fixture.source.id]: fixture.snapshotBytes },
      snapshotTextsBySourceId: { [fixture.source.id]: fixture.snapshotText },
      snapshotHashesBySourceId: { [fixture.source.id]: fixture.snapshotSha256 },
      currentRepairSourceHash: fixture.currentRepairSourceHash,
      ruleValueHashesByRule: { [JSON.stringify([fixture.profileId, fixture.rule.ruleId])]: fixture.ruleValueSha256 },
      manifestsById: { [fixture.manifest.manifestId]: fixture.manifest },
    },
  };
}

describe('applyAiEvidenceProfile', () => {
  it('primijeni profil samo kad sva njegova bodovana pravila prođu AI validator', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const profile = { id: fixture.profileId, ruleEntries: [entry] } as unknown as ThesisProfile;

    const result = applyAiEvidenceProfile(profile, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.ruleEntries?.[0]).toMatchObject({
      status: 'verified',
      confirmedVia: 'ai-evidence-audit',
      verifiedBy: 'ai-evidence-audit',
      aiEvidence: fixture.evidence,
    });
    expect(result.ledger).toHaveLength(1);
    expect(result.ledger[0]).toMatchObject({ action: 'ai-confirmed', actor: 'ai-evidence-audit' });
  });

  it('odbije cijeli profil bez djelomičnog prijelaza ako je jedno bodovano pravilo nevaljano', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const invalidEntry = {
      ...entry,
      ruleId: `${fixture.profileId}--margins`,
      aiEvidence: { ...fixture.evidence, ruleId: 'wrong-rule-id' },
    };
    const profile = {
      id: fixture.profileId,
      ruleEntries: [entry, invalidEntry],
    } as unknown as ThesisProfile;

    const result = applyAiEvidenceProfile(profile, context);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain(`${fixture.profileId}/${invalidEntry.ruleId}:`);
    expect(result.errors.join('\n')).toMatch(/rule-id-mismatch/);
    expect('profile' in result).toBe(false);
    expect('ledger' in result).toBe(false);
  });
});
