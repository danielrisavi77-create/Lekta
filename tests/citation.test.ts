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

  it('BUG: zarez umjesto ";" izmedju autora vise ne gubi koautore nakon drugog', () => {
    // Regresija: chunk.split(',') je uzimao samo prva dva dijela (last, first); sve nakon
    // drugog zareza unutar istog chunka se tiho gubilo. Placeholder trazi ';', ali korisnik
    // koji kopira gotovu referencu prirodno koristi zarez i za autore i za prezime/ime.
    expect(parseAuthors('Kovacic, Ivan, Horvat, Ana')).toEqual([
      { last: 'Kovacic', first: 'Ivan' },
      { last: 'Horvat', first: 'Ana' },
    ]);
  });

  it('BUG: 3 autora zarezom, tri autora + tocan pravilan par', () => {
    expect(parseAuthors('Kovacic, Ivan, Horvat, Ana, Novak, Petra')).toEqual([
      { last: 'Kovacic', first: 'Ivan' },
      { last: 'Horvat', first: 'Ana' },
      { last: 'Novak', first: 'Petra' },
    ]);
  });

  it('BUG: neparan zavrsni segment ostaje autor bez imena umjesto da nestane', () => {
    expect(parseAuthors('Kovacic, Ivan, Horvat')).toEqual([
      { last: 'Kovacic', first: 'Ivan' },
      { last: 'Horvat', first: '' },
    ]);
  });

  it('odbacuje prazne unose', () => {
    expect(parseAuthors('  ;  ')).toEqual([]);
    expect(parseAuthors(undefined)).toEqual([]);
  });

  it('institucionalni autor ostaje doslovno (ne mrvi se u inicijale)', () => {
    expect(parseAuthors('Vlada Republike Hrvatske')).toEqual([{ last: 'Vlada Republike Hrvatske', first: '' }]);
    expect(parseAuthors('Državni zavod za statistiku')).toEqual([{ last: 'Državni zavod za statistiku', first: '' }]);
  });

  it('sklonjeni/dijakriticki nazivi ustanova ostaju doslovni (korijen hvata nastavak)', () => {
    // Prije popravka su svi ovi tiho ispadali kao osobe (trailing \b ubija korijen; leading
    // \b ubija dijakriticki pocetak). Nominativ i genitiv moraju ostati doslovni.
    for (const org of [
      'Akademija dramske umjetnosti',
      'Republika Hrvatska',
      'Sveučilište u Zagrebu',
      'Sveuciliste u Zagrebu',
      'Udruženje obrtnika Zagreb',
      'Knjižnica grada Zagreba',
      'Škola narodnog zdravlja',
      'Ministarstvo znanosti i obrazovanja',
    ]) {
      expect(parseAuthors(org)).toEqual([{ last: org, first: '' }]);
    }
  });

  it('Hrvatski sabor je ustanova (donositelj propisa), ne osoba', () => {
    expect(parseAuthors('Hrvatski sabor')).toEqual([{ last: 'Hrvatski sabor', first: '' }]);
    // trailing granica: "saborski" se NE hvata kao ustanova
    expect(parseAuthors('Ivan Saborski')).toEqual([{ last: 'Saborski', first: 'Ivan' }]);
  });

  it('osobe s rijecju nalik ustanovi ostaju osobe (trailing granica)', () => {
    // "Urednik"/"Vladimir" sadrze "ured"/"vladi" ali su osobe: trailing granica ih cuva.
    expect(parseAuthors('Vladimir Nazor')).toEqual([{ last: 'Nazor', first: 'Vladimir' }]);
    expect(parseAuthors('Ivan Uredski')).toEqual([{ last: 'Uredski', first: 'Ivan' }]);
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

  it('mrezni bez godine je "preporuceno dodati" (godina je recommended, ne samo dostupno polje)', () => {
    // Regresija: godina je bila SAKRIVENA za mrezni tip u formi (FIELDS_BY_TYPE), pa je
    // autor-godina stil tiho ispisivao "(bez dat.)" iako je korisnik znao datum. Polje je
    // sad vidljivo (SOURCE_TYPE_FIELDS.mrezni ukljucuje year); ovo dodatno provjerava da
    // nedostajuca godina i STVARNO upozorava korisnika preko "missing", ne samo sto polje
    // postoji na formi.
    const r = formatCitation(
      { type: 'mrezni', authors: 'Državni zavod za statistiku', title: 'Popis stanovništva', url: 'https://dzs.hr/popis' },
      'autor-godina',
    );
    expect(r.missing).toContain('godina');
    expect(r.citation).toContain('bez dat.');
  });

  it('prijavljuje polja koja nedostaju', () => {
    const r = formatCitation({ type: 'knjiga', title: 'Bezimeno' }, 'autor-godina');
    expect(r.missing).toContain('autor');
    expect(r.missing).toContain('godina');
    expect(r.missing).toContain('izdavač');
    expect(r.missing).not.toContain('naslov');
  });

  it('institucionalni autor bez inicijala u citatu', () => {
    const r = formatCitation(
      { type: 'mrezni', authors: 'Državni zavod za statistiku', title: 'Popis stanovništva', year: '2021', url: 'https://dzs.hr/popis' },
      'autor-godina',
    );
    expect(r.citation).toContain('Državni zavod za statistiku');
    expect(r.citation).not.toContain('V. R.');
    expect(r.citation).not.toContain('statistiku, S.');
  });

  it('bez godine uz autora daje (bez dat.)', () => {
    const r = formatCitation({ type: 'knjiga', authors: 'Ivic', title: 'Ustavno pravo' }, 'autor-godina');
    expect(r.citation).toBe('Ivic (bez dat.). Ustavno pravo.');
  });

  it('poglavlje ima urednika (ur.), a clanak/mrezni DOI', () => {
    const pog = formatCitation(
      { type: 'poglavlje', authors: 'Ivic, Ivan', title: 'Poglavlje', container: 'Zbornik', editor: 'A. Uredni', year: '2020', publisher: 'X' },
      'autor-godina',
    );
    expect(pog.citation).toContain('U: A. Uredni (ur.), Zbornik');
    const cl = formatCitation(
      { type: 'clanak', authors: 'Kovac, M', title: 'Rad', container: 'Casopis', volume: '5', year: '2021', doi: '10.1/xyz' },
      'autor-godina',
    );
    expect(cl.citation).toContain('https://doi.org/10.1/xyz');
    // puni DOI URL se normalizira, ne udvostrucuje
    const mr = formatCitation({ type: 'mrezni', title: 'T', doi: 'https://doi.org/10.2/abc' }, 'autor-godina');
    expect(mr.citation).toContain('https://doi.org/10.2/abc');
    expect(mr.citation).not.toContain('doi.org/https');
  });

  it('in-text oblik: 1, 2 i 3+ autora, institucija, bez godine', () => {
    expect(formatCitation({ type: 'knjiga', authors: 'Ivic, Ivan', year: '2020' }, 'autor-godina').inText).toBe('(Ivic, 2020)');
    expect(formatCitation({ type: 'knjiga', authors: 'Ivic, Ivan; Horvat, Ana', year: '2019' }, 'autor-godina').inText).toBe('(Ivic i Horvat, 2019)');
    expect(formatCitation({ type: 'knjiga', authors: 'Ivic, I; Horvat, A; Kovac, M', year: '2018' }, 'autor-godina').inText).toBe('(Ivic i sur., 2018)');
    expect(formatCitation({ type: 'mrezni', authors: 'Državni zavod za statistiku', year: '2021' }, 'autor-godina').inText).toBe('(Državni zavod za statistiku, 2021)');
    expect(formatCitation({ type: 'knjiga', authors: 'Ivic, Ivan' }, 'autor-godina').inText).toBe('(Ivic, bez dat.)');
    // fusnota nema in-text (u tekstu je broj biljeske)
    expect(formatCitation({ type: 'knjiga', authors: 'Ivic, Ivan', year: '2020' }, 'fusnota').inText).toBe('');
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

  it('propis bez broja je "preporuceno dodati" (FAQ tretira broj sluzbenog glasila kao dio ispravnog navoda)', () => {
    const r = formatCitation({ type: 'propis', title: 'Zakon o radu', container: 'Narodne novine' }, 'fusnota');
    expect(r.missing).toContain('broj');
  });

  it('mrezni bez datuma pristupa je "preporuceno dodati" (stranica sama tvrdi da je datum pristupa uvijek potreban)', () => {
    const r = formatCitation({ type: 'mrezni', title: 'Upute za izradu rada', url: 'https://fpzg.hr/upute' }, 'autor-godina');
    expect(r.missing).toContain('datum pristupa');
  });

  it('tri autora: prvi obrnut, zadnji spojen s "i"', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan; Horvat, Ana; Kovac, Marko', title: 'Prirucnik', year: '2018', publisher: 'X' },
      'fusnota',
    );
    expect(r.citation).toBe('Ivic, Ivan, Ana Horvat i Marko Kovac. Prirucnik. X, 2018.');
  });
});

describe('formatCitation IEEE (numericki)', () => {
  it('knjiga: inicijali ispred prezimena, mjesto: izdavac, godina', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan', title: 'Digitalni sustavi', place: 'Zagreb', publisher: 'Element', year: '2020' },
      'ieee',
    );
    expect(r.citation).toBe('I. Ivic, Digitalni sustavi. Zagreb: Element, 2020.');
  });

  it('clanak: naslov u navodnicima sa zarezom unutra, vol./no./pp.', () => {
    const r = formatCitation(
      { type: 'clanak', authors: 'Kovac, Marko', title: 'Analiza presuda', container: 'IEEE Trans. Educ.', volume: '70', issue: '2', year: '2021', pages: '145-170' },
      'ieee',
    );
    expect(r.citation).toBe('M. Kovac, "Analiza presuda," IEEE Trans. Educ., vol. 70, no. 2, pp. 145-170, 2021.');
  });

  it('dva autora spaja s "and"', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan; Horvat, Ana', title: 'Mreze', year: '2019', publisher: 'X' },
      'ieee',
    );
    expect(r.citation).toContain('I. Ivic and A. Horvat,');
  });

  it('numericki stil nema in-text oblik', () => {
    expect(formatCitation({ type: 'knjiga', authors: 'Ivic, Ivan', year: '2020' }, 'ieee').inText).toBe('');
    expect(formatCitation({ type: 'knjiga', authors: 'Ivic, Ivan', year: '2020' }, 'vancouver').inText).toBe('');
  });
});

describe('formatCitation Vancouver (numericki)', () => {
  it('knjiga: "Prezime I", mjesto: izdavac; godina', () => {
    const r = formatCitation(
      { type: 'knjiga', authors: 'Ivic, Ivan', title: 'Farmakologija', place: 'Zagreb', publisher: 'Medicinska naklada', year: '2019' },
      'vancouver',
    );
    expect(r.citation).toBe('Ivic I. Farmakologija. Zagreb: Medicinska naklada; 2019.');
  });

  it('clanak: Year;Volume(Issue):Pages', () => {
    const r = formatCitation(
      { type: 'clanak', authors: 'Ivic, Ivan; Horvat, Ana', title: 'Metabolizam lijekova', container: 'Lijec Vjesn', volume: '143', issue: '3', year: '2021', pages: '88-95' },
      'vancouver',
    );
    expect(r.citation).toBe('Ivic I, Horvat A. Metabolizam lijekova. Lijec Vjesn. 2021;143(3):88-95.');
  });

  it('7+ autora skracuje na prvih 6 pa "et al."', () => {
    const r = formatCitation(
      { type: 'clanak', authors: 'A, A; B, B; C, C; D, D; E, E; F, F; G, G', title: 'T', container: 'J', year: '2020' },
      'vancouver',
    );
    expect(r.citation).toContain('et al.');
    expect(r.citation).not.toContain('G G');
  });

  it('mrezni: [Internet], [cited ...], Available from', () => {
    const r = formatCitation(
      { type: 'mrezni', title: 'Smjernice', publisher: 'HZJZ', url: 'https://hzjz.hr/s', accessed: '2.7.2026.' },
      'vancouver',
    );
    expect(r.citation).toContain('[Internet]');
    expect(r.citation).toContain('Available from: https://hzjz.hr/s');
  });
});
