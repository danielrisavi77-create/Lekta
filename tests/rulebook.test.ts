import { describe, it, expect } from 'vitest';

import {
  slotProductForWorkType,
  canGrantRulebookReward,
  rulebookRewardEntitlement,
} from '../src/report/rulebook';

const ok = {
  status: 'verified',
  rewardAlreadyGranted: false,
  userHasPriorRulebookReward: false,
  workType: 'diplomski',
};

describe('slotProductForWorkType', () => {
  it('mapira naplatne tipove', () => {
    expect(slotProductForWorkType('diplomski')).toBe('slot_diplomski');
    expect(slotProductForWorkType('seminarski')).toBe('slot_seminarski');
  });
  it('nevaljan/prazan tip -> null', () => {
    expect(slotProductForWorkType('magistarski')).toBeNull();
    expect(slotProductForWorkType(null)).toBeNull();
    expect(slotProductForWorkType('')).toBeNull();
  });
});

describe('canGrantRulebookReward (kriterij 14.8)', () => {
  it('verified + prvi put -> ok s productId', () => {
    expect(canGrantRulebookReward(ok)).toEqual({ ok: true, productId: 'slot_diplomski' });
  });
  it('status != verified (pending/duplicate/rejected) -> bez nagrade', () => {
    for (const status of ['pending', 'duplicate', 'rejected']) {
      expect(canGrantRulebookReward({ ...ok, status })).toEqual({ ok: false, reason: 'not_verified' });
    }
  });
  it('vec dodijeljeno za tu prijavu -> already_granted', () => {
    expect(canGrantRulebookReward({ ...ok, rewardAlreadyGranted: true })).toEqual({
      ok: false,
      reason: 'already_granted',
    });
  });
  it('druga nagrada istom korisniku -> user_cap', () => {
    expect(canGrantRulebookReward({ ...ok, userHasPriorRulebookReward: true })).toEqual({
      ok: false,
      reason: 'user_cap',
    });
  });
  it('nevaljan work_type -> invalid_work_type', () => {
    expect(canGrantRulebookReward({ ...ok, workType: null })).toEqual({
      ok: false,
      reason: 'invalid_work_type',
    });
  });
});

describe('rulebookRewardEntitlement', () => {
  it('interni entitlement, order_id prefiks reward:rulebook:', () => {
    expect(rulebookRewardEntitlement('sub-9', 'diplomski')).toEqual({
      provider: 'internal',
      orderId: 'reward:rulebook:sub-9',
      productId: 'slot_diplomski',
      workType: 'diplomski',
      slotsTotal: 1,
    });
  });
});
