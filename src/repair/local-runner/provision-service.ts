import { importRepairContractPrivateKey } from '../contract/signature.ts';
import {
  issueLocalRepairJob,
  type IssuedLocalRepairJob,
  type IssueLocalRepairInput,
} from './issue-service.ts';

export interface LocalRepairProvisioningConfig {
  enabled: boolean;
  privateKeyPkcs8Base64Url: string;
  keyId: string;
}

export interface LocalRepairProvisioningDependencies {
  importSigner: (privateKeyPkcs8Base64Url: string) => Promise<CryptoKey>;
  issue: (input: IssueLocalRepairInput) => Promise<IssuedLocalRepairJob>;
}

export type LocalRepairProvisioningResult =
  | { ok: true; issued: IssuedLocalRepairJob }
  | { ok: false; code: 'disabled' | 'unconfigured' | 'unavailable' };

const DEFAULT_DEPENDENCIES: LocalRepairProvisioningDependencies = {
  importSigner: importRepairContractPrivateKey,
  issue: issueLocalRepairJob,
};

export async function provisionLocalRepairJob(
  input: Omit<IssueLocalRepairInput, 'signer'>,
  config: LocalRepairProvisioningConfig,
  dependencies: LocalRepairProvisioningDependencies = DEFAULT_DEPENDENCIES,
): Promise<LocalRepairProvisioningResult> {
  if (!config.enabled) return { ok: false, code: 'disabled' };
  if (!config.privateKeyPkcs8Base64Url || !config.keyId) {
    return { ok: false, code: 'unconfigured' };
  }
  try {
    const privateKey = await dependencies.importSigner(config.privateKeyPkcs8Base64Url);
    const issued = await dependencies.issue({
      ...input,
      signer: { privateKey, keyId: config.keyId },
    });
    return { ok: true, issued };
  } catch {
    return { ok: false, code: 'unavailable' };
  }
}
