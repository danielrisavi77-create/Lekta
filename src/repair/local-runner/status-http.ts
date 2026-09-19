import type { LocalRepairStatusResult } from './status-service.ts';

export interface LocalRepairStatusHttpDependencies {
  record: (input: unknown) => Promise<LocalRepairStatusResult>;
}

const RESPONSE_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json',
} as const;
const MAX_REQUEST_BYTES = 64 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}

async function requestBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_REQUEST_BYTES) {
      throw new TypeError('invalid content length');
    }
  }

  if (!request.body) throw new TypeError('missing request body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        try {
          await reader.cancel('request too large');
        } catch {
          // The size decision is authoritative even if stream cancellation fails.
        }
        throw new TypeError('request too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return JSON.parse(text) as unknown;
}

export async function handleLocalRepairStatusHttp(
  request: Request,
  dependencies: LocalRepairStatusHttpDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: unknown;
  try {
    body = await requestBody(request);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  let result: LocalRepairStatusResult;
  try {
    result = await dependencies.record(body);
  } catch {
    return json({ error: 'internal' }, 500);
  }
  if (result.ok) return json(result, 200);
  if (result.code === 'invalid-signature'
    || result.code === 'invalid-device-key'
    || result.code === 'not-bound') {
    return json({ error: 'unauthorized' }, 401);
  }
  if (result.code === 'not-advanceable') return json({ error: 'not_advanceable' }, 409);
  return json({ error: 'bad_request' }, 400);
}
