import { describe, it, expect } from 'vitest';

import {
  validateReferral,
  referralRewardEntitlement,
  rewardIsPullable,
  semesterStart,
  REFERRAL_SEMESTER_CAP,
} from '../src/report/referral';

const base = {
  referrerUserId: 'ref-1',
  referredUserId: 'new-1',
  referredHasPriorEntitlement: false,
  referrerCreditsThisSemester: 0,
};

describe('validateReferral (kriterij 14.7)', () => {
  it('valjan referral -> ok', () => {
    expect(validateReferral(base)).toEqual({ ok: true });
  });
  it('nepoznat kod (referrer null) -> unknown_code', () => {
    expect(validateReferral({ ...base, referrerUserId: null })).toEqual({ ok: false, reason: 'unknown_code' });
  });
  it('self-referral -> odbijen', () => {
    expect(validateReferral({ ...base, referredUserId: 'ref-1' })).toEqual({ ok: false, reason: 'self_referral' });
  });
  it('korisnik s prethodnim entitlementom -> not_first_purchase', () => {
    expect(validateReferral({ ...base, referredHasPriorEntitlement: true })).toEqual({
      ok: false,
      reason: 'not_first_purchase',
    });
  });
  it('6. kredit u semestru -> cap_reached', () => {
    expect(validateReferral({ ...base, referrerCreditsThisSemester: REFERRAL_SEMESTER_CAP })).toEqual({
      ok: false,
      reason: 'cap_reached',
    });
    // 5. kredit (index 4) jos prolazi
    expect(validateReferral({ ...base, referrerCreditsThisSemester: REFERRAL_SEMESTER_CAP - 1 }).ok).toBe(true);
  });
});

describe('referralRewardEntitlement', () => {
  it('interni entitlement, 1 seminarski slot, order_id prefiks reward:referral:', () => {
    expect(referralRewardEntitlement('abc')).toEqual({
      provider: 'internal',
      orderId: 'reward:referral:abc',
      productId: 'slot_seminarski',
      workType: 'seminarski',
      slotsTotal: 1,
    });
  });
});

describe('rewardIsPullable', () => {
  it('nepotrosena nagrada se povlaci; potrosena ne', () => {
    expect(rewardIsPullable(0)).toBe(true);
    expect(rewardIsPullable(1)).toBe(false);
  });
});

describe('semesterStart', () => {
  it('studeni -> 1.10. iste godine', () => {
    expect(semesterStart(Date.UTC(2026, 10, 15))).toBe(new Date(Date.UTC(2026, 9, 1)).toISOString());
  });
  it('sijecanj -> 1.10. prethodne godine', () => {
    expect(semesterStart(Date.UTC(2026, 0, 20))).toBe(new Date(Date.UTC(2025, 9, 1)).toISOString());
  });
  it('svibanj -> 1.3. iste godine', () => {
    expect(semesterStart(Date.UTC(2026, 4, 10))).toBe(new Date(Date.UTC(2026, 2, 1)).toISOString());
  });
});
