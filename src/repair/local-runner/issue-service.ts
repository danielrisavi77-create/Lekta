import {
  buildUnsignedRepairContractV1,
  sha256Hex,
  signRepairContractV1,
  toBase64Url,
  type BuildRepairContractInput,
  type RepairContractV1,
} from '../contract/index.ts';
import { WORDREPLICA_0_1_0_ENGINE_VERSION } from '../contract/wordreplica-policy.ts';

export interface IssueLocalRepairInput extends Omit<
  BuildRepairContractInput,
  'engineMinVersion' | 'engineMaxVersion'
> {
  slotId: string;
  signer: {
    privateKey: CryptoKey;
    keyId: string;
  };
}

export interface IssueLocalRepairDependencies {
  randomBytes: (length: number) => Uint8Array;
}

export interface LocalRepairLaunchV1 {
  version: 1;
  jobId: string;
  claimToken: string;
  expiresAt: string;
}

export interface LocalRepairJobRecord {
  jobId: string;
  userId: string;
  slotId: string;
  sourceSha256: string;
  sourceSize: number;
  targetSha256: string;
  targetSize: number;
  repairContract: RepairContractV1;
  contractKeyId: string;
  localState: 'claimable';
  claimTokenSha256: string;
  claimExpiresAt: string;
}

export interface IssuedLocalRepairJob {
  launch: LocalRepairLaunchV1;
  record: LocalRepairJobRecord;
}

function secureRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export async function issueLocalRepairJob(
  input: IssueLocalRepairInput,
  dependencies: IssueLocalRepairDependencies = { randomBytes: secureRandomBytes },
): Promise<IssuedLocalRepairJob> {
  const tokenBytes = new Uint8Array(dependencies.randomBytes(32));
  if (tokenBytes.length !== 32) throw new TypeError('Claim token mora imati 32 bajta.');

  const { slotId, signer, ...contractInput } = input;
  const unsigned = await buildUnsignedRepairContractV1({
    ...contractInput,
    engineMinVersion: WORDREPLICA_0_1_0_ENGINE_VERSION,
    engineMaxVersion: WORDREPLICA_0_1_0_ENGINE_VERSION,
  });
  const repairContract = await signRepairContractV1(
    unsigned,
    new Uint8Array(input.targetBytes),
    signer.privateKey,
    signer.keyId,
  );
  const claimToken = toBase64Url(tokenBytes);

  return {
    launch: {
      version: 1,
      jobId: input.jobId,
      claimToken,
      expiresAt: repairContract.expiresAt,
    },
    record: {
      jobId: input.jobId,
      userId: input.userId,
      slotId,
      sourceSha256: repairContract.sourceSha256,
      sourceSize: repairContract.sourceSize,
      targetSha256: repairContract.targetSha256,
      targetSize: repairContract.targetSize,
      repairContract,
      contractKeyId: signer.keyId,
      localState: 'claimable',
      claimTokenSha256: await sha256Hex(tokenBytes),
      claimExpiresAt: repairContract.expiresAt,
    },
  };
}
