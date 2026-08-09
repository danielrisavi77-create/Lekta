/**
 * POKRIVENOST VERIFIKACIJE: koliko je od ocjene stvarno IZMJERENO.
 *
 * Kad Word ne zapise font/velicinu/prored/margine, provjera ne smije tvrditi da je prosla.
 * Takav je ishod `unknown`, bez bodova, ali uz vidljivu informacijsku pokrivenost.
 *
 * Ovi testovi cuvaju da razlika ostane vidljiva i da se unknown ne boduje.
 */
import { describe, it, expect } from 'vitest';
import { makeCheck, markAssumedEvidence, scoreTotals, verificationCoverage, type Check } from '../src/scoring/checks';

const scored = (title: string, earned: number, max: number): Check =>
  makeCheck('formatting', title, 'pass', earned, max, '');

describe('evidence na Check', () => {
  it('bodovana provjera je po defaultu izmjerena', () => {
    expect(scored('Dominantni font', 8, 8).evidence).toBe('measured');
  });

  it('nebodovana (max 0) je not-applicable i ne ulazi u pokrivenost', () => {
    expect(makeCheck('formatting', 'Dominantni font', 'pass', 0, 0, '')).toMatchObject({
      status: 'info',
      evidence: 'not-applicable',
      measurementStatus: 'not-applicable',
      scored: false,
    });
  });

  it('markAssumedEvidence oznacava po STABILNOM id-u, ne po naslovu', () => {
    const checks = [scored('Dominantni font', 8, 8), scored('Prored osnovnog teksta', 6, 6)];
    markAssumedEvidence(checks, { 'format.font.dominant': true, 'format.spacing.body': false });
    expect(checks[0].evidence).toBe('assumed');
    expect(checks[0]).toMatchObject({ status: 'unknown', measurementStatus: 'unavailable', earned: 0, scored: false });
    expect(checks[1].evidence).toBe('measured');
  });

  it('ne dira nebodovane provjere (nemaju sto pretpostaviti)', () => {
    const checks = [makeCheck('formatting', 'Dominantni font', 'pass', 0, 0, '')];
    markAssumedEvidence(checks, { 'format.font.dominant': true });
    expect(checks[0].evidence).toBe('not-applicable');
  });
});

describe('verificationCoverage', () => {
  it('sve izmjereno daje 100% i nijednu nepotvrdjenu stavku', () => {
    const checks = [scored('Dominantni font', 8, 8), scored('Margine dokumenta', 6, 6)];
    expect(verificationCoverage(checks)).toEqual({ percent: 100, assumed: 0 });
  });

  it('nedostupna vrijednost snizava pokrivenost i izostaje iz ocjene', () => {
    const checks = [scored('Dominantni font', 8, 8), scored('Margine dokumenta', 6, 6)];
    markAssumedEvidence(checks, { 'format.font.dominant': true });

    expect(scoreTotals(checks)).toEqual({ earned: 6, max: 6, score: 100 });
    expect(verificationCoverage(checks)).toEqual({ percent: 43, assumed: 1 });
  });

  it('dokument u kojem se nista ne da ocitati nema score uz 0% pokrivenosti', () => {
    const checks = [scored('Dominantni font', 8, 8), scored('Prored osnovnog teksta', 6, 6)];
    markAssumedEvidence(checks, { 'format.font.dominant': true, 'format.spacing.body': true });
    expect(verificationCoverage(checks)).toEqual({ percent: 0, assumed: 2 });
    expect(scoreTotals(checks)).toEqual({ earned: 0, max: 0, score: null });
  });

  it('bez bodovanih provjera nema ni pokrivenosti (kao ni ocjene)', () => {
    expect(verificationCoverage([makeCheck('formatting', 'Dominantni font', 'pass', 0, 0, '')])).toBeNull();
    expect(verificationCoverage([])).toBeNull();
  });
});
