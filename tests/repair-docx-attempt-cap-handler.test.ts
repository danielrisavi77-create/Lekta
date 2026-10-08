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

const state = vi.hoisted(() => ({
  resolve: (_c: { table: string }): unknown => undefined,
  calls: [] as { table: string; ops: { op: string; args: unknown[] }[] }[],
  readBody: 0,
  readZip: 0,
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
  readFormDataBounded: async () => {
    state.readBody += 1;
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
});

const SLOT_OK: FakeResult = { data: [{ slot_id: 's-1', reason: 'ok' }] };
const post = () => handler(new Request('http://lazni/repair-docx', {
  method: 'POST',
  headers: { Authorization: 'Bearer token', 'content-type': 'multipart/form-data; boundary=x' },
  body: 'x',
}));
const attemptWrites = () => state.calls.filter((c) => c.table === 'repair_attempt_log' && writeOp(c) !== 'select');

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
