import { describe, expect, it } from 'vitest';
import { titlePageFixer, type DocxXmlParts } from './fixers';

const parts = (documentXml: string): DocxXmlParts => ({
  documentXml,
  stylesXml: '<w:styles/>',
});

describe('titlePageFixer', () => {
  it('regenerira samo omeđenu prvu stranicu i skriva broj kroz titlePg', () => {
    // Ulaz nosi ISTI tekst koji predlozak slaze, samo u pogresnom redoslijedu i bez oblikovanja.
    // Do 2026-09-13 su ovdje stajali 'Stari fakultet' i 'Stari naslov', dakle tekst koji u
    // predlosku ne postoji; fixer ga je brisao, a fixtura je to ozakonjivala. Vodic taj popravak
    // NE ubraja medju pet kojima je promjena vidljivog teksta dopustena (vidi
    // `tests/repair-title-page-visible-text.test.ts`), pa takav ulaz opisuje zabranjen ishod.
    const documentXml = '<w:document><w:body>' +
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Novi naslov</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Fakultet</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Tekst rada koji mora ostati.</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Tablica</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
      '</w:body></w:document>';
    const result = titlePageFixer(parts(documentXml), {
      paragraphCount: 2,
      ensureTitlePageNoNumber: true,
      marginsCm: { top: 2, right: 2.5, bottom: 2, left: 2.5 },
      lines: [
        { role: 'faculty', text: 'Fakultet', group: 0, style: { font: 'Times New Roman', sizePt: 12, bold: true, align: 'center' } },
        { role: 'title', text: 'Novi naslov', group: 1, style: { font: 'Times New Roman', sizePt: 16, align: 'center' } },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('>Fakultet</w:t>');
    expect(result.parts.documentXml).toContain('>Novi naslov</w:t>');
    expect(result.parts.documentXml).toContain('Tekst rada koji mora ostati.');
    expect(result.parts.documentXml).toContain('<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Tablica</w:t>');
    expect(result.parts.documentXml).toContain('<w:titlePg/>');
    expect(result.parts.documentXml).toContain('<w:pgMar w:top="1134" w:right="1418" w:bottom="1134" w:left="1418"/>');
    expect(result.parts.documentXml).toContain('<w:jc w:val="center"/>');
    expect(result.parts.documentXml).toContain('<w:rFonts w:ascii="Times New Roman"');
    expect(result.parts.documentXml).toContain('<w:spacing w:before="120"/>');

    const again = titlePageFixer(result.parts, {
      paragraphCount: 2,
      ensureTitlePageNoNumber: true,
      lines: [
        { role: 'faculty', text: 'Fakultet', group: 0, style: { font: 'Times New Roman', sizePt: 12, bold: true, align: 'center' } },
        { role: 'title', text: 'Novi naslov', group: 1, style: { font: 'Times New Roman', sizePt: 16, align: 'center' } },
      ],
    });
    expect(again.applied).toBe(false);
    expect(again.reason).toBe('already-ok');
  });

  it('ne dira naslovnicu s poljem, slikom ili tracked-change strukturom', () => {
    const documentXml = '<w:document><w:body><w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p><w:sectPr/></w:body></w:document>';
    const result = titlePageFixer(parts(documentXml), {
      paragraphCount: 1,
      lines: [{ text: 'Naslov' }],
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(documentXml);
  });

  /**
   * ULAZ KOJI OBARA POSTOJECU INVARIJANTU, prepisan iz stvarnog dokumenta.
   *
   * Prva fixtura ovog testa vec tvrdi idempotenciju, ali ima `paragraphCount === lines.length`, pa
   * je slucaj koji kvari NIKAD ne proizvodi. Oblik ispod je doslovno onaj iz
   * `tests/fixtures/docx/pravo-integrirani-fusnote.docx` (mjereno 2026-09-13): naslovnica ima DEVET
   * odlomaka od kojih je deveti samo nositelj prijeloma stranice
   * (`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`), a predlozak `pravo-graduate` daje OSAM redaka.
   *
   * Prije popravka je isti zahtjev:
   *   - u prvom prolazu progutao odlomak s prijelomom, pa prva stranica vise nije bila omedjena
   *     (`title.order` i `title.layout` su s 3/3 pali na nebodovano 0/0), i
   *   - u drugom prolazu s `paragraphCount: 9` zahvatio osam generiranih redaka PLUS "1. UVOD" i
   *     prvi odlomak uvoda, dakle obrisao tijelo rada.
   */
  const REAL_BREAK_PARAGRAPH = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  const front = (text: string) => `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  const realDocumentXml = '<w:document><w:body>'
    + front('SVEUČILIŠTE U ZAGREBU')
    + front('PRAVNI FAKULTET')
    + front('Integrirani preddiplomski i diplomski studij prava')
    + front('Ime Prezime')
    + front('NASLOV DIPLOMSKOGA RADA')
    + front('DIPLOMSKI RAD')
    + front('Mentor: prof. dr. sc. Ime Mentora')
    + front('Zagreb, 2026.')
    + REAL_BREAK_PARAGRAPH
    + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">1. Uvod</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t xml:space="preserve">Uvodni odlomak upucuje na propis i na raniji rad.</w:t></w:r></w:p>'
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
    + '</w:body></w:document>';
  const realTarget = () => ({
    paragraphCount: 9,
    ensureTitlePageNoNumber: true,
    lines: [
      { role: 'university', text: 'SVEUČILIŠTE U ZAGREBU', group: 0, style: { font: 'Times New Roman', sizePt: 12, bold: true, align: 'center' as const } },
      { role: 'faculty', text: 'PRAVNI FAKULTET', group: 0, style: { font: 'Times New Roman', sizePt: 12, align: 'center' as const } },
      // `study` je u predlosku `pravo-graduate` OBAVEZNA uloga (izmjereno u
      // `data/title-pages/templates-heavy.json`: university*, faculty*, study*, author*, worktype,
      // title*, mentor*, placeyear*). Do 2026-09-13 je ovdje nedostajala, pa je fixtura opisivala
      // model koji odlomak sa studijem NE pokriva, a fixer ga je brisao iz dokumenta.
      { role: 'study', text: 'Integrirani preddiplomski i diplomski studij prava', group: 0, style: { font: 'Times New Roman', sizePt: 12, align: 'center' as const } },
      { role: 'author', text: 'Ime Prezime', group: 1, style: { font: 'Times New Roman', sizePt: 12, bold: true, align: 'center' as const } },
      { role: 'worktype', text: 'DIPLOMSKI RAD', group: 2, style: { font: 'Times New Roman', sizePt: 12, align: 'center' as const } },
      { role: 'title', text: 'NASLOV DIPLOMSKOGA RADA', group: 3, style: { font: 'Times New Roman', sizePt: 20, bold: true, align: 'center' as const } },
      { role: 'mentor', text: 'Mentor: prof. dr. sc. Ime Mentora', group: 4, style: { font: 'Times New Roman', sizePt: 12, align: 'center' as const } },
      { role: 'placeyear', text: 'Zagreb, 2026.', group: 5, style: { font: 'Times New Roman', sizePt: 12, align: 'center' as const } },
    ],
  });

  it('cuva prijelom kojim je prva stranica omedjena (9 odlomaka -> 8 redaka predloska)', () => {
    const result = titlePageFixer(parts(realDocumentXml), realTarget());
    expect(result.applied).toBe(true);
    // Sidro je i dalje u dokumentu, i to bajt-identicno: bez njega analiza gubi `confident` prvu
    // stranicu i s njom bodovanje redoslijeda i rasporeda naslovnice.
    expect(result.parts.documentXml).toContain(REAL_BREAK_PARAGRAPH);
    // Tijelo rada iza sidra je netaknuto.
    expect(result.parts.documentXml).toContain('>1. Uvod</w:t>');
    expect(result.parts.documentXml).toContain('Uvodni odlomak upucuje na propis i na raniji rad.');
    // Prijelom je TOCNO jedan; kanonski nositelj se ne dodaje uz sacuvani.
    expect(result.parts.documentXml.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
  });

  it('drugi prolaz istim zahtjevom je no-op i ne dira tijelo rada', () => {
    const first = titlePageFixer(parts(realDocumentXml), realTarget());
    expect(first.applied).toBe(true);
    const second = titlePageFixer(first.parts, realTarget());
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
    expect(second.parts.documentXml).toBe(first.parts.documentXml);
    expect(second.parts.documentXml).toContain('>1. Uvod</w:t>');
  });

  it('nositelj sidra koji uz prijelom nosi i tekst naslovnice zamjenjuje se kanonskim', () => {
    // Isti oblik kao u `tests/repair-closed-loop-titlepage.test.ts`: prijelom je u odlomku s tekstom.
    // Nositelj sidra nosi tekst koji predlozak SLAZE ('Zagreb, 2026.'), pa se odlomak smije svesti
    // na kanonski prijelom: isti tekst se vraca kao generirani redak. Ranija fixtura je ondje imala
    // 'Stari redak', tekst kojeg u predlosku nema, i tvrdila da nestane; to je opis brisanja
    // vidljivog teksta, a ne popravka forme.
    const documentXml = '<w:document><w:body>'
      + '<w:p><w:r><w:t>Naslov rada</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>Zagreb, 2026.</w:t><w:br w:type="page"/></w:r></w:p>'
      + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>Tijelo teksta rada nakon naslovnice.</w:t></w:r></w:p>'
      + '</w:body></w:document>';
    const target = () => ({
      paragraphCount: 2,
      lines: [
        { role: 'university', text: 'Sveučilište u Zagrebu', group: 0 },
        { role: 'faculty', text: 'Fakultet političkih znanosti', group: 0 },
        { role: 'title', text: 'Naslov rada', group: 1 },
        { role: 'placeyear', text: 'Zagreb, 2026.', group: 2 },
      ],
    });
    const first = titlePageFixer(parts(documentXml), target());
    expect(first.applied).toBe(true);
    expect(first.parts.documentXml).toContain(REAL_BREAK_PARAGRAPH);
    // Nositelj je sveden na kanonski prijelom, ali njegov tekst nije nestao iz dokumenta.
    expect(first.parts.documentXml.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
    expect(first.parts.documentXml).toContain('Tijelo teksta rada nakon naslovnice.');
    // Predlozak ima VISE redaka nego sto je odlomaka zahvaceno; nijedan se ne smije izgubiti.
    expect(first.parts.documentXml).toContain('>Zagreb, 2026.</w:t>');
    const second = titlePageFixer(first.parts, target());
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
    expect(second.parts.documentXml).toContain('>Uvod</w:t>');
  });

  /**
   * POCETAK RASPONA. Sve do 2026-09-13 se pretpostavljao kao odlomak 0, pa je prepis odnosio i ono
   * sto je IZNAD naslovnice. Izmjereno na `tests/fixtures/docx-authored/pravo--final--prijediplomski--neuredan.docx`:
   * rucno pisan sadrzaj (sest odlomaka) nestao je zajedno s naslovnicom.
   */
  it('sadrzaj iznad naslovnice ostaje netaknut', () => {
    const documentXml = '<w:document><w:body>'
      + front('SADRŽAJ')
      + front('1. UVOD 3')
      + front('SVEUČILIŠTE U ZAGREBU')
      + front('PRAVNI FAKULTET')
      + REAL_BREAK_PARAGRAPH
      + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">1. Uvod</w:t></w:r></w:p>'
      + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>'
      + '</w:body></w:document>';
    const target = () => ({
      paragraphCount: 5,
      lines: [
        { role: 'university', text: 'SVEUČILIŠTE U ZAGREBU', group: 0, style: { align: 'center' as const } },
        { role: 'faculty', text: 'PRAVNI FAKULTET', group: 0, style: { align: 'center' as const } },
      ],
    });
    const result = titlePageFixer(parts(documentXml), target());
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('>SADRŽAJ</w:t>');
    expect(result.parts.documentXml).toContain('>1. UVOD 3</w:t>');
    expect(result.parts.documentXml).toContain('>1. Uvod</w:t>');
    // Sidro je sacuvano i nije udvostruceno.
    expect(result.parts.documentXml.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
    // Drugi prolaz nad vlastitim izlazom ne smije ici dalje prema gore.
    const second = titlePageFixer(result.parts, target());
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
    expect(second.parts.documentXml).toContain('>SADRŽAJ</w:t>');
  });

  /**
   * ODBIJANJE UMJESTO POGADJANJA. Kad predlozak ne pokriva svaki odlomak naslovnice, pocetak
   * raspona nije odrediv: ono sto nije prepoznato bilo bi obrisano. Izmjereno na istom
   * `--neuredan` primjerku, gdje `inferValues` ne prepoznaje studij, autora ni naslov rada.
   */
  it('nemapiran odlomak unutar naslovnice odbija popravak umjesto da ga obrise', () => {
    const documentXml = '<w:document><w:body>'
      + front('SVEUČILIŠTE U ZAGREBU')
      + front('PRAVNI FAKULTET')
      + front('Luka Perković')
      + REAL_BREAK_PARAGRAPH
      + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">1. Uvod</w:t></w:r></w:p>'
      + '</w:body></w:document>';
    const result = titlePageFixer(parts(documentXml), {
      paragraphCount: 4,
      lines: [
        { role: 'university', text: 'SVEUČILIŠTE U ZAGREBU', group: 0 },
        { role: 'faculty', text: 'PRAVNI FAKULTET', group: 0 },
      ],
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(documentXml);
  });

  it('Wordov trag renderiranja nije sidro nego odbijanje', () => {
    // `firstPageParagraphs` broji `<w:lastRenderedPageBreak/>` u `pageBreakAfter`, pa `paragraphCount`
    // moze pocivati iskljucivo na njemu. To je zapis o ZADNJEM slaganju stranice, ne autorova odluka,
    // i pomice se sa svakom izmjenom fonta ili margina; prepis vezan uz njega nema stabilno sidro.
    const documentXml = '<w:document><w:body>'
      + front('SVEUCILISTE U ZAGREBU')
      + front('PRAVNI FAKULTET')
      + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:lastRenderedPageBreak/><w:t>1. Uvod</w:t></w:r></w:p>'
      + '<w:p><w:r><w:t>Tijelo rada.</w:t></w:r></w:p>'
      + '</w:body></w:document>';
    const result = titlePageFixer(parts(documentXml), {
      paragraphCount: 3,
      lines: [
        { role: 'university', text: 'SVEUČILIŠTE U ZAGREBU', group: 0 },
        { role: 'faculty', text: 'PRAVNI FAKULTET', group: 0 },
      ],
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(documentXml);
  });
});
