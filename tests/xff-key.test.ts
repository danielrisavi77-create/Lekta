/**
 * T84 XFF: baseline garda izvora (zadnji unos x-forwarded-for, svi pozivatelji kroz hashClientIpSalted).
 * Ponasanje pomocnika je u supabase/functions/_shared/hash-ip.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { xffKeyProblems, xffRealSources } from './helpers/xff-key-guard';

describe('T84 XFF: IP kljuc iz zadnjeg unosa', () => {
  it('stvarni izvor: hash-ip uzima zadnji unos, nijedna funkcija ne cita x-forwarded-for mimo pomocnika', () => {
    const { hashIp, functions } = xffRealSources();
    expect(functions.some((f) => f.path.endsWith('faculty-request/index.ts'))).toBe(true);
    expect(functions.filter((f) => f.text.includes("'x-forwarded-for'")).length).toBeGreaterThanOrEqual(9);
    expect(xffKeyProblems(hashIp, functions)).toEqual([]);
  });
});
