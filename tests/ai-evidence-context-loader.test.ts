import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ThesisProfile } from '../src/profiles/profile-schema';
import { ruleEvidenceKey } from '../src/verification/worklist';
import { loadRepositoryAiEvidenceContext } from '../scripts/ai-evidence-context-loader';
import { createAiEvidenceAuditFixture } from './helpers/ai-evidence-audit-fixture';
import { hashRepairSourceTree } from '../scripts/lib/repair-source-hash.mjs';

describe('repository AI evidence context loader', () => {
  it('čita samo hashom potvrđen tekstualni izvadak uz nepromijenjeni PDF snapshot', async () => {
    const fixture = createAiEvidenceAuditFixture();
    const root = mkdtempSync(join(tmpdir(), 'lekta-ai-context-'));
    try {
      const sourcePath = 'data/sources/official.pdf';
      const textPath = 'data/sources/official-extracted.txt';
      const text = 'Official PDF extraction: exact quoted text.\n';
      mkdirSync(join(root, 'data/sources'), { recursive: true });
      writeFileSync(join(root, sourcePath), fixture.snapshotBytes);
      writeFileSync(join(root, textPath), text, 'utf8');
      const profile: ThesisProfile = { id: fixture.profileId, rules: {}, ruleEntries: [fixture.rule] };
      const source = {
        ...fixture.source,
        snapshotPath: sourcePath,
        textSnapshotPath: textPath,
        textSnapshotHash: createHash('sha256').update(text, 'utf8').digest('hex'),
        textSnapshotOf: fixture.source.snapshotHash,
      };

      const resolved = await loadRepositoryAiEvidenceContext(root, [profile], [source], {
        targetProfileIds: [fixture.profileId],
      });

      expect(Array.from(resolved.gateContext.snapshotBytesBySourceId[source.id]!)).toEqual(Array.from(fixture.snapshotBytes));
      expect(resolved.gateContext.snapshotTextsBySourceId[source.id]).toBe(text);
      const stale = await loadRepositoryAiEvidenceContext(root, [profile], [{
        ...source,
        textSnapshotOf: '0'.repeat(64),
      }], { targetProfileIds: [fixture.profileId] });
      expect(stale.gateContext.snapshotTextsBySourceId[source.id]).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('odbija tekstualni izvadak kojemu hash ne odgovara', async () => {
    const fixture = createAiEvidenceAuditFixture();
    const root = mkdtempSync(join(tmpdir(), 'lekta-ai-context-'));
    try {
      const sourcePath = 'data/sources/official.pdf';
      const textPath = 'data/sources/official-extracted.txt';
      mkdirSync(join(root, 'data/sources'), { recursive: true });
      writeFileSync(join(root, sourcePath), fixture.snapshotBytes);
      writeFileSync(join(root, textPath), 'Tampered extraction.', 'utf8');
      const profile: ThesisProfile = { id: fixture.profileId, rules: {}, ruleEntries: [fixture.rule] };
      const source = {
        ...fixture.source,
        snapshotPath: sourcePath,
        textSnapshotPath: textPath,
        textSnapshotHash: '0'.repeat(64),
      };

      const resolved = await loadRepositoryAiEvidenceContext(root, [profile], [source], {
        targetProfileIds: [fixture.profileId],
      });

      expect(Array.from(resolved.gateContext.snapshotBytesBySourceId[source.id]!)).toEqual(Array.from(fixture.snapshotBytes));
      expect(resolved.gateContext.snapshotTextsBySourceId[source.id]).toBe('');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('učitava kontekst za odabrani pending profil prije primjene novog AI paketa', async () => {
    const fixture = createAiEvidenceAuditFixture();
    const root = mkdtempSync(join(tmpdir(), 'lekta-ai-context-'));
    try {
      const sourcePath = 'data/sources/official.txt';
      mkdirSync(join(root, 'data/sources'), { recursive: true });
      writeFileSync(join(root, sourcePath), fixture.snapshotBytes);
      const manifestPath = join(root, 'data/verification/closed-loop-manifests');
      mkdirSync(manifestPath, { recursive: true });
      writeFileSync(join(manifestPath, `${fixture.profileId}.json`), JSON.stringify({
        profileId: fixture.profileId,
        manifests: [fixture.manifest],
      }));
      const profile: ThesisProfile = {
        id: fixture.profileId,
        rules: {},
        ruleEntries: [{ ...fixture.rule, status: 'verified', verifiedBy: 'owner-bulk-approval', confirmedVia: 'owner-bulk-approval' }],
      };
      const source = { ...fixture.source, snapshotPath: sourcePath };

      const resolved = await loadRepositoryAiEvidenceContext(root, [profile], [source], {
        targetProfileIds: [fixture.profileId],
      });

      expect(Array.from(resolved.gateContext.snapshotBytesBySourceId[source.id])).toEqual(Array.from(fixture.snapshotBytes));
      expect(resolved.gateContext.manifestsById[fixture.manifest.manifestId]).toEqual(fixture.manifest);
      expect(resolved.resultsByRule).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('čita samo snapshote iz registra i rule-manifest iz imenovanog profilnog paketa', async () => {
    const fixture = createAiEvidenceAuditFixture();
    const root = mkdtempSync(join(tmpdir(), 'lekta-ai-context-'));
    try {
      const sourcePath = 'data/sources/official.txt';
      mkdirSync(join(root, 'data/sources'), { recursive: true });
      writeFileSync(join(root, sourcePath), fixture.snapshotBytes);
      mkdirSync(join(root, 'src/repair'), { recursive: true });
      writeFileSync(join(root, 'src/repair/fixture.ts'), 'export const fixture = true;\n');
      const manifest = { ...fixture.manifest,
        repairSourceHash: hashRepairSourceTree(join(root, 'src/repair')) };
      const manifestPath = join(root, 'data/verification/closed-loop-manifests');
      mkdirSync(manifestPath, { recursive: true });
      writeFileSync(join(manifestPath, `${fixture.profileId}.json`), JSON.stringify({
        profileId: fixture.profileId,
        manifests: [manifest],
      }));

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
      const source = { ...fixture.source, snapshotPath: sourcePath };
      const resolved = await loadRepositoryAiEvidenceContext(root, [profile], [source]);

      expect(resolved.resultsByRule[ruleEvidenceKey(fixture.profileId, fixture.rule.ruleId)]).toEqual({
        valid: true,
        reasons: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ne učitava snapshot s putanjom izvan repozitorija', async () => {
    const fixture = createAiEvidenceAuditFixture();
    const root = mkdtempSync(join(tmpdir(), 'lekta-ai-context-'));
    try {
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
      const source = { ...fixture.source, snapshotPath: '../outside.txt' };
      const resolved = await loadRepositoryAiEvidenceContext(root, [profile], [source]);
      const result = resolved.resultsByRule[ruleEvidenceKey(fixture.profileId, fixture.rule.ruleId)];
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reasons.map((reason) => reason.code)).toContain('snapshot-content-hash-mismatch');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
