import { describe, expect, it, vi } from 'vitest';
import { recoverAgentPayloadUploads } from '../supabase/functions/katedra-agent-worker/upload-recovery';
const bytes = new TextEncoder().encode('private bytes');
const row = { manifest_id: '11111111-1111-4111-8111-111111111111', object_kind: 'body', upload_token: '22222222-2222-4222-8222-222222222222', body_sha256: '', body_bytes: bytes.length, storage_bucket: 'katedra-temporary-materials', storage_path: '33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555/results/a.json', storage_version: 'version-1' };
async function fixture() {
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const item = { ...row, body_sha256: digest };
  const rpc = vi.fn(async (name: string) => ({ data: name === 'claim_agent_payload_upload_reconciliation' ? [item] : 'uploaded', error: null }));
  const download = vi.fn(async () => ({ data: new Blob([bytes]), error: null }));
  return { rpc, download, item, client: { rpc, storage: { from: () => ({ download }) } } };
}
describe('unknown upload reconciliation', () => {
  it.each(['body', 'manifest'])('recovers a canonical unbound material %s object', async kind => {
    const f = await fixture();
    f.item.object_kind = kind;
    f.item.storage_path = '33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555' + (kind === 'body' ? '-body' : '.manifest.json');
    expect(await recoverAgentPayloadUploads(f.client)).toMatchObject({ recovered: 1, deferred: 0 });
    expect(f.download).toHaveBeenCalledWith(f.item.storage_path);
  });
  it('does not download an unbound path outside the canonical material identity', async () => {
    const f = await fixture();
    f.item.storage_path = '33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/arbitrary-body';
    expect(await recoverAgentPayloadUploads(f.client)).toMatchObject({ recovered: 0, deferred: 1 });
    expect(f.download).not.toHaveBeenCalled();
  });
  it('confirms only matching bytes and the captured Storage version', async () => {
    const f = await fixture();
    expect(await recoverAgentPayloadUploads(f.client)).toMatchObject({ recovered: 1, deferred: 0, error: null });
    expect(f.rpc).toHaveBeenLastCalledWith('confirm_agent_payload_upload', expect.objectContaining({ p_storage_version: 'version-1', p_sha256: f.item.body_sha256, p_bytes: bytes.length }));
    expect(JSON.stringify(f.rpc.mock.calls)).not.toContain('private bytes');
  });
  it('leaves missing or changed bytes unresolved without claiming deletion', async () => {
    const f = await fixture(); f.download.mockResolvedValue({ data: new Blob(['different']), error: null });
    expect(await recoverAgentPayloadUploads(f.client)).toMatchObject({ recovered: 0, deferred: 1 });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it('does not confirm a version changed between download and acknowledgement', async () => {
    const f = await fixture();
    f.rpc.mockImplementation(async name => ({ data: name === 'claim_agent_payload_upload_reconciliation' ? [f.item] : null, error: name === 'confirm_agent_payload_upload' ? 'version changed' : null }));
    expect(await recoverAgentPayloadUploads(f.client)).toMatchObject({ recovered: 0, deferred: 1 });
  });
  it('does not start downloads after its deadline', async () => {
    const f = await fixture();
    expect(await recoverAgentPayloadUploads(f.client, { now: () => 100, deadlineAt: 100 })).toMatchObject({ recovered: 0 });
    expect(f.download).not.toHaveBeenCalled();
  });
});
