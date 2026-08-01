import { describe, expect, it } from 'vitest';
import { titlePageFixer, type DocxXmlParts } from './fixers';

const parts = (documentXml: string): DocxXmlParts => ({
  documentXml,
  stylesXml: '<w:styles/>',
});

describe('titlePageFixer', () => {
  it('regenerira samo omeđenu prvu stranicu i skriva broj kroz titlePg', () => {
    const documentXml = '<w:document><w:body>' +
      '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Stari fakultet</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Stari naslov</w:t></w:r></w:p>' +
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
});
