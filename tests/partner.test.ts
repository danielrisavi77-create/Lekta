import { describe, it, expect } from 'vitest';

import { isPartnerActive, resolveDailyCap } from '../src/report/partner';

describe('isPartnerActive', () => {
  it('samo status=active je aktivan', () => {
    expect(isPartnerActive({ status: 'active', dailyCap: 100 })).toBe(true);
    expect(isPartnerActive({ status: 'pending', dailyCap: 100 })).toBe(false);
    expect(isPartnerActive({ status: 'suspended', dailyCap: 100 })).toBe(false);
    expect(isPartnerActive(null)).toBe(false);
    expect(isPartnerActive(undefined)).toBe(false);
  });
});

describe('resolveDailyCap (kriterij 14.5)', () => {
  it('aktivan partner dobiva svoj daily_cap', () => {
    expect(resolveDailyCap({ status: 'active', dailyCap: 100 }, 30)).toBe(100);
  });
  it('neaktivan partner pada na retail default', () => {
    expect(resolveDailyCap({ status: 'pending', dailyCap: 100 }, 30)).toBe(30);
    expect(resolveDailyCap({ status: 'suspended', dailyCap: 100 }, 30)).toBe(30);
  });
  it('bez partner racuna -> retail default', () => {
    expect(resolveDailyCap(null, 30)).toBe(30);
  });
  it('postuje partnerov specificni cap', () => {
    expect(resolveDailyCap({ status: 'active', dailyCap: 250 }, 30)).toBe(250);
  });
});
