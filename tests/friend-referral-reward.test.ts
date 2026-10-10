// @vitest-environment node
/**
 * T84 RF-1: nagrada prijatelju iz preporuke (interni entitlement = placeni slot) ne smije pripasti
 * anonimnom Auth racunu. Anonimni racun nastaje bez e-maila i captche, pa bi svaki novi anonimni racun s
 * istim kodom dobio slot. Isto pravilo vec vrijedi za nagradu preporucitelju (ineligible_buyer).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { friendRewardCaller, tryGrantFriendReferralReward } from '../supabase/functions/_shared/grant-friend-referral-reward';
import { argOf, eqs, fakeAdmin, writeOp, type FakeCall } from './helpers/fake-supabase';
import { friendRewardAnonGuardProblems } from './helpers/friend-referral-guard';

const read = (...p: string[]) => readFileSync(resolve(process.cwd(), ...p), 'utf8').replace(/\r\n?/g, '\n');

function db() {
  return fakeAdmin((c: FakeCall) => {
    if (c.table === 'referral_signups' && writeOp(c) === 'select') return { data: { id: 'signup-1' } };
    if (c.table === 'entitlements' && writeOp(c) === 'insert') return { data: { id: 'ent-1' } };
    return undefined;
  });
}

describe('T84 RF-1: nagrada prijatelju', () => {
  it('anonimni racun ne dobiva slot i baza se ne dira', async () => {
    const { admin, calls } = db();
    const r = await tryGrantFriendReferralReward(admin as never, 'anon-user', 'doktorski', { isAnonymous: true });
    expect(r).toEqual({ granted: false, reason: 'ineligible_anonymous' });
    expect(calls).toEqual([]);
  });

  it('nepoznat status (undefined) je fail-closed', async () => {
    const { admin, calls } = db();
    const r = await tryGrantFriendReferralReward(admin as never, 'u', 'diplomski', { isAnonymous: undefined as unknown as boolean });
    expect(r.granted).toBe(false);
    expect(calls).toEqual([]);
  });

  it('pozivatelj: samo izricit is_anonymous=false je pravi racun; undefined i null su anonimni (RF-1A)', async () => {
    expect(friendRewardCaller({ is_anonymous: false })).toEqual({ isAnonymous: false });
    expect(friendRewardCaller({ is_anonymous: true })).toEqual({ isAnonymous: true });
    expect(friendRewardCaller({})).toEqual({ isAnonymous: true });
    expect(friendRewardCaller({ is_anonymous: null })).toEqual({ isAnonymous: true });
    for (const user of [{}, { is_anonymous: null }]) {
      const { admin, calls } = db();
      const r = await tryGrantFriendReferralReward(admin as never, 'u', 'diplomski', friendRewardCaller(user));
      expect(r.granted).toBe(false);
      expect(calls).toEqual([]);
    }
  });

  it('pravi racun dobiva tocno jedan slot s ispravnim sadrzajem, a drugi prolaz ne dodjeljuje novi (RF-1B)', async () => {
    let status = 'signed_up';
    const { admin, calls } = fakeAdmin((c: FakeCall) => {
      if (c.table === 'referral_signups' && writeOp(c) === 'select') {
        return { data: eqs(c).status === status ? { id: 'signup-1' } : null };
      }
      if (c.table === 'referral_signups' && writeOp(c) === 'update') {
        status = String((argOf(c, 'update') as { status: string }).status);
        return undefined;
      }
      if (c.table === 'entitlements' && writeOp(c) === 'insert') return { data: { id: 'ent-1' } };
      return undefined;
    });
    const first = await tryGrantFriendReferralReward(admin as never, 'real-user', 'diplomski', friendRewardCaller({ is_anonymous: false }));
    expect(first).toEqual({ granted: true });
    const inserts = calls.filter((c) => c.table === 'entitlements' && writeOp(c) === 'insert');
    expect(inserts).toHaveLength(1);
    expect(argOf(inserts[0], 'insert')).toMatchObject({
      user_id: 'real-user', work_type: 'diplomski', slots_total: 1, product_id: 'slot_diplomski',
      order_id: 'reward:ref-friend:signup-1', provider: 'internal',
    });
    const update = calls.find((c) => c.table === 'referral_signups' && writeOp(c) === 'update');
    expect(argOf(update!, 'update')).toMatchObject({ status: 'friend_rewarded', friend_reward_entitlement_id: 'ent-1' });
    expect(eqs(update!)).toEqual({ id: 'signup-1' });

    const second = await tryGrantFriendReferralReward(admin as never, 'real-user', 'diplomski', friendRewardCaller({ is_anonymous: false }));
    expect(second).toEqual({ granted: false });
    expect(calls.filter((c) => c.table === 'entitlements' && writeOp(c) === 'insert')).toHaveLength(1);
  });

  it('izvor: helper ima rani izlaz, a generate-report prosljeduje user.is_anonymous (baseline garda)', () => {
    expect(friendRewardAnonGuardProblems(
      read('supabase', 'functions', '_shared', 'grant-friend-referral-reward.ts'),
      read('supabase', 'functions', 'generate-report', 'index.ts'),
    )).toEqual([]);
  });
});
