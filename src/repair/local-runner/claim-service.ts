import { fromBase64Url, sha256Hex } from '../contract/hash.ts';

export interface LocalRepairClaimInput {
  jobId: string;
  claimToken: string;
  devicePublicKeySpki: string;
}

export interface LocalRepairClaimDependencies {
  claimAtomic: (input: AtomicLocalRepairClaim) => Promise<ClaimedLocalRepairJob | null>;
  signRepairObject: (path: string, expiresInSeconds: number) => Promise<string>;
}

export interface AtomicLocalRepairClaim {
  jobId: string;
  claimTokenSha256: string;
  devicePublicKeySpki: string;
  deviceKeySha256: string;
}

export interface ClaimedLocalRepairJob {
  jobId: string;
  userId: string;
  localState: 'claimed';
  repairContract: unknown;
  originalPath: string;
  resultPath: string;
}

export type LocalRepairClaimResult =
  | {
    ok: true;
    jobId: string;
    contract: unknown;
    sourceDownloadUrl: string;
    targetDownloadUrl: string;
    expiresInSeconds: number;
  }
  | { ok: false; code: 'invalid-request' }
  | { ok: false; code: 'invalid-device-key' }
  | { ok: false; code: 'invalid-claim-record' }
  | { ok: false; code: 'not-claimable' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOWNLOAD_URL_SECONDS = 300;

function claimTokenBytes(value: unknown): Uint8Array | null {
  if (typeof value !== 'string') return null;
  try {
    const bytes = fromBase64Url(value);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

async function p256SpkiBytes(value: unknown): Promise<Uint8Array | null> {
  if (typeof value !== 'string') return null;
  try {
    const bytes = fromBase64Url(value);
    if (bytes.length < 80 || bytes.length > 512) return null;
    await crypto.subtle.importKey(
      'spki',
      new Uint8Array(bytes),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return bytes;
  } catch {
    return null;
  }
}

export async function claimLocalRepairJob(
  input: LocalRepairClaimInput,
  dependencies: LocalRepairClaimDependencies,
): Promise<LocalRepairClaimResult> {
  if (!input || typeof input.jobId !== 'string' || !UUID.test(input.jobId)) {
    return { ok: false, code: 'invalid-request' };
  }
  const tokenBytes = claimTokenBytes(input.claimToken);
  if (!tokenBytes) return { ok: false, code: 'invalid-request' };
  const deviceKeyBytes = await p256SpkiBytes(input.devicePublicKeySpki);
  if (!deviceKeyBytes) {
    return { ok: false, code: 'invalid-device-key' };
  }

  const claimed = await dependencies.claimAtomic({
    jobId: input.jobId,
    claimTokenSha256: await sha256Hex(tokenBytes),
    devicePublicKeySpki: input.devicePublicKeySpki,
    deviceKeySha256: await sha256Hex(deviceKeyBytes),
  });
  if (!claimed) return { ok: false, code: 'not-claimable' };

  const expectedPrefix = `${claimed.userId}/${input.jobId}`;
  if (!UUID.test(claimed.userId)
    || claimed.jobId !== input.jobId
    || claimed.localState !== 'claimed'
    || claimed.originalPath !== `${expectedPrefix}/original.docx`
    || claimed.resultPath !== `${expectedPrefix}/fixed.docx`) {
    return { ok: false, code: 'invalid-claim-record' };
  }

  const [sourceDownloadUrl, targetDownloadUrl] = await Promise.all([
    dependencies.signRepairObject(claimed.originalPath, DOWNLOAD_URL_SECONDS),
    dependencies.signRepairObject(claimed.resultPath, DOWNLOAD_URL_SECONDS),
  ]);
  return {
    ok: true,
    jobId: claimed.jobId,
    contract: claimed.repairContract,
    sourceDownloadUrl,
    targetDownloadUrl,
    expiresInSeconds: DOWNLOAD_URL_SECONDS,
  };
}
