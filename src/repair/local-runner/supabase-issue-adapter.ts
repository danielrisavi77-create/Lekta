import type { LocalRepairJobRecord } from './issue-service.ts';

interface SupabaseErrorLike {
  message?: string;
}

export interface LocalRepairIssueSupabaseClient {
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => Promise<{ error: SupabaseErrorLike | null }>;
  };
}

export async function persistIssuedLocalRepairJob(
  client: LocalRepairIssueSupabaseClient,
  record: LocalRepairJobRecord,
): Promise<void> {
  const { error } = await client.from('repair_local_jobs').insert({
    job_id: record.jobId,
    user_id: record.userId,
    slot_id: record.slotId,
    source_sha256: record.sourceSha256,
    source_size: record.sourceSize,
    target_sha256: record.targetSha256,
    target_size: record.targetSize,
    repair_contract: record.repairContract,
    contract_key_id: record.contractKeyId,
    local_state: record.localState,
    claim_token_sha256: record.claimTokenSha256,
    claim_expires_at: record.claimExpiresAt,
  });
  if (error) throw new Error('local repair job insert failed');
}
