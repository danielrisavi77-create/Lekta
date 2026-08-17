import { sha256Hex } from './hash.ts';
import { parseUnsignedRepairContractV1 } from './contract-v1.ts';
import { parseContractRequests, requiredExceptionScope } from './request-policy.ts';
import {
  GOLDEN_GATES,
  type AllowedExceptionV1,
  type UnsignedRepairContractV1,
} from './types.ts';

export interface RepairConfirmationInput {
  requestIndex: number;
  confirmationText: string;
  confirmedAt: Date;
}

export interface BuildRepairContractInput {
  jobId: string;
  userId: string;
  sourceBytes: Uint8Array;
  sourceFileName: string;
  createdAt: Date;
  expiresAt: Date;
  engineMinVersion: string;
  engineMaxVersion: string;
  requests: ReadonlyArray<{ fixerId: string; ruleId: string; params: Record<string, unknown> }>;
  confirmations: ReadonlyArray<RepairConfirmationInput>;
  suggestedFileName?: string;
}

function outputFileName(sourceFileName: string): string {
  const stem = sourceFileName.replace(/\.docx$/i, '');
  return `${stem}-popravljeno.docx`;
}

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export async function buildUnsignedRepairContractV1(
  input: BuildRepairContractInput,
): Promise<UnsignedRepairContractV1> {
  const candidates = input.requests.map((request, index) => ({
    requestId: `req-${String(index + 1).padStart(4, '0')}`,
    fixerId: request.fixerId,
    ruleId: request.ruleId,
    params: request.params,
  }));
  const parsed = parseContractRequests(candidates);
  if (!parsed.ok) {
    const first = parsed.issues[0];
    throw new TypeError(`Neispravan repair zahtjev ${first.path}: ${first.code}`);
  }

  const confirmations = new Map<number, RepairConfirmationInput>();
  for (const confirmation of input.confirmations) {
    if (!Number.isInteger(confirmation.requestIndex)
      || confirmation.requestIndex < 0
      || confirmation.requestIndex >= parsed.requests.length) {
      throw new TypeError('Neispravan indeks potvrde repair zahtjeva.');
    }
    if (confirmations.has(confirmation.requestIndex)) {
      throw new TypeError('Dupla potvrda za isti repair zahtjev.');
    }
    if (typeof confirmation.confirmationText !== 'string' || confirmation.confirmationText.length < 1) {
      throw new TypeError('Tekst potvrde ne smije biti prazan.');
    }
    if (!validDate(confirmation.confirmedAt)) {
      throw new TypeError('Datum potvrde nije valjan.');
    }
    const request = parsed.requests[confirmation.requestIndex];
    if (requiredExceptionScope(request.fixerId) === null) {
      throw new TypeError('Potvrda je zadana za fixer koji je ne zahtijeva.');
    }
    confirmations.set(confirmation.requestIndex, confirmation);
  }

  const allowedExceptions: AllowedExceptionV1[] = [];
  for (const [index, request] of parsed.requests.entries()) {
    const scope = requiredExceptionScope(request.fixerId);
    const confirmation = confirmations.get(index);
    if (scope === null) continue;
    if (!confirmation) throw new TypeError(`Nedostaje potvrda za repair zahtjev ${request.requestId}.`);
    allowedExceptions.push({
      requestId: request.requestId,
      scope,
      confirmationSha256: await sha256Hex(new TextEncoder().encode(confirmation.confirmationText)),
      confirmedAt: confirmation.confirmedAt.toISOString(),
    });
  }

  if (!validDate(input.createdAt) || !validDate(input.expiresAt)) {
    throw new TypeError('Vrijeme Repair Contracta nije valjano.');
  }

  const contract: UnsignedRepairContractV1 = {
    contractVersion: 1,
    jobId: input.jobId,
    userId: input.userId,
    sourceSha256: await sha256Hex(input.sourceBytes),
    sourceSize: input.sourceBytes.length,
    sourceFileName: input.sourceFileName,
    createdAt: input.createdAt.toISOString(),
    expiresAt: input.expiresAt.toISOString(),
    engineMinVersion: input.engineMinVersion,
    engineMaxVersion: input.engineMaxVersion,
    requests: parsed.requests,
    allowedExceptions,
    outputPolicy: {
      mode: 'new-file',
      overwriteSource: false,
      suggestedFileName: input.suggestedFileName ?? outputFileName(input.sourceFileName),
    },
    verificationPolicy: {
      requireSourceByteIdentity: true,
      requireOpenAndRepairFalse: true,
      requireVisibleTextEquality: true,
      requireFieldsUpdateEquality: true,
      preserveUnrelatedWordInstances: true,
      requiredGates: [...GOLDEN_GATES],
    },
  };
  const validated = parseUnsignedRepairContractV1(contract);
  if (!validated.ok) {
    const first = validated.issues[0];
    throw new TypeError(`Neispravan Repair Contract ${first.path}: ${first.code}`);
  }
  return validated.contract;
}
