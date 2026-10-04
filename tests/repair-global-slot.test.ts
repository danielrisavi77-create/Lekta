/**
 * T84 RD-3: slot popravka s limitom po korisniku (global-slot.ts) i RD-2 strop ishoda bez potrosnje.
 * Mjeri se izvrseni modul nad laznom bazom (rpc odgovori), plus gard izvora index.ts.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acquireRepairSlot } from '../supabase/functions/repair-docx/global-slot';
import { fakeAdmin, type FakeCall, type FakeResult } from './helpers/fake-supabase';
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

  it('bez migracije 0209 pada na stari globalni RPC, ne na per-instance gate', async () => {
    const { admin, calls } = db({
      'rpc:try_acquire_repair_slot_for_user': { error: { message: 'function not found', code: 'PGRST202' } },
      'rpc:try_acquire_repair_slot': { data: 'g-1' },
    });
    const slot = await acquireRepairSlot(admin, LIMITS);
    expect(slot.kind).toBe('ok');
    expect(calls.map((c) => c.table)).toEqual(['rpc:try_acquire_repair_slot_for_user', 'rpc:try_acquire_repair_slot']);
  });

  it('oba RPC-a pala: absent (per-instance gate), stari pun: full', async () => {
    const absent = await acquireRepairSlot(db({
      'rpc:try_acquire_repair_slot_for_user': { error: { message: 'x' } },
      'rpc:try_acquire_repair_slot': { error: { message: 'y' } },
    }).admin, LIMITS);
    expect(absent.kind).toBe('absent');
    const full = await acquireRepairSlot(db({
      'rpc:try_acquire_repair_slot_for_user': { error: { message: 'x' } },
      'rpc:try_acquire_repair_slot': { data: null },
    }).admin, LIMITS);
    expect(full.kind).toBe('full');
  });

  it('izvor repair-docx: slot po korisniku, strop ishoda bez potrosnje prije tijela, biljezenje (baseline garda)', () => {
    const src = readFileSync(resolve(process.cwd(), 'supabase', 'functions', 'repair-docx', 'index.ts'), 'utf8').replace(/\r\n?/g, '\n');
    expect(repairCostGuardProblems(src)).toEqual([]);
  });
});
