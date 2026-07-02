import { describe, it, expect } from 'vitest';

import { parseAuthors, formatCitation } from '../src/tools/citation';

describe('parseAuthors', () => {
  it('parsira "Prezime, Ime" oblik', () => {
    expect(parseAuthors('Ivic, Ivan')).toEqual([{ last: 'Ivic', first: 'Ivan' }]);
  });

  it('parsira "Ime Prezime" oblik (zadnja rijec je prezime)', () => {
    expect(parseAuthors('Ana Maria Horvat')).toEqual([{ last: 'Horvat', first: 'Ana Maria' }]);
  });

  it('razbija vise autora po ";" i praznom retku', () => {
    expect(parseAuthors('Ivic, Ivan; Horvat, Ana')).toEqual([
      { last: 'Ivic', first: 'Ivan' },
      { last: 'Horvat', first: 'Ana' },
    ]);
  });

  it('odbacuje prazne unose', () => {
    expect(parseAuthors('  ;  ')).toEqual([]);
    expect(parseAuthors(undefined)).toEqual([]);
  });

  it('prezime bez imena', () => {
    expect(parseAuthors('Vlada Republike Hrvatske')).toEqual([{ last: 'Hrvatske', first: 'Vlada Republike' }]);
  });
});

describe('formatCitation autor-godina', () => {
  it('knjiga s jednim autorom', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan', title: 'Ustavno pravo', year: '2020', place: 'Zagreb', publisher: 'Narodne novine' },
      'autor-godina',
    );
    expect(r.citation).toBe('Ivic, I. (2020). Ustavno pravo. Zagreb: Narodne novine.');
    expect(r.missing).toEqual([]);
  });

  it('dva autora spaja s &', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan; Horvat, Ana', title: 'Metodologija', year: '2019', publisher: 'Skolska knjiga' },
      'autor-godina',
    );
    expect(r.citation).toBe('Ivic, I., & Horvat, A. (2019). Metodologija. Skolska knjiga.');
  });

  it('clanak u casopisu s volumenom, brojem i stranicama', () => {
    const r = formatCitation(
      {
        type: 'clanak',
        authors: 'Kovac, Marko',
        title: 'Analiza presuda',
        container: 'Zbornik PFZ',
        volume: '70',
        issue: '2',
        year: '2021',
        pages: '145-170',
      },
      'autor-godina',
    );
    expect(r.citation).toBe('Kovac, M. (2021). Analiza presuda. Zbornik PFZ, 70(2), 145-170.');
  });

  it('mrezni izvor s datumom pristupa', () => {
    const r = formatCitation(
      { type: 'mrezni', title: 'Upute za izradu rada', publisher: 'FPZG', url: 'https://fpzg.hr/upute', accessed: '2.7.2026.' },
      'autor-godina',
    );
    expect(r.citation).toBe('Upute za izradu rada. FPZG. Pristupljeno 2.7.2026. https://fpzg.hr/upute');
  });

  it('prijavljuje polja koja nedostaju', () => {
    const r = formatCitation({ type: 'knjiga', title: 'Bezimeno' }, 'autor-godina');
    expect(r.missing).toContain('autor');
    expect(r.missing).toContain('godina');
    expect(r.missing).toContain('izdavac');
    expect(r.missing).not.toContain('naslov');
  });
});

describe('formatCitation fusnota', () => {
  it('knjiga: prvi autor obrnut, mjesto i godina', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan', title: 'Ustavno pravo', year: '2020', place: 'Zagreb', publisher: 'Narodne novine' },
      'fusnota',
    );
    expect(r.citation).toBe('Ivic, Ivan. Ustavno pravo. Zagreb: Narodne novine, 2020.');
  });

  it('clanak s navodnicima i brojem casopisa', () => {
    const r = formatCitation(
      { type: 'clanak', authors: 'Kovac, Marko', title: 'Analiza presuda', container: 'Zbornik PFZ', volume: '70', issue: '2', year: '2021', pages: '145-170' },
      'fusnota',
    );
    expect(r.citation).toBe('Kovac, Marko. "Analiza presuda." Zbornik PFZ 70, br. 2 (2021): 145-170.');
  });

  it('propis: naziv, sluzbeni list i broj', () => {
    const r = formatCitation(
      { type: 'propis', title: 'Zakon o radu', container: 'Narodne novine', issue: '93/14' },
      'fusnota',
    );
    expect(r.citation).toBe('Zakon o radu. Narodne novine, 93/14.');
  });

  it('tri autora: prvi obrnut, zadnji spojen s "i"', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan; Horvat, Ana; Kovac, Marko', title: 'Prirucnik', year: '2018', publisher: 'X' },
      'fusnota',
    );
    expect(r.citation).toBe('Ivic, Ivan, Ana Horvat i Marko Kovac. Prirucnik. X, 2018.');
  });
});
