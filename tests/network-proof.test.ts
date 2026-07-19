/**
 * Dokaziva privatnost (src/ui/network-proof.ts): agregacija resource zapisa (total/external) i
 * postena poruka. Nikad hardkodirana nula; ako mjerenje nije pouzdano, poruke nema.
 */
import { describe, it, expect } from 'vitest';
import { summarizeResourceEntries, networkProofMessage } from '../src/ui/network-proof';

const ORIGIN = 'https://lektahr.netlify.app';

describe('summarizeResourceEntries', () => {
  it('same-origin zapisi se broje u total ali ne u external', () => {
    const s = summarizeResourceEntries(
      [{ name: `${ORIGIN}/assets/index-abc.js` }, { name: `${ORIGIN}/assets/worker-def.js` }],
      ORIGIN,
    );
    expect(s.total).toBe(2);
    expect(s.external).toBe(0);
    expect(s.externalHosts).toEqual([]);
  });

  it('cross-origin zapisi se broje u external i skupljaju hostove (bez duplikata)', () => {
    const s = summarizeResourceEntries(
      [
        { name: `${ORIGIN}/assets/app.js` },
        { name: 'https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/analytics' },
        { name: 'https://api.crossref.org/works/10.1000/x' },
        { name: 'https://api.crossref.org/works/10.1000/y' },
      ],
      ORIGIN,
    );
    expect(s.total).toBe(4);
    expect(s.external).toBe(3); // supabase + 2x crossref
    expect(s.externalHosts.sort()).toEqual(['api.crossref.org', 'zrrjttizjyfcxmcpgzml.supabase.co']); // 2 jedinstvena hosta
  });

  it('data:/blob:/prazni URL-ovi se preskacu', () => {
    const s = summarizeResourceEntries([{ name: 'data:image/png;base64,AAA' }, { name: 'blob:abc' }, { name: '' }], ORIGIN);
    expect(s.total).toBe(0);
    expect(s.external).toBe(0);
  });
});

describe('networkProofMessage', () => {
  it('nedostupno mjerenje -> null (komponenta se ne prikazuje, nikad lazna nula)', () => {
    expect(networkProofMessage(null)).toBeNull();
    expect(networkProofMessage({ total: 0, external: 0, externalHosts: [], supported: false })).toBeNull();
  });

  it('nula vanjskih -> safe poruka bez lazi', () => {
    const m = networkProofMessage({ total: 3, external: 0, externalHosts: [], supported: true });
    expect(m).not.toBeNull();
    expect(m!.safe).toBe(true);
    expect(m!.text).toContain('nije poslan');
    expect(m!.hint).toContain('DevTools');
  });

  it('ima vanjskih -> posteno prijavi broj i hostove', () => {
    const m = networkProofMessage({ total: 4, external: 1, externalHosts: ['zrrjttizjyfcxmcpgzml.supabase.co'], supported: true });
    expect(m!.safe).toBe(false);
    expect(m!.text).toContain('1 vanjskih');
    expect(m!.text).toContain('supabase.co');
  });
});
