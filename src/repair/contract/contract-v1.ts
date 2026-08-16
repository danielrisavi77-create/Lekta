import { sha256Hex } from './hash.ts';
import { parseContractRequests, requiredExceptionScope } from './request-policy.ts';
import {
  GOLDEN_GATES,
  type AllowedExceptionV1,
  type GoldenGate,
  type RepairContractOutputPolicyV1,
  type RepairContractSignatureV1,
  type RepairContractV1,
  type RepairContractVerificationPolicyV1,
  type UnsignedRepairContractV1,
} from './types.ts';

export interface RepairContractContext {
  now: Date;
  sourceBytes: Uint8Array;
  engineVersion: string;
  expectedJobId?: string;
  expectedUserId?: string;
  maxLifetimeMs?: number;
}

export type ContractValidationCode =
  | 'invalid-shape'
  | 'unsupported-version'
  | 'invalid-id'
  | 'invalid-hash'
  | 'source-size-mismatch'
  | 'source-hash-mismatch'
  | 'invalid-time'
  | 'expired'
  | 'lifetime-too-long'
  | 'engine-out-of-range'
  | 'request-policy'
  | 'missing-exception'
  | 'orphan-exception'
  | 'unsafe-output-policy'
  | 'insufficient-verification-policy';

export interface ContractValidationIssue {
  code: ContractValidationCode;
  path: string;
}

export type ContractParseResult =
  | { ok: true; contract: RepairContractV1 }
  | { ok: false; issues: ContractValidationIssue[] };

export type ContractContextResult =
  | { ok: true }
  | { ok: false; issues: ContractValidationIssue[] };

type DataObject = Record<string, unknown>;

const TOP_LEVEL_KEYS = [
  'allowedExceptions',
  'contractSignature',
  'contractVersion',
  'createdAt',
  'engineMaxVersion',
  'engineMinVersion',
  'expiresAt',
  'jobId',
  'outputPolicy',
  'requests',
  'sourceFileName',
  'sourceSha256',
  'sourceSize',
  'userId',
  'verificationPolicy',
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const DAY_MS = 24 * 60 * 60 * 1_000;

function issue(code: ContractValidationCode, path: string): ContractParseResult {
  return { ok: false, issues: [{ code, path }] };
}

function contextIssue(code: ContractValidationCode, path: string): ContractContextResult {
  return { ok: false, issues: [{ code, path }] };
}

function dataObject(value: unknown): value is DataObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = descriptors[key];
    return descriptor.enumerable && 'value' in descriptor;
  });
}

function exactKeys(value: DataObject, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function parseIso(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value ? timestamp : null;
}

function parseSemver(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null;
  const match = SEMVER.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareSemver(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function safeDocxFileName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 180) return false;
  if (!/\.docx$/i.test(value) || /[<>:"|?*\\/\0]/.test(value) || value.includes('..')) return false;
  const stem = value.slice(0, -'.docx'.length);
  if (!stem || /[. ]$/.test(stem)) return false;
  if (value !== value.trim() || /[. ]$/.test(value) || RESERVED_WINDOWS_NAME.test(value)) return false;
  return true;
}

function parseOutputPolicy(value: unknown): RepairContractOutputPolicyV1 | null {
  if (!dataObject(value) || !exactKeys(value, ['mode', 'overwriteSource', 'suggestedFileName'])) return null;
  if (value.mode !== 'new-file' || value.overwriteSource !== false || !safeDocxFileName(value.suggestedFileName)) return null;
  return { mode: 'new-file', overwriteSource: false, suggestedFileName: value.suggestedFileName };
}

function parseVerificationPolicy(value: unknown): RepairContractVerificationPolicyV1 | null {
  const keys = [
    'preserveUnrelatedWordInstances',
    'requireFieldsUpdateEquality',
    'requireOpenAndRepairFalse',
    'requireSourceByteIdentity',
    'requireVisibleTextEquality',
    'requiredGates',
  ];
  if (!dataObject(value) || !exactKeys(value, keys)) return null;
  if (value.requireSourceByteIdentity !== true
    || value.requireOpenAndRepairFalse !== true
    || value.requireVisibleTextEquality !== true
    || value.requireFieldsUpdateEquality !== true
    || value.preserveUnrelatedWordInstances !== true
    || !Array.isArray(value.requiredGates)) return null;
  const gates = value.requiredGates;
  if (gates.length !== GOLDEN_GATES.length || new Set(gates).size !== GOLDEN_GATES.length) return null;
  if (gates.some((gate) => typeof gate !== 'string' || !GOLDEN_GATES.includes(gate as GoldenGate))) return null;
  return {
    requireSourceByteIdentity: true,
    requireOpenAndRepairFalse: true,
    requireVisibleTextEquality: true,
    requireFieldsUpdateEquality: true,
    preserveUnrelatedWordInstances: true,
    requiredGates: [...gates] as GoldenGate[],
  };
}

function parseSignature(value: unknown): RepairContractSignatureV1 | null {
  if (!dataObject(value) || !exactKeys(value, ['algorithm', 'keyId', 'value'])) return null;
  if (value.algorithm !== 'ES256-P1363'
    || typeof value.keyId !== 'string'
    || !/^[A-Za-z0-9._-]{1,100}$/.test(value.keyId)
    || typeof value.value !== 'string'
    || !BASE64URL.test(value.value)
    || value.value.length > 1_024) return null;
  return { algorithm: 'ES256-P1363', keyId: value.keyId, value: value.value };
}

function parseExceptions(value: unknown): { exceptions: AllowedExceptionV1[]; timestamps: number[] } | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const exceptions: AllowedExceptionV1[] = [];
  const timestamps: number[] = [];
  for (const candidate of value) {
    if (!dataObject(candidate) || !exactKeys(candidate, ['requestId', 'scope', 'confirmationSha256', 'confirmedAt'])) return null;
    const timestamp = parseIso(candidate.confirmedAt);
    if (typeof candidate.requestId !== 'string'
      || !/^req-[0-9]{4}$/.test(candidate.requestId)
      || !['visible-text', 'structure', 'metadata'].includes(String(candidate.scope))
      || typeof candidate.confirmationSha256 !== 'string'
      || !SHA256.test(candidate.confirmationSha256)
      || timestamp === null) return null;
    exceptions.push({
      requestId: candidate.requestId,
      scope: candidate.scope as AllowedExceptionV1['scope'],
      confirmationSha256: candidate.confirmationSha256,
      confirmedAt: candidate.confirmedAt as string,
    });
    timestamps.push(timestamp);
  }
  return { exceptions, timestamps };
}

export function parseRepairContractV1(value: unknown): ContractParseResult {
  if (!dataObject(value) || !exactKeys(value, TOP_LEVEL_KEYS)) return issue('invalid-shape', 'contract');
  if (value.contractVersion !== 1) return issue('unsupported-version', 'contractVersion');
  if (typeof value.jobId !== 'string' || !UUID.test(value.jobId)) return issue('invalid-id', 'jobId');
  if (typeof value.userId !== 'string' || !UUID.test(value.userId)) return issue('invalid-id', 'userId');
  if (typeof value.sourceSha256 !== 'string' || !SHA256.test(value.sourceSha256)) return issue('invalid-hash', 'sourceSha256');
  if (!Number.isInteger(value.sourceSize) || (value.sourceSize as number) < 0) return issue('invalid-shape', 'sourceSize');
  if (!safeDocxFileName(value.sourceFileName)) return issue('invalid-shape', 'sourceFileName');

  const createdAt = parseIso(value.createdAt);
  const expiresAt = parseIso(value.expiresAt);
  if (createdAt === null || expiresAt === null || expiresAt <= createdAt) return issue('invalid-time', 'createdAt');
  const engineMin = parseSemver(value.engineMinVersion);
  const engineMax = parseSemver(value.engineMaxVersion);
  if (!engineMin || !engineMax || compareSemver(engineMin, engineMax) > 0) return issue('invalid-shape', 'engineMinVersion');

  const requests = parseContractRequests(value.requests);
  if (!requests.ok) return issue('request-policy', 'requests');
  const parsedExceptions = parseExceptions(value.allowedExceptions);
  if (!parsedExceptions) return issue('invalid-shape', 'allowedExceptions');
  const requestById = new Map(requests.requests.map((request) => [request.requestId, request]));

  for (const exception of parsedExceptions.exceptions) {
    const request = requestById.get(exception.requestId);
    if (!request || requiredExceptionScope(request.fixerId) === null) return issue('orphan-exception', 'allowedExceptions');
  }
  for (const request of requests.requests) {
    const scope = requiredExceptionScope(request.fixerId);
    if (!scope) continue;
    const matching = parsedExceptions.exceptions.filter((exception) => exception.requestId === request.requestId && exception.scope === scope);
    if (matching.length !== 1 || parsedExceptions.exceptions.filter((exception) => exception.requestId === request.requestId).length !== 1) {
      return issue('missing-exception', `allowedExceptions.${request.requestId}`);
    }
  }
  for (const confirmedAt of parsedExceptions.timestamps) {
    if (confirmedAt > createdAt || createdAt - confirmedAt > DAY_MS) return issue('invalid-time', 'allowedExceptions.confirmedAt');
  }

  const outputPolicy = parseOutputPolicy(value.outputPolicy);
  if (!outputPolicy) return issue('unsafe-output-policy', 'outputPolicy');
  const verificationPolicy = parseVerificationPolicy(value.verificationPolicy);
  if (!verificationPolicy) return issue('insufficient-verification-policy', 'verificationPolicy');
  const contractSignature = parseSignature(value.contractSignature);
  if (!contractSignature) return issue('invalid-shape', 'contractSignature');

  const contract: RepairContractV1 = {
    contractVersion: 1,
    jobId: value.jobId,
    userId: value.userId,
    sourceSha256: value.sourceSha256,
    sourceSize: value.sourceSize as number,
    sourceFileName: value.sourceFileName,
    createdAt: value.createdAt as string,
    expiresAt: value.expiresAt as string,
    engineMinVersion: value.engineMinVersion as string,
    engineMaxVersion: value.engineMaxVersion as string,
    requests: requests.requests,
    allowedExceptions: parsedExceptions.exceptions,
    outputPolicy,
    verificationPolicy,
    contractSignature,
  };
  return { ok: true, contract };
}

export function unsignedPayload(contract: RepairContractV1): UnsignedRepairContractV1 {
  const { contractSignature: _contractSignature, ...payload } = contract;
  return payload;
}

export async function validateRepairContractContext(
  contract: RepairContractV1,
  context: RepairContractContext,
): Promise<ContractContextResult> {
  const now = context.now.getTime();
  const createdAt = Date.parse(contract.createdAt);
  const expiresAt = Date.parse(contract.expiresAt);
  if (!Number.isFinite(now) || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return contextIssue('invalid-time', 'now');
  if (now < createdAt) return contextIssue('invalid-time', 'createdAt');
  if (now >= expiresAt) return contextIssue('expired', 'expiresAt');
  const maxLifetimeMs = context.maxLifetimeMs ?? DAY_MS;
  if (!Number.isFinite(maxLifetimeMs) || maxLifetimeMs <= 0) return contextIssue('invalid-time', 'maxLifetimeMs');
  if (expiresAt - createdAt > maxLifetimeMs) return contextIssue('lifetime-too-long', 'expiresAt');
  if (context.expectedJobId !== undefined && context.expectedJobId !== contract.jobId) return contextIssue('invalid-id', 'jobId');
  if (context.expectedUserId !== undefined && context.expectedUserId !== contract.userId) return contextIssue('invalid-id', 'userId');
  if (context.sourceBytes.length !== contract.sourceSize) return contextIssue('source-size-mismatch', 'sourceSize');
  if (await sha256Hex(context.sourceBytes) !== contract.sourceSha256) return contextIssue('source-hash-mismatch', 'sourceSha256');

  const engine = parseSemver(context.engineVersion);
  const minimum = parseSemver(contract.engineMinVersion);
  const maximum = parseSemver(contract.engineMaxVersion);
  if (!engine || !minimum || !maximum || compareSemver(engine, minimum) < 0 || compareSemver(engine, maximum) > 0) {
    return contextIssue('engine-out-of-range', 'engineVersion');
  }
  return { ok: true };
}
