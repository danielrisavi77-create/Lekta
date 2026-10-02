import { createHash } from 'node:crypto';
import { validateWorkScope } from './task-scope.mjs';

const DEFAULT_TIMEOUT_MS = 8_000;
const SESSION_RE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,63}$/;
const TASK_RE = /^T\d{2}$/;
const SHA_RE = /^[0-9a-f]{40}$/i;

function normalizedBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('LEKTA_CONTROL_PLANE_URL nije valjan URL');
  }
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('Control-plane URL mora koristiti HTTPS (HTTP je dopusten samo za localhost)');
  }
  url.hash = '';
  return url.toString();
}

export function controlPlaneConfigFromEnv(env = process.env) {
  const baseUrl = String(env.LEKTA_CONTROL_PLANE_URL || '').trim();
  const adminToken = String(env.LEKTA_CONTROL_PLANE_ADMIN_TOKEN || '').trim();
  if (!baseUrl) throw new Error('Nedostaje LEKTA_CONTROL_PLANE_URL');
  if (!adminToken) throw new Error('Nedostaje LEKTA_CONTROL_PLANE_ADMIN_TOKEN');
  return { baseUrl: normalizedBaseUrl(baseUrl), adminToken };
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

export function buildLeaseClaim({
  task,
  sessionName,
  baseSha,
  ttlSeconds = 900,
  branch = null,
  environmentKind = null,
}) {
  if (!task || typeof task !== 'object' || !TASK_RE.test(String(task.id || ''))) {
    throw new Error('Claim zahtijeva valjan Txx zadatak');
  }
  if (!SESSION_RE.test(String(sessionName || ''))) {
    throw new Error('sessionName nije valjan');
  }
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
    sessionName: String(sessionName),
    baseSha: String(baseSha).toLowerCase(),
    scope,
    scopeHash: hashScope(scope),
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
      body: JSON.stringify({ operation, payload }),
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
