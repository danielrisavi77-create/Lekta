/**
 * "Popisi slika i tablica" vise ne priznaje goli naslov.
 *
 * Provjera je dosad trazila SAMO da postoji naslov popisa, pa je prazan "Popis slika" nosio pune
 * bodove. Rupa nije bila teorijska: do 2026-08-09 ju je proizvodio i sam Repair Engine, ciji je
 * popis bio Wordovo `TOC \c` polje nad natpisima koji namjerno nemaju SEQ oznake (RE-58). U
 * pravom Wordu je nakon Fields.Update() ondje pisalo "No table of contents entries found.",
 * a provjera je svejedno davala 3 boda.
 */
import { describe, it, expect } from 'vitest';
import { elementListEntryParagraphs } from '../src/audits/structure';

const p = (text: string, headingLevel: number | null = null) => ({ text, headingLevel });
const FIG = ['popisslika', 'popisgrafikona', 'listoffigures'];

describe('elementListEntryParagraphs', () => {
  it('bez naslova popisa nema stavki', () => {
    expect(elementListEntryParagraphs([p('Uvod', 1), p('Tekst')], FIG)).toEqual([]);
  });

  it('naslov BEZ stavki ispod daje prazno (to je bio cijeli kvar)', () => {
    const paragraphs = [p('Popis slika', 1), p('Uvod', 1), p('Tekst rada')];
    expect(elementListEntryParagraphs(paragraphs, FIG)).toEqual([]);
  });

  it('prepoznaje stavke koje pocinju oznakom i brojem', () => {
    const paragraphs = [p('Popis slika', 1), p('Slika 1. Shema procesa'), p('Slika 2. Rezultati'), p('Uvod', 1)];
    expect(elementListEntryParagraphs(paragraphs, FIG).map((x) => x.text)).toEqual([
      'Slika 1. Shema procesa',
      'Slika 2. Rezultati',
    ]);
  });

  it('prepoznaje i Wordov generirani oblik s brojem stranice na kraju', () => {
    const paragraphs = [p('Popis slika', 1), p('Shema procesa\t7'), p('Uvod', 1)];
    expect(elementListEntryParagraphs(paragraphs, FIG)).toHaveLength(1);
  });

  it('staje na sljedecem naslovu, pa ne pokupi tijelo rada', () => {
    const paragraphs = [p('Popis slika', 1), p('Slika 1. Shema'), p('Uvod', 1), p('Slika 2. Ovo je u tijelu rada')];
    expect(elementListEntryParagraphs(paragraphs, FIG)).toHaveLength(1);
  });

  it('prazni odlomci izmedju stavki ne prekidaju popis', () => {
    const paragraphs = [p('Popis slika', 1), p('Slika 1. Prva'), p('   '), p('Slika 2. Druga'), p('Uvod', 1)];
    expect(elementListEntryParagraphs(paragraphs, FIG)).toHaveLength(2);
  });

  it('tablice imaju vlastiti skup naslova', () => {
    const paragraphs = [p('Popis tablica', 1), p('Tablica 1. Uzorak'), p('Uvod', 1)];
    expect(elementListEntryParagraphs(paragraphs, ['popistablica', 'listoftables'])).toHaveLength(1);
    expect(elementListEntryParagraphs(paragraphs, FIG), 'popis slika ne postoji u ovom radu').toEqual([]);
  });
});
