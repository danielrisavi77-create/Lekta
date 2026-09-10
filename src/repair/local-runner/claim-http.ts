import type {
  LocalRepairClaimInput,
  LocalRepairClaimResult,
} from './claim-service.ts';

export interface LocalRepairClaimHttpDependencies {
  claim: (input: LocalRepairClaimInput) => Promise<LocalRepairClaimResult>;
}

const RESPONSE_HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json',
} as const;
const MAX_REQUEST_BYTES = 64 * 1024;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}

function inputObject(value: unknown): LocalRepairClaimInput | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.jobId !== 'string'
    || typeof candidate.claimToken !== 'string'
    || typeof candidate.devicePublicKeySpki !== 'string') return null;
  return {
    jobId: candidate.jobId,
    claimToken: candidate.claimToken,
    devicePublicKeySpki: candidate.devicePublicKeySpki,
  };
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

export async function handleLocalRepairClaimHttp(
  request: Request,
  dependencies: LocalRepairClaimHttpDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: unknown;
  try {
    body = await requestBody(request);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const input = inputObject(body);
  if (!input) return json({ error: 'bad_request' }, 400);

  let result: LocalRepairClaimResult;
  try {
    result = await dependencies.claim(input);
  } catch {
    return json({ error: 'internal' }, 500);
  }
  if (result.ok) return json(result, 200);
  if (result.code === 'not-claimable') return json({ error: 'not_claimable' }, 409);
  if (result.code === 'invalid-claim-record') return json({ error: 'internal' }, 500);
  return json({ error: 'bad_request' }, 400);
}
