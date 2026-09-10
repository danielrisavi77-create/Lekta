import { describe, expect, it } from 'vitest';

import { persistIssuedLocalRepairJob } from '../src/repair/local-runner/supabase-issue-adapter.ts';
import type { LocalRepairJobRecord } from '../src/repair/local-runner/issue-service.ts';

const record: LocalRepairJobRecord = {
  jobId: '33333333-3333-4333-8333-333333333333',
  userId: '11111111-1111-4111-8111-111111111111',
  slotId: '22222222-2222-4222-8222-222222222222',
  sourceSha256: 'a'.repeat(64),
  sourceSize: 120,
  targetSha256: 'b'.repeat(64),
  targetSize: 130,
  repairContract: { contractVersion: 1 } as LocalRepairJobRecord['repairContract'],
  contractKeyId: 'lekta-2026-08',
  localState: 'claimable',
  claimTokenSha256: 'c'.repeat(64),
  claimExpiresAt: '2026-08-25T19:00:00.000Z',
};

describe('local repair Supabase issue adapter', () => {
  it('sprema samo hash tokena i potpisani ugovor u privatni redak', async () => {
    const calls: unknown[] = [];
    await persistIssuedLocalRepairJob({
      from: (table) => {
        calls.push(['from', table]);
        return {
          insert: async (value) => {
            calls.push(['insert', value]);
            return { error: null };
          },
        };
      },
    }, record);

    expect(calls).toEqual([
      ['from', 'repair_local_jobs'],
      ['insert', {
        job_id: record.jobId,
        user_id: record.userId,
        slot_id: record.slotId,
        source_sha256: record.sourceSha256,
        source_size: record.sourceSize,
        target_sha256: record.targetSha256,
        target_size: record.targetSize,
        repair_contract: record.repairContract,
        contract_key_id: record.contractKeyId,
        local_state: 'claimable',
        claim_token_sha256: record.claimTokenSha256,
        claim_expires_at: record.claimExpiresAt,
      }],
    ]);
    expect(JSON.stringify(calls)).not.toContain('claimToken"');
  });

  it('ne skriva pad privatnog local entitlement zapisa', async () => {
    await expect(persistIssuedLocalRepairJob({
      from: () => ({ insert: async () => ({ error: { message: 'constraint failed' } }) }),
    }, record)).rejects.toThrow('local repair job insert failed');
  });
});
