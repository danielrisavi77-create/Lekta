import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  globalLeaseEnforced,
  scrubControlPlaneAdminToken,
} from './global-lease.mjs';

export function buildImplementerEnvironment(env, { taskId, scopeEnforced, baseSha }) {
  const safe = scrubControlPlaneAdminToken(env);
  return {
    ...safe,
    LEKTA_ROLE: 'implementer',
    LEKTA_TASK_ID: taskId,
    LEKTA_SCOPE_ENFORCED: scopeEnforced ? '1' : '0',
    ...(globalLeaseEnforced(env) ? { LEKTA_GLOBAL_LEASE_BASE_SHA: baseSha } : {}),
  };
}

export function validateGlobalLeaseSync({
  root,
  taskId,
  baseSha,
  env = process.env,
  spawn = spawnSync,
}) {
  if (!globalLeaseEnforced(env)) {
    return { enforced: false, leaseId: null, expiresAt: null };
  }

  const sessionName = String(env.LEKTA_SESSION_NAME || '').trim();
  const leaseId = String(env.LEKTA_GLOBAL_LEASE_ID || '').trim();
  if (!sessionName) throw new Error('Global lease enforcement zahtijeva LEKTA_SESSION_NAME');
  if (!leaseId) throw new Error('Global lease enforcement zahtijeva LEKTA_GLOBAL_LEASE_ID');
  if (!String(env.LEKTA_GLOBAL_LEASE_TOKEN || '').trim()) {
    throw new Error('Global lease enforcement zahtijeva LEKTA_GLOBAL_LEASE_TOKEN');
  }
  if (!String(env.LEKTA_CONTROL_PLANE_URL || '').trim()) {
    throw new Error('Global lease enforcement zahtijeva LEKTA_CONTROL_PLANE_URL');
  }

  const script = join(root, 'scripts', 'agents', 'control-plane-cli.mjs');
  const result = spawn(process.execPath, [
    script,
    'validate',
    taskId,
    '--lease-id', leaseId,
    '--session', sessionName,
    '--base-sha', baseSha,
  ], {
    cwd: root,
    env: scrubControlPlaneAdminToken(env),
    encoding: 'utf8',
    timeout: 15_000,
    shell: false,
  });

  if (result.status !== 0) {
    const message = String(result.stderr || result.stdout || 'lease validation failed').trim();
    throw new Error(message || 'lease validation failed');
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch {
    throw new Error('Lease validation CLI nije vratio valjan JSON');
  }
  if (parsed?.ok !== true) throw new Error('Lease validation CLI nije potvrdio ok=true');
  return {
    enforced: true,
    leaseId: parsed.leaseId ?? leaseId,
    expiresAt: parsed.expiresAt ?? null,
  };
}
