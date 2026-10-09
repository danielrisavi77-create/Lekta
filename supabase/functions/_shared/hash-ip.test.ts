import { describe, it, expect } from 'vitest';
import {
  clientIpFromHeaders,
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

const h = (values: Record<string, string>) => ({ get: (name: string) => values[name.toLowerCase()] ?? null });
const FWD = h({ 'cf-connecting-ip': '203.0.113.7' });

describe('clientIpFromHeaders (T84 XFF: cf-connecting-ip)', () => {
  it('prihvaca samo IPv4 i IPv6, prazne i krive zaglavlje odbija prije hashiranja', () => {
    expect(clientIpFromHeaders(h({ 'cf-connecting-ip': '198.51.100.9' }))).toBe('198.51.100.9');
    expect(clientIpFromHeaders(h({ 'cf-connecting-ip': ' 2001:db8::1 ' }))).toBe('2001:db8::1');
    for (const invalid of [{}, { 'cf-connecting-ip': '' }, { 'cf-connecting-ip': '   ' },
      { 'cf-connecting-ip': 'a'.repeat(65) }, { 'cf-connecting-ip': 'spoofed-address' },
      { 'cf-connecting-ip': '999.0.0.1' }, { 'cf-connecting-ip': '198.51.100.9, 1.1.1.1' },
      { 'cf-connecting-ip': '1.2.3.04' }, { 'cf-connecting-ip': '2001:db8::zz' }]) {
      expect(() => clientIpFromHeaders(h(invalid))).toThrow('UNTRUSTED_CLIENT_IP');
    }
  });

  it('x-forwarded-for, x-real-ip i true-client-ip se ne citaju (izmjereno: gateway ih prepisuje ili klijent bira)', () => {
    const spoofed = { 'x-forwarded-for': '198.51.100.1, 10.0.0.1', 'x-real-ip': '198.51.100.2', 'true-client-ip': '198.51.100.3' };
    expect(() => clientIpFromHeaders(h(spoofed))).toThrow('UNTRUSTED_CLIENT_IP');
    expect(clientIpFromHeaders(h({ ...spoofed, 'cf-connecting-ip': '203.0.113.50' }))).toBe('203.0.113.50');
  });

  it('izmisljeni headeri ne mijenjaju hash, razlicit cf-connecting-ip ga mijenja', async () => {
    const a = await hashClientIpSalted(h({ 'cf-connecting-ip': '203.0.113.50', 'x-forwarded-for': '1.1.1.1' }), '', KEY);
    const b = await hashClientIpSalted(h({ 'cf-connecting-ip': '203.0.113.50', 'x-forwarded-for': '2.2.2.2, 3.3.3.3' }), '', KEY);
    const c = await hashClientIpSalted(h({ 'cf-connecting-ip': '203.0.113.51' }), '', KEY);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
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
  it('ne hashira zajednicki unknown kljuc ni lazni, ne-IP header', async () => {
    await expect(hashClientIpSalted(h({}), '', KEY)).rejects.toThrow('UNTRUSTED_CLIENT_IP');
    await expect(hashClientIpSalted(h({ 'cf-connecting-ip': 'attacker-supplied-text' }), '', KEY))
      .rejects.toThrow('UNTRUSTED_CLIENT_IP');
  });

});
