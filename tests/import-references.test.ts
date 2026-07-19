import { describe, it, expect } from 'vitest';

import { parseReferenceFile, detectFormat, decodeLatex } from '../src/citations/import-references';
import { formatCitation, type CitationInput } from '../src/tools/citation';

// Round-trip pomocnik: uvezeni zapis -> CitationInput -> renderiran citat (opci stil).
function render(ref: { type: any; fields: any }, style: any): string {
  const inp = { type: ref.type, ...ref.fields } as CitationInput;
  return formatCitation(inp, style).citation;
}

describe('detectFormat', () => {
  it('prepoznaje CSL-JSON (pocinje [ ili {)', () => {
    expect(detectFormat('[{"type":"book"}]')).toBe('csl');
    expect(detectFormat('  {"type":"book"}')).toBe('csl');
  });
  it('prepoznaje BibTeX (@type{)', () => {
    expect(detectFormat('@article{key, title={X}}')).toBe('bibtex');
  });
  it('prepoznaje RIS (TY  - )', () => {
    expect(detectFormat('TY  - JOUR\nER  -')).toBe('ris');
  });
  it('nepoznat/prazan -> null', () => {
    expect(detectFormat('samo obican tekst')).toBeNull();
    expect(detectFormat('')).toBeNull();
  });
});

describe('decodeLatex (hrvatska dijakritika)', () => {
  it('dekodira č ć đ š ž iz akcentnih naredbi', () => {
    expect(decodeLatex('Kova\\v{c}i\\\'{c}')).toBe('Kovačić');
    expect(decodeLatex('\\v{Z}upan')).toBe('Župan');
    expect(decodeLatex('\\v c \\v s \\v z')).toBe('č š ž');
    expect(decodeLatex('{\\dj}ivot')).toBe('đivot');
  });
  it('cisti escape i viticaste zagrade za zastitu velikih slova', () => {
    expect(decodeLatex('{DNA} \\& RNA')).toBe('DNA & RNA');
  });
});

describe('parseReferenceFile — BibTeX', () => {
  it('clanak s DOI-jem: mapira polja i normalizira stranice', () => {
    const bib = `@article{horvat2019,
      author = {Horvat, Ana and Marić, Petar},
      title = {Analiza podataka},
      journal = {Društvena istraživanja},
      year = {2019},
      volume = {28},
      number = {3},
      pages = {45--67},
      doi = {10.1234/abc}
    }`;
    const [r] = parseReferenceFile(bib);
    expect(r.source).toBe('bibtex');
    expect(r.type).toBe('clanak');
    expect(r.fields.authors).toBe('Horvat, Ana; Marić, Petar');
    expect(r.fields.title).toBe('Analiza podataka');
    expect(r.fields.container).toBe('Društvena istraživanja');
    expect(r.fields.year).toBe('2019');
    expect(r.fields.volume).toBe('28');
    expect(r.fields.issue).toBe('3');
    expect(r.fields.pages).toBe('45-67');
    expect(r.fields.doi).toBe('10.1234/abc');
  });

  it('knjiga: address -> mjesto, dekodira LaTeX u naslovu', () => {
    const bib = '@book{k1, author={Kova\\v{c}i\\\'{c}, Ivan}, title={Ba\\v{s}tina i identitet}, publisher={Naklada Slap}, address={Zagreb}, year={2020}}';
    const [r] = parseReferenceFile(bib);
    expect(r.type).toBe('knjiga');
    expect(r.fields.authors).toBe('Kovačić, Ivan');
    expect(r.fields.title).toBe('Baština i identitet');
    expect(r.fields.publisher).toBe('Naklada Slap');
    expect(r.fields.place).toBe('Zagreb');
  });

  it('poglavlje (incollection): booktitle -> container, editor', () => {
    const bib = '@incollection{c1, author={Marić, P.}, title={Poglavlje}, booktitle={Zbornik radova}, editor={Urednik, A.}, publisher={FF Press}, address={Split}, pages={33--50}, year={2018}}';
    const [r] = parseReferenceFile(bib);
    expect(r.type).toBe('poglavlje');
    expect(r.fields.container).toBe('Zbornik radova');
    expect(r.fields.editor).toBe('Urednik, A.');
    expect(r.fields.pages).toBe('33-50');
  });

  it('phdthesis -> zavrsni, school -> institution', () => {
    const bib = '@phdthesis{t1, author={Ivić, Iva}, title={Doktorat}, school={Filozofski fakultet}, year={2021}}';
    const [r] = parseReferenceFile(bib);
    expect(r.type).toBe('zavrsni');
    expect(r.fields.institution).toBe('Filozofski fakultet');
  });

  it('preskace @comment/@string i vise unosa', () => {
    const bib = '@string{ff = {Filozofski}}\n@book{a, title={Prva}, year={2000}}\n@book{b, title={Druga}, year={2001}}';
    const refs = parseReferenceFile(bib);
    expect(refs.map((r) => r.fields.title)).toEqual(['Prva', 'Druga']);
  });
});

describe('parseReferenceFile — RIS', () => {
  it('clanak: vise autora, SP+EP -> raspon stranica', () => {
    const ris = ['TY  - JOUR', 'AU  - Horvat, Ana', 'AU  - Marić, Petar', 'TI  - Analiza podataka',
      'T2  - Društvena istraživanja', 'PY  - 2019', 'VL  - 28', 'IS  - 3', 'SP  - 45', 'EP  - 67',
      'DO  - 10.1234/abc', 'ER  - '].join('\n');
    const [r] = parseReferenceFile(ris);
    expect(r.source).toBe('ris');
    expect(r.type).toBe('clanak');
    expect(r.fields.authors).toBe('Horvat, Ana; Marić, Petar');
    expect(r.fields.container).toBe('Društvena istraživanja');
    expect(r.fields.year).toBe('2019');
    expect(r.fields.pages).toBe('45-67');
    expect(r.fields.doi).toBe('10.1234/abc');
  });

  it('knjiga: BOOK -> knjiga, CY -> mjesto', () => {
    const ris = ['TY  - BOOK', 'AU  - Kovačić, Ivan', 'TI  - Politički sustavi', 'PB  - Fakultet političkih znanosti',
      'CY  - Zagreb', 'PY  - 2020', 'ER  - '].join('\n');
    const [r] = parseReferenceFile(ris);
    expect(r.type).toBe('knjiga');
    expect(r.fields.place).toBe('Zagreb');
    expect(r.fields.publisher).toBe('Fakultet političkih znanosti');
  });

  it('PY s repom (2019///) -> cetveroznamenkasta godina', () => {
    const ris = 'TY  - JOUR\nTI  - X\nPY  - 2019///\nER  -';
    const [r] = parseReferenceFile(ris);
    expect(r.fields.year).toBe('2019');
  });
});

describe('parseReferenceFile — CSL-JSON', () => {
  it('article-journal: author family/given -> "Prezime, Ime"; issued -> godina', () => {
    const csl = JSON.stringify([{
      type: 'article-journal',
      author: [{ family: 'Horvat', given: 'Ana' }, { family: 'Marić', given: 'Petar' }],
      title: 'Analiza podataka',
      'container-title': 'Društvena istraživanja',
      issued: { 'date-parts': [[2019, 3, 1]] },
      volume: '28', issue: '3', page: '45-67', DOI: '10.1234/abc',
    }]);
    const [r] = parseReferenceFile(csl);
    expect(r.source).toBe('csl');
    expect(r.type).toBe('clanak');
    expect(r.fields.authors).toBe('Horvat, Ana; Marić, Petar');
    expect(r.fields.year).toBe('2019');
    expect(r.fields.pages).toBe('45-67');
    expect(r.fields.doi).toBe('10.1234/abc');
  });

  it('book s literal autorom (ustanova) i chapter tipom', () => {
    const csl = JSON.stringify([
      { type: 'book', author: [{ literal: 'Državni zavod za statistiku' }], title: 'Statistički ljetopis', issued: { 'date-parts': [[2022]] } },
      { type: 'chapter', title: 'Poglavlje', 'container-title': 'Zbornik', editor: [{ family: 'Urednik', given: 'Ana' }] },
    ]);
    const refs = parseReferenceFile(csl);
    expect(refs[0].type).toBe('knjiga');
    expect(refs[0].fields.authors).toBe('Državni zavod za statistiku');
    expect(refs[1].type).toBe('poglavlje');
    expect(refs[1].fields.editor).toBe('Urednik, Ana');
  });

  it('jedan objekt (ne niz) se prihvaca', () => {
    const [r] = parseReferenceFile('{"type":"book","title":"Sama"}');
    expect(r.fields.title).toBe('Sama');
  });
});

describe('round-trip: uvoz -> render u opcem stilu', () => {
  it('BibTeX knjiga -> APA sadrzi autora, godinu i naslov', () => {
    const [r] = parseReferenceFile('@book{k, author={Kovačić, Ivan}, title={Politički sustavi}, address={Zagreb}, publisher={FPZG}, year={2020}}');
    const apa = render(r, 'apa');
    expect(apa).toContain('Kovačić');
    expect(apa).toContain('(2020)');
    expect(apa).toContain('Politički sustavi');
  });

  it('CSL clanak -> Harvard sadrzi casopis i stranice', () => {
    const csl = JSON.stringify([{ type: 'article-journal', author: [{ family: 'Horvat', given: 'Ana' }], title: 'Analiza', 'container-title': 'DI', issued: { 'date-parts': [[2019]] }, volume: '28', page: '45-67' }]);
    const [r] = parseReferenceFile(csl);
    const harvard = render(r, 'harvard');
    expect(harvard).toContain('Horvat');
    expect(harvard).toContain('DI');
    expect(harvard).toContain('45-67');
  });
});

describe('rubni slucajevi', () => {
  it('prazan i nevaljan ulaz -> []', () => {
    expect(parseReferenceFile('')).toEqual([]);
    expect(parseReferenceFile('   ')).toEqual([]);
    expect(parseReferenceFile('nije referenca, obican tekst')).toEqual([]);
    expect(parseReferenceFile('[{ ovo nije valjan json')).toEqual([]);
  });

  it('nepoznat CSL tip -> knjiga (najsira pretpostavka)', () => {
    const [r] = parseReferenceFile('[{"type":"totalno-nepoznat","title":"X"}]');
    expect(r.type).toBe('knjiga');
  });

  it('eksplicitni hint nadjacava detekciju', () => {
    // BibTeX sadrzaj, ali hint 'ris' -> nista (ne pokusava krivi parser na krivom formatu)
    expect(parseReferenceFile('@book{x, title={Y}}', 'ris')).toEqual([]);
  });
});
