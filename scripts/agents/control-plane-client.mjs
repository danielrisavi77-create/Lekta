import { createHash } from 'node:crypto';
import { validateWorkScope } from './task-scope.mjs';

const DEFAULT_TIMEOUT_MS = 8_000;
const SESSION_RE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,63}$/;
const TASK_RE = /^T\d{2,4}$/;
const SHA_RE = /^[0-9a-f]{40}$/i;
const HASH_RE = /^[0-9a-f]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('LEKTA_CONTROL_PLANE_URL nije valjan URL');
  }
  if (url.username || url.password) {
    throw new Error('Control-plane URL ne smije sadrzavati credentials');
  }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Control-plane URL mora koristiti HTTPS (HTTP je dopusten samo za localhost)');
  }
  url.hash = '';
  return url.toString();
}

export function validateSessionName(raw) {
  const value = String(raw || '').trim();
  if (!SESSION_RE.test(value)) throw new Error('sessionName nije valjan');
  return value;
}

function controlPlaneUrlFromEnv(env = process.env) {
  const baseUrl = String(env.LEKTA_CONTROL_PLANE_URL || '').trim();
  if (!baseUrl) throw new Error('Nedostaje LEKTA_CONTROL_PLANE_URL');
  return normalizedBaseUrl(baseUrl);
}

export function controlPlaneConfigFromEnv(env = process.env) {
  const baseUrl = controlPlaneUrlFromEnv(env);
  const adminToken = String(env.LEKTA_CONTROL_PLANE_ADMIN_TOKEN || '').trim();
  if (!adminToken) throw new Error('Nedostaje LEKTA_CONTROL_PLANE_ADMIN_TOKEN');
  return { baseUrl, adminToken };
}

function canonicalScope(scope, taskId) {
  const validated = validateWorkScope(scope, taskId) ?? {};
  return {
    read: [...(validated.read ?? [])].sort(),
    write: [...(validated.write ?? [])].sort(),
    forbidden: [...(validated.forbidden ?? [])].sort(),
  };
}

function hashScope(scope) {
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}

export function workScopeHash(scope, taskId) {
  return hashScope(canonicalScope(scope, taskId));
}

export function leaseCapabilityHash(rawToken) {
  const token = String(rawToken || '').trim();
  if (token.length < 32 || token.length > 256 || /\s/.test(token)) {
    throw new Error('Lease capability token mora imati 32-256 znakova bez razmaka');
  }
  return createHash('sha256').update(token).digest('hex');
}

export function buildLeaseValidation({
  leaseId,
  taskId,
  sessionName,
  baseSha,
  scopeHash,
}) {
  const normalizedLeaseId = String(leaseId || '').trim();
  const normalizedTaskId = String(taskId || '').trim();
  const normalizedBaseSha = String(baseSha || '').trim().toLowerCase();
  const normalizedScopeHash = String(scopeHash || '').trim().toLowerCase();
  if (!UUID_RE.test(normalizedLeaseId)) throw new Error('leaseId nije valjan UUID');
  if (!TASK_RE.test(normalizedTaskId)) throw new Error('taskId nije valjan Txx-Txxxx');
  if (!SHA_RE.test(normalizedBaseSha)) throw new Error('baseSha mora biti puni 40-znamenkasti Git SHA');
  if (!HASH_RE.test(normalizedScopeHash)) throw new Error('scopeHash mora biti SHA-256 hex');
  return {
    leaseId: normalizedLeaseId,
    taskId: normalizedTaskId,
    sessionName: validateSessionName(sessionName),
    baseSha: normalizedBaseSha,
    scopeHash: normalizedScopeHash,
  };
}

export function buildLeaseClaim({
  task,
  sessionName,
  baseSha,
  ttlSeconds = 900,
  branch = null,
  environmentKind = null,
}) {
  if (!task || typeof task !== 'object' || !TASK_RE.test(String(task.id || ''))) {
    throw new Error('Claim zahtijeva valjan Txx-Txxxx zadatak');
  }
  if (!['ready', 'in_progress'].includes(String(task.status || ''))) {
    throw new Error(`${task.id} nije claimable: status ${String(task.status ?? 'nedostaje')}; ocekuje se ready ili in_progress`);
  }
  const normalizedSession = validateSessionName(sessionName);
  if (!SHA_RE.test(String(baseSha || ''))) {
    throw new Error('baseSha mora biti puni 40-znamenkasti Git SHA');
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 120 || ttlSeconds > 3600) {
    throw new Error('ttlSeconds mora biti cijeli broj od 120 do 3600');
  }
  const scope = canonicalScope(task.workScope, task.id);
  if (scope.write.length === 0) {
    throw new Error(`${task.id} nema workScope.write; globalni write lease se ne moze traziti`);
  }
  const metadata = {};
  if (branch) metadata.branch = String(branch);
  if (environmentKind) metadata.environmentKind = String(environmentKind);
  return {
    taskId: task.id,
    sessionName: normalizedSession,
    baseSha: String(baseSha).toLowerCase(),
    scope,
    scopeHash: workScopeHash(scope, task.id),
    ttlSeconds,
    metadata,
  };
}

export async function requestControlPlane(operation, payload = {}, options = {}) {
  if (typeof operation !== 'string' || !/^[a-z][a-z0-9_-]{1,31}$/.test(operation)) {
    throw new Error('Nevaljana control-plane operacija');
  }
  const config = options.config ?? controlPlaneConfigFromEnv(options.env);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch nije dostupan');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(config.baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lekta-control-token': config.adminToken,
      },
      body: JSON.stringify({ protocolVersion: 1, operation, payload }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Control-plane zahtjev je istekao');
    throw new Error(`Control-plane nije dostupan: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Control-plane je vratio nevaljan JSON (HTTP ${response.status})`);
  }
  if (body?.protocolVersion !== 1) {
    throw new Error(`Control-plane protocol nije kompatibilan: ${String(body?.protocolVersion ?? 'nedostaje')}`);
  }
  if (!response.ok || body?.ok === false) {
    const code = typeof body?.code === 'string' ? body.code : `http_${response.status}`;
    const message = typeof body?.message === 'string' ? body.message : 'zahtjev odbijen';
    const safeMessage = config.adminToken ? message.split(config.adminToken).join('[REDACTED]') : message;
    throw new Error(`Control-plane ${code}: ${safeMessage}`);
  }
  if (!body || typeof body !== 'object' || body.ok !== true) {
    throw new Error('Control-plane odgovor nema ok=true');
  }
  return body;
}


export async function requestLeaseValidation(payload, options = {}) {
  const baseUrl = options.baseUrl ?? controlPlaneUrlFromEnv(options.env);
  const leaseToken = String(options.leaseToken ?? options.env?.LEKTA_GLOBAL_LEASE_TOKEN ?? process.env.LEKTA_GLOBAL_LEASE_TOKEN ?? '').trim();
  if (!leaseToken) throw new Error('Nedostaje LEKTA_GLOBAL_LEASE_TOKEN');
  leaseCapabilityHash(leaseToken);

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch nije dostupan');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lekta-lease-token': leaseToken,
      },
      body: JSON.stringify({ protocolVersion: 1, operation: 'validate', payload }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Lease validation je istekla');
    throw new Error(`Control-plane lease validation nije dostupna: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Lease validation je vratila nevaljan JSON (HTTP ${response.status})`);
  }
  if (body?.protocolVersion !== 1) {
    throw new Error(`Control-plane protocol nije kompatibilan: ${String(body?.protocolVersion ?? 'nedostaje')}`);
  }
  if (!response.ok || body?.ok !== true) {
    const code = typeof body?.code === 'string' ? body.code : `http_${response.status}`;
    const message = typeof body?.message === 'string' ? body.message : 'lease validation odbijena';
    const safeMessage = message.split(leaseToken).join('[REDACTED]');
    throw new Error(`Control-plane ${code}: ${safeMessage}`);
  }
  return body;
}
