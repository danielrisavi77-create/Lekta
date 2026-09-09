/**
 * Ratchet nad punim grafom `npm audit` (vanjski audit 2026-09-08, nalaz 6).
 *
 * Do 2026-09-09 broj high/critical nalaza u punom grafu samo se ISPISIVAO u koraku s
 * `continue-on-error`, pa je rast bio nevidljiv: komentar u workflowu tvrdio je 21, izmjereno 23.
 * Ovdje se dokazuje da jezgra (1) broji tocno one severity razrede koje tvrdi, (2) porast iznad
 * stropa proglasava padom, (3) pad ispod stropa proglasava pozivom da se strop spusti, i (4) da je
 * commitani strop broj koji odgovara zapisu (inace ratchet nista ne drzi).
 */
import { describe, it, expect } from 'vitest';
import { countHighCritical, compareToRatchet, formatVerdict } from '../scripts/npm-audit-ratchet-core.mjs';
import ratchet from '../data/security/npm-audit-ratchet.json';

const fixture = {
  vulnerabilities: {
    a: { severity: 'critical' },
    b: { severity: 'high' },
    c: { severity: 'moderate' },
    d: { severity: 'low' },
    e: { severity: 'info' },
  },
};

describe('npm audit ratchet: jezgra', () => {
  it('broji SAMO high i critical', () => {
    expect(countHighCritical(fixture)).toBe(2);
  });

  it('prazan ili nepostojeci graf daje 0, ne baca', () => {
    expect(countHighCritical({ vulnerabilities: {} })).toBe(0);
    expect(countHighCritical({})).toBe(0);
    expect(countHighCritical(null)).toBe(0);
  });

  it('jednako stropu je equal (baseline)', () => {
    expect(compareToRatchet(23, { fullGraphHighCritical: 23 }).verdict).toBe('equal');
  });

  it('iznad stropa je above (mutacija: porast mora biti vidljiv)', () => {
    const s = compareToRatchet(24, { fullGraphHighCritical: 23 });
    expect(s.verdict).toBe('above');
    expect(s.delta).toBe(1);
    expect(formatVerdict(s)).toMatch(/^FAIL/);
  });

  it('ispod stropa je below i poziva na spustanje stropa, ne tihi prolaz', () => {
    const s = compareToRatchet(22, { fullGraphHighCritical: 23 });
    expect(s.verdict).toBe('below');
    expect(formatVerdict(s)).toMatch(/Spusti fullGraphHighCritical/);
  });

  it('strop koji nije broj ne moze biti prolaz', () => {
    expect(compareToRatchet(0, { fullGraphHighCritical: 'puno' as unknown as number }).verdict).toBe('above');
    expect(compareToRatchet(0, {} as { fullGraphHighCritical: number }).verdict).toBe('above');
  });
});

describe('npm audit ratchet: commitani zapis', () => {
  it('strop je konacan nenegativan cijeli broj s datumom i obrazlozenjem', () => {
    expect(Number.isInteger(ratchet.fullGraphHighCritical)).toBe(true);
    expect(ratchet.fullGraphHighCritical).toBeGreaterThanOrEqual(0);
    expect(ratchet.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ratchet.changeNote.length).toBeGreaterThan(40);
  });

  it('prethodno mjerenje je zapisano da se promjena ne moze procitati kao tiha', () => {
    expect(ratchet.priorMeasurement.fullGraphHighCritical).toBe(21);
    expect(ratchet.priorMeasurement.measuredAt).toBe('2026-08-24');
  });
});
