import type {
  AtomicLocalRepairClaim,
  ClaimedLocalRepairJob,
  LocalRepairClaimDependencies,
} from './claim-service.ts';

interface SupabaseErrorLike {
  message?: string;
}

interface SupabaseRpcResult {
  data: unknown;
  error: SupabaseErrorLike | null;
}

interface SupabaseSignedUrlResult {
  data: { signedUrl?: unknown } | null;
  error: SupabaseErrorLike | null;
}

export interface LocalRepairClaimSupabaseClient {
  rpc: (name: string, params: Record<string, unknown>) => Promise<SupabaseRpcResult>;
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresInSeconds: number) => Promise<SupabaseSignedUrlResult>;
    };
  };
}

function stringField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== 'string') throw new Error('invalid local repair claim RPC result');
  return value;
}

function mapClaimedRow(value: unknown): ClaimedLocalRepairJob {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid local repair claim RPC result');
  }
  const row = value as Record<string, unknown>;
  const localState = stringField(row, 'local_state');
  if (localState !== 'claimed') throw new Error('invalid local repair claim RPC result');
  return {
    jobId: stringField(row, 'job_id'),
    userId: stringField(row, 'user_id'),
    localState,
    repairContract: row.repair_contract,
    originalPath: stringField(row, 'original_path'),
    resultPath: stringField(row, 'result_path'),
  };
}

export function createLocalRepairClaimSupabaseDependencies(
  client: LocalRepairClaimSupabaseClient,
): LocalRepairClaimDependencies {
  return {
    claimAtomic: async (input: AtomicLocalRepairClaim): Promise<ClaimedLocalRepairJob | null> => {
      const { data, error } = await client.rpc('claim_local_repair_job', {
        p_job_id: input.jobId,
        p_claim_token_sha256: input.claimTokenSha256,
        p_device_public_key_spki: input.devicePublicKeySpki,
        p_device_key_sha256: input.deviceKeySha256,
      });
      if (error) throw new Error('local repair claim RPC failed');
      if (!Array.isArray(data)) throw new Error('invalid local repair claim RPC result');
      if (data.length === 0) return null;
      if (data.length !== 1) throw new Error('invalid local repair claim RPC result');
      return mapClaimedRow(data[0]);
    },
    signRepairObject: async (path: string, expiresInSeconds: number): Promise<string> => {
      const { data, error } = await client.storage
        .from('repair')
        .createSignedUrl(path, expiresInSeconds);
      if (error || typeof data?.signedUrl !== 'string' || !data.signedUrl) {
        throw new Error('local repair signed URL failed');
      }
      return data.signedUrl;
    },
  };
}
