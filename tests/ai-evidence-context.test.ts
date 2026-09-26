import { describe, expect, it } from 'vitest';
import type { ThesisProfile } from '../src/profiles/profile-schema';
import { ruleEvidenceKey } from '../src/verification/worklist';
import { resolveAiEvidenceContext } from '../src/verification/ai-evidence-context';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';

describe('AI evidence context resolver', () => {
  it('revalidira AI pravilo samo s manifestom iz istog profilnog paketa i stvarnim snapshot bajtovima', () => {
    const fixture = createAiEvidenceAuditFixture();
    const profile: ThesisProfile = {
      id: fixture.profileId,
      rules: {},
      ruleEntries: [{
        ...fixture.rule,
        status: 'verified',
        confirmedVia: 'ai-evidence-audit',
        aiEvidence: fixture.evidence,
      }],
    };

    const resolved = resolveAiEvidenceContext(
      [profile],
      [fixture.source],
      {
        snapshotsBySourceId: {
          [fixture.source.id]: { bytes: fixture.snapshotBytes, text: fixture.snapshotText, sha256: fixture.snapshotSha256 },
        },
        manifestFilesByProfileId: {
          [fixture.profileId]: { profileId: fixture.profileId, manifests: [fixture.manifest] },
        },
        currentRepairSourceHash: fixture.currentRepairSourceHash,
        ruleValueHashesByRule: { [ruleEvidenceKey(fixture.profileId, fixture.rule.ruleId)]: fixture.ruleValueSha256 },
      },
    );

    const result = resolved.resultsByRule[ruleEvidenceKey(fixture.profileId, fixture.rule.ruleId)];
    expect(result).toEqual({ valid: true, reasons: [] });
    expect(resolved.gateContext.snapshotBytesBySourceId[fixture.source.id]).toEqual(fixture.snapshotBytes);
    expect(resolved.gateContext.manifestsById[fixture.manifest.manifestId]).toEqual(fixture.manifest);
  });

  it('odbija manifest iz paketa drugog profila i ne dopušta cross-profile dokaz', () => {
    const fixture = createAiEvidenceAuditFixture();
    const profile: ThesisProfile = {
      id: fixture.profileId,
      rules: {},
      ruleEntries: [{
        ...fixture.rule,
        status: 'verified',
        confirmedVia: 'ai-evidence-audit',
        aiEvidence: fixture.evidence,
      }],
    };

    const resolved = resolveAiEvidenceContext(
      [profile],
      [fixture.source],
      {
        snapshotsBySourceId: {
          [fixture.source.id]: { bytes: fixture.snapshotBytes, text: fixture.snapshotText, sha256: fixture.snapshotSha256 },
        },
        manifestFilesByProfileId: {
          [fixture.profileId]: { profileId: 'another-profile', manifests: [fixture.manifest] },
        },
        currentRepairSourceHash: fixture.currentRepairSourceHash,
        ruleValueHashesByRule: { [ruleEvidenceKey(fixture.profileId, fixture.rule.ruleId)]: fixture.ruleValueSha256 },
      },
    );

    const result = resolved.resultsByRule[ruleEvidenceKey(fixture.profileId, fixture.rule.ruleId)];
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasons.map((reason) => reason.code)).toContain('manifest-missing');
  });
});
