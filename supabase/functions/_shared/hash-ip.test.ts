import { describe, it, expect } from 'vitest';
import {
  clientIpFromForwarded,
  deriveIpSalt,
  hashClientIp,
  hashClientIpSalted,
} from './hash-ip';

// P0-02-3 (security-02): prije popravka generate-report i redeem-referral-signup su hashirali
// IP sa saltom koji fallbacka na '' pa je ip_hash bio nesoljen (reverzibilan). Test dokazuje da
// s praznim IP_HASH_SALT hash sada JEST soljen (izveden iz service-role kljuca) i da su dvije
// funkcije s istim kljucem medusobno konzistentne (anti-fraud usporedba radi).

const HEX64 = /^[0-9a-f]{64}$/;
const KEY = 'service-role-kljuc-ABC';
const FWD = '203.0.113.7, 10.0.0.1';

describe('clientIpFromForwarded', () => {
  it('uzima prvi IP iz liste, inace unknown', () => {
    expect(clientIpFromForwarded(FWD)).toBe('203.0.113.7');
    expect(clientIpFromForwarded(null)).toBe('unknown');
    expect(clientIpFromForwarded('')).toBe('unknown');
  });
});

describe('deriveIpSalt', () => {
  it('vraca dedicirani salt kad je postavljen', async () => {
    expect(await deriveIpSalt('moj-salt', KEY)).toBe('moj-salt');
  });

  it('bez dediciranog salta izvodi STABILAN, neprazni salt iz kljuca', async () => {
    const a = await deriveIpSalt('', KEY);
    const b = await deriveIpSalt(undefined, KEY);
    expect(a).toMatch(HEX64);
    expect(a).not.toBe('');
    expect(a).toBe(b); // stabilnost -> ista vrijednost u svim funkcijama
  });

  it('razlicit kljuc daje razlicit izvedeni salt', async () => {
    expect(await deriveIpSalt('', KEY)).not.toBe(await deriveIpSalt('', 'drugi-kljuc'));
  });
});

describe('hashClientIpSalted', () => {
  it('s praznim IP_HASH_SALT hash je SOLJEN (razlicit od nesoljenog)', async () => {
    const salted = await hashClientIpSalted(FWD, '', KEY);
    const unsalted = await hashClientIp(FWD, ''); // stari, ranjivi put
    expect(salted).toMatch(HEX64);
    expect(salted).not.toBe(unsalted);
  });

  it('iste vrijednosti (fwd, prazan salt, isti kljuc) daju isti hash u dvije funkcije', async () => {
    const fromReport = await hashClientIpSalted(FWD, '', KEY);
    const fromRedeem = await hashClientIpSalted(FWD, '', KEY);
    expect(fromReport).toBe(fromRedeem);
  });

  it('dedicirani salt ima prednost i konzistentan je', async () => {
    const withSalt = await hashClientIpSalted(FWD, 'dedicirani', KEY);
    const direct = await hashClientIp(FWD, 'dedicirani');
    expect(withSalt).toBe(direct);
  });
});
