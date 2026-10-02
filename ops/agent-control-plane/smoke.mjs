#!/usr/bin/env node
import { buildLeaseClaim, requestControlPlane } from '../../scripts/agents/control-plane-client.mjs';

const BASE_SHA = '0'.repeat(40);
const TASK_A = 'T9000';
const TASK_B = 'T9001';
const SESSION_A = 'lease-smoke-a';
const SESSION_B = 'lease-smoke-b';

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

  await cleanupSmokeLeases();

  let leaseA = null;
  let leaseB = null;
  try {
    const claimA = buildLeaseClaim({
      task: task(TASK_A, ['.agent-control-plane-smoke/**']),
      sessionName: SESSION_A,
      baseSha: BASE_SHA,
      branch: 'smoke/a',
    });
    leaseA = await requestControlPlane('claim', claimA);

    const retryA = await requestControlPlane('claim', claimA);
    if (retryA.leaseId !== leaseA.leaseId || retryA.idempotent !== true) {
      throw new Error('ponovljeni identicni claim nije vratio isti lease ID');
    }

    await expectCode('isti task na drugoj sesiji', 'task_busy', () =>
      requestControlPlane('claim', buildLeaseClaim({
        task: task(TASK_A, ['.agent-control-plane-smoke-disjoint/**']),
        sessionName: SESSION_B,
        baseSha: BASE_SHA,
        branch: 'smoke/b-task-busy',
      })));

    await expectCode('isti session na drugom tasku', 'session_busy', () =>
      requestControlPlane('claim', buildLeaseClaim({
        task: task(TASK_B, ['.agent-control-plane-smoke-disjoint/**']),
        sessionName: SESSION_A,
        baseSha: BASE_SHA,
        branch: 'smoke/a-session-busy',
      })));

    await expectCode('preklapajuci write scope', 'lease_conflict', () =>
      requestControlPlane('claim', buildLeaseClaim({
        task: task(TASK_B, ['.agent-control-plane-smoke/file.ts']),
        sessionName: SESSION_B,
        baseSha: BASE_SHA,
        branch: 'smoke/b-conflict',
      })));

    await requestControlPlane('release', { leaseId: leaseA.leaseId, reason: 'smoke_phase_1_done' });
    leaseA = null;

    leaseB = await requestControlPlane('claim', buildLeaseClaim({
      task: task(TASK_B, ['.agent-control-plane-smoke/file.ts']),
      sessionName: SESSION_B,
      baseSha: BASE_SHA,
      branch: 'smoke/b-after-release',
    }));

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
  }
}

main().catch((error) => {
  process.stderr.write(`agent-control-plane smoke: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
