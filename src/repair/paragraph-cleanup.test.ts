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

describe('stripOrphanedEmptyParagraphs: prilozi na novoj stranici', () => {
  it('prazni odlomci NEPOSREDNO PRIJE naslova priloga se NE kolabiraju (ostaju na novoj stranici)', () => {
    const literatura = p(run('Popis literature'));
    const izvor = p(run('Autor, N. (2020). Naslov.'));
    const prilozi = p('<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + run('Prilozi'));
    const xml = '<w:body>' + literatura + izvor + p() + p() + p() + p() + prilozi + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);

    // Niz od 4 prazna prije "Prilozi" mora ostati netaknut: nista se ne brise.
    expect(r.applied).toBe(false);
    expect(r.paragraphsRemoved).toBe(0);
    expect(r.xml).toBe(xml);
  });

  it('hvata i "Dodatak" i razbijeni naslov iz vise runova', () => {
    const dodatak = p('<w:r><w:t>Doda</w:t></w:r><w:r><w:t>tak A</w:t></w:r>');
    const xml = '<w:body>' + p(run('tekst')) + p() + p() + p() + dodatak + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);
    expect(r.applied).toBe(false);
  });

  it('prazni prije OBICNOG odlomka se i dalje kolabiraju (nema lazne zastite)', () => {
    const obican = p(run('Sljedeci odlomak nije prilog.'));
    const xml = '<w:body>' + p(run('tekst')) + p() + p() + p() + obican + '</w:body>';
    const r = stripOrphanedEmptyParagraphs(xml);
    expect(r.applied).toBe(true);
    expect(r.paragraphsRemoved).toBe(2);
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

// --- Regresija: naslovnica (prijavio vlasnik 2026-07-20) -------------------------------------
// Popravak je spojio dvije naslovnice u jednu stranicu i zbio razmake. Dva uzroka, oba ovdje.
describe('naslovnica se ne smije razbiti', () => {
  const P_EMPTY = '<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>';
  const P_BREAK = '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:pageBreakBefore/></w:pPr></w:p>';
  const P_TEXT = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

  it('odlomak s w:pageBreakBefore se NIKAD ne brise (inace se stranice spoje)', () => {
    const xml = `<w:body>${P_TEXT('Naslovnica 1')}${P_EMPTY}${P_BREAK}${P_TEXT('Naslovnica 2')}</w:body>`;
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain('w:pageBreakBefore');
  });

  // Ista klasa kao pageBreakBefore: sadrzaj koji se VIDI, a nije <w:t>, pa ga hasVisibleText ne
  // primjecuje. Bez ovih zastita bi rucni prijelom retka i ukrasni simbol s naslovnice nestali.
  it('odlomak s w:cr (rucni prijelom retka) se ne brise', () => {
    const cr = '<w:p><w:r><w:cr/></w:r></w:p>';
    const xml = `<w:body>${P_TEXT('A')}${P_EMPTY}${cr}${P_EMPTY}${P_TEXT('B')}</w:body>`;
    expect(stripOrphanedEmptyParagraphs(xml).xml).toContain('<w:cr/>');
  });

  it('odlomak s w:sym (simbolski znak, npr. Wingdings ukras) se ne brise', () => {
    const sym = '<w:p><w:r><w:sym w:font="Wingdings" w:char="F0A8"/></w:r></w:p>';
    const xml = `<w:body>${P_TEXT('A')}${P_EMPTY}${sym}${P_EMPTY}${P_TEXT('B')}</w:body>`;
    expect(stripOrphanedEmptyParagraphs(xml).xml).toContain('w:sym');
  });

  it('odlomak s w:ptab (apsolutni tabulator) se ne brise', () => {
    const ptab = '<w:p><w:r><w:ptab w:alignment="right" w:relativeTo="margin" w:leader="dot"/></w:r></w:p>';
    const xml = `<w:body>${P_TEXT('A')}${P_EMPTY}${ptab}${P_EMPTY}${P_TEXT('B')}</w:body>`;
    expect(stripOrphanedEmptyParagraphs(xml).xml).toContain('w:ptab');
  });

  it('odlomak s mc:AlternateContent (oblik s VML rezervom) se ne brise', () => {
    const alt = '<w:p><w:r><mc:AlternateContent><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r></w:p>';
    const xml = `<w:body>${P_TEXT('A')}${P_EMPTY}${alt}${P_EMPTY}${P_TEXT('B')}</w:body>`;
    expect(stripOrphanedEmptyParagraphs(xml).xml).toContain('mc:AlternateContent');
  });

  // Rad formatiran bez ijednog Word stila naslova (sve rucno, sto analiza inace prijavljuje) nije
  // imao NIKAKVU zastitu naslovnice: prva granica je bila prvi Heading, kojeg ondje nema.
  it('bez ijednog stila naslova, naslovnica je zasticena do prvog prijeloma stranice', () => {
    const xml = `<w:body>${P_TEXT('SVEUCILISTE U ZAGREBU')}${P_EMPTY.repeat(6)}${P_TEXT('Diplomski rad')}`
      + `${P_BREAK}${P_TEXT('Uvod')}${P_EMPTY.repeat(4)}${P_TEXT('Tijelo rada')}</w:body>`;
    const out = stripOrphanedEmptyParagraphs(xml);
    const emptyCount = (s: string) => (s.match(/<w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr><\/w:p>/g) || []).length;
    // naslovnica: svih 6 prezivi; iza prijeloma se i dalje kolabira 4 -> 1
    expect(emptyCount(out.xml)).toBe(6 + 1);
  });

  it('prazni odlomci PRIJE prvog naslova (naslovnica) ostaju netaknuti', () => {
    const front = P_EMPTY.repeat(8); // vertikalni razmak na naslovnici
    const xml = `<w:body>${P_TEXT('SVEUCILISTE U ZAGREBU')}${front}${P_TEXT('Diplomski rad')}`
      + `${P_BREAK}<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>`
      + `${P_EMPTY.repeat(4)}${P_TEXT('Tijelo rada')}</w:body>`;
    const out = stripOrphanedEmptyParagraphs(xml);
    const emptyCount = (s: string) => (s.match(/<w:p><w:pPr><w:pStyle w:val="Normal"\/><\/w:pPr><\/w:p>/g) || []).length;
    // naslovnica: svih 8 mora prezivjeti; iza Uvoda se smije kolabirati 4 -> 1
    expect(emptyCount(out.xml)).toBe(8 + 1);
  });
});

// --- RE-01 (P0 gubitak sadrzaja): blok-jednadzba (OMML m:oMath) ----------------------------------
// hasVisibleText cita SAMO <w:t>; tekst jednadzbe zivi u <m:t> (drugi imenski prostor), pa je
// odlomak ciji je JEDINI sadrzaj jednadzba prolazio kao "osirotjeli prazan" i bio brisan cim je
// bio dio kvalificirajuceg niza (npr. do golog Entera).
describe('stripOrphanedEmptyParagraphs: blok-jednadzba (m:oMath)', () => {
  const equation = '<w:p><m:oMathPara><m:oMath><m:r><m:t>E</m:t></m:r></m:oMath></m:oMathPara></w:p>';

  it('odlomak ciji je jedini sadrzaj m:oMathPara/m:oMath se ne brise, cak ni uz susjedni prazan odlomak', () => {
    const xml = '<w:body>' + p(run('prije')) + p() + equation + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(equation);
  });

  it('3 uzastopne jednadzbe prezivljavaju sve, ne kolabiraju na 1', () => {
    const xml = '<w:body>' + p(run('prije')) + equation + equation + equation + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.applied).toBe(false);
    expect(out.xml).toBe(xml);
  });

  it('m:oMath BEZ oMathPara omotaca (inline oblik) se takodjer ne brise', () => {
    const inlineEq = '<w:p><w:r><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:r></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + inlineEq + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(inlineEq);
  });
});

// --- RE-12: tracked-changes i markeri raspona (recenzirani rad) --------------------------------
// w:delText (brisani tekst u revizijama) je DRUGI tag od <w:t>, pa ga hasVisibleText ne vidi;
// commentRangeStart/End i moveFrom/ToRangeStart/End su samozatvarajuci sidra koja mogu obuhvatiti
// VISE odlomaka (par zivi u razlicitim paragrafima), pa brisanje jednog ostavlja NESPAREN marker
// (osteceni review markup) ili tiho gubi revidirani sadrzaj.
describe('stripOrphanedEmptyParagraphs: tracked-changes i markeri raspona', () => {
  it('odlomak ciji je jedini sadrzaj obrisan tekst (w:del/w:delText) se ne brise', () => {
    const deletion = '<w:p><w:del w:id="1" w:author="M" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>obrisano</w:delText></w:r></w:del></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + deletion + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(deletion);
  });

  it('odlomak sa samo w:commentRangeStart se ne brise (sprjecava nesparen commentRangeEnd)', () => {
    const rangeStart = '<w:p><w:commentRangeStart w:id="1"/></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + rangeStart + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(rangeStart);
  });

  it('odlomak sa samo w:commentRangeEnd se ne brise', () => {
    const rangeEnd = '<w:p><w:commentRangeEnd w:id="1"/></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + rangeEnd + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(rangeEnd);
  });

  it('odlomak sa samo w:moveFromRangeStart/w:moveToRangeEnd markerima se ne brise', () => {
    const moveFrom = '<w:p><w:moveFromRangeStart w:id="1" w:name="move1" w:author="M" w:date="2026-01-01T00:00:00Z"/></w:p>';
    const moveTo = '<w:p><w:moveToRangeEnd w:id="1" w:name="move1"/></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + moveFrom + p(run('sredina')) + p() + moveTo + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(moveFrom);
    expect(out.xml).toContain(moveTo);
  });

  it('odlomak s umetnutim tekstom u reviziji (w:ins) i dalje prezivljava preko vidljivog w:t (bez regresije)', () => {
    const insertion = '<w:p><w:ins w:id="1" w:author="M" w:date="2026-01-01T00:00:00Z"><w:r><w:t>umetnuto</w:t></w:r></w:ins></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + insertion + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(insertion);
  });
});

// --- RE-11: prazan odlomak s vidljivim svojstvom odlomka (w:pBdr/w:shd/w:numPr) -----------------
// qualifiesAsOrphanedEmpty je gledao samo sadrzaj runova, nikad w:pPr svojstva odlomka: potpisna
// linija (rub bez teksta iznad), istaknuta traka (shd) i prazna stavka popisa (numPr) su VIDLJIVE
// na stranici iako odlomak nema w:t, pa su se tiho brisale kao "visak".
describe('stripOrphanedEmptyParagraphs: vidljiva svojstva odlomka (pBdr/shd/numPr)', () => {
  it('prazan odlomak s w:pBdr (potpisna linija, rub) se ne brise', () => {
    const signatureLine = '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + signatureLine + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(signatureLine);
  });

  it('prazan odlomak s w:shd fill razlicitim od auto (istaknuta traka) se ne brise', () => {
    const shaded = '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:pPr></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + shaded + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(shaded);
  });

  it('w:shd s fill="auto" (bez vidljive boje) i dalje kvalificira kao prazan (bez pretjerane zastite)', () => {
    const noFill = p('<w:pPr><w:shd w:val="clear" w:color="auto" w:fill="auto"/></w:pPr>');
    const xml = '<w:body>' + p(run('prije')) + noFill + p() + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.applied).toBe(true);
    expect(out.paragraphsRemoved).toBe(1);
  });

  it('prazan odlomak s w:numPr (prazna stavka popisa) se ne brise', () => {
    const listItem = '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr></w:pPr></w:p>';
    const xml = '<w:body>' + p(run('prije')) + p() + listItem + p(run('poslije')) + '</w:body>';
    const out = stripOrphanedEmptyParagraphs(xml);
    expect(out.xml).toContain(listItem);
  });
});
