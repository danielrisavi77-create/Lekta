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
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) {
    throw new TypeError('request too large');
  }
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
