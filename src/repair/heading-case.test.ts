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

  // RE-08: dosad SAMO doslovni pStyle="Heading{n}". Hrvatski Word/LibreOffice cesto ima vlastiti
  // (lokalizirani) styleId "Naslov1" umjesto "Heading1"; analiza i patchHeadingFormat vec prepoznaju
  // takav stil (id-ili-ime), pa je velika slova naslova bio JEDINI popravak koji je na takvom radu
  // ostajao tihi no-op iako profil trazi velika slova.
  it('RE-08: prepoznaje naslov po LOKALIZIRANOM styleId-u ("Naslov1"), uz stylesXml', () => {
    const stylesXml = '<w:styles><w:style w:type="paragraph" w:styleId="Naslov1"><w:name w:val="Naslov 1"/></w:style></w:styles>';
    const xml = `<w:body>${heading(1, 'Uvod').replace('Heading1', 'Naslov1')}</w:body>`;
    const r = upperCaseHeadings(xml, [1], stylesXml);
    expect(r.applied).toBe(true);
    expect(r.changed).toBe(1);
    expect(r.xml).toContain('<w:t>UVOD</w:t>');
  });

  it('RE-08: bez stylesXml (stari pozivi), lokalizirani "Naslov1" se i dalje NE prepoznaje (bez regresije)', () => {
    const xml = `<w:body>${heading(1, 'Uvod').replace('Heading1', 'Naslov1')}</w:body>`;
    const r = upperCaseHeadings(xml, [1]);
    expect(r.applied).toBe(false);
  });

  it('RE-08: literalni "Heading1" i dalje radi UZ stylesXml koji ga NE definira (bez regresije)', () => {
    const xml = `<w:body>${heading(1, 'Uvod')}</w:body>`;
    const r = upperCaseHeadings(xml, [1], '<w:styles></w:styles>');
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:t>UVOD</w:t>');
  });

  it('RE-08: prepoznaje naslov preko DIREKTNOG w:outlineLvl na odlomku (bez imenovanog stila)', () => {
    const outlineHeading = '<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>';
    const xml = `<w:body>${outlineHeading}</w:body>`;
    const r = upperCaseHeadings(xml, [1]);
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:t>UVOD</w:t>');
  });

  it('RE-08: outlineLvl izvan trazenih razina se ne dira', () => {
    const outlineHeading = '<w:p><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:r><w:t>Razrada</w:t></w:r></w:p>';
    const xml = `<w:body>${outlineHeading}</w:body>`;
    const r = upperCaseHeadings(xml, [1]);
    expect(r.applied).toBe(false);
  });

  // RE-08 dodatak (Codex adversarijalni nalaz #2): odlomak IMA prepoznat stil (Heading2, razina
  // nije trazena), ali NOSI I direktan (proturjecan) w:outlineLvl="0" na istom odlomku. Stil MORA
  // pobijediti; outlineLvl je rezerva SAMO kad NEMA prepoznatog stila, ne kad postoji ali je
  // "kriva" razina.
  it('RE-08: prepoznat stil (Heading2) pobjedjuje nad proturjecnim direktnim outlineLvl na ISTOM odlomku', () => {
    const xml = `<w:body><w:p><w:pPr><w:pStyle w:val="Heading2"/><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>Razrada</w:t></w:r></w:p></w:body>`;
    const r = upperCaseHeadings(xml, [1]); // trazena SAMO razina 1
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });

  // RE-08 dodatak (Codex adversarijalni nalaz #1/#3): ime/styleId koji SADRZI "heading"/"naslov"
  // kao dio duljeg, nepovezanog imena ne smije lazno pogoditi (regex mora biti usidren).
  it('RE-08: stil ciji NAZIV samo SADRZI "heading"/"naslov" (npr. "NotHeading1Body") ne pogadja lazno', () => {
    const stylesXml = '<w:styles><w:style w:type="paragraph" w:styleId="Custom1"><w:name w:val="NotHeading1Body"/></w:style></w:styles>';
    const xml = `<w:body><w:p><w:pPr><w:pStyle w:val="Custom1"/></w:pPr><w:r><w:t>Obican tekst</w:t></w:r></w:p></w:body>`;
    const r = upperCaseHeadings(xml, [1], stylesXml);
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });

  // RE-08 dodatak (Codex adversarijalni nalaz, drugi krug): stil s heading-nalik styleId-em
  // ("Naslov2") ALI nepovezanim/generickim imenom ("Custom") mora se prepoznati preko STYLEID-A;
  // provjera SAMO imena (kad ono postoji) bi ostavila ovaj stil "neprepoznatim", pa bi proturjecan
  // direktan outlineLvl na istom odlomku lazno otvorio outlineLvl rezervu (vidi test iznad).
  it('RE-08: prepoznaje stil preko STYLEID-A i kad ime NIJE heading-nalik (npr. "Naslov2" / ime "Custom")', () => {
    const stylesXml = '<w:styles><w:style w:type="paragraph" w:styleId="Naslov2"><w:name w:val="Custom"/></w:style></w:styles>';
    // Naslov2 (razina 2) NIJE trazena razina (trazimo [1]), ALI odlomak nosi i proturjecan
    // direktan outlineLvl=0: stil MORA pobijediti preko styleId-a, outline rezerva se ne smije otvoriti.
    const xml = '<w:body><w:p><w:pPr><w:pStyle w:val="Naslov2"/><w:outlineLvl w:val="0"/></w:pPr><w:r><w:t>Razrada</w:t></w:r></w:p></w:body>';
    const r = upperCaseHeadings(xml, [1], stylesXml);
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
