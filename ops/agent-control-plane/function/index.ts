import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'postgres';
import {
  PROTOCOL_VERSION,
  type ControlOperation,
  payloadScopeHashValid,
  sha256Hex,
  statusForControlResult,
  timingSafeTokenHashMatch,
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

async function expectedControlTokenHash(): Promise<string> {
  if (!sql) return '';
  const rows = await sql`
    select setting_value
      from agent_control.control_settings
     where setting_key = 'admin_token_sha256'
     limit 1
  `;
  const value = rows[0]?.setting_value;
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value) ? value.toLowerCase() : '';
}

type ValidEnvelope = {
  ok: true;
  operation: ControlOperation;
  payload: Record<string, unknown>;
};

type ParsedEnvelope =
  | { ok: true; envelope: ValidEnvelope }
  | { ok: false; response: Response };

async function readEnvelope(request: Request): Promise<ParsedEnvelope> {
  const advertisedLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_BODY_BYTES) {
    return { ok: false, response: json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'payload_too_large' }, 413) };
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'payload_too_large' }, 413) };
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, response: json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'invalid_json' }, 400) };
  }

  const envelope = validateEnvelope(body);
  if (!envelope.ok) {
    return { ok: false, response: json({ protocolVersion: PROTOCOL_VERSION, ...envelope }, 400) };
  }
  return { ok: true, envelope };
}

async function validateWorkerLease(
  payload: Record<string, unknown>,
  request: Request,
): Promise<Response> {
  if (!sql) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'database_not_configured' }, 503);
  }

  const leaseToken = request.headers.get('x-lekta-lease-token')?.trim() ?? '';
  if (leaseToken.length < 32 || leaseToken.length > 256 || /\s/.test(leaseToken)) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'unauthorized' }, 401);
  }

  try {
    const capabilityHash = await sha256Hex(leaseToken);
    const rows = await sql`
      select agent_control.validate_lease(
        ${JSON.stringify({ ...payload, capabilityHash })}::jsonb
      ) as result
    `;
    const rawResult = rows[0]?.result;
    const result = rawResult && typeof rawResult === 'object'
      ? { protocolVersion: PROTOCOL_VERSION, ...rawResult }
      : rawResult;
    return json(result, statusForControlResult(result));
  } catch (error) {
    console.error('agent-control-plane validate failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return json({
      protocolVersion: PROTOCOL_VERSION,
      ok: false,
      code: 'internal_error',
      message: 'Control plane nije mogao provjeriti lease.',
    }, 500);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'method_not_allowed' }, 405);
  }

  const parsed = await readEnvelope(request);
  if (!parsed.ok) return parsed.response;
  const envelope = parsed.envelope;

  if (envelope.operation === 'validate') {
    return validateWorkerLease(envelope.payload, request);
  }

  if (!sql) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'database_not_configured' }, 503);
  }

  let expectedTokenHash = '';
  try {
    expectedTokenHash = await expectedControlTokenHash();
  } catch (error) {
    console.error('agent-control-plane auth lookup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'database_unavailable' }, 503);
  }
  if (!expectedTokenHash) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'server_not_configured' }, 503);
  }

  const authorized = await timingSafeTokenHashMatch(
    request.headers.get('x-lekta-control-token'),
    expectedTokenHash,
  );
  if (!authorized) {
    return json({ protocolVersion: PROTOCOL_VERSION, ok: false, code: 'unauthorized' }, 401);
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
