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

  it('BUG: isti autor s razlicitim godinama ostaje u ulaznom redoslijedu (FAQ/vodic obecava kronoloski, stariji prije novijeg)', () => {
    const r = organizeBibliography('Anić, A. (2022). Noviji rad.\nAnić, A. (2019). Stariji rad.');
    expect(r.entries.map(e => e.text)).toEqual([
      'Anić, A. (2019). Stariji rad.',
      'Anić, A. (2022). Noviji rad.',
    ]);
  });

  it('isti autor bez prepoznate godine ide iza svih datiranih zapisa istog autora', () => {
    const r = organizeBibliography('Anić, A. (n.d.). Bez godine.\nAnić, A. (2019). Stariji rad.\nAnić, A. (2022). Noviji rad.');
    expect(r.entries.map(e => e.text)).toEqual([
      'Anić, A. (2019). Stariji rad.',
      'Anić, A. (2022). Noviji rad.',
      'Anić, A. (n.d.). Bez godine.',
    ]);
  });

  it('ignorira vodece nabrajanje pri sortiranju', () => {
    const r = organizeBibliography('[2] Zorić, Z. (2020). Rad.\n[1] Anić, A. (2019). Rad.');
    expect(r.entries[0].text).toContain('Anić');
  });

  it('BUG: prepoznaje duplikat kad je jedan zapis numeriran a drugi nije', () => {
    // Ceste liste literature se rucno numeriraju (kopirano iz Worda); dedupeKey mora
    // ignorirati "1. " isto kao sortKey, inace isti zapis s brojem i bez broja prode
    // kao dva razlicita zapisa.
    const r = organizeBibliography('1. Anić, A. (2019). Rad.\nAnić, A. (2019). Rad.\nBarić, B. (2020). Drugi.');
    expect(r.inputCount).toBe(3);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.entries).toHaveLength(2);
  });

  it('zadano sortMode je "alphabetical" (nema opts)', () => {
    expect(organizeBibliography('Zorić, Z.\nAnić, A.').sortMode).toBe('alphabetical');
  });

  it('BUG: sort:"appearance" ne razbija numericki popis (IEEE/Vancouver)', () => {
    // Regresija: abecedno sortiranje je bezuvjetno primjenjivano cak i kad brojevi ispred
    // svakog zapisa ([1], [2]...) vec kodiraju redoslijed pojavljivanja u tekstu; sortKey
    // svjesno strippa te brojeve pa bi ih abecedno sortiranje raskorak(ir)alo s tekstom.
    const raw = '[3] Zorić, Z. (2020). Treći rad.\n[1] Anić, A. (2019). Prvi rad.\n[2] Marić, M. (2021). Drugi rad.';
    const alpha = organizeBibliography(raw, { sort: 'alphabetical' });
    expect(alpha.entries.map((e) => e.text[1])).toEqual(['1', '2', '3']); // A, M, Z abecedno

    const appearance = organizeBibliography(raw, { sort: 'appearance' });
    expect(appearance.sortMode).toBe('appearance');
    expect(appearance.entries.map((e) => e.text[1])).toEqual(['3', '1', '2']); // izvorni redoslijed
    expect(appearance.entries.map((e) => e.text)).toEqual([
      '[3] Zorić, Z. (2020). Treći rad.',
      '[1] Anić, A. (2019). Prvi rad.',
      '[2] Marić, M. (2021). Drugi rad.',
    ]);
  });

  it('appearance nacin i dalje uklanja duplikate i oznacava upozorenja (samo preskace sort)', () => {
    const r = organizeBibliography('Zorić, Z. (2020). Rad.\nzorić,  z. (2020). rad.\nAnić, A.', { sort: 'appearance' });
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[1].issues).toContain('nema godine'); // "Anić, A." nema godinu
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

  it('goli DOI nastavak (Vancouver/IEEE PDF-copy) spaja se u prethodnu jedinicu', () => {
    const r = organizeBibliography(
      'Anić A. Rad o medicini. Liječnički vjesnik. 2020;142(3):45-52.\n10.26800/LV-142-3-4\nBarić B. Drugi rad. Zagreb; 2021.',
    );
    expect(r.entries).toHaveLength(2);
    const anic = r.entries.find(e => e.text.startsWith('Anić'));
    expect(anic?.text).toContain('10.26800/LV-142-3-4');

    // doi.org oblik bez sheme, isto nastavak.
    const r2 = organizeBibliography('Anić A. Rad. 2020.\ndoi.org/10.1000/xyz123');
    expect(r2.entries).toHaveLength(1);
    expect(r2.entries[0].text).toContain('doi.org/10.1000/xyz123');
  });

  it('uzastopni goli DOI-jevi ostaju zasebni zapisi (kao webografija)', () => {
    const r = organizeBibliography('10.1000/prvi\n10.1000/drugi');
    expect(r.entries).toHaveLength(2);
  });
});

describe('detectIssues', () => {
  it('označava zapis bez godine', () => {
    expect(detectIssues('Anić, A. Naslov rada. Zagreb.')).toContain('nema godine');
    expect(detectIssues('Anić, A. (2019). Naslov.')).not.toContain('nema godine');
  });

  it('legitimni "bez datuma" markeri (n.d., b.g., bez godine) NE dobivaju "nema godine"', () => {
    expect(detectIssues('Ministarstvo znanosti. (n.d.). Strategija obrazovanja. Zagreb.')).not.toContain('nema godine');
    expect(detectIssues('Anić, A. (b.g.). Interni prirucnik. Split: Ustanova.')).not.toContain('nema godine');
    expect(detectIssues('Zavod za statistiku (bez godine). Metodologija popisa. Zagreb.')).not.toContain('nema godine');
    // "n. d." s razmakom (cest u praksi) takodjer prolazi.
    expect(detectIssues('UNESCO. (n. d.). Global report. Paris.')).not.toContain('nema godine');
    // Ali obican zapis bez ikakvog markera i bez godine i dalje dobiva upozorenje.
    expect(detectIssues('Anić, A. Naslov nekog duljeg rada. Zagreb: Naklada.')).toContain('nema godine');
  });

  it('BUG: 4-znamenkasti broj u URL putanji (bez prave godine izdanja) i dalje oznacava "nema godine"', () => {
    // Regresija: godina se PRIJE trazila nad cijelim tekstom, pa bi npr. "/2021/03/..." u
    // permalinku portala lazno ugasio upozorenje bas kod mreznih izvora, gdje je najkorisnije.
    expect(detectIssues('Portal (2021). https://portal.hr/2021/03/naslov-clanka'))
      .not.toContain('nema godine'); // prava godina PRIJE URL-a i dalje vrijedi
    expect(detectIssues('https://portal.hr/2021/03/naslov-clanka-bez-godine'))
      .toContain('nema godine'); // SAMO broj u putanji, bez prave godine izdanja
  });

  it('označava mrežni izvor bez datuma pristupa', () => {
    expect(detectIssues('Portal (2021). https://primjer.hr/clanak')).toContain('provjeri treba li tvoj citatni stil datum pristupa');
    expect(detectIssues('Portal (2021). https://primjer.hr (pristup 2.7.2026.)')).not.toContain('provjeri treba li tvoj citatni stil datum pristupa');
  });

  it('prihvaća "citirano" kao marker datuma pristupa (hrvatski Vancouver/IEEE)', () => {
    expect(detectIssues('SZO. (2020). Izvještaj. https://who.int [citirano: 2.7.2026.]'))
      .not.toContain('provjeri treba li tvoj citatni stil datum pristupa');
  });

  it('goli datum objave nije datum pristupa; hvata i bare www URL', () => {
    // Datum je datum objave, nema kljucne rijeci pristupa -> i dalje se oznacava.
    expect(detectIssues('Novosti (12.3.2021). https://x.hr/a')).toContain('provjeri treba li tvoj citatni stil datum pristupa');
    // Bare www URL bez sheme se sada prepoznaje kao mrežni izvor.
    expect(detectIssues('Zavod (2021). Podaci. www.primjer.hr/podaci')).toContain('provjeri treba li tvoj citatni stil datum pristupa');
  });

  it('označava prekratak zapis', () => {
    expect(detectIssues('Anić 2019')).toContain('vrlo kratak zapis, možda nepotpun');
  });
});
