import { describe, expect, it } from 'vitest';
import { anchorFingerprintForXml } from '../analysis/element-structure';
import { tableFigureRescueFixer } from './table-figure-rescue-fixer';

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
