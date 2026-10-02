#!/usr/bin/env node
import { buildLeaseClaim, buildLeaseValidation, leaseCapabilityHash, requestControlPlane, requestLeaseValidation } from '../../scripts/agents/control-plane-client.mjs';

const BASE_SHA = '0'.repeat(40);
const TASK_A = 'T9000';
const TASK_B = 'T9001';
const SESSION_A = 'lease-smoke-a';
const SESSION_B = 'lease-smoke-b';
const TOKEN_A = 'smoke-a-' + 'a'.repeat(48);
const TOKEN_B = 'smoke-b-' + 'b'.repeat(48);

function task(id, write) {
  return {
    id,
    status: 'ready',
    workScope: { read: [], write, forbidden: [] },
  };
}

async function expectCode(label, code, action) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes(code)) return;
    throw new Error(`${label}: ocekivao ${code}, dobio ${message}`);
  }
  throw new Error(`${label}: operacija je neocekivano prosla; ocekivao ${code}`);
}

async function cleanupSmokeLeases() {
  const snapshot = await requestControlPlane('snapshot', {});
  for (const lease of snapshot.leases ?? []) {
    if ([TASK_A, TASK_B].includes(String(lease.taskId))) {
      await requestControlPlane('release', {
        leaseId: lease.leaseId,
        reason: 'smoke_cleanup',
      });
    }
  }
}

function tokenForSession(sessionName) {
  if (sessionName === SESSION_A) return TOKEN_A;
  if (sessionName === SESSION_B) return TOKEN_B;
  throw new Error('Nepoznat smoke session za capability');
}

function buildSmokeClaim(taskId, sessionName, write, branch) {
  const payload = buildLeaseClaim({
    task: task(taskId, write),
    sessionName,
    baseSha: BASE_SHA,
    branch,
    environmentKind: 'smoke',
  });
  return {
    ...payload,
    capabilityHash: leaseCapabilityHash(tokenForSession(sessionName)),
  };
}

function claim(taskId, sessionName, write, branch) {
  return requestControlPlane('claim', buildSmokeClaim(taskId, sessionName, write, branch));
}

async function assertConcurrentConflict() {
  const results = await Promise.allSettled([
    claim(TASK_A, SESSION_A, ['.agent-control-plane-smoke/**'], 'smoke/concurrent-a'),
    claim(TASK_B, SESSION_B, ['.agent-control-plane-smoke/file.ts'], 'smoke/concurrent-b'),
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  if (fulfilled.length !== 1 || rejected.length !== 1) {
    throw new Error(`concurrent claim: ocekivao 1 success + 1 conflict, dobio ${fulfilled.length} success + ${rejected.length} reject`);
  }

  const rejection = rejected[0].reason instanceof Error
    ? rejected[0].reason.message
    : String(rejected[0].reason);
  if (!rejection.includes('lease_conflict')) {
    throw new Error(`concurrent claim: ocekivao lease_conflict, dobio ${rejection}`);
  }

  const winner = fulfilled[0].value;
  if (!winner?.leaseId) throw new Error('concurrent claim: pobjednik nema leaseId');
  await requestControlPlane('release', {
    leaseId: winner.leaseId,
    reason: 'smoke_concurrency_complete',
  });
}

async function main() {
  await requestControlPlane('health', {});
  await requestControlPlane('register', {
    sessionName: SESSION_A,
    machine: 'desktop',
    role: 'implementer',
    environmentKind: 'smoke',
  });
  await requestControlPlane('register', {
    sessionName: SESSION_B,
    machine: 'laptop',
    role: 'implementer',
    environmentKind: 'smoke',
  });
  await requestControlPlane('heartbeat', { sessionName: SESSION_A });

  await expectCode('session identity promjena', 'session_identity_conflict', () =>
    requestControlPlane('register', {
      sessionName: SESSION_A,
      machine: 'laptop',
      role: 'implementer',
      environmentKind: 'smoke',
    }));

  await cleanupSmokeLeases();
  await assertConcurrentConflict();

  let leaseA = null;
  let leaseB = null;
  try {
    const claimA = buildSmokeClaim(
      TASK_A,
      SESSION_A,
      ['.agent-control-plane-smoke-idempotent/**'],
      'smoke/a',
    );
    leaseA = await requestControlPlane('claim', claimA);

    const retryA = await requestControlPlane('claim', claimA);
    if (retryA.leaseId !== leaseA.leaseId || retryA.idempotent !== true) {
      throw new Error('ponovljeni identicni claim nije vratio isti lease ID');
    }

    const validationPayload = buildLeaseValidation({
      leaseId: leaseA.leaseId,
      taskId: TASK_A,
      sessionName: SESSION_A,
      baseSha: BASE_SHA,
      scopeHash: claimA.scopeHash,
    });
    const validated = await requestLeaseValidation(validationPayload, {
      env: process.env,
      leaseToken: TOKEN_A,
    });
    if (validated.leaseId !== leaseA.leaseId) {
      throw new Error('worker validate nije vratio aktivni lease');
    }
    await expectCode('pogresan worker capability', 'lease_validation_mismatch', () =>
      requestLeaseValidation(validationPayload, {
        env: process.env,
        leaseToken: TOKEN_B,
      }));

    const renewed = await requestControlPlane('renew', { leaseId: leaseA.leaseId, ttlSeconds: 900 });
    if (renewed.leaseId !== leaseA.leaseId) throw new Error('renew je promijenio lease ID');

    await expectCode('isti task na drugoj sesiji', 'task_busy', () =>
      claim(TASK_A, SESSION_B, ['.agent-control-plane-smoke-task-busy/**'], 'smoke/b-task-busy'));

    await expectCode('isti session na drugom tasku', 'session_busy', () =>
      claim(TASK_B, SESSION_A, ['.agent-control-plane-smoke-session-busy/**'], 'smoke/a-session-busy'));

    await requestControlPlane('release', { leaseId: leaseA.leaseId, reason: 'smoke_phase_1_done' });
    const releaseRetry = await requestControlPlane('release', { leaseId: leaseA.leaseId, reason: 'smoke_phase_1_done' });
    if (releaseRetry.idempotent !== true) throw new Error('ponovljeni release nije idempotentan');
    leaseA = null;

    leaseA = await claim(
      TASK_A,
      SESSION_A,
      ['.agent-control-plane-smoke-expand-a/**'],
      'smoke/expand-a',
    );
    leaseB = await claim(
      TASK_B,
      SESSION_B,
      ['.agent-control-plane-smoke-expand-b/**'],
      'smoke/expand-b',
    );

    const conflictingExpand = buildLeaseClaim({
      task: task(TASK_A, [
        '.agent-control-plane-smoke-expand-a/**',
        '.agent-control-plane-smoke-expand-b/file.ts',
      ]),
      sessionName: SESSION_A,
      baseSha: BASE_SHA,
      branch: 'smoke/expand-a-conflict',
      environmentKind: 'smoke',
    });
    await expectCode('expand u tudji scope', 'lease_conflict', () =>
      requestControlPlane('expand', { leaseId: leaseA.leaseId, ...conflictingExpand }));

    const safeExpand = buildLeaseClaim({
      task: task(TASK_A, [
        '.agent-control-plane-smoke-expand-a/**',
        '.agent-control-plane-smoke-expand-c/**',
      ]),
      sessionName: SESSION_A,
      baseSha: BASE_SHA,
      branch: 'smoke/expand-a-safe',
      environmentKind: 'smoke',
    });
    const expanded = await requestControlPlane('expand', { leaseId: leaseA.leaseId, ...safeExpand });
    if (expanded.leaseId !== leaseA.leaseId || expanded.idempotent !== false) {
      throw new Error('sigurni expand nije azurirao postojeci lease');
    }
    const expandRetry = await requestControlPlane('expand', { leaseId: leaseA.leaseId, ...safeExpand });
    if (expandRetry.leaseId !== leaseA.leaseId || expandRetry.idempotent !== true) {
      throw new Error('ponovljeni identicni expand nije idempotentan');
    }

    await requestControlPlane('release', { leaseId: leaseA.leaseId, reason: 'smoke_expand_complete' });
    leaseA = null;
    await requestControlPlane('release', { leaseId: leaseB.leaseId, reason: 'smoke_complete' });
    leaseB = null;

    const finalSnapshot = await requestControlPlane('snapshot', {});
    const leftovers = (finalSnapshot.leases ?? []).filter((lease) =>
      [TASK_A, TASK_B].includes(String(lease.taskId)));
    if (leftovers.length) throw new Error('smoke je ostavio aktivan lease');

    process.stdout.write('agent-control-plane smoke: OK\n');
  } finally {
    if (leaseA?.leaseId) {
      await requestControlPlane('release', { leaseId: leaseA.leaseId, reason: 'smoke_finally' }).catch(() => {});
    }
    if (leaseB?.leaseId) {
      await requestControlPlane('release', { leaseId: leaseB.leaseId, reason: 'smoke_finally' }).catch(() => {});
    }
    await cleanupSmokeLeases().catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`agent-control-plane smoke: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
