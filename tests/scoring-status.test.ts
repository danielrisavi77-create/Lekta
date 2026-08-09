import { describe, expect, it } from 'vitest';
import { isScoreEligible, makeCheck, markAssumedEvidence, scoreMeta, scoreTotals } from '../src/scoring/checks';

describe('status mjerenja i bodovanje', () => {
  it('unknown provjera nije podobna za score', () => {
    const check = makeCheck('formatting', 'Dominantni font', 'pass', 8, 8, '');

    markAssumedEvidence([check], { 'format.font.dominant': true });

    expect(isScoreEligible(check)).toBe(false);
    expect(check).toMatchObject({
      status: 'unknown',
      measurementStatus: 'unavailable',
      earned: 0,
      scored: false,
    });
  });

  it('scoreTotals izostavlja nedostupne provjere iz nazivnika', () => {
    const measured = makeCheck('formatting', 'Margine dokumenta', 'pass', 6, 6, '');
    const unavailable = makeCheck('formatting', 'Dominantni font', 'pass', 8, 8, '');
    markAssumedEvidence([unavailable], { 'format.font.dominant': true });

    expect(scoreTotals([measured, unavailable])).toEqual({ earned: 6, max: 6, score: 100 });
  });

  it('informativna provjera nije pass', () => {
    const check = makeCheck('structure', 'Prazni odlomci', 'pass', 0, 0, '');

    expect(check).toMatchObject({ status: 'info', measurementStatus: 'not-applicable', scored: false });
    expect(isScoreEligible(check)).toBe(false);
  });

  it('scoreMeta za null jasno navodi da ocjena nije dostupna', () => {
    expect(scoreMeta(null)).toEqual({
      label: 'Ocjena nije dostupna',
      color: 'var(--muted)',
      text: 'Nema dovoljno dostupnih mjerenja za izračun bodovne ocjene.',
    });
  });
});
