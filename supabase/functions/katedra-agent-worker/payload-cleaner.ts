import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { recoverAgentPayloadUploads } from './upload-recovery.ts';

interface Result { data?: unknown; error?: unknown }
export interface CleanupClient {
  rpc(name: string, params?: Record<string, unknown>): PromiseLike<Result>;
  storage: { from(bucket: string): { remove(paths: string[]): PromiseLike<Result>; download?(path: string): PromiseLike<Result> } };
}
interface Payload { manifest_id: string; storage_bucket: string; storage_path: string; manifest_path: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function payload(value: unknown): Payload | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.manifest_id !== 'string' || !UUID.test(row.manifest_id)
    || row.storage_bucket !== 'katedra-temporary-materials'
    || typeof row.storage_path !== 'string' || typeof row.manifest_path !== 'string') return null;
  const body = row.storage_path.split('/');
  const manifest = row.manifest_path.split('/');
  // Kanonski trigger vec provjerava vlasnistvo. Ovdje dodatno ogranicavamo
  // privilegirano brisanje na privatni bucket i isti korisnik/projekt prefiks.
  if (body.length < 3 || manifest.length < 3 || !UUID.test(body[0]) || !UUID.test(body[1])
    || body[0] !== manifest[0] || body[1] !== manifest[1]
    || [...body, ...manifest].some(part => !part || part === '.' || part === '..' || /[\\%\x00-\x1f]/.test(part))) return null;
  return row as unknown as Payload;
}

export async function cleanupAgentPayloads(client: CleanupClient, options: { now?: () => number; deadlineAt?: number } = {}) {
  const now = options.now ?? Date.now;
  const deadline = options.deadlineAt ?? now() + 45_000;
  const recovery = await recoverAgentPayloadUploads(client, { now, deadlineAt: Math.min(deadline, now() + 15_000) });
  const summary = { deleted: 0, failed: 0, deferred: 0, recoveredUploads: recovery.recovered, unresolvedUploads: recovery.deferred, error: recovery.error };
  if (recovery.error) return summary;
  let pending: Result;
  try { pending = await client.rpc('list_pending_agent_payload_deletions', { p_now: new Date(now()).toISOString() }); }
  catch { return { ...summary, error: 'payload_queue_unavailable' }; }
  if (pending.error || !Array.isArray(pending.data) || pending.data.length > 500) return { ...summary, error: 'payload_queue_unavailable' };
  if (now() >= deadline) return { ...summary, deferred: pending.data.length };
  const candidates = pending.data.map(payload).filter((item): item is Payload => item !== null);
  if (!candidates.length) return { ...summary, failed: pending.data.length };
  let ready: Result;
  try { ready = await client.rpc('agent_payload_deletion_ready', { p_manifest_ids: candidates.map(item => item.manifest_id) }); }
  catch { return { ...summary, error: 'payload_upload_state_unavailable' }; }
  if (ready.error || !Array.isArray(ready.data)) return { ...summary, error: 'payload_upload_state_unavailable' };
  const readyIds = new Set(ready.data.map(item => item?.manifest_id));
  const removed: string[] = [];
  for (let i = 0; i < pending.data.length; i++) {
    if (now() >= deadline) { summary.deferred += pending.data.length - i; break; }
    const item = payload(pending.data[i]);
    if (!item) { summary.failed++; continue; }
    if (!readyIds.has(item.manifest_id)) { summary.deferred++; continue; }
    try {
      const result = await client.storage.from(item.storage_bucket).remove([...new Set([item.storage_path, item.manifest_path])]);
      if (result.error) throw new Error('storage_delete_failed');
      removed.push(item.manifest_id);
    } catch {
      summary.failed++;
      // Nikad ne zapisuj sirovi odgovor: moze sadrzavati putanju ili token.
      try {
        const result = await client.rpc('record_agent_payload_deletion_failure', { p_manifest_ids: [item.manifest_id], p_error_code: 'storage_delete_failed' });
        if (result.error) summary.error = 'payload_failure_record_failed';
      } catch { summary.error = 'payload_failure_record_failed'; }
    }
  }
  if (removed.length) {
    try {
      const result = await client.rpc('finalize_agent_payload_deletions', { p_manifest_ids: removed, p_now: new Date(now()).toISOString() });
      const count = Array.isArray(result.data) ? result.data[0]?.deleted : undefined;
      if (result.error || !Number.isInteger(count) || count < 0 || count > removed.length) throw new Error('payload_finalize_failed');
      summary.deleted = count;
      summary.deferred += removed.length - count;
    } catch { summary.error = 'payload_finalize_failed'; }
  }
  return summary;
}

export async function handlePayloadCleanup(req: Request, client: CleanupClient, secret: string | undefined): Promise<Response> {
  if (!isCronAuthorized(req, secret)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const result = await cleanupAgentPayloads(client);
  return Response.json(result, { status: result.error ? 503 : 200 });
}
