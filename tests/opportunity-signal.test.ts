import { describe, expect, it } from 'vitest';
import { opportunitySignalForEvent } from '../src/analytics/opportunity-signal';

describe('opportunitySignalForEvent', () => {
  it('izvodi samo agregirane brojace bez teksta rada', () => {
    const out = opportunitySignalForEvent({
      checks: [{ status: 'pass' }, { status: 'unmeasurable' }, { status: 'unmeasurable' }],
      details: {
        profileDefinitionId: 'fpzg-diplomski',
        triage: { counts: { auto: 4, assisted: 2, manual: 3, total: 9 } },
      },
      settings: { workType: 'diplomski' },
    }, 'verified');

    expect(out).toEqual({
      profileId: 'fpzg-diplomski',
      profileStatus: 'verified',
      workType: 'diplomski',
      auto: 4,
      assisted: 2,
      manual: 3,
      unknown: 2,
      total: 9,
      kind: 'manual',
    });
    expect(JSON.stringify(out)).not.toContain('tekst');
  });

  it('nevalidne brojace svodi na nulu i ne baca na djelomicnom rezultatu', () => {
    expect(opportunitySignalForEvent({
      checks: null,
      details: { triage: { counts: { auto: -1, assisted: 'x', manual: null, total: undefined } } },
    }, '')).toMatchObject({
      profileId: '',
      profileStatus: 'generic',
      workType: '',
      auto: 0,
      assisted: 0,
      manual: 0,
      unknown: 0,
      total: 0,
      kind: 'clear',
    });
  });

  it('unknown ima prednost pred assisted kad nema manual nalaza', () => {
    expect(opportunitySignalForEvent({
      checks: [{ status: 'unmeasurable' }],
      details: { triage: { counts: { auto: 2, assisted: 1, manual: 0, total: 3 } } },
    }, 'partial').kind).toBe('unknown');
  });
});
