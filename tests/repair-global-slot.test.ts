/**
 * T84 RD-3: slot popravka s limitom po korisniku (global-slot.ts) i RD-2 strop ishoda bez potrosnje.
 * Mjeri se izvrseni modul nad laznom bazom (rpc odgovori), plus gard izvora index.ts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireRepairSlot, isMissingFunction } from '../supabase/functions/repair-docx/global-slot';
import { attemptCapStatus, recordAttempt } from '../supabase/functions/repair-docx/attempt-cap';
import { argOf, eqs, fakeAdmin, writeOp, type FakeCall, type FakeResult } from './helpers/fake-supabase';
import { repairCostGuardProblems } from './helpers/repair-cost-guard';

const LIMITS = { userId: 'user-a', maxGlobal: 4, maxPerUser: 1, leaseSeconds: 300 };
const rpcArgs = (c: FakeCall) => c.ops[0].args[1] as Record<string, unknown>;

function db(answers: Record<string, FakeResult>) {
  return fakeAdmin((c: FakeCall) => answers[c.table]);
}

describe('T84 RD-3: acquireRepairSlot', () => {
  it('ok: novi RPC dobiva korisnika i limit po korisniku, release zove release_repair_slot tocno jednom', async () => {
    const { admin, calls } = db({ 'rpc:try_acquire_repair_slot_for_user': { data: [{ slot_id: 's-1', reason: 'ok' }] } });
    const slot = await acquireRepairSlot(admin, LIMITS);
    expect(slot.kind).toBe('ok');
    expect(rpcArgs(calls[0])).toEqual({ p_max: 4, p_lease_seconds: 300, p_user_id: 'user-a', p_max_per_user: 1 });
    if (slot.kind !== 'ok') throw new Error('nije ok');
    await slot.release();
    await slot.release();
    const releases = calls.filter((c) => c.table === 'rpc:release_repair_slot');
    expect(releases).toHaveLength(1);
    expect(rpcArgs(releases[0])).toEqual({ p_id: 's-1' });
  });

  it('user_busy i full se razlikuju i ne uzimaju slot', async () => {
    const busy = await acquireRepairSlot(db({ 'rpc:try_acquire_repair_slot_for_user': { data: [{ slot_id: null, reason: 'user_busy' }] } }).admin, LIMITS);
    expect(busy.kind).toBe('user_busy');
    const full = await acquireRepairSlot(db({ 'rpc:try_acquire_repair_slot_for_user': { data: [{ slot_id: null, reason: 'full' }] } }).admin, LIMITS);
    expect(full.kind).toBe('full');
  });

  it('bez migracije 0209 (PGRST202 ili 42883) pada na stari globalni RPC, ne na per-instance gate', async () => {
    for (const code of ['PGRST202', '42883']) {
      const { admin, calls } = db({
        'rpc:try_acquire_repair_slot_for_user': { error: { message: 'function not found', code } },
        'rpc:try_acquire_repair_slot': { data: 'g-1' },
      });
      const slot = await acquireRepairSlot(admin, LIMITS);
      expect(slot.kind).toBe('ok');
      expect(calls.map((c) => c.table)).toEqual(['rpc:try_acquire_repair_slot_for_user', 'rpc:try_acquire_repair_slot']);
    }
  });

  it('svaka druga greska novog RPC-a je error (503) i NE aktivira stari RPC bez limita po korisniku (Codex R1)', async () => {
    for (const error of [{ message: 'timeout' }, { message: 'null', code: '22004' }, { message: 'x', code: 'PGRST301' }]) {
      const { admin, calls } = db({
        'rpc:try_acquire_repair_slot_for_user': { error },
        'rpc:try_acquire_repair_slot': { data: 'g-1' },
      });
      expect((await acquireRepairSlot(admin, LIMITS)).kind).toBe('error');
      expect(calls.map((c) => c.table)).toEqual(['rpc:try_acquire_repair_slot_for_user']);
    }
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunction({ code: '42883' })).toBe(true);
    expect(isMissingFunction({ code: '22004' })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });

  it('novi RPC ne postoji, a stari pao: absent (per-instance gate); stari pun: full', async () => {
    const missing = { error: { message: 'missing', code: 'PGRST202' } };
    const absent = await acquireRepairSlot(db({
      'rpc:try_acquire_repair_slot_for_user': missing,
      'rpc:try_acquire_repair_slot': { error: { message: 'y' } },
    }).admin, LIMITS);
    expect(absent.kind).toBe('absent');
    const full = await acquireRepairSlot(db({
      'rpc:try_acquire_repair_slot_for_user': missing,
      'rpc:try_acquire_repair_slot': { data: null },
    }).admin, LIMITS);
    expect(full.kind).toBe('full');
  });

  it('strop pokusaja: 30 ishoda je over, 29 ok, greska i null su error (fail-closed), cap 0 bez upita (Codex R2, R7)', async () => {
    const answer = (r: FakeResult) => fakeAdmin((c: FakeCall) => (c.table === 'repair_attempt_log' ? r : undefined));
    const over = answer({ count: 30 });
    expect(await attemptCapStatus(over.admin, 'u', 30, Date.parse('2026-10-04T12:00:00Z'))).toBe('over');
    expect(eqs(over.calls[0])).toEqual({ user_id: 'u' });
    expect(over.calls[0].ops.find((o) => o.op === 'gt')?.args).toEqual(['created_at', '2026-10-03T12:00:00.000Z']);
    expect(await attemptCapStatus(answer({ count: 29 }).admin, 'u', 30)).toBe('ok');
    expect(await attemptCapStatus(answer({ error: { message: 'db down' } }).admin, 'u', 30)).toBe('error');
    expect(await attemptCapStatus(answer({ count: null }).admin, 'u', 30)).toBe('error');
    const off = answer({ count: 999 });
    expect(await attemptCapStatus(off.admin, 'u', 0)).toBe('ok');
    expect(off.calls).toEqual([]);
  });

  it('upis pokusaja: tocan redak u repair_attempt_log, greska upisa je false (Codex R3)', async () => {
    const ok = fakeAdmin(() => undefined);
    expect(await recordAttempt(ok.admin, 'u', 'no_change')).toBe(true);
    expect(ok.calls).toHaveLength(1);
    expect(ok.calls[0].table).toBe('repair_attempt_log');
    expect(writeOp(ok.calls[0])).toBe('insert');
    expect(argOf(ok.calls[0], 'insert')).toEqual({ user_id: 'u', outcome: 'no_change' });
    const fail = fakeAdmin(() => ({ error: { message: 'relation does not exist', code: '42P01' } }));
    expect(await recordAttempt(fail.admin, 'u', 'integrity_failed')).toBe(false);
  });

  it('izvor repair-docx: slot po korisniku, strop ishoda bez potrosnje prije tijela, biljezenje (baseline garda)', () => {
    const src = readFileSync(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'), 'utf8').replace(/\r\n?/g, '\n');
    expect(repairCostGuardProblems(src)).toEqual([]);
  });
});
