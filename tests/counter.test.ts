import { describe, it, expect } from 'vitest';
import { countText, ZNAKOVA_PO_KARTICI } from '../src/tools/counter';

describe('countText', () => {
  it('prazan tekst daje sve nule', () => {
    const m = countText('');
    expect(m).toMatchObject({ words: 0, charsWithSpaces: 0, charsWithoutSpaces: 0, kartice: 0, pages: 0, sentences: 0, paragraphs: 0, readingMinutes: 0 });
  });

  it('sami razmaci: nema sadrzaja pa je i stranica 0 (bez laznog "1")', () => {
    const m = countText('   ');
    expect(m).toMatchObject({ words: 0, sentences: 0, paragraphs: 0, pages: 0, kartice: 0 });
  });

  it('broji rijeci i znakove s razmacima i bez', () => {
    const m = countText('Ana ima macku.');
    expect(m.words).toBe(3);
    expect(m.charsWithSpaces).toBe('Ana ima macku.'.length);
    expect(m.charsWithoutSpaces).toBe('Anaimamacku.'.length);
  });

  it('hrvatski dijakritici se broje kao jedan znak', () => {
    const m = countText('čćšžđ');
    expect(m.charsWithoutSpaces).toBe(5);
  });

  it('prijelomi retka se ne broje u znakove, ali dijele odlomke', () => {
    const m = countText('Prvi odlomak.\n\nDrugi odlomak.');
    expect(m.paragraphs).toBe(2);
    expect(m.charsWithSpaces).toBe('Prvi odlomak.Drugi odlomak.'.length); // prijelomi se ne broje
  });

  it('kartica = znakovi s razmacima / 1800', () => {
    const text = 'a'.repeat(ZNAKOVA_PO_KARTICI);
    const m = countText(text);
    expect(m.charsWithSpaces).toBe(1800);
    expect(m.kartice).toBe(1);
    expect(m.pages).toBe(1);
  });

  it('pola kartice se zaokruzi na jednu stranicu', () => {
    const m = countText('a'.repeat(900));
    expect(m.kartice).toBe(0.5);
    expect(m.pages).toBe(1);
  });

  it('broji recenice po zavrsnoj interpunkciji, minimalno jedna za tekst', () => {
    expect(countText('Jedan. Dva! Tri?').sentences).toBe(3);
    expect(countText('Bez tocke na kraju').sentences).toBe(1);
  });

  it('kratice ne napuhavaju broj recenica', () => {
    expect(countText('Rad je napisao dr. sc. Ivan Ivić.').sentences).toBe(1);
    expect(countText('Vidi npr. tab. 3 i sl.').sentences).toBe(1);
    expect(countText('Prva rečenica. Druga rečenica.').sentences).toBe(2);
  });

  it('decimale i redni brojevi ne broje se kao kraj recenice', () => {
    expect(countText('Uzorak iznosi 3.5 kg.').sentences).toBe(1);
    expect(countText('Obranjeno 2. svibnja 2020. godine.').sentences).toBe(1);
    expect(countText('Cijena je 1.250,00 eura.').sentences).toBe(1);
  });

  it('dijakriticka kratica "čl." se neutralizira (pravna domena)', () => {
    // Prije popravka je ASCII \b padao ispred č pa se "čl." brojao kao kraj recenice.
    expect(countText('U čl. 5 stoji zabrana.').sentences).toBe(1);
    expect(countText('Prema čl. 3 i čl. 4 ovoga Zakona vrijedi pravilo.').sentences).toBe(1);
  });

  it('leksicka kratica na kraju recenice broji granicu (ne podbraja)', () => {
    // "itd."/"sl." iza kojih slijedi veliko slovo su stvarni kraj recenice.
    expect(countText('Kupili smo jabuke, kruške itd. Vratili smo se kući.').sentences).toBe(2);
    expect(countText('Ima voća, povrća i sl. Zatim smo otišli.').sentences).toBe(2);
    // ali ista kratica usred recenice (malo slovo iza) ne broji granicu.
    expect(countText('Ima jabuka, krušaka itd. u kolicama.').sentences).toBe(1);
  });

  it('tocke unutar URL-a se ne broje kao recenice', () => {
    expect(countText('Posjeti www.example.com za više.').sentences).toBe(1);
    expect(countText('Izvor: https://hrcak.srce.hr/12345 dostupan je.').sentences).toBe(1);
    // URL neposredno prije kraja recenice: zavrsna tocka ostaje terminator.
    expect(countText('Idi na www.x.com. Zatim se vrati.').sentences).toBe(2);
  });

  it('procjena vremena citanja raste s brojem rijeci', () => {
    const m = countText(Array.from({ length: 400 }, () => 'rijec').join(' '));
    expect(m.words).toBe(400);
    expect(m.readingMinutes).toBe(2);
  });
});
