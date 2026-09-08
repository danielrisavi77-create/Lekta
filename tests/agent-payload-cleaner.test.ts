import { describe, expect, it, vi } from 'vitest';
import { cleanupAgentPayloads, handlePayloadCleanup } from '../supabase/functions/katedra-agent-worker/payload-cleaner';

const prefix = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/';
const row = (id: string) => ({ manifest_id: id, storage_bucket: 'katedra-temporary-materials', storage_path: `${prefix}${id}.txt`, manifest_path: `${prefix}${id}.manifest.json` });
const a = '33333333-3333-4333-8333-333333333333';
const b = '44444444-4444-4444-8444-444444444444';
function fixture(rows = [row(a), row(b)]) {
  const events: string[] = [];
  const rpc = vi.fn(async (name: string, params?: Record<string, unknown>) => {
    events.push(name);
    return { data: name === 'claim_agent_payload_upload_reconciliation' ? [] : name === 'list_pending_agent_payload_deletions' || name === 'agent_payload_deletion_ready' ? rows : [{ deleted: (params?.p_manifest_ids as string[] || []).length }], error: null };
  });
  const remove = vi.fn(async (_paths: string[]): Promise<{ error: unknown }> => { events.push('remove'); return { error: null }; });
  return { events, rpc, remove, client: { rpc, storage: { from: vi.fn(() => ({ remove })) } } };
}

describe('canonical Storage-first payload cleanup', () => {
  it('defers in-flight or uncertain uploads before attempting Storage removal', async () => {
    const f = fixture();
    f.rpc.mockImplementation(async name => ({ data: name === 'list_pending_agent_payload_deletions' ? [row(a)] : [], error: null }));
    expect(await cleanupAgentPayloads(f.client)).toMatchObject({ deleted: 0, deferred: 1, error: null });
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('removes both objects before finalizing only their manifest IDs', async () => {
    const f = fixture();
    expect(await cleanupAgentPayloads(f.client)).toMatchObject({ deleted: 2, failed: 0 });
    expect(f.remove).toHaveBeenCalledWith([row(a).storage_path, row(a).manifest_path]);
    expect(f.events).toEqual(['claim_agent_payload_upload_reconciliation', 'list_pending_agent_payload_deletions', 'agent_payload_deletion_ready', 'remove', 'remove', 'finalize_agent_payload_deletions']);
    expect(f.rpc).toHaveBeenLastCalledWith('finalize_agent_payload_deletions', expect.objectContaining({ p_manifest_ids: [a, b] }));
  });
  it('retains failed items for retry and never persists raw Storage errors', async () => {
    const f = fixture();
    f.remove.mockRejectedValueOnce(new Error('private object and token'));
    expect(await cleanupAgentPayloads(f.client)).toMatchObject({ deleted: 1, failed: 1 });
    expect(f.rpc).toHaveBeenCalledWith('record_agent_payload_deletion_failure', { p_manifest_ids: [a], p_error_code: 'storage_delete_failed' });
    expect(f.rpc).toHaveBeenLastCalledWith('finalize_agent_payload_deletions', expect.objectContaining({ p_manifest_ids: [b] }));
  });
  it('fails closed when the pending query fails', async () => {
    const f = fixture();
    f.rpc.mockImplementation(async name => { if (name === 'list_pending_agent_payload_deletions') throw new Error('private query'); return { data: [], error: null }; });
    expect(await cleanupAgentPayloads(f.client)).toMatchObject({ error: 'payload_queue_unavailable', deleted: 0 });
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('does not report physical completion when finalization fails', async () => {
    const f = fixture([row(a)]);
    f.rpc.mockImplementation(async name => ({ data: name === 'claim_agent_payload_upload_reconciliation' ? [] : name === 'list_pending_agent_payload_deletions' || name === 'agent_payload_deletion_ready' ? [row(a)] : null, error: name === 'finalize_agent_payload_deletions' ? { message: 'private error' } : null }));
    expect(await cleanupAgentPayloads(f.client)).toMatchObject({ deleted: 0, error: 'payload_finalize_failed' });
  });
  it('rejects foreign buckets and malformed or mismatched paths before deletion', async () => {
    for (const invalid of [
      { ...row(a), storage_bucket: 'documents' },
      { ...row(a), storage_path: `${prefix}../foreign.txt` },
      { ...row(a), manifest_path: `55555555-5555-4555-8555-555555555555/${row(a).manifest_path}` },
    ]) {
      const f = fixture([invalid]);
      expect(await cleanupAgentPayloads(f.client)).toMatchObject({ deleted: 0, failed: 1 });
      expect(f.remove).not.toHaveBeenCalled();
    }
  });
  it('stops starting removals at its deadline and leaves deferred items pending', async () => {
    const f = fixture();
    expect(await cleanupAgentPayloads(f.client, { now: () => 100, deadlineAt: 100 })).toMatchObject({ deleted: 0, deferred: 2 });
    expect(f.remove).not.toHaveBeenCalled();
  });
  it('requires the dedicated cron secret before any client operations', async () => {
    const f = fixture();
    for (const secret of [undefined, 'expected']) {
      const response = await handlePayloadCleanup(new Request('https://worker.test/?mode=cleanup'), f.client, secret);
      expect(response.status).toBe(401);
    }
    expect(f.rpc).not.toHaveBeenCalled();
    const response = await handlePayloadCleanup(new Request('https://worker.test/?mode=cleanup', { headers: { Authorization: 'Bearer expected' } }), f.client, 'expected');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deleted: 2 });
  });
});
