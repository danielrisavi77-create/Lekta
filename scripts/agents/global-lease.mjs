import {
  buildLeaseValidation,
  requestLeaseValidation,
  workScopeHash,
} from './control-plane-client.mjs';

export function globalLeaseEnforced(env = process.env) {
  return env.LEKTA_GLOBAL_LEASE_ENFORCED === '1';
}

export function implementerHasControlPlaneAdminToken(env = process.env) {
  return globalLeaseEnforced(env)
    && env.LEKTA_ROLE === 'implementer'
    && Boolean(String(env.LEKTA_CONTROL_PLANE_ADMIN_TOKEN || '').trim());
}

export function scrubControlPlaneAdminToken(env = process.env) {
  const {
    LEKTA_CONTROL_PLANE_ADMIN_TOKEN: _adminToken,
    ...safe
  } = env;
  return safe;
}

export function buildGlobalLeaseValidation({ env = process.env, task, baseSha = null }) {
  if (!globalLeaseEnforced(env)) return null;
  if (!task || typeof task !== 'object' || !task.id) {
    throw new Error('Global lease enforcement zahtijeva valjan task');
  }

  const resolvedBaseSha = String(baseSha ?? env.LEKTA_GLOBAL_LEASE_BASE_SHA ?? '').trim();
  return buildLeaseValidation({
    leaseId: env.LEKTA_GLOBAL_LEASE_ID,
    taskId: task.id,
    sessionName: env.LEKTA_SESSION_NAME,
    baseSha: resolvedBaseSha,
    scopeHash: workScopeHash(task.workScope, task.id),
  });
}

export async function validateGlobalLease({
  env = process.env,
  task,
  baseSha = null,
  request = requestLeaseValidation,
}) {
  if (!globalLeaseEnforced(env)) {
    return { enforced: false, leaseId: null, expiresAt: null };
  }

  const payload = buildGlobalLeaseValidation({ env, task, baseSha });
  const result = await request(payload, { env });
  return {
    enforced: true,
    leaseId: result.leaseId ?? payload.leaseId,
    expiresAt: result.expiresAt ?? null,
  };
}
