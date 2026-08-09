/**
 * POKRIVENOST VERIFIKACIJE: koliko je od ocjene stvarno IZMJERENO.
 *
 * Analiza je namjerno fail-open: kad Word ne zapise font/velicinu/prored/margine, check dobiva
 * PUNE bodove i status 'pass' (`!dominantFont.value` i srodne grane u analyze-docx). To stiti od
 * laznih optuzbi i OSTAJE, ali znaci da `100/100` moze znaciti "nije bilo sto izmjeriti", a ne
 * "dokazano ispravno". `repairCeiling` to ne vidi jer gleda samo `status !== 'pass'`.
 *
 * Ovi testovi cuvaju da razlika ostane vidljiva i da bodovanje pritom NIJE promijenjeno.
 */
import { describe, it, expect } from 'vitest';
import { makeCheck, markAssumedEvidence, verificationCoverage, type Check } from '../src/scoring/checks';

const scored = (title: string, earned: number, max: number): Check =>
  makeCheck('formatting', title, 'pass', earned, max, '');

describe('evidence na Check', () => {
  it('bodovana provjera je po defaultu izmjerena', () => {
    expect(scored('Dominantni font', 8, 8).evidence).toBe('measured');
  });

  it('nebodovana (max 0) je not-applicable i ne ulazi u pokrivenost', () => {
    expect(makeCheck('formatting', 'Dominantni font', 'pass', 0, 0, '').evidence).toBe('not-applicable');
  });

  it('markAssumedEvidence oznacava po STABILNOM id-u, ne po naslovu', () => {
    const checks = [scored('Dominantni font', 8, 8), scored('Prored osnovnog teksta', 6, 6)];
    markAssumedEvidence(checks, { 'format.font.dominant': true, 'format.spacing.body': false });
    expect(checks[0].evidence).toBe('assumed');
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

  it('nedostupna vrijednost snizava pokrivenost, ali NE ocjenu', () => {
    const checks = [scored('Dominantni font', 8, 8), scored('Margine dokumenta', 6, 6)];
    markAssumedEvidence(checks, { 'format.font.dominant': true });

    // Ovo je cijela poanta: bodovi ostaju puni (fail-open), pokrivenost pada.
    const earned = checks.reduce((s, c) => s + c.earned, 0);
    const max = checks.reduce((s, c) => s + c.max, 0);
    expect(Math.round((earned / max) * 100)).toBe(100);
    expect(verificationCoverage(checks)).toEqual({ percent: 43, assumed: 1 });
  });

  it('dokument u kojem se nista ne da ocitati: 100/100 uz 0% pokrivenosti', () => {
    const checks = [scored('Dominantni font', 8, 8), scored('Prored osnovnog teksta', 6, 6)];
    markAssumedEvidence(checks, { 'format.font.dominant': true, 'format.spacing.body': true });
    expect(verificationCoverage(checks)).toEqual({ percent: 0, assumed: 2 });
  });

  it('bez bodovanih provjera nema ni pokrivenosti (kao ni ocjene)', () => {
    expect(verificationCoverage([makeCheck('formatting', 'Dominantni font', 'pass', 0, 0, '')])).toBeNull();
    expect(verificationCoverage([])).toBeNull();
  });
});
