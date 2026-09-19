import {
  canonicalUtf8,
  fromBase64Url,
  sha256Hex,
  type JsonValue,
} from '../contract/index.ts';

export type LocalRepairStatusEvent =
  | 'processing'
  | 'heartbeat'
  | 'retryable'
  | 'completed'
  | 'local_failed';

export type LocalRepairState =
  | 'claimed'
  | 'processing'
  | 'retryable'
  | 'completed'
  | 'local_failed';

export interface LocalRepairStatusInput {
  version: 1;
  jobId: string;
  sequence: number;
  event: LocalRepairStatusEvent;
  occurredAt: string;
  checkpointSha256: string | null;
  outputSha256: string | null;
  reportSha256: string | null;
  signature: string;
}

export interface LocalRepairStatusBinding {
  jobId: string;
  localState: LocalRepairState;
  devicePublicKeySpki: string;
  deviceKeySha256: string;
}

export interface AtomicLocalRepairStatus {
  jobId: string;
  deviceKeySha256: string;
  sequence: number;
  event: LocalRepairStatusEvent;
  occurredAt: string;
  checkpointSha256: string | null;
  outputSha256: string | null;
  reportSha256: string | null;
  eventSha256: string;
}

export interface LocalRepairStatusDependencies {
  now: () => Date;
  loadBinding: (jobId: string) => Promise<LocalRepairStatusBinding | null>;
  advanceAtomic: (
    event: AtomicLocalRepairStatus,
  ) => Promise<{ localState: LocalRepairState; sequence: number } | null>;
}

export type LocalRepairStatusResult =
  | { ok: true; jobId: string; localState: LocalRepairState; sequence: number }
  | {
    ok: false;
    code:
      | 'invalid-request'
      | 'stale-event'
      | 'not-bound'
      | 'invalid-device-key'
      | 'invalid-signature'
      | 'not-advanceable';
  };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const EVENTS = new Set<LocalRepairStatusEvent>([
  'processing',
  'heartbeat',
  'retryable',
  'completed',
  'local_failed',
]);
const STATES = new Set<LocalRepairState>([
  'claimed',
  'processing',
  'retryable',
  'completed',
  'local_failed',
]);
const MAX_CLOCK_SKEW_MS = 10 * 60 * 1_000;
const INPUT_KEYS = [
  'checkpointSha256',
  'event',
  'jobId',
  'occurredAt',
  'outputSha256',
  'reportSha256',
  'sequence',
  'signature',
  'version',
].join(',');

function dataObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hashOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && SHA256.test(value));
}

function validHashesForEvent(input: LocalRepairStatusInput): boolean {
  if (input.event === 'processing') {
    return input.checkpointSha256 === null
      && input.outputSha256 === null
      && input.reportSha256 === null;
  }
  if (input.event === 'heartbeat') {
    return input.outputSha256 === null && input.reportSha256 === null;
  }
  if (input.event === 'retryable') {
    return input.checkpointSha256 !== null
      && input.outputSha256 === null
      && input.reportSha256 === null;
  }
  if (input.event === 'completed') {
    return input.outputSha256 !== null && input.reportSha256 !== null;
  }
  return input.outputSha256 === null && input.reportSha256 === null;
}

function parseInput(value: unknown): LocalRepairStatusInput | null {
  if (!dataObject(value) || Object.keys(value).sort().join(',') !== INPUT_KEYS) return null;
  const event = value.event;
  const input = value as unknown as LocalRepairStatusInput;
  if (value.version !== 1
    || typeof value.jobId !== 'string'
    || !UUID.test(value.jobId)
    || !Number.isSafeInteger(value.sequence)
    || (value.sequence as number) < 1
    || typeof event !== 'string'
    || !EVENTS.has(event as LocalRepairStatusEvent)
    || typeof value.occurredAt !== 'string'
    || !hashOrNull(value.checkpointSha256)
    || !hashOrNull(value.outputSha256)
    || !hashOrNull(value.reportSha256)
    || typeof value.signature !== 'string'
    || !validHashesForEvent(input)) return null;
  return input;
}

function canonicalTimestampMs(value: string): number | null {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function unsignedPayload(input: LocalRepairStatusInput): JsonValue {
  return {
    version: input.version,
    jobId: input.jobId,
    sequence: input.sequence,
    event: input.event,
    occurredAt: input.occurredAt,
    checkpointSha256: input.checkpointSha256,
    outputSha256: input.outputSha256,
    reportSha256: input.reportSha256,
  };
}

async function verifiedDeviceKey(
  binding: LocalRepairStatusBinding,
): Promise<CryptoKey | null> {
  if (binding.jobId.length === 0
    || !STATES.has(binding.localState)
    || !SHA256.test(binding.deviceKeySha256)) return null;
  try {
    const bytes = fromBase64Url(binding.devicePublicKeySpki);
    if (bytes.length < 80 || bytes.length > 512) return null;
    if (await sha256Hex(bytes) !== binding.deviceKeySha256) return null;
    return await crypto.subtle.importKey(
      'spki',
      new Uint8Array(bytes),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return null;
  }
}

export async function recordLocalRepairStatus(
  value: unknown,
  dependencies: LocalRepairStatusDependencies,
): Promise<LocalRepairStatusResult> {
  const input = parseInput(value);
  if (!input) return { ok: false, code: 'invalid-request' };

  const occurredAtMs = canonicalTimestampMs(input.occurredAt);
  const nowMs = dependencies.now().getTime();
  if (occurredAtMs === null
    || !Number.isFinite(nowMs)
    || occurredAtMs > nowMs + MAX_CLOCK_SKEW_MS
    || (input.event !== 'completed' && occurredAtMs < nowMs - MAX_CLOCK_SKEW_MS)) {
    return { ok: false, code: 'stale-event' };
  }

  const binding = await dependencies.loadBinding(input.jobId);
  if (!binding || binding.jobId !== input.jobId) return { ok: false, code: 'not-bound' };
  const publicKey = await verifiedDeviceKey(binding);
  if (!publicKey) return { ok: false, code: 'invalid-device-key' };

  let signature: Uint8Array;
  try {
    signature = fromBase64Url(input.signature);
  } catch {
    return { ok: false, code: 'invalid-signature' };
  }
  if (signature.length !== 64) return { ok: false, code: 'invalid-signature' };

  let verified = false;
  const payloadBytes = canonicalUtf8(unsignedPayload(input));
  const signatureBytes = new Uint8Array(new ArrayBuffer(signature.byteLength));
  signatureBytes.set(signature);
  const verificationBytes = new Uint8Array(new ArrayBuffer(payloadBytes.byteLength));
  verificationBytes.set(payloadBytes);
  try {
    verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureBytes,
      verificationBytes,
    );
  } catch {
    verified = false;
  }
  if (!verified) return { ok: false, code: 'invalid-signature' };

  const event: AtomicLocalRepairStatus = {
    jobId: input.jobId,
    deviceKeySha256: binding.deviceKeySha256,
    sequence: input.sequence,
    event: input.event,
    occurredAt: input.occurredAt,
    checkpointSha256: input.checkpointSha256,
    outputSha256: input.outputSha256,
    reportSha256: input.reportSha256,
    eventSha256: await sha256Hex(payloadBytes),
  };
  const advanced = await dependencies.advanceAtomic(event);
  if (!advanced || advanced.sequence !== input.sequence || !STATES.has(advanced.localState)) {
    return { ok: false, code: 'not-advanceable' };
  }
  return {
    ok: true,
    jobId: input.jobId,
    localState: advanced.localState,
    sequence: advanced.sequence,
  };
}
