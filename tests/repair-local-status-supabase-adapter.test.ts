import { describe, expect, it } from 'vitest';

import { createLocalRepairStatusSupabaseDependencies } from '../src/repair/local-runner/status-supabase-adapter.ts';

const JOB_ID = '33333333-3333-4333-8333-333333333333';
const DEVICE_HASH = 'd'.repeat(64);

describe('Supabase adapter za lokalni repair status', () => {
  it('ucitava samo vezu uredjaja za trazeni privatni posao', async () => {
    const calls: unknown[] = [];
    const dependencies = createLocalRepairStatusSupabaseDependencies({
      from: (table) => ({
        select: (columns) => ({
          eq: (column, value) => ({
            maybeSingle: async () => {
              calls.push([table, columns, column, value]);
              return {
                data: {
                  job_id: JOB_ID,
                  local_state: 'processing',
                  device_public_key_spki: 'A'.repeat(122),
                  device_key_sha256: DEVICE_HASH,
                },
                error: null,
              };
            },
          }),
        }),
      }),
      rpc: async () => ({ data: [], error: null }),
    });

    await expect(dependencies.loadBinding(JOB_ID)).resolves.toEqual({
      jobId: JOB_ID,
      localState: 'processing',
      devicePublicKeySpki: 'A'.repeat(122),
      deviceKeySha256: DEVICE_HASH,
    });
    expect(calls).toEqual([[
      'repair_local_jobs',
      'job_id,local_state,device_public_key_spki,device_key_sha256',
      'job_id',
      JOB_ID,
    ]]);
  });

  it('salje tocno potpisani dogadjaj atomskom lifecycle RPC-u', async () => {
    const rpcCalls: unknown[] = [];
    const dependencies = createLocalRepairStatusSupabaseDependencies({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
      rpc: async (name, params) => {
        rpcCalls.push([name, params]);
        return {
          data: [{ local_state: 'completed', device_event_sequence: 7 }],
          error: null,
        };
      },
    });
    const event = {
      jobId: JOB_ID,
      deviceKeySha256: DEVICE_HASH,
      sequence: 7,
      event: 'completed' as const,
      occurredAt: '2026-08-25T10:00:00.000Z',
      checkpointSha256: null,
      outputSha256: 'e'.repeat(64),
      reportSha256: 'f'.repeat(64),
      eventSha256: '6'.repeat(64),
    };

    await expect(dependencies.advanceAtomic(event)).resolves.toEqual({
      localState: 'completed',
      sequence: 7,
    });
    expect(rpcCalls).toEqual([[
      'advance_local_repair_job',
      {
        p_job_id: JOB_ID,
        p_device_key_sha256: DEVICE_HASH,
        p_sequence: 7,
        p_event: 'completed',
        p_occurred_at: '2026-08-25T10:00:00.000Z',
        p_checkpoint_sha256: null,
        p_output_sha256: 'e'.repeat(64),
        p_report_sha256: 'f'.repeat(64),
        p_event_sha256: '6'.repeat(64),
      },
    ]]);
  });

  it('fail-closed odbija neispravan ili viseznacan RPC rezultat', async () => {
    const dependencies = createLocalRepairStatusSupabaseDependencies({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
      rpc: async () => ({
        data: [
          { local_state: 'processing', device_event_sequence: 2 },
          { local_state: 'processing', device_event_sequence: 2 },
        ],
        error: null,
      }),
    });

    await expect(dependencies.advanceAtomic({
      jobId: JOB_ID,
      deviceKeySha256: DEVICE_HASH,
      sequence: 2,
      event: 'heartbeat',
      occurredAt: '2026-08-25T10:00:00.000Z',
      checkpointSha256: null,
      outputSha256: null,
      reportSha256: null,
      eventSha256: '7'.repeat(64),
    })).rejects.toThrow('invalid local repair status RPC result');
  });
});
