/**
 * Klijent lokalnog Laya runtimea (V2.1). Protokol je u docs/laya/RUNTIME_PROTOCOL.md.
 *
 * Granice (LAYA_V2_SPEC.md, odj. 13):
 *  - samo loopback (127.0.0.1, ::1, localhost) i samo http; udaljeni runtime trazi zaseban consent
 *    i nije dio V2.1, pa ga klijent odbija vec pri konstrukciji;
 *  - runtime dobiva samo omotnicu s caseId, inputDigest i modelInput (tekst jednog zapisa), nikad
 *    identitet, provenance, score ni dokument;
 *  - svaki kvar (nedostupan servis, timeout, prevelik ili neispravan odgovor) je null, sto
 *    adjudicate() pretvara u `runtime_unavailable`. Klijent nikad ne baca prema runneru.
 *
 * Odgovor se ne tumaci ovdje: sirovi JSON ide u adjudicate() uz manifest i prag iz registra.
 */
import { SCHEMA_VERSION, TASK_ID } from './contracts-v2.ts';
import type { LayaModelInput, LayaVerdict } from './contracts-v2.ts';

const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_BYTES = 64 * 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

export interface LayaInferenceRequest {
  schemaVersion: typeof SCHEMA_VERSION;
  taskId: typeof TASK_ID;
  caseId: string;
  inputDigest: string;
  modelInput: LayaModelInput;
  /** Redoslijed ponudjenih oznaka; eval ga permutira za provjeru stabilnosti (odj. 20). */
  labelOrder: LayaVerdict[];
}

export interface LayaRuntimeClient {
  /** Vraca sirovi odgovor runtimea ili null na svaki kvar. Nikad ne baca. */
  infer(request: LayaInferenceRequest): Promise<unknown>;
}

class LayaEndpointError extends Error {
  constructor() { super('Laya runtime mora biti lokalni http endpoint (127.0.0.1, ::1 ili localhost).'); this.name = 'LayaEndpointError'; }
}

/** Dopusten je samo lokalni http endpoint bez korisnickih podataka u URL-u. */
export function assertLoopbackEndpoint(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new LayaEndpointError(); }
  if (url.protocol !== 'http:' || url.username || url.password || !LOOPBACK_HOSTS.has(url.hostname)) throw new LayaEndpointError();
  return url;
}

export interface HttpClientOptions { timeoutMs?: number; fetchImpl?: typeof fetch }

export function httpLayaClient(endpoint: string, options: HttpClientOptions = {}): LayaRuntimeClient {
  const url = new URL('v2/infer', assertLoopbackEndpoint(endpoint.endsWith('/') ? endpoint : `${endpoint}/`));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;
  return {
    async infer(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await doFetch(url, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
          signal: controller.signal, redirect: 'error',
        });
        if (!response.ok) return null;
        const declared = Number(response.headers.get('content-length') ?? '0');
        if (declared > MAX_RESPONSE_BYTES) return null;
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) return null;
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
