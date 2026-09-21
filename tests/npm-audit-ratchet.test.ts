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
import {
  compareAuditToRatchet,
  countHighCritical,
  formatVerdict,
  highCriticalPackageNames,
  parseAuditResponse,
  validateRatchet,
} from '../scripts/npm-audit-ratchet-core.mjs';
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
    expect(highCriticalPackageNames(fixture)).toEqual(['a', 'b']);
  });

  it('valjan prazan vulnerabilities objekt broji 0', () => {
    expect(countHighCritical({ vulnerabilities: {} })).toBe(0);
    expect(parseAuditResponse({ vulnerabilities: {} })).toEqual({ vulnerabilities: {} });
  });

  it('nevaljan audit odgovor (error / bez vulnerabilities) baca, ne postaje nula', () => {
    expect(() => parseAuditResponse({ error: { code: 'ENOTFOUND' } })).toThrow(/ENOTFOUND|greska/i);
    expect(() => parseAuditResponse({})).toThrow(/vulnerabilities/);
    expect(() => parseAuditResponse({ vulnerabilities: null })).toThrow(/vulnerabilities/);
    expect(() => parseAuditResponse('{"error":{"code":"EAI_AGAIN"}}')).toThrow(/EAI_AGAIN|greska/i);
  });

  it('jednako stropu je equal (baseline)', () => {
    expect(compareAuditToRatchet(fixture, {
      fullGraphHighCritical: 2,
      fullGraphHighCriticalPackages: ['a', 'b'],
    }).verdict).toBe('equal');
  });

  it('novi identitet pada i kad ukupan broj ostane isti', () => {
    const s = compareAuditToRatchet({
      vulnerabilities: {
        a: { severity: 'critical' },
        novi: { severity: 'high' },
      },
    }, {
      fullGraphHighCritical: 2,
      fullGraphHighCriticalPackages: ['a', 'b'],
    });
    expect(s.verdict).toBe('above');
    expect(s.unexpectedPackages).toEqual(['novi']);
    expect(s.resolvedPackages).toEqual(['b']);
    expect(formatVerdict(s)).toMatch(/^FAIL/);
    expect(formatVerdict(s)).toContain('novi');
  });

  it('ispod stropa je below i poziva na spustanje stropa, ne tihi prolaz', () => {
    const s = compareAuditToRatchet({ vulnerabilities: { a: { severity: 'high' } } }, {
      fullGraphHighCritical: 2,
      fullGraphHighCriticalPackages: ['a', 'b'],
    });
    expect(s.verdict).toBe('below');
    expect(formatVerdict(s)).toMatch(/Spusti fullGraphHighCritical/);
  });

  it('strop koji nije broj ne moze biti prolaz', () => {
    const empty = { vulnerabilities: {} };
    expect(compareAuditToRatchet(empty, { fullGraphHighCritical: 'puno' as unknown as number }).verdict).toBe('above');
    expect(compareAuditToRatchet(empty, {} as { fullGraphHighCritical: number }).verdict).toBe('above');
  });

  it('odbijanje iznimke bez vlasnika, mitigacije i buduceg roka nije prebaceno na dokumentaciju', () => {
    const invalid = {
      fullGraphHighCritical: 1,
      fullGraphHighCriticalPackages: ['sharp'],
      exceptions: [{
        packages: ['sharp'],
        owner: '',
        mitigation: '',
        expiresOn: '2026-09-20',
        nextReviewOn: '2026-09-19',
      }],
    };
    expect(validateRatchet(invalid, { today: '2026-09-21' })).toEqual(expect.arrayContaining([
      expect.stringMatching(/owner/),
      expect.stringMatching(/mitigation/),
      expect.stringMatching(/istekla/),
      expect.stringMatching(/pregled/),
    ]));
  });
});

describe('npm audit ratchet: commitani zapis', () => {
  it('strop je konacan nenegativan cijeli broj s datumom i obrazlozenjem', () => {
    expect(Number.isInteger(ratchet.fullGraphHighCritical)).toBe(true);
    expect(ratchet.fullGraphHighCritical).toBeGreaterThanOrEqual(0);
    expect(ratchet.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ratchet.changeNote.length).toBeGreaterThan(40);
    expect(ratchet.fullGraphHighCriticalPackages).toHaveLength(ratchet.fullGraphHighCritical);
    expect(validateRatchet(ratchet, { today: '2026-09-21' })).toEqual([]);
  });

  it('prethodno mjerenje je zapisano da se promjena ne moze procitati kao tiha', () => {
    expect(ratchet.priorMeasurement.fullGraphHighCritical).toBe(7);
    expect(ratchet.priorMeasurement.measuredAt).toBe('2026-09-09');
  });
});
