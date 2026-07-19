/**
 * Pravni tekstovi (src/legal/legal-content.ts) su jedini izvor istine za modal I javne
 * stranice, a TERMS_VERSION se trajno biljezi uz kupnju (checkout_consents). Ovaj test
 * cuva: GDPR minimum u privacy, garancijske kljucne tocke, zabranu em/en crtica i
 * placeholder stringova, te determinizam (modal === stranica po konstrukciji).
 */
import { describe, it, expect } from 'vitest';
import { legalDocuments, TERMS_VERSION, type LegalDocKind } from '../src/legal/legal-content';

const KINDS: LegalDocKind[] = ['privacy', 'terms', 'disclaimer', 'purchase', 'processing', 'cookies', 'guarantee'];

describe('legal-content', () => {
  const docs = legalDocuments();

  it('svih 7 dokumenata postoji s naslovom, slugom, opisom i verzijom', () => {
    for (const kind of KINDS) {
      const d = docs[kind];
      expect(d.title.length, kind).toBeGreaterThan(3);
      expect(d.slug, kind).toMatch(/^[a-z-]+$/);
      expect(d.description.length, kind).toBeGreaterThan(20);
      expect(d.html, kind).toContain(TERMS_VERSION);
    }
  });

  it('nema em/en crtica ni placeholder oznaka ni u jednom dokumentu', () => {
    for (const kind of KINDS) {
      const d = docs[kind];
      const text = d.title + d.description + d.html;
      expect(text.includes('—'), `${kind}: em crtica`).toBe(false);
      expect(text.includes('–'), `${kind}: en crtica`).toBe(false);
      expect(text.includes('[PLACEHOLDER'), `${kind}: placeholder`).toBe(false);
    }
  });

  it('privacy sadrzi GDPR minimum: pravnu osnovu, izvrsitelje, AZOP i obje retencije', () => {
    const html = docs.privacy.html;
    expect(html).toContain('čl. 6');
    expect(html).toContain('Supabase');
    expect(html).toContain('Netlify');
    expect(html).toContain('AZOP');
    expect(html).toContain('30 dana');
    expect(html).toContain('90 dana');
    expect(html).toContain('Voditelj obrade');
  });

  it('WS-6: privacy i processing objavljuju server-side popravak s pohranom-do-brisanja i pravom brisanja', () => {
    for (const kind of ['privacy', 'processing'] as const) {
      const html = docs[kind].html;
      expect(html, `${kind}: automatski popravak`).toContain('automatski popravak');
      expect(html, `${kind}: pohrana`).toMatch(/pohranjuj|pohran/);
      expect(html, `${kind}: retencija do brisanja`).toContain('dok ih');
      expect(html, `${kind}: Moji popravci (right to erasure)`).toContain('Moji popravci');
    }
    // privacy mora imenovati pravnu osnovu pohrane (privola) i izvrsitelja pohrane (Supabase Storage)
    expect(docs.privacy.html).toContain('Supabase Storage');
    // purchase mora navesti popravak kao placeni digitalni proizvod (per vrsta rada)
    expect(docs.purchase.html).toContain('automatski popravak');
  });

  it('guarantee definira svih 9 tocaka: rokove, dokaz, odluku, lijek i iskljucenja', () => {
    const html = docs.guarantee.html;
    expect(html).toContain('30 dana');            // rok podnosenja
    expect(html).toContain('5 radnih dana');      // SLA odgovora
    expect(html).toContain('vezivanja');          // snapshot na dan vezivanja
    expect(html).toContain('verificiran');        // definicija pokrica
    expect(html).toContain('povrat');             // lijek
    expect(html).toContain('ručni popravak');     // lijek
    expect(html).toContain('odlučuje čovjek');    // tko odlucuje
    expect(html.toLowerCase()).toContain('mentor'); // iskljucenje mentorskih zahtjeva
  });

  it('purchase referencira garancijske uvjete dual-mode linkom (modal + stranica)', () => {
    expect(docs.purchase.html).toContain('data-legal="guarantee"');
    expect(docs.purchase.html).toContain('href="/garancija.html"');
  });

  it('dok registracijski podaci nisu upisani, dokumenti nose napomenu o dopuni', () => {
    // provider.json ima prazan oib -> privacy mora reci da podaci slijede (posteno prema korisniku)
    expect(docs.privacy.html).toContain('registracij');
    // a cim se oib upise, napomena nestaje i OIB se renderira
    const withOib = legalDocuments({ oib: '12345678901' });
    expect(withOib.privacy.html).toContain('OIB');
    expect(withOib.privacy.html.includes('bit će objavljeni')).toBe(false);
  });

  it('deterministicki: dva poziva daju identican sadrzaj (modal === stranica)', () => {
    const a = legalDocuments();
    const b = legalDocuments();
    for (const kind of KINDS) expect(a[kind].html).toBe(b[kind].html);
  });
});
