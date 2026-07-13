import { describe, it, expect } from 'vitest';
import { stripOrphanedEmptyParagraphs } from './paragraph-cleanup';

// Golden testovi za ciscenje osirotjelih praznih odlomaka: svaka zastita ima
// test koji dokazuje da se NE dira ono sto ne smije, isti stil kao run-level.test.ts.

const p = (inner = '', attrs = '') => `<w:p${attrs}>${inner}</w:p>`;
const run = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t>${text}</w:t></w:r>`;

describe('stripOrphanedEmptyParagraphs: osnovni slucaj', () => {
  it('kolabira 5 uzastopnih potpuno praznih odlomaka na 1, tekstualni odlomci prezivljavaju bajt-identicno', () => {
    const before = p(run('Uvod'));
    const after = p(run('Poglavlje 1'));
    const xml = '<w:body>' + before + p() + p() + p() + p() + p() + after + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(4);
    expect(r.runsCollapsed).toBe(1);
    expect(r.xml).toContain(before);
    expect(r.xml).toContain(after);
    expect(r.xml.match(/<w:p><\/w:p>|<w:p\/>/g)).toHaveLength(1);
  });
});

describe('stripOrphanedEmptyParagraphs: prijelom stranice dijeli run', () => {
  it('odlomak sa samo w:br type page prezivljava i dijeli okolne prazne u dva odvojena runa', () => {
    const breakParagraph = p('<w:r><w:br w:type="page"/></w:r>');
    const xml =
      '<w:body>' +
      p() + // 1: prazan (usamljen do sada, ali dio runa "prije")
      p() + // 2: prazan
      breakParagraph + // prijelom stranice: NE dira se, dijeli runove
      p() + // 3: prazan
      p() + // 4: prazan
      '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.xml).toContain(breakParagraph); // prijelom prezivljava bajt-identican
    expect(r.runsCollapsed).toBe(2); // dva odvojena runa, svaki kolabira na 1
    expect(r.paragraphsRemoved).toBe(2); // po jedan visak u svakom runu
  });
});

describe('stripOrphanedEmptyParagraphs: oznake (bookmarks)', () => {
  it('odlomak sa samo w:bookmarkStart/w:bookmarkEnd nikad se ne brise, cak ni uz susjedne prazne', () => {
    const bookmarkParagraph = p('<w:bookmarkStart w:id="0" w:name="_Toc1"/><w:bookmarkEnd w:id="0"/>');
    const xml = '<w:body>' + p() + p() + bookmarkParagraph + p() + p() + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(bookmarkParagraph);
  });
});

describe('stripOrphanedEmptyParagraphs: prijelom odjeljka (w:sectPr)', () => {
  it('odlomak s w:sectPr u w:pPr se nikad ne brise, cak ni usred inace kvalificirajuceg runa', () => {
    const sectPr =
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:bottom="1417"/></w:sectPr>';
    const sectionBreakParagraph = p(`<w:pPr>${sectPr}</w:pPr>`);
    const xml = '<w:body>' + p() + p() + sectionBreakParagraph + p() + p() + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(sectionBreakParagraph);
    expect(r.xml).toContain(sectPr); // sadrzaj sectPr bajt-identican
  });
});

describe('stripOrphanedEmptyParagraphs: stilizirani naslov', () => {
  it('prazan odlomak sa stilom Heading1 (bez teksta) prezivljava netaknut', () => {
    const heading = p('<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>');
    const xml = '<w:body>' + p() + p() + heading + p() + p() + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(heading);
  });
});

describe('stripOrphanedEmptyParagraphs: polja (fields)', () => {
  it('odlomak sa samo w:fldSimple (PAGE/TOC polje) bez vidljivog teksta prezivljava', () => {
    // Cache rezultata polja namjerno prazan (kao odmah nakon umetanja, prije
    // Wordovog preracunavanja): bez cuvara nad w:fldSimple, pravilo (e) bi ga
    // samo po sebi vec smatralo praznim i pogresno ga kvalificiralo.
    const fieldParagraph = p('<w:fldSimple w:instr="PAGE"><w:r><w:t></w:t></w:r></w:fldSimple>');
    const xml = '<w:body>' + p() + p() + fieldParagraph + p() + p() + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(fieldParagraph);
  });

  it('odlomak sa w:fldChar + w:instrText mehanikom polja bez staticnog teksta prezivljava', () => {
    const fieldParagraph = p(
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>',
    );
    const xml = '<w:body>' + p() + p() + fieldParagraph + p() + p() + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(fieldParagraph);
  });
});

describe('stripOrphanedEmptyParagraphs: fusnote/biljeske reference', () => {
  it('odlomak sa samo w:footnoteReference bez drugog teksta prezivljava', () => {
    const footnoteParagraph = p('<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="3"/></w:r>');
    const xml = '<w:body>' + p() + p() + footnoteParagraph + p() + p() + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(footnoteParagraph);
  });

  it('odlomak sa samo w:commentReference bez drugog teksta prezivljava', () => {
    const commentParagraph = p('<w:r><w:commentReference w:id="1"/></w:r>');
    const xml = '<w:body>' + p() + p() + commentParagraph + p() + p() + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(commentParagraph);
  });
});

describe('stripOrphanedEmptyParagraphs: zasticene zone (tablice, okviri, sdt)', () => {
  it('prazni odlomci UNUTAR celije tablice ostaju potpuno netaknuti, dok identican niz IZVAN tablice kolabira', () => {
    const outerEmpties = p() + p(); // izvan tablice: kvalificiraju se, run duljine 2 kolabira
    const cellEmpties = p() + p() + p(); // unutar celije: zasticena zona, run duljine 3 netaknut
    const xml =
      '<w:body>' +
      p(run('prije')) +
      outerEmpties +
      '<w:tbl><w:tr><w:tc>' +
      cellEmpties +
      '</w:tc></w:tr></w:tbl>' +
      p(run('poslije')) +
      '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(1); // samo izvan tablice: 2 -> 1
    expect(r.runsCollapsed).toBe(1);
    expect(r.xml).toContain('<w:tbl><w:tr><w:tc>' + cellEmpties + '</w:tc></w:tr></w:tbl>'); // celija bajt-identicna
  });

  it('prazni odlomci unutar w:txbxContent ostaju netaknuti (isti zasticeni raspon kao tablice)', () => {
    const boxEmpties = p() + p() + p();
    const xml =
      '<w:body>' +
      p(run('prije')) +
      p(`<w:r><w:drawing><w:txbxContent>${boxEmpties}</w:txbxContent></w:drawing></w:r>`) +
      p(run('poslije')) +
      '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(boxEmpties);
  });

  it('prazni odlomci unutar w:sdt ostaju netaknuti (isti zasticeni raspon)', () => {
    const sdtEmpties = p() + p() + p();
    const xml =
      '<w:body>' +
      p(run('prije')) +
      `<w:sdt><w:sdtContent>${sdtEmpties}</w:sdtContent></w:sdt>` +
      p(run('poslije')) +
      '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.xml).toContain(sdtEmpties);
  });
});

describe('stripOrphanedEmptyParagraphs: usamljeni prazan odlomak', () => {
  it('jedan prazan odlomak izmedju dva teksta se NE dira, applied ostaje false, xml identican', () => {
    const xml = '<w:body>' + p(run('prije')) + p() + p(run('poslije')) + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(false);
    expect(r.paragraphsRemoved).toBe(0);
    expect(r.xml).toBe(xml);
  });
});

describe('stripOrphanedEmptyParagraphs: samozatvarajuci <w:p/>', () => {
  it('samozatvarajuci <w:p w:rsidR="00AA"/> ne guta sljedeci stilizirani odlomak', () => {
    const xml =
      '<w:body><w:p w:rsidR="00AA"/>' +
      p('<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + run('Naslov')) +
      '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    // Samo jedan prazan odlomak (samozatvarajuci) bez kvalificirajuceg susjeda
    // istog runa: usamljen je, applied ostaje false, naslov netaknut. Ovo i dalje
    // vrijedi nakon sto samozatvarajuci oblik postao "vidljiv" scanneru (qualifies=true
    // za taj jedan match): duljina niza je 1, a runovi duljine 1 se nikad ne kolabiraju,
    // pa je applied=false ovdje dokaz run-length guarda, ne dokaz da je odlomak
    // nevidljiv scanneru.
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });

  it('5 uzastopnih potpuno samozatvarajucih <w:p/> izmedju dva teksta kolabira na 1 prezivjeli', () => {
    const before = p(run('Uvod'));
    const after = p(run('Poglavlje 1'));
    const selfClosing = '<w:p/>';
    const xml = '<w:body>' + before + selfClosing.repeat(5) + after + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(4);
    expect(r.runsCollapsed).toBe(1);
    expect(r.xml).toContain(before);
    expect(r.xml).toContain(after);
    expect(r.xml.match(/<w:p\/>/g)).toHaveLength(1);
  });

  it('samozatvarajuci prazni odlomci UNUTAR celije tablice ostaju netaknuti, dok identican niz IZVAN kolabira', () => {
    const outerEmpties = '<w:p/><w:p/>'; // izvan tablice: kvalificira se, run duljine 2 kolabira
    const cellEmpties = '<w:p/><w:p/><w:p/>'; // unutar celije: zasticena zona, run duljine 3 netaknut
    const xml =
      '<w:body>' +
      p(run('prije')) +
      outerEmpties +
      '<w:tbl><w:tr><w:tc>' +
      cellEmpties +
      '</w:tc></w:tr></w:tbl>' +
      p(run('poslije')) +
      '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(1); // samo izvan tablice: 2 -> 1
    expect(r.runsCollapsed).toBe(1);
    expect(r.xml).toContain('<w:tbl><w:tr><w:tc>' + cellEmpties + '</w:tc></w:tr></w:tbl>'); // celija bajt-identicna
  });

  it('mijesani niz samozatvarajucih i uparenih-ali-praznih odlomaka kolabira ZAJEDNO kao jedan run', () => {
    const before = p(run('Uvod'));
    const after = p(run('Poglavlje 1'));
    // <w:p/> (samozatvarajuci), <w:p></w:p> (upareni prazan), <w:p/> (samozatvarajuci)
    const mixed = '<w:p/>' + p() + '<w:p/>';
    const xml = '<w:body>' + before + mixed + after + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(2);
    expect(r.runsCollapsed).toBe(1);
    expect(r.xml).toContain(before);
    expect(r.xml).toContain(after);
    // Tocno 1 prezivjeli prazan odlomak (bilo koji od dva oblika) izmedju before i after.
    const between = r.xml.slice(r.xml.indexOf(before) + before.length, r.xml.indexOf(after));
    expect(between === '<w:p/>' || between === '<w:p></w:p>').toBe(true);
  });

  it('samozatvarajuci odlomak s viska atributima (rsidR + rsidRDefault) se prepoznaje i kolabira u kvalificirajucem nizu', () => {
    const before = p(run('Uvod'));
    const after = p(run('Poglavlje 1'));
    const tricky = '<w:p w:rsidR="00AA" w:rsidRDefault="00BB"/>';
    const xml = '<w:body>' + before + tricky + '<w:p/>' + '<w:p/>' + after + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(2);
    expect(r.runsCollapsed).toBe(1);
    expect(r.xml).toContain(before);
    expect(r.xml).toContain(after);
    // Prezivjeli je PRVI u nizu (tricky), ostatak obrisan.
    expect(r.xml).toContain(tricky);
    expect(r.xml.match(/<w:p\b[^>]*\/>/g)).toHaveLength(1);
  });
});

describe('stripOrphanedEmptyParagraphs: prazninu odredjuje samo w:t sadrzaj', () => {
  it('formatirani (rPr) ali tekstualno prazan run i dalje kvalificira odlomak kao prazan', () => {
    const formattedEmpty = p(run('', '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/>'));
    const xml = '<w:body>' + p(run('prije')) + formattedEmpty + p() + p(run('poslije')) + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(1);
    // Formatiranje (rFonts/b) na praznom runu ne sprjecava kvalifikaciju: jedan
    // od dva prazna odlomka je uklonjen (kolabirano na 1), drugi prezivljava.
  });
});

describe('stripOrphanedEmptyParagraphs: whitespace-only w:t', () => {
  it('w:t s xml:space preserve koji sadrzi samo razmake i dalje kvalificira kao prazan', () => {
    const whitespaceOnly = p('<w:r><w:t xml:space="preserve">   </w:t></w:r>');
    const xml = '<w:body>' + p(run('prije')) + whitespaceOnly + p() + p(run('poslije')) + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(1);
  });
});

describe('stripOrphanedEmptyParagraphs: nista za ukloniti', () => {
  it('dokument bez uzastopnih praznih odlomaka: applied false, xml bajt-identican', () => {
    const xml = '<w:body>' + p(run('Prvi')) + p(run('Drugi')) + p(run('Treci')) + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    expect(r.applied).toBe(false);
    expect(r.paragraphsRemoved).toBe(0);
    expect(r.runsCollapsed).toBe(0);
    expect(r.xml).toBe(xml);
  });
});
