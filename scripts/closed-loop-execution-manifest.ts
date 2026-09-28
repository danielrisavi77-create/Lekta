import { createHash } from 'node:crypto';
import type { AiEvidenceExecutionManifest } from '../src/verification/ai-evidence-audit';
import { detectorManifestId, stableJson } from '../src/verification/ai-evidence-audit';

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
    manifestId: `closed-loop:${input.profileId}:${input.ruleId}:${inputHash}:${outputHash}:${outcome}`,
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

export interface DetectorExecutionManifestInput {
  profileId: string;
  ruleId: string;
  ruleCheckId: string;
  checkId: string;
  ruleValue: unknown;
  analysisSourceHash: string;
  testId: string;
  command: string;
  violatingInputBytes: Uint8Array;
  violatingOutputBytes: Uint8Array;
  correctInputBytes: Uint8Array;
  correctOutputBytes: Uint8Array;
  violatingCheck?: { id?: string | null; earned?: number; max?: number };
  correctCheck?: { id?: string | null; earned?: number; max?: number };
  ranAt: string;
}

/** A positive detector result needs a scored violation and a scored clean control. */
export function createDetectorExecutionManifest(input: DetectorExecutionManifestInput): AiEvidenceExecutionManifest {
  const manifest: AiEvidenceExecutionManifest = {
    kind: 'detector',
    manifestId: '',
    profileId: input.profileId,
    ruleId: input.ruleId,
    ruleCheckId: input.ruleCheckId,
    checkId: input.checkId,
    testId: input.testId,
    command: input.command,
    outcome: 'fail',
    inputHash: sha256(input.violatingInputBytes),
    violatingOutputHash: sha256(input.violatingOutputBytes),
    correctInputHash: sha256(input.correctInputBytes),
    outputHash: sha256(input.correctOutputBytes),
    analysisSourceHash: input.analysisSourceHash,
    ruleValueHash: sha256(Buffer.from(stableJson(input.ruleValue), 'utf8')),
    ranAt: input.ranAt,
  };
  const bad = input.violatingCheck;
  const good = input.correctCheck;
  if (!input.checkId || !bad || !good || bad.id !== input.checkId || good.id !== input.checkId
    || !Number.isFinite(bad.max) || !Number.isFinite(good.max) || (bad.max ?? 0) <= 0 || (good.max ?? 0) <= 0) {
    manifest.failureReason = 'nema detektora';
  } else if (!Number.isFinite(bad.earned) || !Number.isFinite(good.earned)
    || (bad.earned ?? 0) >= bad.max! || (good.earned ?? 0) < good.max!) {
    manifest.failureReason = 'detektor ne razlikuje kršeći i ispravan dokument';
  } else if (manifest.inputHash !== manifest.violatingOutputHash
    || manifest.correctInputHash !== manifest.outputHash) {
    manifest.failureReason = 'analiza je promijenila dokument';
  } else if (![input.profileId, input.ruleId, input.ruleCheckId, input.testId, input.command, input.ranAt]
    .every((value) => value.trim()) || !/^[a-f0-9]{64}$/.test(input.analysisSourceHash)
    || [input.violatingInputBytes, input.violatingOutputBytes, input.correctInputBytes, input.correctOutputBytes]
      .some((bytes) => bytes.byteLength === 0)) {
    manifest.failureReason = 'nepotpun dokaz izvršenja';
  } else {
    manifest.outcome = 'pass';
  }
  manifest.manifestId = detectorManifestId(manifest);
  return manifest;
}
