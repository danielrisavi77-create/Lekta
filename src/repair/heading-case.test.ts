import { describe, it, expect } from 'vitest';
import {
  toCroatianUpper,
  isAlreadyUpper,
  upperCaseHeadings,
  headingCaseSuggestions,
  headingNumberSuggestions,
} from './heading-case';

const heading = (level: number, text: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const body = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('toCroatianUpper', () => {
  it('postuje hrvatska pravila (dj mora dati Dj s crticom, ne D)', () => {
    expect(toCroatianUpper('đačko čudo šuma žito ćup')).toBe('ĐAČKO ČUDO ŠUMA ŽITO ĆUP');
  });

  it('NE kvari XML entitete (&amp; ne smije postati &AMP;)', () => {
    expect(toCroatianUpper('pravo &amp; politika')).toBe('PRAVO &amp; POLITIKA');
    expect(toCroatianUpper('a &#233; b')).toBe('A &#233; B');
  });

  it('RE-09: cuva HEKSADECIMALNU XML referencu (&#x161; ne smije postati &#X161;)', () => {
    expect(toCroatianUpper('a &#x161; b')).toBe('A &#x161; B');
  });
});

describe('isAlreadyUpper', () => {
  it('prepoznaje vec velika slova i ne broji brojeve ni interpunkciju', () => {
    expect(isAlreadyUpper('UVOD')).toBe(true);
    expect(isAlreadyUpper('1. UVOD U TEMU')).toBe(true);
    expect(isAlreadyUpper('Uvod')).toBe(false);
  });
});

describe('upperCaseHeadings', () => {
  it('mijenja SAMO naslove trazenih razina, tijelo i druge razine ostaju netaknuti', () => {
    const xml = `<w:body>${heading(1, 'Uvod')}${body('Tekst tijela ostaje malim slovima.')}${heading(2, 'Razrada')}</w:body>`;
    const r = upperCaseHeadings(xml, [1]);

    expect(r.applied).toBe(true);
    expect(r.changed).toBe(1);
    expect(r.xml).toContain('<w:t>UVOD</w:t>');
    expect(r.xml).toContain('Tekst tijela ostaje malim slovima.');
    expect(r.xml).toContain('<w:t>Razrada</w:t>'); // razina 2 nije trazena
  });

  it('naslov koji je VEC velikim slovima nije promjena (idempotentno)', () => {
    const xml = `<w:body>${heading(1, 'UVOD')}</w:body>`;
    const r = upperCaseHeadings(xml, [1]);
    expect(r.applied).toBe(false);
    expect(r.changed).toBe(0);
    expect(r.xml).toBe(xml);
  });

  it('ponovna primjena nad vec popravljenim dokumentom je no-op', () => {
    const xml = `<w:body>${heading(1, 'Uvod')}</w:body>`;
    const once = upperCaseHeadings(xml, [1]);
    const twice = upperCaseHeadings(once.xml, [1]);
    expect(twice.applied).toBe(false);
    expect(twice.xml).toBe(once.xml);
  });

  it('cuva oblikovanje runova i vise runova u istom naslovu', () => {
    const xml = '<w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Prvi </w:t></w:r><w:r><w:t>dio</w:t></w:r></w:p></w:body>';
    const r = upperCaseHeadings(xml, [1]);
    expect(r.xml).toContain('<w:b/>');
    expect(r.xml).toContain('<w:t>PRVI </w:t>');
    expect(r.xml).toContain('<w:t>DIO</w:t>');
  });

  it('bez trazenih razina ne dira nista', () => {
    const xml = `<w:body>${heading(1, 'Uvod')}</w:body>`;
    expect(upperCaseHeadings(xml, []).applied).toBe(false);
  });

  it('RE-10: odlomak demotiran s Heading1 na Normal (bez trenutnog pStyle) se ne tretira kao naslov, cak ni uz stari stil zarobljen u w:pPrChange', () => {
    const demoted =
      '<w:p><w:pPr><w:pPrChange w:id="1" w:author="M" w:date="2026-01-01T00:00:00Z">' +
      '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr></w:pPrChange></w:pPr>' +
      '<w:r><w:t>Tekst koji vise nije naslov</w:t></w:r></w:p>';
    const xml = `<w:body>${demoted}</w:body>`;
    const r = upperCaseHeadings(xml, [1]);
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });
});

describe('prijedlozi (bez ijedne izmjene dokumenta)', () => {
  const headings = [
    { level: 1, text: 'Uvod' },
    { level: 2, text: 'Metodologija' },
    { level: 1, text: 'ZAKLJUČAK' },
  ];

  it('velika slova: predlaze samo ono sto stvarno nije veliko, i to za trazene razine', () => {
    const s = headingCaseSuggestions(headings, [1]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ level: 1, from: 'Uvod', to: 'UVOD' });
  });

  it('numeriranje: racuna hijerarhiju po dokument-poretku i uklanja postojecu oznaku', () => {
    const s = headingNumberSuggestions([
      { level: 1, text: 'Uvod' },
      { level: 2, text: 'Pregled' },
      { level: 2, text: '5. Metode' },
      { level: 1, text: 'Zaključak' },
    ]);
    expect(s.map((x) => x.to)).toEqual(['1. Uvod', '1.1. Pregled', '1.2. Metode', '2. Zaključak']);
  });
});
