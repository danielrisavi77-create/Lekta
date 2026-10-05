/**
 * T84 RD-3: slot popravka s limitom po korisniku (global-slot.ts) i RD-2 strop ishoda bez potrosnje.
 * Mjeri se izvrseni modul nad laznom bazom (rpc odgovori), plus gard izvora index.ts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireRepairSlot, isMissingFunction } from '../supabase/functions/repair-docx/global-slot';
import { attemptCapStatus, dropAttempt, finishAttempt, reserveAttempt } from '../supabase/functions/repair-docx/attempt-cap';
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

  it('absent SAMO kad ni novi ni stari RPC ne postoje; stari pun: full', async () => {
    const missing = { error: { message: 'missing', code: 'PGRST202' } };
    for (const code of ['PGRST202', '42883']) {
      const absent = await acquireRepairSlot(db({
        'rpc:try_acquire_repair_slot_for_user': missing,
        'rpc:try_acquire_repair_slot': { error: { message: 'missing', code } },
      }).admin, LIMITS);
      expect(absent.kind).toBe('absent');
    }
    const full = await acquireRepairSlot(db({
      'rpc:try_acquire_repair_slot_for_user': missing,
      'rpc:try_acquire_repair_slot': { data: null },
    }).admin, LIMITS);
    expect(full.kind).toBe('full');
  });

  it('operativna greska starog RPC-a nakon PGRST202 je error (503), ne absent (Codex R1 runda 2)', async () => {
    for (const error of [{ message: 'timeout' }, { message: 'x', code: '57014' }, { message: 'x', code: 'PGRST301' }]) {
      const slot = await acquireRepairSlot(db({
        'rpc:try_acquire_repair_slot_for_user': { error: { message: 'missing', code: 'PGRST202' } },
        'rpc:try_acquire_repair_slot': { error },
      }).admin, LIMITS);
      expect(slot.kind).toBe('error');
    }
  });

  it('bacena iznimka novog ili starog RPC-a je error (503), ne absent (Codex R1 runda 2)', async () => {
    const throwsOn = (fn: string, before?: Record<string, FakeResult>) => fakeAdmin((c: FakeCall) => {
      if (c.table === fn) throw new Error('fetch failed');
      return before?.[c.table];
    });
    const newThrows = throwsOn('rpc:try_acquire_repair_slot_for_user');
    expect((await acquireRepairSlot(newThrows.admin, LIMITS)).kind).toBe('error');
    expect(newThrows.calls.map((c) => c.table)).toEqual(['rpc:try_acquire_repair_slot_for_user']);
    const oldThrows = throwsOn('rpc:try_acquire_repair_slot', {
      'rpc:try_acquire_repair_slot_for_user': { error: { message: 'missing', code: 'PGRST202' } },
    });
    expect((await acquireRepairSlot(oldThrows.admin, LIMITS)).kind).toBe('error');
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

  it('rezervacija: pending redak s id-om; greska, iznimka ili bez id-a je null (503); cap 0 je off bez upita (Codex R3 runda 2)', async () => {
    const ok = fakeAdmin(() => ({ data: { id: 'r-1' } }));
    expect(await reserveAttempt(ok.admin, 'u', 30)).toEqual({ kind: 'reserved', id: 'r-1' });
    expect(ok.calls).toHaveLength(1);
    expect(ok.calls[0].table).toBe('repair_attempt_log');
    expect(writeOp(ok.calls[0])).toBe('insert');
    expect(argOf(ok.calls[0], 'insert')).toEqual({ user_id: 'u', outcome: 'pending' });
    expect(await reserveAttempt(fakeAdmin(() => ({ error: { message: 'denied', code: '42501' } })).admin, 'u', 30)).toBeNull();
    expect(await reserveAttempt(fakeAdmin(() => ({ data: null })).admin, 'u', 30)).toBeNull();
    expect(await reserveAttempt(fakeAdmin(() => { throw new Error('fetch failed'); }).admin, 'u', 30)).toBeNull();
    const off = fakeAdmin(() => undefined);
    expect(await reserveAttempt(off.admin, 'u', 0)).toEqual({ kind: 'off' });
    expect(off.calls).toEqual([]);
  });

  it('dopisivanje ishoda i brisanje rezervacije ciljaju tocno taj redak; off ne pise nista', async () => {
    const reserved = { kind: 'reserved', id: 'r-1' } as const;
    const fin = fakeAdmin(() => undefined);
    expect(await finishAttempt(fin.admin, reserved, 'no_change')).toBe(true);
    expect(writeOp(fin.calls[0])).toBe('update');
    expect(argOf(fin.calls[0], 'update')).toEqual({ outcome: 'no_change' });
    expect(eqs(fin.calls[0])).toEqual({ id: 'r-1' });
    const drop = fakeAdmin(() => undefined);
    expect(await dropAttempt(drop.admin, reserved)).toBe(true);
    expect(writeOp(drop.calls[0])).toBe('delete');
    expect(eqs(drop.calls[0])).toEqual({ id: 'r-1' });
    const fail = fakeAdmin(() => ({ error: { message: 'x' } }));
    expect(await finishAttempt(fail.admin, reserved, 'integrity_failed')).toBe(false);
    expect(await dropAttempt(fail.admin, reserved)).toBe(false);
    const off = fakeAdmin(() => undefined);
    expect(await finishAttempt(off.admin, { kind: 'off' }, 'no_change')).toBe(true);
    expect(await dropAttempt(off.admin, { kind: 'off' })).toBe(true);
    expect(off.calls).toEqual([]);
  });

  it('izvor repair-docx: slot po korisniku, strop ishoda bez potrosnje prije tijela, biljezenje (baseline garda)', () => {
    const src = readFileSync(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'), 'utf8').replace(/\r\n?/g, '\n');
    expect(repairCostGuardProblems(src)).toEqual([]);
  });
});
