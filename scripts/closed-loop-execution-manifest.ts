import { createHash } from 'node:crypto';
import type { AiEvidenceExecutionManifest } from '../src/verification/ai-evidence-audit';
import { stableJson } from '../src/verification/ai-evidence-audit';

export interface ClosedLoopExecutionManifestInput {
  profileId: string;
  ruleId: string;
  ruleValue: unknown;
  repairSourceHash: string;
  testId: string;
  command: string;
  inputBytes: Uint8Array;
  outputBytes: Uint8Array;
  before: { earned: number; max: number };
  after: { earned: number; max: number };
  textPreserved: boolean;
  integrityFailure: string | null;
  idempotent: boolean;
  regressions: number;
  ranAt: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Izvodi manifest samo iz opaženih ulaznih/izlaznih bajtova i rezultata bodovane provjere.
 * Fail zapis ostaje dijagnostički; validator ga nikad ne prihvaća kao dokaz prolaza.
 */
export function createClosedLoopExecutionManifest(
  input: ClosedLoopExecutionManifestInput,
): AiEvidenceExecutionManifest {
  const inputHash = sha256(input.inputBytes);
  const outputHash = sha256(input.outputBytes);
  const finiteChecks = [input.before.earned, input.before.max, input.after.earned, input.after.max].every(Number.isFinite);
  const failedBefore = input.before.max > 0 && input.before.earned < input.before.max;
  const passedAfter = input.after.max === input.before.max && input.after.max > 0 && input.after.earned >= input.after.max;
  const outcome =
    input.profileId.trim() !== '' &&
    input.ruleId.trim() !== '' &&
    input.testId.trim() !== '' &&
    input.ranAt.trim() !== '' &&
    input.inputBytes.byteLength > 0 &&
    input.outputBytes.byteLength > 0 &&
    finiteChecks &&
    failedBefore &&
    passedAfter &&
    input.textPreserved &&
    input.integrityFailure === null &&
    input.idempotent &&
    input.regressions === 0
      ? 'pass'
      : 'fail';

  return {
    manifestId: `closed-loop:${input.profileId}:${input.ruleId}:${inputHash}:${outputHash}`,
    profileId: input.profileId,
    ruleId: input.ruleId,
    testId: input.testId,
    command: input.command,
    outcome,
    inputHash,
    outputHash,
    repairSourceHash: input.repairSourceHash,
    ruleValueHash: sha256(Buffer.from(stableJson(input.ruleValue), 'utf8')),
    ranAt: input.ranAt,
  };
}
