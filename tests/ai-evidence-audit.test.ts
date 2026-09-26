import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RuleEntry, SourceEntry } from '../src/profiles/profile-schema';
import {
  auditAiEvidence,
  type AiEvidenceAudit,
  type AiEvidenceExecutionManifest,
} from '../src/verification/ai-evidence-audit';

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const PROFILE_ID = 'profile-a';
const RULE_ID = 'rule-margins';
const SNAPSHOT = 'Official guidance: The margins must be 2.5 cm on all sides.\r\n';
const QUOTE = 'The margins must be 2.5 cm on all sides.';
const INPUT = 'profile-a:rule-margins:closed-loop-input';
const OUTPUT = 'profile-a:rule-margins:closed-loop-output';

const source: SourceEntry = {
  id: 'official-guidance-2026',
  kind: 'guidelines',
  title: 'Official academic writing guidance',
  url: 'https://university.example/guidance.pdf',
  fetchedAt: '2026-09-20T10:00:00.000Z',
  snapshotPath: 'data/sources/example/guidance.pdf',
  snapshotHash: sha256(SNAPSHOT),
  validityClass: 'stable',
  lastChecked: '2026-09-20',
};

const rule: RuleEntry = {
  ruleId: RULE_ID,
  checkId: 'margins',
  value: { allSidesCm: 2.5 },
  authority: 'binding',
  sourceId: source.id,
  sourcePage: 'page 4',
  quote: QUOTE,
  status: 'draft',
  modality: 'obligation',
  scope: 'whole',
};

const evidence: AiEvidenceAudit = {
  schemaVersion: 1,
  profileId: PROFILE_ID,
  ruleId: RULE_ID,
  sourceId: source.id,
  sourceUrl: source.url,
  fetchedAt: source.fetchedAt!,
  snapshotHash: source.snapshotHash!,
  sourcePage: 'page 4',
  quote: QUOTE,
  claim: { value: { allSidesCm: 2.5 }, modality: 'obligation', scope: 'whole' },
  passes: [
    { pass: 'extract', verdict: 'confirm', note: 'Value and obligation extracted.' },
    { pass: 'quote-check', verdict: 'confirm', note: 'Quote matches the source snapshot.' },
    { pass: 'refute', verdict: 'confirm', note: 'No contradictory provision found.' },
  ],
  agree: true,
  summary: 'The three scoped passes agree with the cited official provision.',
  model: { provider: 'test-provider', model: 'test-model', version: '1' },
  execution: {
    manifestId: `closed-loop:${PROFILE_ID}:${RULE_ID}:${sha256(INPUT)}:${sha256(OUTPUT)}`,
    testId: 'closed-loop:profile-a:rule-margins',
    command: 'npm run closed-loop -- --profile profile-a',
    inputHash: sha256(INPUT),
    outputHash: sha256(OUTPUT),
    ranAt: '2026-09-24T10:00:00.000Z',
  },
};

const manifest: AiEvidenceExecutionManifest = {
  manifestId: evidence.execution.manifestId,
  profileId: PROFILE_ID,
  ruleId: RULE_ID,
  testId: evidence.execution.testId,
  command: evidence.execution.command,
  outcome: 'pass',
  inputHash: evidence.execution.inputHash,
  outputHash: evidence.execution.outputHash,
  repairSourceHash: sha256('repair-source-fixture'),
  ruleValueHash: sha256('{"allSidesCm":2.5}'),
  ranAt: evidence.execution.ranAt,
};

const audit = (
  over: Partial<Parameters<typeof auditAiEvidence>[0]> = {},
) => auditAiEvidence({ profileId: PROFILE_ID, rule, source, snapshotBytes: Buffer.from(SNAPSHOT, 'utf8'), snapshotSha256: source.snapshotHash!, currentRepairSourceHash: manifest.repairSourceHash, ruleValueSha256: manifest.ruleValueHash, snapshotText: SNAPSHOT, evidence, manifest, ...over });

describe('auditAiEvidence: deterministicki dokazni paket', () => {
  it('prihvaca cjelovit paket vezan uz sluzbeni snapshot, pravilo i prolazni manifest', () => {
    expect(audit()).toEqual({ valid: true, reasons: [] });
  });

  it('odbija manifest nastao nad starim kodom popravka', () => {
    const result = audit({ currentRepairSourceHash: 'f'.repeat(64) });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasons.map((reason) => reason.code)).toContain('manifest-stale-repair');
  });

  it('odbija manifest za drugu vrijednost pravila', () => {
    const result = audit({ ruleValueSha256: 'f'.repeat(64) });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasons.map((reason) => reason.code)).toContain('manifest-rule-value-mismatch');
  });

  it('hashira izvorne bajtove, ne tekst izdvojen iz binarnog snapshota', () => {
    const snapshotBytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SNAPSHOT, 'utf8')]);
    const binarySnapshotHash = createHash('sha256').update(snapshotBytes).digest('hex');
    const binarySource = { ...source, snapshotPath: 'data/sources/example/guidance.doc', snapshotHash: binarySnapshotHash };
    const binaryEvidence = { ...evidence, snapshotHash: binarySnapshotHash };

    const result = auditAiEvidence({
      profileId: PROFILE_ID,
      rule,
      source: binarySource,
      snapshotText: SNAPSHOT,
      snapshotBytes,
      snapshotSha256: binarySnapshotHash,
      currentRepairSourceHash: manifest.repairSourceHash,
      ruleValueSha256: manifest.ruleValueHash,
      evidence: binaryEvidence,
      manifest,
    } as Parameters<typeof auditAiEvidence>[0]);

    expect(result).toEqual({ valid: true, reasons: [] });
  });

  it('prihvaca citat prelomljen prijelomom retka u layoutu PDF-a', () => {
    const result = audit({ snapshotText: 'Official guidance: The margins must be 2.5\ncm on all sides.\r\n' });
    expect(result).toEqual({ valid: true, reasons: [] });
  });

  it('odbija manifest čiji ID ne veže profil, pravilo i hashove i kad se AI paket uskladi s lažnim ID-jem', () => {
    const manifestId = `closed-loop:${manifest.profileId}:${manifest.ruleId}:${manifest.inputHash}:${manifest.outputHash}`;
    const evidenceWithBoundId = {
      ...evidence,
      execution: { ...evidence.execution, manifestId },
    };
    const forgedId = `${manifestId}:forged`;
    const result = audit({
      evidence: {
        ...evidenceWithBoundId,
        execution: { ...evidenceWithBoundId.execution, manifestId: forgedId },
      },
      manifest: { ...manifest, manifestId: forgedId },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reasons.map((reason) => reason.code)).toContain('manifest-id-mismatch');
  });

  it.each([
    ['profile ID', { profileId: 'profile-b' }, 'profile-id-mismatch'],
    ['unsupported schema version', { evidence: { ...evidence, schemaVersion: 2 } }, 'schema-version-unsupported'],
    ['rule ID', { evidence: { ...evidence, ruleId: 'other-rule' } }, 'rule-id-mismatch'],
    ['source ID', { evidence: { ...evidence, sourceId: 'other-source' } }, 'source-id-mismatch'],
    ['source URL', { evidence: { ...evidence, sourceUrl: 'https://other.example/' } }, 'source-url-mismatch'],
    ['snapshot hash', { evidence: { ...evidence, snapshotHash: '0'.repeat(64) } }, 'snapshot-hash-mismatch'],
    ['stale snapshot bytes', { snapshotBytes: Buffer.from(`${SNAPSHOT}Changed.`, 'utf8'),
      snapshotSha256: sha256(`${SNAPSHOT}Changed.`) }, 'snapshot-content-hash-mismatch'],
    ['missing quote', { evidence: { ...evidence, quote: '' } }, 'quote-missing'],
    ['quote outside snapshot', { evidence: { ...evidence, quote: 'Margins should be about 3 cm.' } }, 'quote-not-found'],
    ['rule value mismatch', { evidence: { ...evidence, claim: { ...evidence.claim, value: { allSidesCm: 3 } } } }, 'value-mismatch'],
    ['ambiguous scope', { evidence: { ...evidence, claim: { ...evidence.claim, scope: null } } }, 'scope-ambiguous'],
    ['scope mismatch', { evidence: { ...evidence, claim: { ...evidence.claim, scope: 'body' } } }, 'scope-mismatch'],
    ['ambiguous modality', { evidence: { ...evidence, claim: { ...evidence.claim, modality: null } } }, 'modality-ambiguous'],
    ['modality mismatch', { evidence: { ...evidence, claim: { ...evidence.claim, modality: 'recommendation' } } }, 'modality-mismatch'],
    ['missing resolved manifest', { manifest: null }, 'manifest-missing'],
    ['manifest input hash mismatch', { manifest: { ...manifest, inputHash: sha256('wrong input') } }, 'manifest-input-hash-mismatch'],
    ['manifest output hash mismatch', { manifest: { ...manifest, outputHash: sha256('wrong output') } }, 'manifest-output-hash-mismatch'],
    ['manifest command mismatch', { manifest: { ...manifest, command: 'npm run unrelated-test' } }, 'manifest-command-mismatch'],
    ['failed execution', { manifest: { ...manifest, outcome: 'fail' } }, 'test-failed'],
    ['disagreeing passes', { evidence: { ...evidence, passes: evidence.passes.map((pass) => pass.pass === 'refute' ? { ...pass, verdict: 'refute' as const } : pass) } }, 'passes-disagree'],
  ] as const)('odbija paket s %s', (_label, over, code) => {
    const result = audit(over as Partial<Parameters<typeof auditAiEvidence>[0]>);
    expect(result.valid).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain(code);
  });

  it('ne vjeruje samostalnoj zastavici agree bez tri razlicita prolaza', () => {
    const result = audit({ evidence: { ...evidence, passes: evidence.passes.slice(0, 2), agree: true } });
    expect(result.valid).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain('passes-incomplete');
  });

  it('odbija paket koji nedostaje umjesto da baca runtime gresku', () => {
    const result = audit({ evidence: undefined });
    expect(result).toEqual({
      valid: false,
      reasons: [{ code: 'evidence-missing', message: 'Nedostaje strukturirani AI dokazni paket.' }],
    });
  });

  it('odbija neispravan JSON oblik paketa bez runtime iznimke', () => {
    const malformed = { ...evidence, execution: undefined } as unknown as AiEvidenceAudit;
    const result = audit({ evidence: malformed });
    expect(result.valid).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toContain('evidence-structure-incomplete');
  });
});
