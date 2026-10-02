export const PROTOCOL_VERSION = 1 as const;

const CONTROL_OPERATIONS = [
  'health',
  'register',
  'heartbeat',
  'claim',
  'renew',
  'expand',
  'release',
  'snapshot',
] as const;

export type ControlOperation = typeof CONTROL_OPERATIONS[number];

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateEnvelope(value: unknown):
  | { ok: true; operation: ControlOperation; payload: JsonRecord }
  | { ok: false; code: string; message: string } {
  if (!isRecord(value)) {
    return { ok: false, code: 'invalid_envelope', message: 'Body mora biti JSON objekt.' };
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return { ok: false, code: 'protocol_mismatch', message: 'Nepodrzana protocolVersion.' };
  }
  if (typeof value.operation !== 'string' || !CONTROL_OPERATIONS.includes(value.operation as ControlOperation)) {
    return { ok: false, code: 'unknown_operation', message: 'Nepoznata control-plane operacija.' };
  }
  if (!isRecord(value.payload)) {
    return { ok: false, code: 'invalid_payload', message: 'Payload mora biti JSON objekt.' };
  }
  return { ok: true, operation: value.operation as ControlOperation, payload: value.payload };
}

export function canonicalScopeJson(scope: unknown): string | null {
  if (!isRecord(scope)) return null;
  const keys = Object.keys(scope).sort();
  if (keys.join(',') !== 'forbidden,read,write') return null;

  const result: Record<'read' | 'write' | 'forbidden', string[]> = {
    read: [],
    write: [],
    forbidden: [],
  };

  for (const key of ['read', 'write', 'forbidden'] as const) {
    const value = scope[key];
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
    result[key] = [...value] as string[];
  }
  return JSON.stringify(result);
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function payloadScopeHashValid(payload: JsonRecord): Promise<boolean> {
  if (!('scope' in payload)) return false;
  const canonical = canonicalScopeJson(payload.scope);
  if (canonical === null || typeof payload.scopeHash !== 'string') return false;
  return (await sha256Hex(canonical)) === payload.scopeHash.toLowerCase();
}

export async function timingSafeTokenHashMatch(provided: string | null, expectedSha256: string): Promise<boolean> {
  if (!provided || !/^[0-9a-f]{64}$/i.test(expectedSha256)) return false;
  const left = await sha256Hex(provided);
  const right = expectedSha256.toLowerCase();
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export function statusForControlResult(result: unknown): number {
  if (!isRecord(result) || result.protocolVersion !== PROTOCOL_VERSION) return 502;
  if (result.ok === true) return 200;
  switch (result.code) {
    case 'lease_conflict':
    case 'session_busy':
    case 'task_busy':
    case 'lease_requires_expand':
    case 'lease_expired':
    case 'session_identity_conflict':
      return 409;
    case 'lease_not_found':
      return 404;
    case 'invalid_envelope':
    case 'invalid_payload':
    case 'invalid_session':
    case 'invalid_claim':
    case 'invalid_expand':
    case 'invalid_renew':
    case 'invalid_release':
    case 'invalid_ttl':
    case 'unknown_operation':
    case 'session_not_registered':
    case 'lease_owner_mismatch':
      return 400;
    default:
      return 500;
  }
}
