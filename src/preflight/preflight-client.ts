/**
 * Klijentska strana Provjere prije predaje. Tok:
 *   1. startPreflight -> Edge preflight-start (JWT + meta + privola) izda
 *      {jobId, uploadUrl, uploadToken} ili dedup {jobId}.
 *   2. uploadFile -> PUT .docx IZRAVNO na Python servis (uploadUrl) s HMAC
 *      tokenom u X-Lekta-Token; Edge nikad ne vidi datoteku.
 *   3. pollResult -> Edge preflight-result (JWT + jobId) vraca status; kad je
 *      'done', vraca VEC FILTRIRAN (tier) nalaz. Klijent nema pristup sirovom
 *      nalazu ni mentorskim kodovima.
 *
 * Klijent NIKAD ne odlucuje o pravu pristupa (server gate). INERTNO je dok
 * endpoint nije konfiguriran (kao report-client/integrity-client). Ciste
 * funkcije uz injektabilan fetch (testabilno bez mreze).
 */
import { buildPreflightConsent, type PreflightConsent } from './preflight-consent';
import type { PreflightReport } from './tier-filter';

export interface PreflightConfig {
  /** Edge preflight-start URL; prazno = inertno (sekcija skrivena). */
  startEndpoint: string;
  /** Edge preflight-result URL; prazno = inertno. */
  resultEndpoint: string;
}

export interface PreflightStartMeta {
  fileSize: number;
  fileSha256: string;
  workType: string;
  lang: string;
  consent: PreflightConsent;
}

export type PreflightStatus = 'pending' | 'running' | 'done' | 'error' | 'expired';

export type StartOutcome =
  | { kind: 'ok'; jobId: string; uploadUrl: string; uploadToken: string; maxBytes: number }
  | { kind: 'dedup'; jobId: string }
  | { kind: 'unauthorized' }
  | { kind: 'rate_limited' }
  | { kind: 'too_large'; maxBytes?: number }
  | { kind: 'job_active' }
  | { kind: 'disabled' }
  | { kind: 'error'; status?: number; message: string };

export type UploadOutcome =
  | { kind: 'accepted' }
  | { kind: 'bad_ticket' }
  | { kind: 'too_large'; maxBytes?: number }
  | { kind: 'rejected'; code: string }   // 415/422 guard: not_a_docx, invalid_docx...
  | { kind: 'busy' }
  | { kind: 'error'; status?: number; message: string };

export type PollOutcome =
  | { kind: 'pending' }
  | { kind: 'running' }
  | { kind: 'done'; report: PreflightReport; depth: 'teaser' | 'full' }
  | { kind: 'failed'; code: string }
  | { kind: 'expired' }
  | { kind: 'unauthorized' }
  | { kind: 'error'; status?: number; message: string };

/** SHA-256 datoteke (Web Crypto) kao hex; server ga potvrdi protiv najavljenog. */
export async function sha256Hex(
  file: Blob,
  cryptoImpl: Crypto = globalThis.crypto,
): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await cryptoImpl.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sastavi meta zahtjev za preflight-start. BACA bez valjane privole (kao
 * buildIntegrityRequest): nijedan poziv ne smije krenuti bez privole.
 */
export function buildStartMeta(
  file: Blob,
  fileSha256: string,
  workType: string,
  lang: string,
  consent: PreflightConsent | null | undefined,
): PreflightStartMeta {
  if (!consent || consent.sendsFullFile !== true) {
    throw new Error('Provjera prije predaje traži privolu prije slanja datoteke');
  }
  return { fileSize: file.size, fileSha256, workType, lang, consent };
}

export async function startPreflight(
  config: PreflightConfig,
  accessToken: string,
  meta: PreflightStartMeta,
  fetchImpl: typeof fetch = fetch,
): Promise<StartOutcome> {
  if (!config.startEndpoint) return { kind: 'error', message: 'preflight nije konfiguriran' };
  let res: Response;
  try {
    res = await fetchImpl(config.startEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(meta),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrežna greška' };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 200) {
    if (data.dedup === true && typeof data.jobId === 'string') {
      return { kind: 'dedup', jobId: data.jobId };
    }
    if (typeof data.jobId === 'string' && typeof data.uploadUrl === 'string'
        && typeof data.uploadToken === 'string') {
      return {
        kind: 'ok', jobId: data.jobId, uploadUrl: data.uploadUrl,
        uploadToken: data.uploadToken, maxBytes: Number(data.maxBytes ?? 0),
      };
    }
    return { kind: 'error', message: 'neispravan odgovor servera' };
  }
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status === 429) return { kind: 'rate_limited' };
  if (res.status === 413) return { kind: 'too_large', maxBytes: Number(data.maxBytes) || undefined };
  if (res.status === 409) return { kind: 'job_active' };
  if (res.status === 503) return { kind: 'disabled' };
  return { kind: 'error', status: res.status, message: `neočekivani odgovor ${res.status}` };
}

/** Upload datoteke izravno na Python servis (octet-stream + HMAC token). */
export async function uploadFile(
  uploadUrl: string,
  uploadToken: string,
  file: Blob,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<UploadOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(uploadUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-lekta-token': uploadToken,
      },
      body: file,
      signal,
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrežna greška' };
  }
  if (res.status === 200) return { kind: 'accepted' };
  if (res.status === 401) return { kind: 'bad_ticket' };
  if (res.status === 413) {
    const data = (await res.json().catch(() => ({}))) as { max_bytes?: number };
    return { kind: 'too_large', maxBytes: data.max_bytes };
  }
  if (res.status === 415 || res.status === 422) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { kind: 'rejected', code: data.error ?? 'invalid_docx' };
  }
  if (res.status === 429) return { kind: 'busy' };
  return { kind: 'error', status: res.status, message: `neočekivani odgovor ${res.status}` };
}

export async function pollResult(
  config: PreflightConfig,
  accessToken: string,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PollOutcome> {
  if (!config.resultEndpoint) return { kind: 'error', message: 'preflight nije konfiguriran' };
  let res: Response;
  try {
    res = await fetchImpl(config.resultEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ jobId }),
    });
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : 'mrežna greška' };
  }
  if (res.status === 401) return { kind: 'unauthorized' };
  if (res.status !== 200) {
    return { kind: 'error', status: res.status, message: `neočekivani odgovor ${res.status}` };
  }
  const data = (await res.json().catch(() => ({}))) as {
    status?: PreflightStatus; report?: PreflightReport; depth?: 'teaser' | 'full';
    errorCode?: string;
  };
  switch (data.status) {
    case 'pending': return { kind: 'pending' };
    case 'running': return { kind: 'running' };
    case 'expired': return { kind: 'expired' };
    case 'error': return { kind: 'failed', code: data.errorCode ?? 'unknown' };
    case 'done':
      if (!data.report) return { kind: 'expired' };
      return { kind: 'done', report: data.report, depth: data.depth ?? 'full' };
    default:
      return { kind: 'error', message: 'nepoznat status' };
  }
}

/** Procjena trajanja (klijentski progress): fiksni trosak + po referenci. */
export function estimatePreflightSeconds(referenceCount: number): number {
  return Math.min(90, 10 + Math.round(referenceCount * 2.5));
}

/** Re-export za UI sloj (jedan uvoz). */
export { buildPreflightConsent };
export type { PreflightConsent, PreflightReport };
