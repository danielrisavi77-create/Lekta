import { describe, it, expect } from 'vitest';
import {
  patchMargins,
  patchPaperSize,
  patchDefaultFont,
  patchDefaultSpacing,
  patchDefaultParagraphSpacing,
  patchDefaultAlignment,
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

  it('theme-only rFonts (bez w:ascii) je posten no-op, ne izmislja atribute', () => {
    // v1 granica: kad docDefaults koristi SAMO w:asciiTheme/w:hAnsiTheme, fixer ne
    // dira nista i vraca applied:false (fail-safe skip koji UI iskreno prijavi).
    const themed =
      '<w:styles><w:docDefaults><w:rPrDefault><w:rPr>' +
      '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/>' +
      '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>';
    const result = patchDefaultFont(themed, { fontName: 'Times New Roman' });
    expect(result.applied).toBe(false);
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
