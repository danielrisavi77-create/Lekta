import { describe, it, expect } from 'vitest';

import {
  coverageTierForStatus,
  canFileGuaranteeClaim,
  GUARANTEE_WINDOW_DAYS,
} from '../src/report/guarantee';

describe('coverageTierForStatus', () => {
  it('verified=2 (T2/T3), partial=1, ostalo=0', () => {
    expect(coverageTierForStatus('verified')).toBe(2);
    expect(coverageTierForStatus('partial')).toBe(1);
    expect(coverageTierForStatus('research')).toBe(0);
    expect(coverageTierForStatus('generic')).toBe(0);
    expect(coverageTierForStatus(null)).toBe(0);
  });
});

describe('canFileGuaranteeClaim (kriterij 14.9)', () => {
  const now = Date.UTC(2026, 5, 1);
  const day = 24 * 3600 * 1000;
  const base = { coverageTier: 2, boundAtMs: now - 5 * day, nowMs: now, hasEvidence: true, ruleKey: 'DR.SC.-08' };

  it('tier>=2, unutar 30 dana, dokaz i rule_key -> ok', () => {
    expect(canFileGuaranteeClaim(base)).toEqual({ ok: true });
  });
  it('coverage_tier < 2 -> odbijen na ulazu', () => {
    expect(canFileGuaranteeClaim({ ...base, coverageTier: 1 })).toEqual({ ok: false, reason: 'tier_too_low' });
    expect(canFileGuaranteeClaim({ ...base, coverageTier: 0 })).toEqual({ ok: false, reason: 'tier_too_low' });
  });
  it('nakon 30 dana -> window_expired', () => {
    expect(canFileGuaranteeClaim({ ...base, boundAtMs: now - (GUARANTEE_WINDOW_DAYS + 1) * day })).toEqual({
      ok: false,
      reason: 'window_expired',
    });
  });
  it('tocno na granici (30 dana) jos prolazi', () => {
    expect(canFileGuaranteeClaim({ ...base, boundAtMs: now - GUARANTEE_WINDOW_DAYS * day }).ok).toBe(true);
  });
  it('bez dokaza -> missing_evidence', () => {
    expect(canFileGuaranteeClaim({ ...base, hasEvidence: false })).toEqual({ ok: false, reason: 'missing_evidence' });
  });
  it('bez rule_key -> missing_rule_key', () => {
    expect(canFileGuaranteeClaim({ ...base, ruleKey: null })).toEqual({ ok: false, reason: 'missing_rule_key' });
  });
});
