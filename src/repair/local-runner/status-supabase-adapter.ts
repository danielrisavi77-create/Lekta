import type {
  AtomicLocalRepairStatus,
  LocalRepairState,
  LocalRepairStatusBinding,
  LocalRepairStatusDependencies,
} from './status-service.ts';

interface SupabaseErrorLike {
  message?: string;
}

interface SupabaseResult {
  data: unknown;
  error: SupabaseErrorLike | null;
}

export interface LocalRepairStatusSupabaseClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => Promise<SupabaseResult>;
      };
    };
  };
  rpc: (name: string, params: Record<string, unknown>) => Promise<SupabaseResult>;
}

const STATES = new Set<LocalRepairState>([
  'claimed',
  'processing',
  'retryable',
  'completed',
  'local_failed',
]);

function record(value: unknown, message: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function bindingFromRow(value: unknown): LocalRepairStatusBinding {
  const row = record(value, 'invalid local repair status binding');
  if (typeof row.job_id !== 'string'
    || typeof row.local_state !== 'string'
    || !STATES.has(row.local_state as LocalRepairState)
    || typeof row.device_public_key_spki !== 'string'
    || typeof row.device_key_sha256 !== 'string') {
    throw new Error('invalid local repair status binding');
  }
  return {
    jobId: row.job_id,
    localState: row.local_state as LocalRepairState,
    devicePublicKeySpki: row.device_public_key_spki,
    deviceKeySha256: row.device_key_sha256,
  };
}

function advancementFromRow(value: unknown): { localState: LocalRepairState; sequence: number } {
  const row = record(value, 'invalid local repair status RPC result');
  if (typeof row.local_state !== 'string'
    || !STATES.has(row.local_state as LocalRepairState)
    || !Number.isSafeInteger(row.device_event_sequence)
    || (row.device_event_sequence as number) < 1) {
    throw new Error('invalid local repair status RPC result');
  }
  return {
    localState: row.local_state as LocalRepairState,
    sequence: row.device_event_sequence as number,
  };
}

export function createLocalRepairStatusSupabaseDependencies(
  client: LocalRepairStatusSupabaseClient,
): Pick<LocalRepairStatusDependencies, 'loadBinding' | 'advanceAtomic'> {
  return {
    loadBinding: async (jobId: string): Promise<LocalRepairStatusBinding | null> => {
      const { data, error } = await client
        .from('repair_local_jobs')
        .select('job_id,local_state,device_public_key_spki,device_key_sha256')
        .eq('job_id', jobId)
        .maybeSingle();
      if (error) throw new Error('local repair status binding query failed');
      return data === null ? null : bindingFromRow(data);
    },
    advanceAtomic: async (event: AtomicLocalRepairStatus) => {
      const { data, error } = await client.rpc('advance_local_repair_job', {
        p_job_id: event.jobId,
        p_device_key_sha256: event.deviceKeySha256,
        p_sequence: event.sequence,
        p_event: event.event,
        p_occurred_at: event.occurredAt,
        p_checkpoint_sha256: event.checkpointSha256,
        p_output_sha256: event.outputSha256,
        p_report_sha256: event.reportSha256,
        p_event_sha256: event.eventSha256,
      });
      if (error) throw new Error('local repair status RPC failed');
      if (!Array.isArray(data)) throw new Error('invalid local repair status RPC result');
      if (data.length === 0) return null;
      if (data.length !== 1) throw new Error('invalid local repair status RPC result');
      return advancementFromRow(data[0]);
    },
  };
}
