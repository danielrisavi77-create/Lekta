import { describe, expect, it } from 'vitest';
import { sectionAnchorFingerprint } from '../analysis/section-structure';
import { sectionSurgeryFixer } from './section-surgery-fixer';

const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="decimal"/></w:sectPr></w:pPr><w:r><w:t>Naslovnica</w:t></w:r></w:p><w:p><w:r><w:t>Glavni dio</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgNumType w:fmt="decimal"/></w:sectPr></w:body></w:document>`;

describe('section surgery fixer', () => {
  it('primjenjuje geometriju, rimsko numeriranje i naslovnicu bez broja', () => {
    const result = sectionSurgeryFixer({ documentXml, stylesXml: '' }, { version: 1, operations: [
      { id: 'title', kind: 'set-title-page', sectionOrdinal: 0, anchorFingerprint: sectionAnchorFingerprint('Naslovnica', 0), enabled: true, confirmed: true },
      { id: 'front-num', kind: 'set-numbering', sectionOrdinal: 0, anchorFingerprint: sectionAnchorFingerprint('Naslovnica', 0), numbering: { format: 'lowerRoman', start: 1 }, confirmed: true },
      { id: 'main-geo', kind: 'set-geometry', sectionOrdinal: 1, anchorFingerprint: sectionAnchorFingerprint('', 2), orientation: 'landscape', confirmed: true },
    ] });
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('<w:titlePg/>');
    expect(result.parts.documentXml).toContain('w:fmt="lowerRoman"');
    expect(result.parts.documentXml).toContain('w:orient="landscape"');
    const second = sectionSurgeryFixer(result.parts, { version: 1, operations: [
      { id: 'title', kind: 'set-title-page', sectionOrdinal: 0, anchorFingerprint: sectionAnchorFingerprint('Naslovnica', 0), enabled: true, confirmed: true },
      { id: 'front-num', kind: 'set-numbering', sectionOrdinal: 0, anchorFingerprint: sectionAnchorFingerprint('Naslovnica', 0), numbering: { format: 'lowerRoman', start: 1 }, confirmed: true },
      { id: 'main-geo', kind: 'set-geometry', sectionOrdinal: 1, anchorFingerprint: sectionAnchorFingerprint('', 2), orientation: 'landscape', confirmed: true },
    ] });
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });

  it('odbija zastarjelo sidro bez djelomične izmjene', () => {
    const result = sectionSurgeryFixer({ documentXml, stylesXml: '' }, { version: 1, operations: [{ id: 'stale', kind: 'set-title-page', sectionOrdinal: 0, anchorFingerprint: 'stale', enabled: true, confirmed: true }] });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(documentXml);
  });

  it('može umetnuti novu sekcijsku granicu nakon body-level odlomka', () => {
    const result = sectionSurgeryFixer({ documentXml, stylesXml: '' }, { version: 1, operations: [{ id: 'insert', kind: 'insert-section', sectionOrdinal: 1, insertAfterBodyChildIndex: 1, anchorFingerprint: sectionAnchorFingerprint('Glavni dio', 1), orientation: 'landscape', confirmed: true }] });
    expect(result.applied).toBe(true);
    expect((result.parts.documentXml.match(/<w:sectPr\b/g) || []).length).toBe(3);
    expect(result.parts.documentXml).toContain('w:orient="landscape"');
  });
});
