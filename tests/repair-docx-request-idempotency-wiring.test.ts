// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const edgeSource = readFileSync(join(root, 'supabase', 'functions', 'repair-docx', 'index.ts'), 'utf8').replace(/\r\n?/g, '\n');

describe('repair request idempotency Edge wiring', () => {
  it('creates idempotency rows only after attempt limits and bounded upload validation', () => {
    const attemptReservation = edgeSource.indexOf('reserveAttempt(admin, user.id, REPAIR_UNCOUNTED_DAILY_CAP)');
    const boundedBodyRead = edgeSource.indexOf('readFormDataBounded(req,');
    const claim = edgeSource.indexOf("admin.rpc('claim_repair_request'");

    expect(edgeSource).not.toContain("requestMode === 'reserve'");
    expect(edgeSource).not.toContain('reserve_repair_request');
    expect(attemptReservation).toBeGreaterThanOrEqual(0);
    expect(boundedBodyRead).toBeGreaterThan(attemptReservation);
    expect(claim).toBeGreaterThan(boundedBodyRead);
  });

  it('derives and claims an identity for legacy uploads without request headers', () => {
    const deriveFingerprint = edgeSource.indexOf('actualRequestFingerprint = await repairRequestFingerprint(docxBytes, meta)');
    const acceptSuppliedFingerprint = edgeSource.indexOf('if (requestId && requestFingerprint) {', deriveFingerprint);
    const deriveLegacyFingerprint = edgeSource.indexOf('requestFingerprint = actualRequestFingerprint', acceptSuppliedFingerprint);
    const deriveLegacyId = edgeSource.indexOf('requestId = await repairRequestId(actualRequestFingerprint)', deriveLegacyFingerprint);
    const claim = edgeSource.indexOf("admin.rpc('claim_repair_request'", deriveLegacyId);

    expect(deriveFingerprint).toBeGreaterThanOrEqual(0);
    expect(acceptSuppliedFingerprint).toBeGreaterThan(deriveFingerprint);
    expect(deriveLegacyFingerprint).toBeGreaterThan(acceptSuppliedFingerprint);
    expect(deriveLegacyId).toBeGreaterThan(deriveLegacyFingerprint);
    expect(claim).toBeGreaterThan(deriveLegacyId);
    expect(edgeSource).toContain('...(requestId ? { requestId } : {})');
    expect(edgeSource).toContain('requestStateResponse(claim.status, typeof claim.jobId === \'string\' ? claim.jobId : null, requestId)');
  });

  it('recovers an unstored result only through an existing paid slot and preserves the recovery state', () => {
    const recoveryGuard = edgeSource.indexOf('if (requestRecovery && decision.decision !== \'recheck\')');
    const consumeSlot = edgeSource.indexOf("'consume_repair_slot_and_bind'");

    expect(recoveryGuard).toBeGreaterThanOrEqual(0);
    expect(recoveryGuard).toBeLessThan(consumeSlot);
    expect(edgeSource).toContain('if (requestRecovery) return { slotId, usageLogged: true };');
    expect(edgeSource).toContain("finishRequest(requestRecovery ? 'completed_unstored' : 'retryable')");
    expect(edgeSource).toContain("finishAttempt(admin, attempt, 'delivery_failed')");
    expect(edgeSource).toContain("admin.rpc('mark_repair_request_delivery_pending'");
    expect(edgeSource).toContain('if (committed.requestStateFailed)');
  });

  it('reuses a previously stored job when recovery follows a failed completion update', () => {
    const claim = edgeSource.indexOf("admin.rpc('claim_repair_request'");
    const recoveryLookup = edgeSource.indexOf('if (requestRecovery && requestId && requestFingerprint)');
    const priorJobLookup = edgeSource.indexOf('findRepairJobByRequestFingerprint(admin, user.id, requestFingerprint)', recoveryLookup);
    const completion = edgeSource.indexOf("safeFinishRequest('completed', existing.id)", recoveryLookup);
    const docxReprocessing = edgeSource.indexOf('let fingerprint: ReturnType<typeof computeFingerprint>', recoveryLookup);

    expect(recoveryLookup).toBeGreaterThan(claim);
    expect(priorJobLookup).toBeGreaterThan(recoveryLookup);
    expect(completion).toBeGreaterThan(priorJobLookup);
    expect(docxReprocessing).toBeGreaterThan(completion);
    expect(edgeSource).toContain(".eq('request_fingerprint', requestFingerprint)");
    expect(edgeSource).toContain('request_fingerprint: meta.requestFingerprint');
    expect(edgeSource).toContain('let lookupFailed = false;');
    expect(edgeSource).toContain("if (existing.id !== jobId) await removeRepairObjects(bucket, [origPath, resPath], 'duplicate request')");
    expect(edgeSource).toContain('if (!lookupFailed) {');
    expect(edgeSource).toContain('Preserve the blobs so');
    expect(edgeSource).toContain('const { error } = await bucket.remove(paths)');
    expect(edgeSource).toContain('storage cleanup failed (${reason})');
    expect(edgeSource).toContain("finishRequest(stored ? 'completed' : 'completed_unstored', stored?.jobId ?? null)");
  });

  it('charges recovery quota only after the winning claim and existing-job lookup', () => {
    const claim = edgeSource.indexOf("admin.rpc('claim_repair_request'");
    const recoveryLookup = edgeSource.indexOf('if (requestRecovery && requestId && requestFingerprint)');
    const existingJobReturn = edgeSource.indexOf("return requestStateResponse('completed', existing.id, requestId)", recoveryLookup);
    const lookupFailure = edgeSource.indexOf('if (recoveryLookupFailed)', recoveryLookup);
    const recoveryLimit = edgeSource.indexOf('const recoveryLimit = await claimRepairRateSlots', recoveryLookup);
    const recoveryScopeCall = edgeSource.indexOf("user.id, recoveryIpHash, 'repair_recovery'");
    const expensiveZipRead = edgeSource.indexOf('const entries = await readZip(docxBytes)', recoveryLimit);

    expect(claim).toBeGreaterThanOrEqual(0);
    expect(recoveryLookup).toBeGreaterThan(claim);
    expect(existingJobReturn).toBeGreaterThan(recoveryLookup);
    expect(lookupFailure).toBeGreaterThan(existingJobReturn);
    expect(edgeSource.slice(lookupFailure, recoveryLimit)).toContain("return json({ error: 'unavailable' }, 503);");
    expect(recoveryLimit).toBeGreaterThan(existingJobReturn);
    expect(recoveryLimit).toBeGreaterThan(lookupFailure);
    expect(recoveryScopeCall).toBeGreaterThan(recoveryLimit);
    expect(expensiveZipRead).toBeGreaterThan(recoveryLimit);
    expect(edgeSource).toContain("const reset = await resetRecoveryRequest();\n        await dropAttempt(admin, attempt);");
    expect(edgeSource).toContain("if (!reset) return requestStateResponse('processing', null, requestId);");
  });
});
