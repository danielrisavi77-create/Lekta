import { describe, expect, it } from 'vitest';
import { buildRepairOutcome, type VerifiedCheck } from '../src/repair/repair-outcome-verified';

/** T10: "zahvat izvrsen" nije "problem rijesen". Identifikatori su lokalni testni, ne produkcijski. */
const c = (id: string, status: VerifiedCheck['status']): VerifiedCheck => ({ id, status });

describe('buildRepairOutcome', () => {
  it('rijeseno je samo fail -> pass medju odabranima; nerijeseno ostaje imenovano', () => {
    const outcome = buildRepairOutcome({
      selectedCheckIds: ['target-spacing', 'target-heading'],
      before: [c('target-spacing', 'fail'), c('target-heading', 'fail'), c('margins', 'pass')],
      after: [c('target-spacing', 'pass'), c('target-heading', 'fail'), c('margins', 'pass')],
      skippedCheckIds: [],
      integrity: 'passed',
    });
    expect(outcome.resolvedIds).toContain('target-spacing');
    expect(outcome.unresolvedIds).toContain('target-heading');
    expect(outcome.regressedIds).toEqual([]);
    expect(outcome.integrity).toBe('passed');
    expect(outcome.recommendRepairedCopy).toBe(true);
  });

  it('neizmjereno ili nestalo NIJE rijeseno', () => {
    const outcome = buildRepairOutcome({
      selectedCheckIds: ['a', 'b'],
      before: [c('a', 'fail'), c('b', 'fail')],
      after: [c('a', 'unmeasurable')],
      skippedCheckIds: [],
      integrity: 'passed',
    });
    expect(outcome.resolvedIds).toEqual([]);
    expect(outcome.unresolvedIds).toEqual(['a', 'b']);
  });

  it('regresija obuhvaca i provjere IZVAN odabranog skupa i ukida preporuku popravljene kopije', () => {
    const outcome = buildRepairOutcome({
      selectedCheckIds: ['a'],
      before: [c('a', 'fail'), c('toc', 'pass')],
      after: [c('a', 'pass'), c('toc', 'fail')],
      skippedCheckIds: [],
      integrity: 'passed',
    });
    expect(outcome.resolvedIds).toEqual(['a']);
    expect(outcome.regressedIds).toEqual(['toc']);
    expect(outcome.recommendRepairedCopy).toBe(false);
  });

  it('preskoceno je odvojeno od nerijesenog, a integritet ne mijesa brojeve', () => {
    const outcome = buildRepairOutcome({
      selectedCheckIds: ['a', 'b'],
      before: [c('a', 'fail'), c('b', 'fail')],
      after: [c('a', 'pass'), c('b', 'fail')],
      skippedCheckIds: ['b'],
      integrity: 'failed',
    });
    expect(outcome.skippedIds).toEqual(['b']);
    expect(outcome.unresolvedIds).toEqual([]);
    expect(outcome.resolvedIds).toEqual(['a']);
    expect(outcome.integrity).toBe('failed');
    expect(outcome.recommendRepairedCopy).toBe(false);
    expect(buildRepairOutcome({ selectedCheckIds: [], before: [], after: [], skippedCheckIds: [], integrity: 'not-verified' }).recommendRepairedCopy).toBe(false);
  });

  it('porast ocjene sam po sebi nista ne dokazuje: bez pass poslije nema rijesenog', () => {
    // Prije 2 faila, poslije 1 fail i 1 neizmjereno: "ocjena" bi porasla, rijeseno je nula.
    const outcome = buildRepairOutcome({
      selectedCheckIds: ['a', 'b'],
      before: [c('a', 'fail'), c('b', 'fail')],
      after: [c('a', 'unmeasurable'), c('b', 'fail')],
      skippedCheckIds: [],
      integrity: 'passed',
    });
    expect(outcome.resolvedIds).toEqual([]);
  });
});
