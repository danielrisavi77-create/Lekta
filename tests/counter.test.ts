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

  it('procjena vremena citanja raste s brojem rijeci', () => {
    const m = countText(Array.from({ length: 400 }, () => 'rijec').join(' '));
    expect(m.words).toBe(400);
    expect(m.readingMinutes).toBe(2);
  });
});
