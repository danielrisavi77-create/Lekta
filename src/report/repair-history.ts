/**
 * Klijent za "Moji popravci" (WS-6 UI): lista repair-poslova, potpisani download URL i brisanje
 * (right to erasure). Retencija je "do brisanja" (vlasnikova odluka 5), pa korisnik mora moci
 * vidjeti svoje poslove, ponovno preuzeti rezultat i trajno obrisati.
 *
 * Ciste funkcije uz injektabilan `fetch` (testabilno bez mreze), isti obrazac kao products-catalog
 * (PostgREST citanje) i repair-client. Citanje je RLS select-own: apikey (anon) je gate projekta,
 * a Bearer USER JWT daje identitet (repair_jobs_select_own = user_id = auth.uid()). Brisanje ide
 * preko delete-repair-job Edge (service role brise Storage BLOB + redak).
 */

export type { RepairHistoryConfig } from './repair-history-config';
export { repairHistoryConfigFrom } from './repair-history-config';
import type { RepairHistoryConfig } from './repair-history-config';

export interface RepairJob {
  id: string;
  workType: string;
  label: string | null;
  status: string;
  originalBytes: number | null;
  resultBytes: number | null;
  changesCount: number | null;
  resultPath: string;
  createdAt: string;
  /**
   * Brisanje je zapoceto pa jos nije dovrseno (audit P1-10, migracija 0098). Takav posao NE SMIJE
   * se nuditi za preuzimanje: blobovi su vec uklonjeni ili se uklanjaju, pa bi potpisani URL vodio
   * u nista. `cleanup-orphan-repairs` ga dovrsi.
   */
  deleting: boolean;
}

const JOB_SELECT = 'id,work_type,label,status,original_bytes,result_bytes,changes_count,result_path,created_at,deleting_at';

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Redak iz PostgREST-a (snake_case) -> tipizirani RepairJob. */
export function mapRepairJobRow(row: Record<string, unknown>): RepairJob {
  return {
    id: String(row.id ?? ''),
    workType: String(row.work_type ?? ''),
    label: row.label == null ? null : String(row.label),
    status: String(row.status ?? ''),
    originalBytes: num(row.original_bytes),
    resultBytes: num(row.result_bytes),
    changesCount: num(row.changes_count),
    resultPath: String(row.result_path ?? ''),
    createdAt: String(row.created_at ?? ''),
    deleting: row.deleting_at != null && row.deleting_at !== '',
  };
}

function baseUrl(config: RepairHistoryConfig): string {
  return config.supabaseUrl.replace(/\/+$/, '');
}

/** Ucitaj korisnikove repair-poslove (najnoviji prvi). RLS select-own; baca na neuspjeh. */
export async function fetchRepairJobs(
  config: RepairHistoryConfig,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RepairJob[]> {
  if (!config.supabaseUrl || !config.anonKey) throw new Error('repair history nije konfiguriran');
  if (!accessToken) throw new Error('prijava je potrebna');
  const url = `${baseUrl(config)}/rest/v1/repair_jobs?select=${JOB_SELECT}&order=created_at.desc`;
  const res = await fetchImpl(url, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`repair jobs ${res.status}`);
  const rows = (await res.json()) as unknown;
  return Array.isArray(rows) ? rows.map((r) => mapRepairJobRow(r as Record<string, unknown>)) : [];
}

/**
 * Potpisani (privremeni) URL za download objekta iz privatnog bucketa 'repair'. Storage RLS
 * (repair_objects_read_own) dopusta potpisivanje SAMO vlastitih objekata. `path` je result_path
 * (npr. '<user_id>/<job_id>/fixed.docx'). Vraca apsolutni URL spreman za <a href>/preuzimanje.
 */
export async function signRepairDownload(
  config: RepairHistoryConfig,
  accessToken: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
  expiresIn = 120,
): Promise<string> {
  if (!config.supabaseUrl || !config.anonKey) throw new Error('repair history nije konfiguriran');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const url = `${baseUrl(config)}/storage/v1/object/sign/repair/${encoded}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(`sign ${res.status}`);
  const data = (await res.json().catch(() => ({}))) as { signedURL?: string; signedUrl?: string };
  const signed = data.signedURL || data.signedUrl;
  if (!signed) throw new Error('nema signedURL');
  // Supabase vraca relativni '/object/sign/repair/...?token=...'; slozi apsolutni URL.
  return signed.startsWith('http') ? signed : `${baseUrl(config)}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
}

export type DeleteRepairOutcome = { ok: true } | { ok: false; error: string };

/** Trajno obrisi repair-posao (Storage BLOB-ovi + redak) preko delete-repair-job Edge. */
export async function deleteRepairJob(
  config: RepairHistoryConfig,
  accessToken: string,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeleteRepairOutcome> {
  if (!config.deleteEndpoint) return { ok: false, error: 'delete endpoint nije konfiguriran' };
  if (!jobId) return { ok: false, error: 'nedostaje jobId' };
  let res: Response;
  try {
    res = await fetchImpl(config.deleteEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ jobId }),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'mrezna greska' };
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (res.ok && data.ok) return { ok: true };
  return { ok: false, error: String(data.error || res.status) };
}
