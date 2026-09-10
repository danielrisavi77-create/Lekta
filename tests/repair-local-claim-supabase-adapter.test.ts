import { describe, expect, it } from 'vitest';

import { createLocalRepairClaimSupabaseDependencies } from '../src/repair/local-runner/supabase-adapter.ts';

const JOB_ID = '33333333-3333-4333-8333-333333333333';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('local repair Supabase claim adapter', () => {
  it('poziva samo atomski RPC i mapira njegov jedini uspjesni redak', async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      rpc: async (name: string, params: Record<string, unknown>) => {
        rpcCalls.push([name, params]);
        return {
          data: [{
            job_id: JOB_ID,
            user_id: USER_ID,
            local_state: 'claimed',
            repair_contract: { contractVersion: '1', jobId: JOB_ID },
            original_path: `${USER_ID}/${JOB_ID}/original.docx`,
            result_path: `${USER_ID}/${JOB_ID}/fixed.docx`,
          }],
          error: null,
        };
      },
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: null, error: null }),
        }),
      },
    };
    const dependencies = createLocalRepairClaimSupabaseDependencies(client);

    const result = await dependencies.claimAtomic({
      jobId: JOB_ID,
      claimTokenSha256: 'a'.repeat(64),
      devicePublicKeySpki: 'device-spki',
      deviceKeySha256: 'b'.repeat(64),
    });

    expect(rpcCalls).toEqual([[
      'claim_local_repair_job',
      {
        p_job_id: JOB_ID,
        p_claim_token_sha256: 'a'.repeat(64),
        p_device_public_key_spki: 'device-spki',
        p_device_key_sha256: 'b'.repeat(64),
      },
    ]]);
    expect(result).toEqual({
      jobId: JOB_ID,
      userId: USER_ID,
      localState: 'claimed',
      repairContract: { contractVersion: '1', jobId: JOB_ID },
      originalPath: `${USER_ID}/${JOB_ID}/original.docx`,
      resultPath: `${USER_ID}/${JOB_ID}/fixed.docx`,
    });
  });

  it('vraca null kada atomski RPC nije osvojio claim i baca na backend gresku', async () => {
    let response: { data: unknown; error: { message: string } | null } = { data: [], error: null };
    const dependencies = createLocalRepairClaimSupabaseDependencies({
      rpc: async () => response,
      storage: {
        from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }),
      },
    });

    await expect(dependencies.claimAtomic({
      jobId: JOB_ID,
      claimTokenSha256: 'a'.repeat(64),
      devicePublicKeySpki: 'device-spki',
      deviceKeySha256: 'b'.repeat(64),
    })).resolves.toBeNull();

    response = { data: null, error: { message: 'database unavailable' } };
    await expect(dependencies.claimAtomic({
      jobId: JOB_ID,
      claimTokenSha256: 'a'.repeat(64),
      devicePublicKeySpki: 'device-spki',
      deviceKeySha256: 'b'.repeat(64),
    })).rejects.toThrow('local repair claim RPC failed');
  });

  it('potpisuje samo repair bucket i zahtijevani rok valjanosti', async () => {
    const storageCalls: unknown[] = [];
    const dependencies = createLocalRepairClaimSupabaseDependencies({
      rpc: async () => ({ data: [], error: null }),
      storage: {
        from: (bucket: string) => {
          storageCalls.push(['bucket', bucket]);
          return {
            createSignedUrl: async (path: string, expiresInSeconds: number) => {
              storageCalls.push(['sign', path, expiresInSeconds]);
              return { data: { signedUrl: 'https://storage.test/signed' }, error: null };
            },
          };
        },
      },
    });

    await expect(dependencies.signRepairObject(
      `${USER_ID}/${JOB_ID}/fixed.docx`,
      300,
    )).resolves.toBe('https://storage.test/signed');
    expect(storageCalls).toEqual([
      ['bucket', 'repair'],
      ['sign', `${USER_ID}/${JOB_ID}/fixed.docx`, 300],
    ]);
  });
});
