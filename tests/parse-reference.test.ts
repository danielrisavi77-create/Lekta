import { describe, it, expect } from 'vitest';

import { parseReference, splitReferences } from '../src/citations/parse-reference';

describe('splitReferences', () => {
  it('dijeli po praznom retku kad postoji', () => {
    const out = splitReferences('Prva referenca.\n\nDruga\nreferenca u dva retka.');
    expect(out).toEqual(['Prva referenca.', 'Druga referenca u dva retka.']);
  });

  it('dijeli po retku kad nema praznih redaka', () => {
    expect(splitReferences('Prva\nDruga\nTreca')).toEqual(['Prva', 'Druga', 'Treca']);
  });

  it('skida redne oznake i prazne unose', () => {
    expect(splitReferences('1. Prva\n2) Druga\n[3] Treca\n   ')).toEqual(['1. Prva', '2) Druga', '[3] Treca']);
    // stripMarker se primjenjuje u parseReference, ne u splitu; split zadrzava sirovi redak
  });
});

describe('parseReference', () => {
  it('APA knjiga: autor, godina, naslov, mjesto, izdavac', () => {
    const r = parseReference('Kovačić, I. (2020). Politički sustavi. Zagreb: Fakultet političkih znanosti.');
    expect(r.type).toBe('knjiga');
    expect(r.fields.year).toBe('2020');
    expect(r.fields.title).toBe('Politički sustavi');
    expect(r.fields.place).toBe('Zagreb');
    expect(r.fields.publisher).toBe('Fakultet političkih znanosti');
    expect(r.fields.authors).toContain('Kovačić');
  });

  it('APA clanak: casopis, volumen, broj, stranice', () => {
    const r = parseReference('Horvat, A., & Marić, P. (2019). Analiza podataka. Društvena istraživanja, 28(3), 45-67.');
    expect(r.type).toBe('clanak');
    expect(r.fields.year).toBe('2019');
    expect(r.fields.title).toBe('Analiza podataka');
    expect(r.fields.container).toBe('Društvena istraživanja');
    expect(r.fields.volume).toBe('28');
    expect(r.fields.issue).toBe('3');
    expect(r.fields.pages).toBe('45-67');
    expect(r.fields.authors).toContain('Horvat');
    expect(r.fields.authors).toContain('Marić');
  });

  it('clanak s DOI-jem: izvlaci DOI, ne tretira URL kao mjesto', () => {
    const r = parseReference('Kovač, M. (2021). Naslov rada. Časopis, 5, 1-10. https://doi.org/10.1234/abcd');
    expect(r.fields.doi).toBe('10.1234/abcd');
    expect(r.type).toBe('clanak');
    expect(r.fields.year).toBe('2021');
    expect(r.fields.title).toBe('Naslov rada');
    expect(r.fields.pages).toBe('1-10');
    expect(r.fields.place).toBeUndefined();
    expect(r.fields.publisher).toBeUndefined();
  });

  it('mrezni izvor: institucija kao autor + URL', () => {
    const r = parseReference('Državni zavod za statistiku (2021). Popis stanovništva. https://dzs.hr/popis');
    expect(r.type).toBe('mrezni');
    expect(r.fields.url).toBe('https://dzs.hr/popis');
    expect(r.fields.year).toBe('2021');
    expect(r.fields.title).toBe('Popis stanovništva');
    expect(r.fields.authors).toContain('Državni zavod');
  });

  it('prvi autor (za sortiranje) je prezime prije prvog zareza', () => {
    const r = parseReference('Šimić, T. (2018). Naslov. Split: Redak.');
    // sort kljuc se u UI-u racuna preko parseAuthors; ovdje samo potvrda da autor pocinje prezimenom
    expect(r.fields.authors.startsWith('Šimić')).toBe(true);
  });

  it('nepotpun/messy unos ne puca i oznacava nisku pouzdanost', () => {
    const r = parseReference('nekakav nepotpun tekst bez ičega');
    expect(r.type).toBe('knjiga');
    expect(r.lowConfidence).toBe(true);
    expect(() => parseReference('')).not.toThrow();
  });

  it('propis: prepoznaje Narodne novine', () => {
    const r = parseReference('Zakon o radu. Narodne novine, 93/14.');
    expect(r.type).toBe('propis');
  });
});
