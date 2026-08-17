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

  // K5: provjera izvora u korpusu je nova svrha obrade uz placeni popravak. Dvije stvari moraju
  // ostati napisane: da nikakav podatak ne izlazi iz Lekte (korpus je nasa baza, ne vanjski servis)
  // i da promasaj NIJE dokaz nepostojanja. Bez drugoga bi pravni tekst obecavao vise nego alat moze.
  it('K5: privacy i processing opisuju provjeru izvora bez slanja trecim stranama', () => {
    for (const kind of ['privacy', 'processing'] as LegalDocKind[]) {
      const html = docs[kind].html;
      expect(html, kind).toMatch(/korpus/i);
      expect(html, kind).toContain('hrvatskih repozitorija');
      expect(html, kind).toMatch(/ne šalju izvan Lekte|ne šalje vanjskim servisima/);
      expect(html, kind).toContain('ne znači da');
    }
  });

  it('K5: nijedan dokument ne tvrdi da korpus moze dokazati nepostojanje izvora', () => {
    // Rijec "izmisljen" smije se pojaviti SAMO u nijekanoj recenici. Zato se gleda svaka recenica
    // u kojoj stoji: ako ijedna nema nijek, tekst optuzuje korisnika za nesto sto alat ne moze znati.
    for (const kind of KINDS) {
      for (const rec of docs[kind].html.toLowerCase().split(/[.;]/)) {
        if (!rec.includes('izmišljen')) continue;
        expect(/\bne\b|\bnije\b|\bnisu\b/.test(rec), `${kind}: „${rec.trim()}”`).toBe(true);
      }
    }
    expect(docs.disclaimer.html).toContain('ne može dokazati suprotno');
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

  /**
   * LEG-02: Zakon o zastiti potrosaca medju predugovornim informacijama trazi i TELEFONSKI
   * broj trgovca, ne samo e-mail. Polje je prazno dok subjekt nije registriran, pa se redak
   * tada ne smije renderirati (prazan "Telefon:" bio bi gori od izostanka).
   */
  it('telefon se renderira samo kad postoji', () => {
    expect(legalDocuments().privacy.html.includes('Telefon:')).toBe(false);
    expect(legalDocuments({ phone: '+385 1 2345 678' }).privacy.html).toContain('Telefon:');
    expect(legalDocuments({ phone: '+385 1 2345 678' }).privacy.html).toContain('+385 1 2345 678');
  });

  /**
   * A26-01: dok registracijski podaci nisu upisani, "Lekta" je naziv usluge a ne pravni
   * subjekt. Napomena to mora IZRICITO reci, jer bi inace redak "Voditelj obrade: Lekta"
   * citatelju izgledao kao da voditelj obrade postoji i identificiran je.
   */
  it('bez OIB-a napomena izricito kaze da subjekt nije registriran i da se ne naplacuje', () => {
    const html = legalDocuments().privacy.html;
    expect(html).toContain('a ne registrirani pravni subjekt');
    expect(html).toContain('ne naplaćuje');
  });

  it('deterministicki: dva poziva daju identican sadrzaj (modal === stranica)', () => {
    const a = legalDocuments();
    const b = legalDocuments();
    for (const kind of KINDS) expect(a[kind].html).toBe(b[kind].html);
  });
});
