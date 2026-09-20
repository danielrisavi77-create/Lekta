import {
  buildUnsignedRepairContractV1,
  signRepairContractV1,
  type BuildRepairContractInput,
  type RepairContractV1,
} from '../src/repair/contract/index.ts';
import {
  WORDREPLICA_0_1_0_ENGINE_VERSION,
  WORDREPLICA_0_1_0_FIXER_IDS,
  WORDREPLICA_0_1_0_FIXER_REGISTRY_FINGERPRINT,
  wordReplicaSupportsFixer,
} from '../src/repair/contract/wordreplica-policy.ts';

export { WORDREPLICA_0_1_0_FIXER_IDS, WORDREPLICA_0_1_0_FIXER_REGISTRY_FINGERPRINT };

export interface BuildRepairContractPocPackageInput extends Omit<
  BuildRepairContractInput,
  'engineMinVersion' | 'engineMaxVersion'
> {
  signer: {
    privateKey: CryptoKey;
    keyId: string;
  };
}

export interface RepairContractPocPackageV1 {
  contract: RepairContractV1;
  sourceBytes: Uint8Array;
  targetBytes: Uint8Array;
}

/** Lokalni POC helper. Privatni kljuc se koristi samo za potpis i nikad nije dio rezultata. */
export async function buildRepairContractPocPackageV1(
  input: BuildRepairContractPocPackageInput,
): Promise<RepairContractPocPackageV1> {
  const unsupported = input.requests.find(
    (request) => !wordReplicaSupportsFixer(WORDREPLICA_0_1_0_ENGINE_VERSION, request.fixerId),
  );
  if (unsupported) {
    throw new TypeError(`WordReplica 0.1.0 ne podrzava fixer ${unsupported.fixerId}.`);
  }

  const sourceBytes = new Uint8Array(input.sourceBytes);
  const targetBytes = new Uint8Array(input.targetBytes);
  const { signer, ...contractInput } = input;
  const payload = await buildUnsignedRepairContractV1({
    ...contractInput,
    sourceBytes,
    targetBytes,
    engineMinVersion: WORDREPLICA_0_1_0_ENGINE_VERSION,
    engineMaxVersion: WORDREPLICA_0_1_0_ENGINE_VERSION,
  });
  const contract = await signRepairContractV1(payload, targetBytes, signer.privateKey, signer.keyId);

  return { contract, sourceBytes, targetBytes };
}
