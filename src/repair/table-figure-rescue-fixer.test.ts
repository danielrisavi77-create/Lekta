import { describe, expect, it } from 'vitest';
import { anchorFingerprintForXml } from '../analysis/element-structure';
import { tableFigureRescueFixer } from './table-figure-rescue-fixer';
import { detectIntegrityFailure } from './apply-fixers';

const table = `<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr><w:trPr/></w:tr><w:tr><w:tc><w:tcPr><w:tcW w:w="4500"/></w:tcPr></w:tc><w:tc><w:tcPr><w:tcW w:w="4500"/></w:tcPr></w:tc></w:tr></w:tbl>`;
const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${table}</w:body></w:document>`;
const source = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t>Izvor: službeni podaci</w:t></w:r></w:p>`;

describe('table-figure-rescue fixer', () => {
  it('dodaje fiksnu širinu, zaglavlje i cantSplit bez promjene teksta', () => {
    const parts = { documentXml, stylesXml: '' };
    const result = tableFigureRescueFixer(parts, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', table), textWidthEmu: 6_000_000, actions: { fitToTextWidth: true, equalColumns: true, repeatHeader: true, preventRowSplit: true, center: true } }], figures: [] });
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:tblLayout');
    expect(result.parts.documentXml).toContain('w:tblHeader');
    expect(result.parts.documentXml).toContain('w:cantSplit');
    expect(result.parts.documentXml).toContain('w:jc w:val="center"');
    const second = tableFigureRescueFixer(result.parts, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', table), textWidthEmu: 6_000_000, actions: { fitToTextWidth: true, equalColumns: true, repeatHeader: true, preventRowSplit: true, center: true } }], figures: [] });
    expect(second.applied).toBe(false);
  });

  it('primjenjuje profilnu tipografiju i odvaja potvrđeni izvor', () => {
    const fontTable = table.replace('</w:tc></w:tr>', '<w:p><w:r><w:t>X</w:t></w:r></w:p></w:tc></w:tr>');
    const parts = { documentXml: `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${fontTable}${source}</w:body></w:document>`, stylesXml: '' };
    const result = tableFigureRescueFixer(parts, { version: 1, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', fontTable), typography: { font: 'Arial', sizePt: 10, beforePt: 0, afterPt: 3 }, source: { paragraphIndex: 2, anchorFingerprint: anchorFingerprintForXml('figure', source) }, actions: { applyProfileTypography: true, separateSource: true } }], figures: [] });
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:ascii="Arial"');
    expect(result.parts.documentXml).toContain('w:after="60"');
    expect(result.parts.documentXml).toContain('Izvor: službeni podaci');
  });
});

/**
 * T65: equalColumns je prepisivao SVAKI <w:tcW> u tablici sirinom JEDNOG stupca i nije gledao
 * spojene celije. Celija s <w:gridSpan w:val="2"/> tako je dobivala sirinu jednog stupca, pa grid
 * i celije vise nisu bili uskladjeni. Odluka (opcija A): na tablici sa spojenim celijama
 * (gridSpan ili vMerge) equalColumns se preskace, a tblGrid i svi tcW ostaju bajt-identicni.
 * Ostale akcije istog zahtjeva rade kao i prije.
 */
const WNS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const cell = (width: number, text: string, extra = '') => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${extra}</w:tcPr><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
// Jedan red, grid 2000/3000/4000 (ukupno 9000, jedan stupac = 3000); prva celija se proteze preko dva stupca.
const gridSpanTable = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr>${cell(5000, 'Spojeno zaglavlje', '<w:gridSpan w:val="2"/>')}${cell(4000, 'Desno')}</w:tr></w:tbl>`;
// Dva reda, grid 3000/6000, prvi stupac okomito spojen.
const vMergeTable = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6000"/></w:tblGrid><w:tr>${cell(3000, 'Skupina', '<w:vMerge w:val="restart"/>')}${cell(6000, 'Prvi')}</w:tr><w:tr>${cell(3000, '', '<w:vMerge/>')}${cell(6000, 'Drugi')}</w:tr></w:tbl>`;
const wrapDoc = (tbl: string) => `<w:document ${WNS}><w:body>${tbl}</w:body></w:document>`;
type Actions = Partial<Record<'fitToTextWidth' | 'equalColumns' | 'repeatHeader' | 'preventRowSplit' | 'center', true>>;
const rescueParams = (tbl: string, actions: Actions, textWidthEmu?: number) => ({ version: 1 as const, tables: [{ id: 't', bodyChildIndex: 0, anchorFingerprint: anchorFingerprintForXml('table', tbl), ...(textWidthEmu ? { textWidthEmu } : {}), actions }], figures: [] });
const gridOf = (xml: string) => xml.match(/<w:tblGrid\b[^>]*>[\s\S]*?<\/w:tblGrid>/i)?.[0];
const tcWidths = (xml: string) => [...xml.matchAll(/<w:tcW\b[^>]*>/gi)].map((m) => m[0]);
/** Vidljivi tekst: spojeni w:t svakog odlomka, procitan kroz DOM, ne sirovi XML. */
const paragraphTexts = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml.replace(/\r/g, ''), 'application/xml');
  return [...doc.getElementsByTagName('w:p')].map((p) => [...p.getElementsByTagName('w:t')].map((t) => t.textContent ?? '').join(''));
};
const integrity = (before: string, after: string) => detectIntegrityFailure([{ name: 'word/document.xml', xml: after }], ['word/document.xml'], ['word/document.xml'], [], { 'word/document.xml': before });

describe('table-figure-rescue fixer: equalColumns i spojene celije (T65)', () => {
  it('gridSpan: celija preko dva stupca ne dobiva sirinu jednog stupca', () => {
    const input = wrapDoc(gridSpanTable);
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(gridSpanTable, { equalColumns: true, fitToTextWidth: true }));
    const out = result.parts.documentXml;
    // Na masteru: tcW spojene celije postaje 3000 (jedan stupac), a grid 3000/3000/3000.
    expect(tcWidths(out)[0]).not.toBe('<w:tcW w:w="3000" w:type="dxa"/>');
    expect(gridOf(out)).toBe(gridOf(input));
    expect(tcWidths(out)).toEqual(tcWidths(input));
  });

  it('vMerge: okomito spojena tablica ne dobiva prepisan grid ni tcW', () => {
    const input = wrapDoc(vMergeTable);
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(vMergeTable, { equalColumns: true, repeatHeader: true }));
    const out = result.parts.documentXml;
    expect(gridOf(out)).toBe(gridOf(input));
    expect(tcWidths(out)).toEqual(tcWidths(input));
  });

  for (const [name, tbl] of [['gridSpan', gridSpanTable], ['vMerge', vMergeTable]] as const) {
    it(`${name}: ostale akcije rade, grid i tcW bajt-identicni, tekst isti, integritet cist, drugi prolaz no-op`, () => {
      const input = wrapDoc(tbl);
      const params = rescueParams(tbl, { equalColumns: true, fitToTextWidth: true, repeatHeader: true, preventRowSplit: true, center: true }, 6_000_000);
      const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, params);
      const out = result.parts.documentXml;
      expect(result.applied).toBe(true);
      expect(out).toContain('<w:tblLayout w:type="fixed"/>');
      expect(out).toContain('<w:tblW w:w="9449" w:type="dxa"/>');
      expect(out).toContain('<w:jc w:val="center"/>');
      expect(out).toContain('<w:tblHeader w:val="true"/>');
      expect((out.match(/<w:cantSplit\/>/g) || []).length).toBe((input.match(/<w:tr>/g) || []).length);
      expect(gridOf(out)).toBe(gridOf(input));
      expect(tcWidths(out)).toEqual(tcWidths(input));
      expect(out).toContain(name === 'gridSpan' ? '<w:gridSpan w:val="2"/>' : '<w:vMerge w:val="restart"/>');
      expect(paragraphTexts(out)).toEqual(paragraphTexts(input));
      expect(integrity(input, out)).toBeNull();
      const second = tableFigureRescueFixer(result.parts, params);
      expect(second.applied).toBe(false);
      expect(second.parts.documentXml).toBe(out);
    });

    it(`${name}: samo equalColumns ne mijenja nista i javlja unsupported-structure`, () => {
      const input = wrapDoc(tbl);
      const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(tbl, { equalColumns: true }));
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('unsupported-structure');
      expect(result.parts.documentXml).toBe(input);
    });
  }

  it('drugi prefiks za isti imenski prostor ne zaobilazi gard (nalaz pregleda)', () => {
    const aliased = gridSpanTable
      .replace(`<w:tbl ${WNS}>`, `<w:tbl ${WNS} xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`)
      .replace('<w:gridSpan w:val="2"/>', '<x:gridSpan x:val="2"/>');
    const input = wrapDoc(aliased);
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, rescueParams(aliased, { equalColumns: true }));
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(input);
  });

  it('zakomentirani gridSpan ne gasi equalColumns (nalaz pregleda)', () => {
    const plain = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="7000"/></w:tblGrid><w:tr><!-- <w:gridSpan w:val="2"/> -->${cell(2000, 'A')}${cell(7000, 'B')}</w:tr></w:tbl>`;
    const result = tableFigureRescueFixer({ documentXml: wrapDoc(plain), stylesXml: '' }, rescueParams(plain, { equalColumns: true }));
    expect(result.applied).toBe(true);
    expect(gridOf(result.parts.documentXml)).toBe('<w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>');
  });

  it('tablica bez spojenih celija i dalje dobiva jednake stupce (gard nije globalan)', () => {
    const plain = `<w:tbl ${WNS}><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="3000"/><w:gridCol w:w="4000"/></w:tblGrid><w:tr>${cell(2000, 'A')}${cell(3000, 'B')}${cell(4000, 'C')}</w:tr></w:tbl>`;
    const input = wrapDoc(plain);
    const params = rescueParams(plain, { equalColumns: true });
    const result = tableFigureRescueFixer({ documentXml: input, stylesXml: '' }, params);
    const out = result.parts.documentXml;
    expect(result.applied).toBe(true);
    expect(gridOf(out)).toBe('<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>');
    expect(tcWidths(out)).toEqual(Array(3).fill('<w:tcW w:w="3000" w:type="dxa"/>'));
    expect(paragraphTexts(out)).toEqual(paragraphTexts(input));
    expect(integrity(input, out)).toBeNull();
    expect(tableFigureRescueFixer(result.parts, params).parts.documentXml).toBe(out);
  });
});
