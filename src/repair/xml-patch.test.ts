import { describe, it, expect } from 'vitest';
import {
  patchMargins,
  patchPaperSize,
  patchDefaultFont,
  patchDefaultSpacing,
  patchDefaultParagraphSpacing,
  patchDefaultAlignment,
  patchFootnoteTextSpacing,
  patchFooterPageAlignment,
  patchHeadingFormat,
  patchFootnoteTypography,
} from './xml-patch';

const DOCUMENT_XML =
  '<w:document><w:body><w:p>tekst prije</w:p><w:sectPr>' +
  '<w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/>' +
  '<w:cols w:space="708"/></w:sectPr></w:body></w:document>';

const STYLES_XML =
  '<w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
  '</w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
  '<w:name w:val="Normal"/>' +
  '<w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>' +
  '</w:style></w:styles>';

describe('patchMargins', () => {
  it('mijenja samo ciljani atribut, ostalo netaknuto', () => {
    const result = patchMargins(DOCUMENT_XML, { right: 1440 });

    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:right="1440"');
    expect(result.xml).toContain('w:top="1417"'); // netaknuto
    expect(result.xml).toContain('w:header="708"'); // netaknuto
    expect(result.xml).toContain('w:gutter="0"'); // netaknuto
    expect(result.xml).toContain('<w:p>tekst prije</w:p>'); // netaknuto, izvan sectPr
    expect(result.before).toEqual({ 'w:right': '1417' });
    expect(result.after).toEqual({ 'w:right': '1440' });
  });

  it('vraca applied:false kad pgMar ne postoji', () => {
    const result = patchMargins('<w:document><w:body></w:body></w:document>', { top: 1000 });
    expect(result.applied).toBe(false);
  });

  it('krpa SVE sekcije (naslovnica s vlastitim sectPr + glavni tekst)', () => {
    // Analizator provjerava margine preko svih sekcija; standardna teza ima
    // naslovnicu s vlastitim sectPr. Popravak mora pogoditi svaku sekciju.
    const multiSection =
      '<w:document><w:body>' +
      '<w:p><w:pPr><w:sectPr><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr></w:pPr></w:p>' +
      '<w:p>glavni tekst</w:p>' +
      '<w:sectPr><w:pgMar w:top="1417" w:right="1134" w:bottom="1417" w:left="1417"/></w:sectPr>' +
      '</w:body></w:document>';
    const result = patchMargins(multiSection, { right: 1440 });

    expect(result.applied).toBe(true);
    expect(result.xml).not.toContain('w:right="1417"'); // prva sekcija promijenjena
    expect(result.xml).not.toContain('w:right="1134"'); // druga sekcija promijenjena
    expect(result.xml.match(/w:right="1440"/g)).toHaveLength(2);
    expect(result.xml).toContain('<w:p>glavni tekst</w:p>'); // ostalo netaknuto
  });

  it('krpa i kad je samo DRUGA sekcija prekrsena (prva vec ispravna)', () => {
    const multiSection =
      '<w:document><w:body>' +
      '<w:p><w:pPr><w:sectPr><w:pgMar w:right="1440"/></w:sectPr></w:pPr></w:p>' +
      '<w:sectPr><w:pgMar w:right="1134"/></w:sectPr>' +
      '</w:body></w:document>';
    const result = patchMargins(multiSection, { right: 1440 });

    expect(result.applied).toBe(true); // prije fixa: prva sekcija bez promjene -> lazni no-op
    expect(result.xml.match(/w:right="1440"/g)).toHaveLength(2);
  });

  it('prepoznaje i ne-self-closing oblik taga (<w:pgMar ...></w:pgMar>)', () => {
    const xml = '<w:sectPr><w:pgMar w:top="1417"></w:pgMar></w:sectPr>';
    const result = patchMargins(xml, { top: 1440 });
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('<w:pgMar w:top="1440"></w:pgMar>');
  });
});

describe('patchPaperSize', () => {
  it('mijenja pgSz, ostavlja pgMar netaknut', () => {
    const result = patchPaperSize(DOCUMENT_XML, { w: 16838, h: 11906 });
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:w="16838"');
    expect(result.xml).toContain('w:h="11906"');
    expect(result.xml).toContain('w:top="1417"'); // pgMar netaknut
  });

  // Analiza polozenu sekciju TOLERIRA (near(w,h) ILI near(h,w)), pa uspravljanje nije popravak nego
  // steta: polozeni prilog sa sirokom tablicom se raspadne. Pravilo je jednosmjerno.
  it('NE uspravlja sekciju s eksplicitnim w:orient="landscape" (vec je na cilju, samo polozeno)', () => {
    const xml = '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr>';
    const result = patchPaperSize(xml, { w: 11906, h: 16838 });
    expect(result.applied).toBe(false); // A4 polozeno je vec tocno, nema sto mijenjati
    expect(result.xml).toContain('w:w="16838"');
    expect(result.xml).toContain('w:orient="landscape"');
  });

  it('polozenoj sekciji KRIVOG formata popravlja format, ali je ostavlja polozenom', () => {
    // Letter polozeno (27,9 x 21,6 cm) uz cilj A4: mora postati A4 POLOZENO, ne A4 uspravno.
    const xml = '<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/></w:sectPr>';
    const result = patchPaperSize(xml, { w: 11906, h: 16838 });
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:w="16838"');   // sirina = visina cilja
    expect(result.xml).toContain('w:h="11906"');   // visina = sirina cilja
    expect(result.xml).toContain('w:orient="landscape"');
  });

  it('NE uspravlja sekciju s polozenim dimenzijama ni bez w:orient atributa', () => {
    const xml = '<w:sectPr><w:pgSz w:w="16838" w:h="11906"/></w:sectPr>';
    const result = patchPaperSize(xml, { w: 11906, h: 16838 });
    expect(result.applied).toBe(false);
  });

  it('uspravnu sekciju krivog formata (npr. Letter) i dalje krpa', () => {
    const xml = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>';
    const result = patchPaperSize(xml, { w: 11906, h: 16838 });
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:w="11906"');
  });

  it('mijesan dokument: uspravna sekcija se popravlja, polozeni prilog ostaje polozen', () => {
    const xml = '<w:body><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>'
      + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr></w:body>';
    const result = patchPaperSize(xml, { w: 11906, h: 16838 });
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('<w:pgSz w:w="11906" w:h="16838"/>');
    expect(result.xml).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
  });
});

describe('patchDefaultFont', () => {
  it('mijenja font i velicinu, ostavlja cs i Normal stil netaknute', () => {
    const result = patchDefaultFont(STYLES_XML, { fontName: 'Times New Roman', sizeHalfPoints: 24 });

    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:ascii="Times New Roman"');
    expect(result.xml).toContain('w:hAnsi="Times New Roman"');
    expect(result.xml).toContain('w:cs="Calibri"'); // netaknuto, nismo trazili cs
    expect(result.xml).toContain('<w:sz w:val="24"/>');
    expect(result.xml).toContain('<w:szCs w:val="22"/>'); // netaknuto
    expect(result.xml).toContain('w:line="259"'); // Normal stil netaknut
  });

  it('XML-escapa vrijednost i ne interpretira $ sekvence u imenu fonta', () => {
    // Obrana u dubinu: ime fonta dolazi iz profila, ali vrijednost u XML atributu
    // mora biti escapana ('&' -> '&amp;') i ne smije proci kroz $-interpretaciju
    // String.replace replacement stringa ('$&' bi ubacio cijeli match).
    const result = patchDefaultFont(STYLES_XML, { fontName: 'A & B "$&" <x>' });
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:ascii="A &amp; B &quot;$&amp;&quot; &lt;x>"');
    expect(result.xml).not.toContain('w:ascii="A & B'); // sirovi & ne smije u atribut
  });

  it('theme-only rFonts: upisuje doslovni font i MICE referencu na temu (inace bi tema pobijedila)', () => {
    // Stanje u svakom dokumentu koji je Word sam napravio. Po shemi w:asciiTheme ima prednost pred
    // w:ascii, pa upis bez uklanjanja teme ne bi promijenio nista vidljivo.
    const themed =
      '<w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorBidi"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
    const result = patchDefaultFont(themed, { fontName: 'Times New Roman' });
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:ascii="Times New Roman"');
    expect(result.xml).toContain('w:hAnsi="Times New Roman"');
    expect(result.xml).not.toContain('w:asciiTheme');
    expect(result.xml).not.toContain('w:hAnsiTheme');
    // Slot za slozena pisma nije nas posao i ostaje netaknut.
    expect(result.xml).toContain('w:cstheme="minorBidi"');
  });

  it('naslovima mice referencu na temu (inace ostaju Cambria), ali izricit font ne dira', () => {
    // Wordov Heading1 nosi majorHAnsi (Cambria) i time blokira font dokumenta; Heading2 ovdje ima
    // autorov izricit izbor (Georgia), koji je namjera, ne prepreka.
    const styles =
      '<w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/></w:rPr></w:rPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
      '<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:sz w:val="32"/></w:rPr></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>' +
      '<w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/></w:rPr></w:style></w:styles>';
    const r = patchDefaultFont(styles, { fontName: 'Times New Roman' });
    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('majorHAnsi');           // prepreka uklonjena -> naslov nasljedjuje TNR
    expect(r.xml).toContain('<w:sz w:val="32"/>');       // velicina naslova netaknuta
    expect(r.xml).toContain('w:ascii="Georgia"');        // autorov izbor netaknut
  });

  it('rFonts koji UOPCE ne postoji se stvara na shemom propisanom mjestu (prvi u rPr)', () => {
    const bare = '<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
    const result = patchDefaultFont(bare, { fontName: 'Times New Roman', sizeHalfPoints: 24 });
    expect(result.applied).toBe(true);
    // CT_RPr trazi rFonts PRIJE sz; obrnut redoslijed Word prijavljuje kao ostecenje.
    expect(result.xml.indexOf('<w:rFonts')).toBeLessThan(result.xml.indexOf('<w:sz'));
    expect(result.xml).toContain('<w:sz w:val="24"/>');
  });
});

describe('patchHeadingFormat (oblikovanje naslova po razinama)', () => {
  // Stil kakav Word stvarno pise: velicina i isticanje su u stilu, ne na odlomcima.
  const STYLES =
    '<w:styles><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
    '<w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="32"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>';

  it('postavlja velicinu, podebljano i poravnanje slijeva u stil razine', () => {
    const r = patchHeadingFormat(STYLES, 1, { sizeHalfPoints: 24, bold: true, alignLeft: true });
    expect(r.applied).toBe(true);
    const h1 = r.xml.match(/<w:style\b[^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/)![0];
    expect(h1).toContain('<w:sz w:val="24"/>');
    expect(h1).toContain('<w:b/>');
    expect(h1).toContain('<w:jc w:val="left"/>');
    // Drugi stil ostaje netaknut.
    expect(r.xml).toContain('<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>');
  });

  it('stvara w:rPr i w:pPr kad ih razina uopce nema, po CT_Style redoslijedu (pPr prije rPr)', () => {
    const r = patchHeadingFormat(STYLES, 2, { sizeHalfPoints: 26, italic: true, alignLeft: true });
    expect(r.applied).toBe(true);
    const h2 = r.xml.match(/<w:style\b[^>]*w:styleId="Heading2"[\s\S]*?<\/w:style>/)![0];
    expect(h2).toContain('<w:i/>');
    expect(h2).toContain('<w:jc w:val="left"/>');
    expect(h2.indexOf('<w:pPr>')).toBeLessThan(h2.indexOf('<w:rPr>'));
    expect(h2.indexOf('<w:name')).toBeLessThan(h2.indexOf('<w:pPr>'));
  });

  it('w:rPr stila se ne mijesa s w:rPr unutar w:pPr (svojstva oznake odlomka)', () => {
    const tricky =
      '<w:styles><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
      '<w:pPr><w:rPr><w:sz w:val="99"/></w:rPr></w:pPr></w:style></w:styles>';
    const r = patchHeadingFormat(tricky, 1, { sizeHalfPoints: 28 });
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:sz w:val="99"/>');   // oznaka odlomka netaknuta
    expect(r.xml).toContain('<w:sz w:val="28"/>');   // stilska velicina postavljena
  });

  it('iskljuceno podebljanje (w:val="0") se ukljucuje uklanjanjem atributa', () => {
    const off = '<w:styles><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
      '<w:rPr><w:b w:val="0"/></w:rPr></w:style></w:styles>';
    const r = patchHeadingFormat(off, 1, { bold: true });
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:b/>');
    expect(r.xml).not.toContain('w:val="0"');
  });

  it('razina koja u dokumentu ne postoji je posten no-op (stil se ne izmislja)', () => {
    expect(patchHeadingFormat(STYLES, 5, { bold: true }).applied).toBe(false);
  });

  it('nalazi stil i po lokaliziranom imenu kad styleId nije Wordov', () => {
    const lo = '<w:styles><w:style w:type="paragraph" w:styleId="Naslov1"><w:name w:val="Naslov 1"/></w:style></w:styles>';
    const r = patchHeadingFormat(lo, 1, { bold: true });
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:b/>');
  });
});

describe('patchFootnoteTypography', () => {
  const STYLES =
    '<w:styles><w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/>' +
    '<w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/><w:sz w:val="20"/></w:rPr></w:style></w:styles>';

  it('postavlja font i velicinu fusnota i uklanja referencu na temu', () => {
    const r = patchFootnoteTypography(STYLES, { fontName: 'Times New Roman', sizeHalfPoints: 20 });
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('w:ascii="Times New Roman"');
    expect(r.xml).not.toContain('w:asciiTheme');
    expect(r.xml).toContain('<w:sz w:val="20"/>'); // vec tocna velicina ostaje
  });

  it('stil fusnota koji ne postoji je posten no-op', () => {
    const none = '<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>';
    expect(patchFootnoteTypography(none, { fontName: 'Times New Roman' }).applied).toBe(false);
  });
});

describe('postavljanje vrijednosti koje u dokumentu ne postoje', () => {
  // Stil Normal kakav Word stvarno pise: bez pPr, bez proreda, bez poravnanja.
  const STOCK_NORMAL =
    '<w:styles><w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>';

  it('prored se stvara u w:pPr stila Normal koji uopce nema pPr', () => {
    const r = patchDefaultSpacing(STOCK_NORMAL, 360, 'auto');
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr>');
    // CT_Style trazi pPr IZA qFormat.
    expect(r.xml.indexOf('<w:qFormat/>')).toBeLessThan(r.xml.indexOf('<w:pPr>'));
  });

  it('poravnanje se stvara, i to IZA proreda (CT_PPr redoslijed)', () => {
    const withSpacing = patchDefaultSpacing(STOCK_NORMAL, 360, 'auto').xml;
    const r = patchDefaultAlignment(withSpacing, 'both');
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:jc w:val="both"/>');
    expect(r.xml.indexOf('<w:spacing')).toBeLessThan(r.xml.indexOf('<w:jc'));
  });

  it('razmaci odlomaka se dodaju na POSTOJECI w:spacing, ne stvaraju drugi element', () => {
    const withLine = patchDefaultSpacing(STOCK_NORMAL, 360, 'auto').xml;
    const r = patchDefaultParagraphSpacing(withLine, 0, 0);
    expect(r.applied).toBe(true);
    expect((r.xml.match(/<w:spacing\b/g) || [])).toHaveLength(1);
    expect(r.xml).toContain('w:line="360"');
    expect(r.xml).toContain('w:before="0"');
    expect(r.xml).toContain('w:after="0"');
  });

  it('prored NE zavrsi na w:spacing iz w:rPr (razmak medju znakovima nije prored)', () => {
    const charSpacing =
      '<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/>' +
      '<w:rPr><w:spacing w:val="20"/></w:rPr></w:style></w:styles>';
    const r = patchDefaultSpacing(charSpacing, 360, 'auto');
    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:spacing w:val="20"/>');          // znakovni razmak netaknut
    expect(r.xml).toContain('<w:pPr><w:spacing w:line="360"');   // prored u vlastitom pPr
  });

  it('stil koji ne postoji se ne izmislja', () => {
    const noNormal = '<w:styles><w:docDefaults><w:rPrDefault><w:rPr/></w:rPrDefault></w:docDefaults></w:styles>';
    expect(patchDefaultAlignment(noNormal, 'both').applied).toBe(false);
    expect(patchDefaultSpacing(noNormal, 360).applied).toBe(false);
  });
});

describe('patchDefaultSpacing', () => {
  it('mijenja prored, ostavlja docDefaults i jc netaknute', () => {
    const result = patchDefaultSpacing(STYLES_XML, 480, 'auto');
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:line="480"');
    expect(result.xml).toContain('w:ascii="Calibri"'); // docDefaults netaknut
    expect(result.xml).toContain('w:val="left"'); // jc netaknut
  });
});

describe('patchDefaultParagraphSpacing', () => {
  it('mijenja w:after, ostavlja line/lineRule/jc/docDefaults netaknute', () => {
    // Fixture spacing tag nema w:before (samo w:after/w:line/w:lineRule), pa se
    // vidljivo mijenja samo w:after; patch-only politika ne izmislja w:before
    // koji ne postoji na tagu (isto ponasanje kao ostale patch* funkcije).
    const result = patchDefaultParagraphSpacing(STYLES_XML, 0, 0);
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:after="0"');
    expect(result.xml).toContain('w:line="259"'); // netaknuto
    expect(result.xml).toContain('w:lineRule="auto"'); // netaknuto
    expect(result.xml).toContain('w:val="left"'); // jc netaknut
    expect(result.xml).toContain('w:ascii="Calibri"'); // docDefaults netaknut
  });

  it('vraca applied:false kad Normal stil ne postoji', () => {
    const result = patchDefaultParagraphSpacing('<w:styles></w:styles>', 0, 0);
    expect(result.applied).toBe(false);
  });
});

describe('patchDefaultAlignment', () => {
  it('mijenja poravnanje, ostavlja spacing netaknut', () => {
    const result = patchDefaultAlignment(STYLES_XML, 'both');
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('<w:jc w:val="both"/>');
    expect(result.xml).toContain('w:line="259"'); // spacing netaknut
  });

  it('vraca applied:false kad Normal stil ne postoji', () => {
    const result = patchDefaultAlignment('<w:styles></w:styles>', 'both');
    expect(result.applied).toBe(false);
  });
});

describe('findStyleBlock / patchFootnoteTextSpacing', () => {
  // Zaseban fixture (razlicit styleId od STYLES_XML) da findStyleBlock('FootnoteText')
  // dokazano gadja ISPRAVAN stil, ne slucajno Normal.
  const STYLES_XML_WITH_FOOTNOTE =
    '<w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
    '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
    '</w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">' +
    '<w:name w:val="Normal"/>' +
    '<w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>' +
    '</w:style>' +
    '<w:style w:type="paragraph" w:styleId="FootnoteText">' +
    '<w:name w:val="Fusnota"/>' +
    '<w:pPr><w:spacing w:before="120" w:after="80" w:line="240" w:lineRule="auto"/></w:pPr>' +
    '</w:style></w:styles>';

  it('mijenja before/after na FootnoteText stilu, ostavlja Normal i docDefaults netaknute', () => {
    const result = patchFootnoteTextSpacing(STYLES_XML_WITH_FOOTNOTE, 0, 0);

    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:before="0"');
    expect(result.xml).toContain('w:after="0"');
    expect(result.xml).toContain('w:line="240"'); // FootnoteText line netaknut
    // Normal stil u istom fixtureu netaknut
    expect(result.xml).toContain('<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>');
    expect(result.xml).toContain('w:val="left"'); // Normal jc netaknut
    // docDefaults netaknut
    expect(result.xml).toContain('w:ascii="Calibri"');
    expect(result.before).toEqual({ 'w:before': '120', 'w:after': '80' });
    expect(result.after).toEqual({ 'w:before': '0', 'w:after': '0' });
  });

  it('vraca applied:false kad FootnoteText stil ne postoji', () => {
    const result = patchFootnoteTextSpacing(STYLES_XML, 0, 0); // STYLES_XML nema FootnoteText
    expect(result.applied).toBe(false);
  });
});

describe('patchFooterPageAlignment', () => {
  const pageField = (jc: string | null) =>
    `<w:p>${jc ? `<w:pPr><w:jc w:val="${jc}"/></w:pPr>` : ''}` +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    '<w:r><w:t>1</w:t></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
    '</w:p>';
  const wrap = (body: string) =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    body +
    '</w:ftr>';

  it('mijenja w:jc s left na right', () => {
    const result = patchFooterPageAlignment(wrap(pageField('left')), 'right');
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('<w:jc w:val="right"/>');
    expect(result.before).toEqual({ 'w:val': 'left' });
    expect(result.after).toEqual({ 'w:val': 'right' });
  });

  it('no-op kad je vec right', () => {
    const result = patchFooterPageAlignment(wrap(pageField('right')), 'right');
    expect(result.applied).toBe(false);
    expect(result.xml).toBe(wrap(pageField('right')));
  });

  it('no-op (patch-only) kad w:jc uopce ne postoji na PAGE odlomku', () => {
    const xml = wrap(pageField(null));
    const result = patchFooterPageAlignment(xml, 'right');
    expect(result.applied).toBe(false);
    expect(result.found['w:val']).toBeFalsy();
    expect(result.xml).toBe(xml);
  });

  it('no-op kad paragraf s PAGE ne postoji uopce', () => {
    const xml = wrap('<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>Podnožje</w:t></w:r></w:p>');
    const result = patchFooterPageAlignment(xml, 'right');
    expect(result.applied).toBe(false);
  });

  it('hvata PRVI odlomak s PAGE kad mu prethodi odlomak bez PAGE polja', () => {
    const decoy = '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>Autor</w:t></w:r></w:p>';
    const xml = wrap(decoy + pageField('left'));
    const result = patchFooterPageAlignment(xml, 'right');
    expect(result.applied).toBe(true);
    // decoy odlomak (centriran) ostaje netaknut, samo PAGE odlomak se mijenja
    expect(result.xml).toContain('<w:jc w:val="center"/>');
    expect(result.xml).toContain('<w:jc w:val="right"/>');
    expect(result.before).toEqual({ 'w:val': 'left' });
  });

  it('samozatvarajuci <w:p/> ispred pravog PAGE odlomka ne proguta ga (SELF_CLOSING_SRC/PAIRED_SRC alternacija)', () => {
    const xml = wrap('<w:p/>' + pageField('left'));
    const result = patchFooterPageAlignment(xml, 'right');
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('<w:jc w:val="right"/>');
  });
});
