import { createHash } from 'node:crypto';
import type { RuleEntry, SourceEntry } from '../../src/profiles/profile-schema';
import type { AiEvidenceAudit, AiEvidenceExecutionManifest } from '../../src/verification/ai-evidence-audit';

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

export const AI_AUDIT_PROFILE_ID = 'profile-ai-audit-test';
export const AI_AUDIT_RULE_ID = 'rule-ai-audit-test';
export const AI_AUDIT_SNAPSHOT = 'Official guidance: Font must be Times New Roman throughout the document.\n';
export const AI_AUDIT_QUOTE = 'Font must be Times New Roman throughout the document.';

export interface AiEvidenceAuditFixture {
  profileId: string;
  rule: RuleEntry;
  source: SourceEntry;
  snapshotBytes: Uint8Array;
  snapshotSha256: string;
  currentRepairSourceHash: string;
  ruleValueSha256: string;
  snapshotText: string;
  evidence: AiEvidenceAudit;
  manifest: AiEvidenceExecutionManifest;
}

export function createAiEvidenceAuditFixture(): AiEvidenceAuditFixture {
  const source: SourceEntry = {
    id: 'official-ai-audit-test-source',
    kind: 'guidelines',
    title: 'Official test guidance',
    url: 'https://university.example/official-guidance.pdf',
    fetchedAt: '2026-09-20T10:00:00.000Z',
    snapshotPath: 'data/sources/test/official-guidance.pdf',
    snapshotHash: sha256(AI_AUDIT_SNAPSHOT),
    validityClass: 'stable',
    lastChecked: '2026-09-20',
  };
  const rule: RuleEntry = {
    ruleId: AI_AUDIT_RULE_ID,
    checkId: 'font',
    value: ['Times New Roman'],
    authority: 'binding',
    sourceId: source.id,
    sourcePage: 'page 2',
    quote: AI_AUDIT_QUOTE,
    status: 'draft',
    modality: 'obligation',
    scope: 'whole',
  };
  const inputHash = sha256('closed-loop-input');
  const outputHash = sha256('closed-loop-output');
  const execution = {
    manifestId: `closed-loop:${AI_AUDIT_PROFILE_ID}:${rule.ruleId}:${inputHash}:${outputHash}`,
    testId: 'closed-loop:profile-ai-audit-test',
    command: 'npm run closed-loop -- --profile profile-ai-audit-test',
    inputHash,
    outputHash,
    ranAt: '2026-09-24T10:00:00.000Z',
  };
  const evidence: AiEvidenceAudit = {
    schemaVersion: 1,
    profileId: AI_AUDIT_PROFILE_ID,
    ruleId: rule.ruleId,
    sourceId: source.id,
    sourceUrl: source.url,
    fetchedAt: source.fetchedAt!,
    snapshotHash: source.snapshotHash!,
    sourcePage: rule.sourcePage!,
    quote: rule.quote!,
    claim: { value: rule.value, modality: rule.modality!, scope: rule.scope! },
    passes: [
      { pass: 'extract', verdict: 'confirm', note: 'Extracted the value and obligation.' },
      { pass: 'quote-check', verdict: 'confirm', note: 'Matched the exact source quote.' },
      { pass: 'refute', verdict: 'confirm', note: 'Found no contradicting clause.' },
    ],
    agree: true,
    summary: 'All three passes support the cited requirement.',
    model: { provider: 'fixture-provider', model: 'fixture-model', version: '1' },
    execution,
  };
  const manifest: AiEvidenceExecutionManifest = {
    manifestId: execution.manifestId,
    profileId: AI_AUDIT_PROFILE_ID,
    ruleId: rule.ruleId,
    testId: execution.testId,
    command: execution.command,
    outcome: 'pass',
    inputHash: execution.inputHash,
    outputHash: execution.outputHash,
    repairSourceHash: sha256('repair-source-fixture'),
    ruleValueHash: sha256(JSON.stringify(rule.value)),
    ranAt: execution.ranAt,
  };
  return {
    profileId: AI_AUDIT_PROFILE_ID,
    rule,
    source,
    snapshotBytes: Buffer.from(AI_AUDIT_SNAPSHOT, 'utf8'),
    snapshotSha256: source.snapshotHash!,
    currentRepairSourceHash: manifest.repairSourceHash,
    ruleValueSha256: manifest.ruleValueHash,
    snapshotText: AI_AUDIT_SNAPSHOT,
    evidence,
    manifest,
  };
}
