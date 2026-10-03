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

  it('promiče pending legacy pravilo s dokazom u verified i izvedeno bodovano', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const pending = { ...entry, status: 'needs-recheck' as const, scored: false };
    const profile = { id: fixture.profileId, ruleEntries: [pending] } as unknown as ThesisProfile;
    const result = applyAiEvidenceProfile(profile, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.ruleEntries?.[0]).toMatchObject({ status: 'verified', scored: true, confirmedVia: 'ai-evidence-audit' });
    expect(result.ledger).toHaveLength(1);
  });

  it('ostavlja pending pravilo bez dokaza netaknutim uz valjano bodovano pravilo', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const untouched = { ...entry, ruleId: 'pending-without-evidence', status: 'draft' as const, scored: false, aiEvidence: undefined };
    const profile = { id: fixture.profileId, ruleEntries: [entry, untouched] } as unknown as ThesisProfile;
    const result = applyAiEvidenceProfile(profile, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.ruleEntries?.[1]).toEqual(untouched);
    expect(result.ledger).toHaveLength(1);
  });

  it('nevaljan dokaz nebodovanog kandidata blokira cijeli skup kandidata', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const invalidPending = { ...entry, ruleId: 'pending-invalid-evidence', status: 'draft' as const, scored: false };
    const profile = { id: fixture.profileId, ruleEntries: [entry, invalidPending] } as unknown as ThesisProfile;
    const result = applyAiEvidenceProfile(profile, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join('\n')).toContain('rule-id-mismatch');
    expect('profile' in result).toBe(false);
    expect('ledger' in result).toBe(false);
  });

  it('ne dira legacy bodovano pravilo bez novog dokaza', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const legacy = { ...entry, ruleId: 'legacy-without-evidence', aiEvidence: undefined };
    const profile = { id: fixture.profileId, ruleEntries: [entry, legacy] } as ThesisProfile;
    const result = applyAiEvidenceProfile(profile, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.ruleEntries?.[1]).toEqual(legacy);
    expect(result.ledger).toHaveLength(1);
  });

  it('ne mijenja zapis bez dokaza ni kad dijeli ruleId s kandidatom', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const untouched = { ...entry, aiEvidence: undefined };
    const profile = { id: fixture.profileId, ruleEntries: [entry, untouched] } as ThesisProfile;
    const result = applyAiEvidenceProfile(profile, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.ruleEntries?.[1]).toEqual(untouched);
  });

  it('profil bez novog dokaza prolazi bez promjena', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const profile = { id: fixture.profileId, ruleEntries: [{ ...entry, aiEvidence: undefined }] } as ThesisProfile;
    const result = applyAiEvidenceProfile(profile, context);
    expect(result).toEqual({ ok: true, profile, ledger: [], skipped: [] });
  });

  it('drugi prolaz nad istim valjanim dokazom ne mijenja draft ni ledger', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const first = applyAiEvidenceProfile({ id: fixture.profileId, ruleEntries: [entry] } as ThesisProfile, context);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const draftBytes = Buffer.from(JSON.stringify(first.profile), 'utf8');
    const second = applyAiEvidenceProfile(first.profile, context);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.ledger).toEqual([]);
    expect(Buffer.from(JSON.stringify(second.profile), 'utf8')).toEqual(draftBytes);
  });

  it('ponovni audit starog EFOS-tipa paketa prihvaća novi dokaz sheme 2 i novi ledger događaj', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const oldApproved = { ...entry, confirmedVia: 'ai-evidence-audit', verifiedBy: 'ai-evidence-audit' };
    const newEvidence = { ...fixture.evidence, schemaVersion: 2 as const,
      model: { provider: 'OpenAI', model: 'known-model', version: '1' },
      passes: fixture.evidence.passes.map((pass) => ({ ...pass,
        model: { provider: pass.pass === 'refute' ? 'Anthropic' : 'OpenAI', model: 'known-model', version: '1' },
      })),
    };
    const reaudited = { ...oldApproved, aiEvidence: newEvidence };
    const result = applyAiEvidenceProfile({ id: fixture.profileId, ruleEntries: [reaudited] } as ThesisProfile, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.ruleEntries?.[0].aiEvidence).toEqual(newEvidence);
    expect(result.ledger).toHaveLength(1);
    expect(result.ledger[0].id).not.toBe(`led-${entry.ruleId}-ai-confirmed-${context.now}`);
    const second = applyAiEvidenceProfile(result.profile, context);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.ledger).toEqual([]);
  });

  it('AI potvrda bez kanonskog otiska ne skriva novi dokaz sheme 1', () => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const changedEvidence = { ...fixture.evidence, summary: `${fixture.evidence.summary} Novi pregled.` };
    const old = { ...entry, confirmedVia: 'ai-evidence-audit', verifiedBy: 'ai-evidence-audit',
      aiEvidence: changedEvidence, aiEvidenceApprovedCanonical: undefined };
    const result = applyAiEvidenceProfile({ id: fixture.profileId, ruleEntries: [old] } as ThesisProfile, context);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ledger).toHaveLength(1);
  });

  it.each([
    ['draft', { status: 'draft' as const, scored: false, confirmedVia: undefined }],
    ['legacy verified', { status: 'verified' as const, scored: false, confirmedVia: 'ai-1pass-batch' as const }],
    ['ai-confirmed', { status: 'ai-confirmed' as const, scored: false, confirmedVia: undefined }],
  ])('promiče %s s valjanim dokazom umjesto da ga izgubi iz kandidata', (_label, state) => {
    const { fixture, entry, context } = legacyEntryWithEvidence();
    const candidate = { ...entry, ...state };
    const result = applyAiEvidenceProfile({ id: fixture.profileId, ruleEntries: [candidate] } as ThesisProfile, context);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.profile.ruleEntries?.[0]).toMatchObject({ status: 'verified', scored: true, confirmedVia: 'ai-evidence-audit' });
    expect(result.ledger).toHaveLength(1);
  });
});
