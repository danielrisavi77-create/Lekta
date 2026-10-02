import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'postgres';
import {
  PROTOCOL_VERSION,
  payloadScopeHashValid,
  statusForControlResult,
  timingSafeTokenEqual,
  validateEnvelope,
} from './protocol.ts';

const MAX_BODY_BYTES = 64 * 1024;

const databaseUrl = Deno.env.get('SUPABASE_DB_URL') ?? '';
const sql = databaseUrl
  ? postgres(databaseUrl, {
      prepare: false,
      max: 1,
      idle_timeout: 5,
      connect_timeout: 5,
    })
  : null;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function expectedControlToken(): string {
  const explicit = Deno.env.get('LEKTA_CONTROL_PLANE_ADMIN_TOKEN')?.trim();
  if (explicit) return explicit;

  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return typeof keys?.default === 'string' ? keys.default.trim() : '';
  } catch {
    return '';
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'method_not_allowed' }, 405);
  }

  const expectedToken = expectedControlToken();
  if (!expectedToken) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'server_not_configured' }, 503);
  }

  const authorized = await timingSafeTokenEqual(
    request.headers.get('x-lekta-control-token'),
    expectedToken,
  );
  if (!authorized) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'unauthorized' }, 401);
  }

  if (!sql) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'database_not_configured' }, 503);
  }

  const advertisedLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_BODY_BYTES) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'payload_too_large' }, 413);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'payload_too_large' }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'invalid_json' }, 400);
  }

  const envelope = validateEnvelope(body);
  if (!envelope.ok) {
    return json({ protocolVersion: PROTOCOL_VERSION, ...envelope }, 400);
  }

  if ((envelope.operation === 'claim' || envelope.operation === 'expand')
      && !(await payloadScopeHashValid(envelope.payload))) {
    return json({
      protocolVersion: PROTOCOL_VERSION,
      ok: false,
      code: 'scope_hash_mismatch',
      message: 'scopeHash ne odgovara kanonskom scopeu.',
    }, 400);
  }

  try {
    const rows = await sql`
      select agent_control.dispatch(
        ${envelope.operation}::text,
        ${JSON.stringify(envelope.payload)}::jsonb
      ) as result
    `;
    const result = rows[0]?.result;
    return json(result, statusForControlResult(result));
  } catch (error) {
    console.error('agent-control-plane dispatch failed', {
      operation: envelope.operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({
      protocolVersion: PROTOCOL_VERSION,
      ok: false,
      code: 'internal_error',
      message: 'Control plane nije mogao dovrsiti operaciju.',
    }, 500);
  }
});
