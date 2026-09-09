interface Result { data?: unknown; error?: unknown }
export interface UploadRecoveryClient {
  rpc(name: string, params?: Record<string, unknown>): PromiseLike<Result>;
  storage: { from(bucket: string): { download?(path: string): PromiseLike<Result> } };
}
interface Candidate {
  manifest_id: string; object_kind: 'body' | 'manifest'; upload_token: string;
  body_sha256: string; body_bytes: number; storage_bucket: string; storage_path: string; storage_version: string;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH_BYTES = 32 * 1024 * 1024;
function candidate(value: unknown): Candidate | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Candidate;
  if (!UUID.test(row.manifest_id) || !UUID.test(row.upload_token) || !['body', 'manifest'].includes(row.object_kind)
    || !/^[0-9a-f]{64}$/.test(row.body_sha256) || !Number.isSafeInteger(row.body_bytes) || row.body_bytes < 0 || row.body_bytes > MAX_BATCH_BYTES
    || row.storage_bucket !== 'katedra-temporary-materials' || typeof row.storage_version !== 'string' || !row.storage_version
    || typeof row.storage_path !== 'string') return null;
  const parts = row.storage_path.split('/');
  const suffix = row.object_kind === 'body' ? '-body' : '.manifest.json';
  const materialPath = parts.length === 3 && parts.slice(0, 2).every(part => UUID.test(part))
    && parts[2].endsWith(suffix) && UUID.test(parts[2].slice(0, -suffix.length));
  const runPath = parts.length >= 4 && parts.slice(0, 3).every(part => UUID.test(part));
  if ((!materialPath && !runPath)
    || parts.some(part => !part || part === '.' || part === '..' || /[\\%\x00-\x1f]/.test(part))) return null;
  return row;
}

export async function recoverAgentPayloadUploads(client: UploadRecoveryClient, options: { now?: () => number; deadlineAt?: number } = {}) {
  const now = options.now ?? Date.now;
  const deadline = options.deadlineAt ?? now() + 15_000;
  const summary = { recovered: 0, deferred: 0, error: null as string | null };
  if (now() >= deadline) return summary;
  let claimed: Result;
  try { claimed = await client.rpc('claim_agent_payload_upload_reconciliation', { p_limit: 20 }); }
  catch { return { ...summary, error: 'upload_reconciliation_unavailable' }; }
  if (claimed.error || !Array.isArray(claimed.data) || claimed.data.length > 20) return { ...summary, error: 'upload_reconciliation_unavailable' };
  let downloadedBytes = 0;
  for (let i = 0; i < claimed.data.length; i++) {
    if (now() >= deadline) { summary.deferred += claimed.data.length - i; break; }
    const item = candidate(claimed.data[i]);
    if (!item || downloadedBytes + item.body_bytes > MAX_BATCH_BYTES) { summary.deferred++; continue; }
    downloadedBytes += item.body_bytes;
    try {
      const result = await client.storage.from(item.storage_bucket).download?.(item.storage_path);
      if (!result || result.error || !(result.data instanceof Blob) || result.data.size !== item.body_bytes) { summary.deferred++; continue; }
      const body = await result.data.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', body)), b => b.toString(16).padStart(2, '0')).join('');
      if (digest !== item.body_sha256) { summary.deferred++; continue; }
      const confirmed = await client.rpc('confirm_agent_payload_upload', {
        p_manifest_id: item.manifest_id, p_object_kind: item.object_kind, p_upload_token: item.upload_token,
        p_sha256: digest, p_bytes: body.byteLength, p_storage_version: item.storage_version,
      });
      if (confirmed.error || confirmed.data !== 'uploaded') summary.deferred++;
      else summary.recovered++;
    } catch { summary.deferred++; }
  }
  return summary;
}
