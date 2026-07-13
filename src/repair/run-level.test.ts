import { describe, it, expect } from 'vitest';
import { stripDirectFormatting } from './run-level';

// Golden testovi za v2 ciscenje izravnog formatiranja: svaka zastita iz
// zaglavlja run-level.ts ima test koji dokazuje da se NE dira ono sto ne smije.

const p = (inner: string, attrs = '') => `<w:p${attrs}>${inner}</w:p>`;
const run = (rPr: string, text: string) => `<w:r><w:rPr>${rPr}</w:rPr><w:t>${text}</w:t></w:r>`;

describe('stripDirectFormatting: font', () => {
  it('uklanja w:ascii/w:hAnsi, a bold/italic/cs ostaju netaknuti', () => {
    const xml =
      '<w:body>' +
      p(run('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/><w:b/><w:i/>', 'tekst')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, { stripFontName: true });

    expect(r.applied).toBe(true);
    expect(r.runsTouched).toBe(1);
    expect(r.xml).not.toContain('w:ascii="Calibri"');
    expect(r.xml).not.toContain('w:hAnsi="Calibri"');
    expect(r.xml).toContain('<w:rFonts w:cs="Arial"/>'); // cs prezivljava
    expect(r.xml).toContain('<w:b/>'); // bold prezivljava
    expect(r.xml).toContain('<w:i/>'); // italic prezivljava
    expect(r.xml).toContain('<w:t>tekst</w:t>');
  });

  it('uklanja i theme parnjake; atribut-prazan rFonts tag nestaje', () => {
    const xml = '<w:body>' + p(run('<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>', 'x')) + '</w:body>';
    const r = stripDirectFormatting(xml, { stripFontName: true });
    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('<w:rFonts');
  });
});

describe('stripDirectFormatting: velicina (threshold 3 hp = ± 1,5 pt)', () => {
  it('uklanja SAMO w:sz blizu cilja; w:szCs (complex-script) ostaje, naslovne brojke ostaju', () => {
    const xml =
      '<w:body>' +
      p(run('<w:sz w:val="22"/><w:szCs w:val="22"/>', 'tijelo 11pt')) + // 22 hp, cilj 24 -> diff 2 <= 3
      p(run('<w:sz w:val="56"/>', 'NASLOV RADA 28pt')) + // 56 hp, diff 32: ostaje
      '</w:body>';
    const r = stripDirectFormatting(xml, { stripFontSizeNearHalfPoints: 24 });

    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('<w:sz w:val="22"/>'); // ascii velicina skinuta
    expect(r.xml).toContain('<w:szCs w:val="22"/>'); // complex-script velicina NETAKNUTA (nema backstopa)
    expect(r.xml).toContain('<w:sz w:val="56"/>'); // naslovnica netaknuta
  });

  it('podnosi prosireni prazni oblik <w:sz ...></w:sz> bez ostavljanja siroceta', () => {
    const xml = '<w:body>' + p(run('<w:sz w:val="22"></w:sz>', 'tijelo')) + '</w:body>';
    const r = stripDirectFormatting(xml, { stripFontSizeNearHalfPoints: 24 });
    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('w:sz'); // ni otvarajuci ni zatvarajuci ne smiju ostati
    expect(r.xml).not.toContain('</w:sz>');
  });

  it('namjerno sitniji tekst (10 pt uz cilj 12 pt) je izvan tolerancije i ostaje', () => {
    const xml = '<w:body>' + p(run('<w:sz w:val="20"/>', 'potpis ispod slike')) + '</w:body>';
    const r = stripDirectFormatting(xml, { stripFontSizeNearHalfPoints: 24 });
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });
});

describe('stripDirectFormatting: prored', () => {
  it('uklanja w:line/w:lineRule samo kad je lineRule auto; before/after ostaju', () => {
    const xml =
      '<w:body>' +
      p('<w:pPr><w:spacing w:before="120" w:after="160" w:line="240" w:lineRule="auto"/></w:pPr>' + run('', 'a')) +
      p('<w:pPr><w:spacing w:line="240" w:lineRule="exact"/></w:pPr>' + run('', 'b')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, { stripLineSpacing: true });

    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:spacing w:before="120" w:after="160"/>'); // line/lineRule skinuti, ostalo ostaje
    expect(r.xml).toContain('<w:spacing w:line="240" w:lineRule="exact"/>'); // exact je layout: netaknut
  });
});

describe('stripDirectFormatting: prored (stripParagraphSpacing)', () => {
  it('uklanja w:before/w:after kad su eksplicitno ne-"0"; w:line/w:lineRule ostaju netaknuti', () => {
    const xml =
      '<w:body>' +
      p('<w:pPr><w:spacing w:before="120" w:after="160" w:line="240" w:lineRule="auto"/></w:pPr>' + run('', 'a')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, { stripParagraphSpacing: true });

    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('w:before="120"');
    expect(r.xml).not.toContain('w:after="160"');
    expect(r.xml).toContain('<w:spacing w:line="240" w:lineRule="auto"/>'); // line/lineRule netaknuti bez stripLineSpacing
  });

  it('u tablici odlomak sa spacingom ostaje potpuno netaknut; identican odlomak izvan tablice se cisti', () => {
    const spacedPara = '<w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr>' + run('', 'tekst');
    const xml =
      '<w:body><w:tbl><w:tr><w:tc>' +
      p(spacedPara) +
      '</w:tc></w:tr></w:tbl>' +
      p(spacedPara) +
      '</w:body>';
    const r = stripDirectFormatting(xml, { stripParagraphSpacing: true });

    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:tc>' + p(spacedPara) + '</w:tc>'); // celija bajt-identicna
    expect(r.xml.match(/w:before="120"/g)).toHaveLength(1); // samo tablicin primjerak prezivio
    expect(r.xml.match(/w:after="160"/g)).toHaveLength(1);
  });

  it('kompozicija: samo stripParagraphSpacing dira SAMO before/after; oba flaga zajedno diraju sve cetiri bez siroceta', () => {
    const xml =
      '<w:body>' +
      p('<w:pPr><w:spacing w:before="120" w:after="160" w:line="240" w:lineRule="auto"/></w:pPr>' + run('', 'a')) +
      '</w:body>';

    const onlyParagraphSpacing = stripDirectFormatting(xml, { stripParagraphSpacing: true });
    expect(onlyParagraphSpacing.applied).toBe(true);
    expect(onlyParagraphSpacing.xml).toContain('<w:spacing w:line="240" w:lineRule="auto"/>');
    expect(onlyParagraphSpacing.xml).not.toContain('w:before');
    expect(onlyParagraphSpacing.xml).not.toContain('w:after');

    const both = stripDirectFormatting(xml, { stripLineSpacing: true, stripParagraphSpacing: true });
    expect(both.applied).toBe(true);
    expect(both.xml).not.toContain('w:before');
    expect(both.xml).not.toContain('w:after');
    expect(both.xml).not.toContain('w:line="240"');
    expect(both.xml).not.toContain('w:lineRule="auto"');
    expect(both.xml).not.toContain('<w:spacing'); // tag posve prazan -> ukloni cijeli (bez siroceta)
  });
});

describe('stripDirectFormatting: golden baseline prije stripParagraphSpacing', () => {
  it('nijedna postojeca opcija ne dira w:before/w:after: samo w:line/w:lineRule se skida', () => {
    const xml =
      '<w:body>' +
      p('<w:pPr><w:spacing w:before="120" w:after="160" w:line="240" w:lineRule="auto"/></w:pPr>' + run('', 'a')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, {
      stripFontName: true,
      stripFontSizeNearHalfPoints: 24,
      stripLineSpacing: true,
      stripLeftJustify: true,
    });

    expect(r.applied).toBe(true);
    expect(r.xml).toContain('w:before="120"'); // before prezivljava svaku postojecu opciju
    expect(r.xml).toContain('w:after="160"'); // after prezivljava svaku postojecu opciju
    expect(r.xml).not.toContain('w:line="240"'); // line skinut (lineRule auto)
    expect(r.xml).not.toContain('w:lineRule="auto"');
  });
});

describe('stripDirectFormatting: poravnanje', () => {
  it('uklanja jc left, a center/right ostavlja (namjerno centriranje)', () => {
    const xml =
      '<w:body>' +
      p('<w:pPr><w:jc w:val="left"/></w:pPr>' + run('', 'tijelo')) +
      p('<w:pPr><w:jc w:val="center"/></w:pPr>' + run('', 'potpis slike')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, { stripLeftJustify: true });

    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('w:val="left"');
    expect(r.xml).toContain('<w:jc w:val="center"/>');
  });
});

describe('stripDirectFormatting: zastite', () => {
  const ALL: Parameters<typeof stripDirectFormatting>[1] = {
    stripFontName: true,
    stripFontSizeNearHalfPoints: 24,
    stripLineSpacing: true,
    stripLeftJustify: true,
  };

  it('odlomak sa stilom (naslov) je netaknut', () => {
    const heading = p('<w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="left"/></w:pPr>' + run('<w:sz w:val="22"/>', 'Uvod'));
    const xml = '<w:body>' + heading + '</w:body>';
    const r = stripDirectFormatting(xml, ALL);
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });

  it('odlomak sa stilom Normal SE obradjuje', () => {
    const xml = '<w:body>' + p('<w:pPr><w:pStyle w:val="Normal"/><w:jc w:val="left"/></w:pPr>' + run('', 'x')) + '</w:body>';
    const r = stripDirectFormatting(xml, ALL);
    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('w:jc');
  });

  it('allowedStyleId="FootnoteText": odlomak s tim stilom SE obradjuje, "Normal" bez tog opcije NE (fixers.ts footnoteSpacingFixer)', () => {
    const xml =
      '<w:body>' + p('<w:pPr><w:pStyle w:val="FootnoteText"/><w:spacing w:before="120" w:after="160"/></w:pPr>' + run('', 'fusnota')) + '</w:body>';

    const withFootnoteTarget = stripDirectFormatting(xml, { stripParagraphSpacing: true, allowedStyleId: 'FootnoteText' });
    expect(withFootnoteTarget.applied).toBe(true);
    expect(withFootnoteTarget.xml).not.toContain('w:before');
    expect(withFootnoteTarget.xml).not.toContain('w:after');

    // Bez allowedStyleId (default "Normal") isti odlomak ostaje netaknut: FootnoteText
    // se tretira kao "stilizirani odlomak, preskoci", isto kao Heading1 za tijelo.
    const withDefaultTarget = stripDirectFormatting(xml, { stripParagraphSpacing: true });
    expect(withDefaultTarget.applied).toBe(false);
    expect(withDefaultTarget.xml).toBe(xml);
  });

  it('allowedStyleId="FootnoteText": odlomak s DRUGIM stilom (npr. Normal) i dalje netaknut', () => {
    const xml =
      '<w:body>' + p('<w:pPr><w:pStyle w:val="Normal"/><w:spacing w:before="120" w:after="160"/></w:pPr>' + run('', 'tijelo')) + '</w:body>';
    const r = stripDirectFormatting(xml, { stripParagraphSpacing: true, allowedStyleId: 'FootnoteText' });
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });

  it('odlomci unutar tekstualnog okvira su netaknuti', () => {
    const inner = p(run('<w:rFonts w:ascii="Impact" w:hAnsi="Impact"/><w:sz w:val="22"/>', 'ukrasni tekst'));
    const xml =
      '<w:body>' +
      p(run('', 'prije')) +
      p(`<w:r><w:drawing><w:txbxContent>${inner}</w:txbxContent></w:drawing></w:r>`) +
      p(run('<w:sz w:val="22"/>', 'poslije')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.xml).toContain('w:ascii="Impact"'); // okvir netaknut
    expect(r.xml).toContain('<w:txbxContent>' + inner + '</w:txbxContent>');
    // Odlomak "poslije" IZVAN okvira je ociscen: od dva <w:sz w:val="22"/>
    // (jedan u okviru, jedan u tijelu) prezivljava tocno onaj u okviru.
    expect(r.xml.match(/<w:sz w:val="22"\/>/g)).toHaveLength(1);
    expect(r.runsTouched).toBe(1);
  });

  it('odlomci u tablici SE obradjuju (analiza ih broji u dominantni font)', () => {
    const xml =
      '<w:body><w:tbl><w:tr><w:tc>' +
      p(run('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>', 'celija')) +
      '</w:tc></w:tr></w:tbl></w:body>';
    const r = stripDirectFormatting(xml, ALL);
    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('Calibri');
  });

  it('samozatvarajuci <w:p/> ne guta sljedeci odlomak', () => {
    const xml =
      '<w:body><w:p w:rsidR="00AA"/>' +
      p('<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' + run('<w:sz w:val="22"/>', 'Naslov')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);
    // Naslov je stiliziran pa NISTA ne smije biti dirano; da <w:p/> guta match,
    // pStyle guard bi se izgubio i sz bi nestao.
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });

  it('nista za uklanjanje -> applied false i xml identican', () => {
    const xml = '<w:body>' + p(run('<w:b/>', 'cist dokument')) + '</w:body>';
    const r = stripDirectFormatting(xml, ALL);
    expect(r.applied).toBe(false);
    expect(r.xml).toBe(xml);
  });

  it('simbolski fontovi (Symbol/Wingdings) se NE skidaju: glyph mapiranje nosi znacenje', () => {
    const xml =
      '<w:body>' +
      p(run('<w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/>', 'a')) + // renderira se kao alfa
      p(run('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>', 'obicno')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.xml).toContain('w:ascii="Symbol"'); // znacenje sacuvano
    expect(r.xml).not.toContain('Calibri'); // obican font ociscen
  });

  it('formule (m:oMath) su maskirane: Cambria Math u jednadzbi prezivljava', () => {
    const math =
      '<m:oMath><m:r><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:sz w:val="24"/></w:rPr><m:t>x=1</m:t></m:r></m:oMath>';
    const xml =
      '<w:body>' +
      p(`<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t>Formula </w:t></w:r>${math}`) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.applied).toBe(true);
    expect(r.xml).toContain(math); // formula bajt-identicna
    expect(r.xml).not.toContain('Calibri'); // tekst oko formule ociscen
  });

  it('track changes povijest (w:pPrChange/w:rPrChange) je maskirana i ne laze o stilu', () => {
    // Zivi odlomak JE Normal (bez zivog pStyle), ali povijest kaze Heading1:
    // odlomak se MORA obraditi (zivi jc left se skida), povijest ostaje netaknuta.
    const history =
      '<w:pPrChange w:id="1"><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:pPrChange>';
    const xml =
      '<w:body>' +
      p(`<w:pPr><w:jc w:val="left"/>${history}</w:pPr>` + run('', 'tekst')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.applied).toBe(true);
    expect(r.xml).toContain(history); // povijest revizija bajt-identicna
    expect(r.xml).not.toContain('<w:jc w:val="left"/>'); // zivi jc skinut
  });

  it('ugnjezdeni tekstualni okviri: balansirani raspon stiti i vanjski rep', () => {
    const innerBox = '<w:txbxContent>' + p(run('<w:rFonts w:ascii="Impact" w:hAnsi="Impact"/>', 'unutra')) + '</w:txbxContent>';
    const tail = p(run('<w:rFonts w:ascii="Impact" w:hAnsi="Impact"/>', 'vanjski rep'));
    const xml =
      '<w:body>' +
      `<w:txbxContent>${p(`<w:r>${innerBox}</w:r>`)}${tail}</w:txbxContent>` +
      p(run('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>', 'tijelo')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.xml.match(/w:ascii="Impact"/g)).toHaveLength(2); // oba dijela okvira netaknuta
    expect(r.xml).not.toContain('Calibri'); // tijelo ociscen
  });

  it('u tablicama se prored i poravnanje NE diraju, a font se cisti', () => {
    const xml =
      '<w:body><w:tbl><w:tr><w:tc>' +
      p('<w:pPr><w:spacing w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr>' + run('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>', 'celija')) +
      '</w:tc></w:tr></w:tbl></w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.applied).toBe(true);
    expect(r.xml).toContain('<w:spacing w:line="240" w:lineRule="auto"/>'); // prored u tablici ostaje
    expect(r.xml).toContain('<w:jc w:val="left"/>'); // poravnanje u tablici ostaje
    expect(r.xml).not.toContain('Calibri'); // font u tablici ociscen
  });

  it('Wordova ugradjena naslovnica (w:sdt) se preskace u cijelosti', () => {
    const cover =
      '<w:sdt><w:sdtPr><w:docPartObj><w:docPartGallery w:val="Cover Pages"/></w:docPartObj></w:sdtPr><w:sdtContent>' +
      p(run('<w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:sz w:val="72"/>', 'Naslov rada')) +
      p('<w:pPr><w:jc w:val="left"/></w:pPr>' + run('<w:sz w:val="26"/>', 'Ime Prezime')) +
      '</w:sdtContent></w:sdt>';
    const xml = '<w:body>' + cover + p(run('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>', 'tijelo')) + '</w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.xml).toContain(cover); // naslovnica bajt-identicna
    expect(r.xml).not.toContain('Calibri'); // tijelo izvan sdt-a ociscen
  });

  it('simbolski font u BILO KOJEM slotu (mijesani ascii+hAnsi) se ne skida', () => {
    const xml =
      '<w:body>' +
      p(run('<w:rFonts w:ascii="Calibri" w:hAnsi="Wingdings"/>', 'kvacica')) + // hAnsi je simbolski
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);
    expect(r.xml).toContain('w:hAnsi="Wingdings"'); // znacenje sacuvano, cijeli tag ostaje
    expect(r.xml).toContain('w:ascii="Calibri"');
  });

  it('obrisani tekst (w:del) je maskiran: rPr obrisanog runa netaknut', () => {
    const del = '<w:del w:id="2"><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:delText>staro</w:delText></w:r></w:del>';
    const xml =
      '<w:body>' +
      p(`${del}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/></w:rPr><w:t>novo</w:t></w:r>`) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);

    expect(r.xml).toContain(del); // obrisani tekst bajt-identican (Odbaci promjenu vraca tocno)
    expect(r.xml).not.toContain('Arial'); // zivi tekst ociscen
  });

  it('prosireni prazni <w:jc ...></w:jc> se cijeli uklanja (bez siroceta)', () => {
    const xml = '<w:body>' + p('<w:pPr><w:jc w:val="left"></w:jc></w:pPr>' + run('', 'x')) + '</w:body>';
    const r = stripDirectFormatting(xml, { stripLeftJustify: true });
    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('w:jc');
    expect(r.xml).not.toContain('</w:jc>');
  });

  it('samozatvarajuci <w:tbl/> ne zaglavi balancedRanges: kasniji odlomci se i dalje obradjuju', () => {
    const xml =
      '<w:body>' +
      '<w:tbl/>' + // prazna/degenerirana tablica (samozatvarajuca)
      p(run('<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>', 'tijelo poslije')) +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);
    expect(r.applied).toBe(true);
    expect(r.xml).not.toContain('Calibri'); // odlomak poslije NIJE izgubio obradu
  });

  it('run sa znakovnim stilom (w:rStyle) se NE dira: font nasljeduje iz stila, ne Normal/docDefaults', () => {
    const xml =
      '<w:body>' +
      p('<w:r><w:rPr><w:rStyle w:val="Emphasis"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t>istaknuto</w:t></w:r>') +
      '</w:body>';
    const r = stripDirectFormatting(xml, ALL);
    expect(r.applied).toBe(false);
    expect(r.xml).toContain('w:ascii="Calibri"'); // netaknuto (fail-safe)
  });
});
