// @vitest-environment node
/**
 * T84 RD-2 i RD-3 (Codex R7 i R1 na #294): HANDLER repair-docx, ne samo pomocni moduli.
 *
 * Handler se ucitava stvaran, uz lazni esm.sh klijent i lazni `Deno` (env i `serve`). Citac tijela
 * (`readFormDataBounded`) i `readZip` su spijuni: test tvrdi da strop pokusaja, neuspjela rezervacija i
 * greska slota odbiju zahtjev PRIJE skupog rada, a pozitivna kontrola da spijuni stvarno vide citanje.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeAdmin, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import { repairRequestFingerprint } from '../src/report/repair-request-idempotency';
import { TERMS_VERSION } from '../src/legal/terms-version';

const state = vi.hoisted(() => ({
  resolve: (_c: { table: string }): unknown => undefined,
  calls: [] as { table: string; ops: { op: string; args: unknown[] }[] }[],
  readBody: 0,
  readZip: 0,
  parseBody: false,
}));

vi.mock('https://esm.sh/@supabase/supabase-js@2.110.2', () => ({
  createClient: () => {
    const { admin, calls } = fakeAdmin((c: FakeCall) => state.resolve(c) as FakeResult | undefined);
    state.calls = calls;
    return { ...admin, auth: { getUser: async () => ({ data: { user: { id: 'user-a', is_anonymous: false } } }) } };
  },
}));

vi.mock('../supabase/functions/_shared/read-body.ts', async (orig) => ({
  ...(await orig<typeof import('../supabase/functions/_shared/read-body.ts')>()),
  readFormDataBounded: async (req: Request) => {
    state.readBody += 1;
    if (state.parseBody) return { ok: true, form: await req.formData() };
    return { ok: false, reason: 'too_large' };
  },
}));

vi.mock('../src/repair/zip-codec.ts', async (orig) => ({
  ...(await orig<typeof import('../src/repair/zip-codec.ts')>()),
  readZip: async () => {
    state.readZip += 1;
    throw new Error('readZip se ne smije pozvati');
  },
}));

const ENV: Record<string, string> = {
  SUPABASE_URL: 'http://lazni.supabase',
  SUPABASE_SERVICE_ROLE_KEY: 'lazni-kljuc',
  REPAIR_UNCOUNTED_DAILY_CAP: '30',
  REPAIR_STATUS_USER_DAILY_CAP: '20',
  REPAIR_STATUS_IP_DAILY_CAP: '50',
  REPAIR_RECOVERY_USER_DAILY_CAP: '2',
  REPAIR_RECOVERY_IP_DAILY_CAP: '6',
  REPAIR_MAX_PER_USER: '1',
};

let handler: (req: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (k: string) => ENV[k], toObject: () => ({ ...ENV }) },
    serve: (h: (req: Request) => Promise<Response>) => { handler = h; },
  });
  await import('../supabase/functions/repair-docx/index.ts');
  if (!handler) throw new Error('Deno.serve nije pozvan');
});

beforeEach(() => {
  state.readBody = 0;
  state.readZip = 0;
  state.calls = [];
  state.parseBody = false;
});

const SLOT_OK: FakeResult = { data: [{ slot_id: 's-1', reason: 'ok' }] };
const post = (extraHeaders: Record<string, string> = {}) => handler(new Request('http://lazni/repair-docx', {
  method: 'POST',
  headers: { Authorization: 'Bearer token', 'cf-connecting-ip': '203.0.113.7', 'content-type': 'multipart/form-data; boundary=x', ...extraHeaders },
  body: 'x',
}));
const postForm = (form: FormData, extraHeaders: Record<string, string>) => handler(new Request('http://lazni/repair-docx', {
  method: 'POST',
  headers: { Authorization: 'Bearer token', 'cf-connecting-ip': '203.0.113.7', ...extraHeaders },
  body: form,
}));
const attemptWrites = () => state.calls.filter((c) => c.table === 'repair_attempt_log' && writeOp(c) !== 'select');
const REQUEST_ID = 'c6a90f20-9263-4cdf-92b7-09b6a96a32c6';
const REQUEST_FINGERPRINT = 'a'.repeat(64);

describe('repair-docx handler: strop pokusaja i rezervacija prije tijela', () => {
  it('count 30 daje 429 attempts_daily, a citac tijela, readZip i rezervacija nisu pozvani (Codex R7)', async () => {
    state.resolve = (c) => (c.table === 'rpc:try_acquire_repair_slot_for_user' ? SLOT_OK
      : c.table === 'repair_attempt_log' ? { count: 30 } : undefined);
    const res = await post();
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', reason: 'attempts_daily' });
    expect(state.readBody).toBe(0);
    expect(state.readZip).toBe(0);
    expect(attemptWrites()).toEqual([]);
    expect(state.calls.some((c) => c.table === 'rpc:release_repair_slot')).toBe(true);
  });

  it('status zahtjeva uzima dnevne user i IP slotove prije RPC-a za status', async () => {
    state.resolve = (c) => c.table === 'rpc:claim_two_rate_slots' ? { data: 'denied_a' }
      : c.table === 'rpc:repair_request_status' ? { data: { status: 'completed_unstored', jobId: null } }
      : undefined;
    const res = await post({
      'X-Lekta-Request-Mode': 'status',
      'X-Lekta-Request-Id': REQUEST_ID,
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', reason: 'status_user' });
    expect(state.calls.some((c) => c.table === 'rpc:repair_request_status')).toBe(false);
  });

  it('status zahtjeva se može provjeriti ispod limita i prosljeđuje identitet vlasnika', async () => {
    state.resolve = (c) => c.table === 'rpc:claim_two_rate_slots' ? { data: 'ok' }
      : c.table === 'rpc:repair_request_status' ? { data: { status: 'completed_unstored', jobId: null } }
      : undefined;
    const res = await post({
      'X-Lekta-Request-Mode': 'status',
      'X-Lekta-Request-Id': REQUEST_ID,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'completed_unstored', jobId: null });
    const rateLimitCall = state.calls.find((c) => c.table === 'rpc:claim_two_rate_slots');
    expect(rateLimitCall?.ops[0]?.args[1]).toMatchObject({
      p_scope_a: 'repair_status_user',
      p_hash_a: 'user-a',
      p_cap_a: 20,
      p_scope_b: 'repair_status_ip',
      p_cap_b: 50,
    });
  });

  it('greska rate-limit RPC-a fail-closea status prije citanja stanja zahtjeva', async () => {
    state.resolve = (c) => c.table === 'rpc:claim_two_rate_slots'
      ? { error: { message: 'database unavailable' } }
      : c.table === 'rpc:repair_request_status' ? { data: { status: 'completed_unstored', jobId: null } }
      : undefined;
    const res = await post({
      'X-Lekta-Request-Mode': 'status',
      'X-Lekta-Request-Id': REQUEST_ID,
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(state.calls.some((c) => c.table === 'rpc:repair_request_status')).toBe(false);
  });

  it('completed_unstored smije do bounded body provjere iznad attempt limita bez preuranjene recovery kvote', async () => {
    state.resolve = (c) => c.table === 'rpc:try_acquire_repair_slot_for_user' ? SLOT_OK
      : c.table === 'repair_attempt_log' ? (writeOp(c) === 'insert' ? { data: { id: 'r-recovery' } } : { count: 30 })
      : c.table === 'rpc:repair_request_status' ? { data: { status: 'completed_unstored', jobId: null } }
      : c.table === 'rpc:claim_two_rate_slots' ? { data: 'ok' }
      : undefined;
    const res = await post({
      'X-Lekta-Request-Id': REQUEST_ID,
      'X-Lekta-Request-Fingerprint': REQUEST_FINGERPRINT,
    });
    expect(res.status).toBe(413); // bounded body reader is a deliberate test stub
    expect(state.readBody).toBe(1);
    expect(state.readZip).toBe(0);
    expect(attemptWrites().map(writeOp)).toEqual(['insert']);
    const rateCalls = state.calls.filter((c) => c.table === 'rpc:claim_two_rate_slots');
    expect(rateCalls).toHaveLength(1);
    expect(rateCalls[0]?.ops[0]?.args[1]).toMatchObject({
      p_scope_a: 'repair_status_user',
      p_scope_b: 'repair_status_ip',
    });
  });

  it('nepoznat/neuspješan recovery ne preskače opći strop ni čita tijelo', async () => {
    state.resolve = (c) => c.table === 'rpc:try_acquire_repair_slot_for_user' ? SLOT_OK
      : c.table === 'repair_attempt_log' ? { count: 30 }
      : c.table === 'rpc:repair_request_status' ? { data: { status: 'completed' } }
      : c.table === 'rpc:claim_two_rate_slots' ? { data: 'ok' }
      : undefined;
    const res = await post({
      'X-Lekta-Request-Id': REQUEST_ID,
      'X-Lekta-Request-Fingerprint': REQUEST_FINGERPRINT,
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited', reason: 'attempts_daily' });
    expect(state.readBody).toBe(0);
    expect(attemptWrites()).toEqual([]);
  });

  it('completed_unstored cap preflight does not spend recovery quota before the idempotency claim', async () => {
    state.resolve = (c) => c.table === 'rpc:try_acquire_repair_slot_for_user' ? SLOT_OK
      : c.table === 'repair_attempt_log' ? (writeOp(c) === 'insert' ? { data: { id: 'r-recovery' } } : { count: 30 })
      : c.table === 'rpc:repair_request_status' ? { data: { status: 'completed_unstored' } }
      : c.table === 'rpc:claim_two_rate_slots' ? { data: 'ok' }
      : undefined;
    const res = await post({
      'X-Lekta-Request-Id': REQUEST_ID,
      'X-Lekta-Request-Fingerprint': REQUEST_FINGERPRINT,
    });
    expect(res.status).toBe(413); // bounded body reader is a deliberate test stub
    expect(state.readBody).toBe(1);
    expect(attemptWrites().map(writeOp)).toEqual(['insert']);
    const rateCalls = state.calls.filter((c) => c.table === 'rpc:claim_two_rate_slots');
    expect(rateCalls).toHaveLength(1);
    expect(rateCalls[0]?.ops[0]?.args[1]).toMatchObject({ p_scope_a: 'repair_status_user' });
  });

  it('recovery job lookup failure releases the attempt and does not spend recovery quota or rerun repair', async () => {
    state.parseBody = true;
    state.resolve = (c) => {
      if (c.table === 'rpc:try_acquire_repair_slot_for_user') return SLOT_OK;
      if (c.table === 'repair_attempt_log') {
        if (writeOp(c) === 'insert') return { data: { id: 'attempt-recovery' } };
        if (writeOp(c) === 'delete') return { data: null };
        return { count: 0 };
      }
      if (c.table === 'rpc:claim_repair_request') {
        return { data: { claimed: true, status: 'processing', recovery: true } };
      }
      if (c.table === 'repair_jobs') return { error: { message: 'database unavailable' } };
      if (c.table === 'rpc:finish_repair_request') return { data: true };
      return undefined;
    };

    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
    const meta = {
      workType: 'diplomski',
      consentVersion: TERMS_VERSION,
      requests: [{ fixerId: 'line-spacing-fixer', ruleId: 'r1', params: { multiplier: 1.5, deep: true } }],
    };
    const fingerprint = await repairRequestFingerprint(bytes, meta);
    const form = new FormData();
    form.append('file', new File([bytes], 'input.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    form.append('meta', JSON.stringify(meta));

    const res = await postForm(form, {
      'X-Lekta-Request-Id': REQUEST_ID,
      'X-Lekta-Request-Fingerprint': fingerprint,
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(state.readBody).toBe(1);
    expect(state.readZip).toBe(0);
    expect(state.calls.some((c) => c.table === 'rpc:claim_two_rate_slots'
      && (c.ops[0]?.args[1] as Record<string, unknown>)?.p_scope_a === 'repair_recovery_user')).toBe(false);
    const finishCall = state.calls.find((c) => c.table === 'rpc:finish_repair_request');
    expect(finishCall?.ops[0]?.args[1]).toMatchObject({ p_status: 'completed_unstored', p_job_id: null });
    expect(state.calls.some((c) => c.table === 'repair_attempt_log' && writeOp(c) === 'delete')).toBe(true);
  });

  it('neuspjela rezervacija daje 503 prije citanja tijela (Codex R3)', async () => {
    state.resolve = (c) => {
      if (c.table === 'rpc:try_acquire_repair_slot_for_user') return SLOT_OK;
      if (c.table !== 'repair_attempt_log') return undefined;
      return writeOp(c) === 'insert' ? { error: { message: 'permission denied', code: '42501' } } : { count: 0 };
    };
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
    expect(state.readBody).toBe(0);
    expect(attemptWrites().map(writeOp)).toEqual(['insert']);
  });

  it('bacena iznimka slota daje 503 prije citanja tijela (Codex R1)', async () => {
    state.resolve = (c) => {
      if (c.table === 'rpc:try_acquire_repair_slot_for_user') throw new Error('fetch failed');
      return c.table === 'repair_attempt_log' ? { count: 0 } : undefined;
    };
    const res = await post();
    expect(res.status).toBe(503);
    expect(state.readBody).toBe(0);
    expect(state.calls.some((c) => c.table === 'repair_attempt_log')).toBe(false);
  });

  it('pozitivna kontrola: ispod stropa se pokusaj rezervira PA tek onda cita tijelo; rezervacija ostaje', async () => {
    state.resolve = (c) => {
      if (c.table === 'rpc:try_acquire_repair_slot_for_user') return SLOT_OK;
      if (c.table !== 'repair_attempt_log') return undefined;
      return writeOp(c) === 'insert' ? { data: { id: 'r-1' } } : { count: 29 };
    };
    const res = await post();
    expect(res.status).toBe(413);
    expect(state.readBody).toBe(1);
    expect(state.readZip).toBe(0);
    // Rezervacija je upisana prije citanja i nije obrisana: skupi pokusaj ostaje u stropu.
    expect(attemptWrites().map(writeOp)).toEqual(['insert']);
  });
});
