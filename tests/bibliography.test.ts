import { describe, it, expect } from 'vitest';
import { organizeBibliography, detectIssues, bibliographyText } from '../src/tools/bibliography';

describe('organizeBibliography', () => {
  it('prazan unos daje prazan rezultat', () => {
    const r = organizeBibliography('');
    expect(r.entries).toHaveLength(0);
    expect(r.inputCount).toBe(0);
    expect(r.duplicatesRemoved).toBe(0);
  });

  it('sortira abecedno po prezimenu', () => {
    const r = organizeBibliography('Zorić, Z. (2020). Naslov.\nAnić, A. (2019). Naslov.\nMarić, M. (2021). Naslov.');
    expect(r.entries.map(e => e.text[0])).toEqual(['A', 'M', 'Z']);
  });

  it('poštuje hrvatski poredak (C prije Č)', () => {
    const r = organizeBibliography('Čović, Č. (2020). Rad.\nCvitić, C. (2020). Rad.');
    expect(r.entries[0].text.startsWith('Cvitić')).toBe(true);
    expect(r.entries[1].text.startsWith('Čović')).toBe(true);
  });

  it('uklanja duplikate neovisno o razmaku i velikim slovima', () => {
    const r = organizeBibliography('Anić, A. (2019). Rad.\nanić,  a. (2019). rad.\nBarić, B. (2020). Drugi.');
    expect(r.inputCount).toBe(3);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.entries).toHaveLength(2);
  });

  it('ignorira vodece nabrajanje pri sortiranju', () => {
    const r = organizeBibliography('[2] Zorić, Z. (2020). Rad.\n[1] Anić, A. (2019). Rad.');
    expect(r.entries[0].text).toContain('Anić');
  });

  it('bibliographyText vraća po jedan zapis u retku', () => {
    const r = organizeBibliography('Barić, B. (2020). Drugi.\nAnić, A. (2019). Prvi.');
    expect(bibliographyText(r)).toBe('Anić, A. (2019). Prvi.\nBarić, B. (2020). Drugi.');
  });

  it('spaja prelomljeni URL-nastavak u prethodnu jedinicu (PDF paste)', () => {
    const r = organizeBibliography(
      'Anić, A. (2019). Članak na portalu.\nhttps://primjer.hr/clanak\nBarić, B. (2020). Rad.',
    );
    expect(r.entries).toHaveLength(2);
    const anic = r.entries.find(e => e.text.startsWith('Anić'));
    expect(anic?.text).toContain('https://primjer.hr/clanak');
  });

  it('uzastopni goli URL-ovi (webografija) ostaju zasebni zapisi', () => {
    // Regresija: bezuvjetno spajanje URL-nastavka progutalo bi drugi URL u prvi.
    const r = organizeBibliography(
      'https://www.nn.hr/clanci/sluzbeni/2020_01_1.html\nhttps://www.zakon.hr/z/307/Zakon-o-radu',
    );
    expect(r.inputCount).toBe(2);
    expect(r.entries).toHaveLength(2);
  });
});

describe('detectIssues', () => {
  it('označava zapis bez godine', () => {
    expect(detectIssues('Anić, A. Naslov rada. Zagreb.')).toContain('nema godine');
    expect(detectIssues('Anić, A. (2019). Naslov.')).not.toContain('nema godine');
  });

  it('označava mrežni izvor bez datuma pristupa', () => {
    expect(detectIssues('Portal (2021). https://primjer.hr/clanak')).toContain('mrežni izvor bez datuma pristupa');
    expect(detectIssues('Portal (2021). https://primjer.hr (pristup 2.7.2026.)')).not.toContain('mrežni izvor bez datuma pristupa');
  });

  it('prihvaća "citirano" kao marker datuma pristupa (hrvatski Vancouver/IEEE)', () => {
    expect(detectIssues('SZO. (2020). Izvještaj. https://who.int [citirano: 2.7.2026.]'))
      .not.toContain('mrežni izvor bez datuma pristupa');
  });

  it('goli datum objave nije datum pristupa; hvata i bare www URL', () => {
    // Datum je datum objave, nema kljucne rijeci pristupa -> i dalje se oznacava.
    expect(detectIssues('Novosti (12.3.2021). https://x.hr/a')).toContain('mrežni izvor bez datuma pristupa');
    // Bare www URL bez sheme se sada prepoznaje kao mrežni izvor.
    expect(detectIssues('Zavod (2021). Podaci. www.primjer.hr/podaci')).toContain('mrežni izvor bez datuma pristupa');
  });

  it('označava prekratak zapis', () => {
    expect(detectIssues('Anić 2019')).toContain('vrlo kratak zapis, možda nepotpun');
  });
});
