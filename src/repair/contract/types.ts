import type { FixerId } from '../fixer-registry.ts';

export const REPAIR_CONTRACT_VERSION = 1 as const;
export const REPAIR_CONTRACT_MAX_REQUESTS = 64 as const;
export const REPAIR_CONTRACT_SIGNATURE_ALGORITHM = 'ES256-P1363' as const;
export const REPAIR_CONTRACT_KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
export const REPAIR_CONTRACT_SIGNATURE_BYTES = 64 as const;
export const GOLDEN_GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'] as const;

export type GoldenGate = (typeof GOLDEN_GATES)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface RepairContractRequestV1 {
  requestId: string;
  fixerId: FixerId;
  ruleId: string;
  params: JsonObject;
}

export interface AllowedExceptionV1 {
  requestId: string;
  scope: 'visible-text' | 'structure' | 'metadata';
  confirmationSha256: string;
  confirmedAt: string;
}

export interface RepairContractOutputPolicyV1 {
  mode: 'new-file';
  overwriteSource: false;
  suggestedFileName: string;
}

export interface RepairContractVerificationPolicyV1 {
  requireSourceByteIdentity: true;
  requireOpenAndRepairFalse: true;
  requireVisibleTextEquality: true;
  requireFieldsUpdateEquality: true;
  preserveUnrelatedWordInstances: true;
  requiredGates: GoldenGate[];
}

export interface UnsignedRepairContractV1 {
  contractVersion: 1;
  jobId: string;
  userId: string;
  sourceSha256: string;
  sourceSize: number;
  sourceFileName: string;
  createdAt: string;
  expiresAt: string;
  engineMinVersion: string;
  engineMaxVersion: string;
  requests: RepairContractRequestV1[];
  allowedExceptions: AllowedExceptionV1[];
  outputPolicy: RepairContractOutputPolicyV1;
  verificationPolicy: RepairContractVerificationPolicyV1;
}

export interface RepairContractSignatureV1 {
  algorithm: 'ES256-P1363';
  keyId: string;
  value: string;
}

export interface RepairContractV1 extends UnsignedRepairContractV1 {
  contractSignature: RepairContractSignatureV1;
}
