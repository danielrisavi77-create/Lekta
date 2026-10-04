/**
 * T84 RF-1: nagrada prijatelju iz preporuke (interni entitlement = placeni slot) ne smije pripasti
 * anonimnom Auth racunu. Anonimni racun nastaje bez e-maila i captche, pa bi svaki novi anonimni racun s
 * istim kodom dobio slot. Isto pravilo vec vrijedi za nagradu preporucitelju (ineligible_buyer).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tryGrantFriendReferralReward } from '../supabase/functions/_shared/grant-friend-referral-reward';
import { fakeAdmin, writeOp, type FakeCall } from './helpers/fake-supabase';
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

  it('pravi racun sa signupom dobiva jedan slot (kontrola da gard ne gasi tok)', async () => {
    const { admin, calls } = db();
    const r = await tryGrantFriendReferralReward(admin as never, 'real-user', 'diplomski', { isAnonymous: false });
    expect(r).toEqual({ granted: true });
    const insert = calls.find((c) => c.table === 'entitlements' && writeOp(c) === 'insert');
    expect(insert).toBeDefined();
  });

  it('izvor: helper ima rani izlaz, a generate-report prosljeduje user.is_anonymous (baseline garda)', () => {
    expect(friendRewardAnonGuardProblems(
      read('supabase', 'functions', '_shared', 'grant-friend-referral-reward.ts'),
      read('supabase', 'functions', 'generate-report', 'index.ts'),
    )).toEqual([]);
  });
});
