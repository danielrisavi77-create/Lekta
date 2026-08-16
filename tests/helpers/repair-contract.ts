import type { RepairContractV1, UnsignedRepairContractV1 } from '../../src/repair/contract';

export const TEST_SOURCE_BYTES = new TextEncoder().encode('abc');

export function validUnsignedContract(overrides: Partial<UnsignedRepairContractV1> = {}): UnsignedRepairContractV1 {
  return {
    contractVersion: 1,
    jobId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    sourceSha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    sourceSize: 3,
    sourceFileName: 'Seminar.docx',
    createdAt: '2026-08-16T10:00:00.000Z',
    expiresAt: '2026-08-16T11:00:00.000Z',
    engineMinVersion: '1.0.0',
    engineMaxVersion: '1.0.0',
    requests: [{ requestId: 'req-0001', fixerId: 'font-fixer', ruleId: 'body-font', params: { fontName: 'Times New Roman', fontSizePt: 12 } }],
    allowedExceptions: [],
    outputPolicy: { mode: 'new-file', overwriteSource: false, suggestedFileName: 'Seminar-popravljeno.docx' },
    verificationPolicy: {
      requireSourceByteIdentity: true,
      requireOpenAndRepairFalse: true,
      requireVisibleTextEquality: true,
      requireFieldsUpdateEquality: true,
      preserveUnrelatedWordInstances: true,
      requiredGates: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'],
    },
    ...overrides,
  };
}

export function validContract(overrides: Partial<RepairContractV1> = {}): RepairContractV1 {
  return {
    ...validUnsignedContract(),
    contractSignature: { algorithm: 'ES256-P1363', keyId: 'test-key-2026-01', value: 'A'.repeat(86) },
    ...overrides,
  };
}
