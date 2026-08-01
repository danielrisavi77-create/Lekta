import { describe, expect, it } from 'vitest';
import { parseXml } from '../docx/parser';
import { analyzeSectionStructure, sectionAnchorFingerprint } from './section-structure';

const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:titlePg/><w:pgNumType w:fmt="lowerRoman"/></w:sectPr></w:pPr><w:r><w:t>Naslovnica</w:t></w:r></w:p><w:p><w:r><w:t>Uvod</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgNumType w:fmt="decimal" w:start="1"/></w:sectPr></w:body></w:document>`;

describe('section structure', () => {
  it('detektira više sekcija, geometriju i numeriranje', () => {
    const document = parseXml(xml, 'sections');
    const result = analyzeSectionStructure({ document, packageXmlParts: { 'word/settings.xml': '<w:settings xmlns:w="x"><w:evenAndOddHeaders/></w:settings>' }, paragraphs: [{ index: 1, text: 'Naslovnica' }] });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].differentFirstPage).toBe(true);
    expect(result.sections[0].numbering.format).toBe('lowerRoman');
    expect(result.sections[1].geometry.orientation).toBe('landscape');
    expect(result.sections[1].numbering.start).toBe(1);
    expect(result.sections[0].anchorFingerprint).toBe(sectionAnchorFingerprint('Naslovnica', 0));
    expect(result.summary.differentOddEven).toBe(2);
  });
});
