import { describe, expect, it } from 'vitest';
import { extractBodyParagraphs } from '../analysis/typography-structure';
import { requiredSectionFixer, type RequiredSectionFixParams } from './required-section-fixer';

const body = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p><w:sectPr/>';
const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const parts = { documentXml, stylesXml: '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>', numberingXml: '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>', packageXmlParts: { '[Content_Types].xml': '<Types></Types>', 'word/_rels/document.xml.rels': '<Relationships></Relationships>' } };

describe('required section fixer', () => {
  it('umeće naslov, stil, numbering i komentar uz sigurno sidro', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: RequiredSectionFixParams = { version: 1, sections: [{ id: 'abstract', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 1, anchorFingerprint: anchor.fingerprint, position: 'before' }, headingLevel: 1, numbered: true, commentText: 'Ovdje unesi sadržaj', confirmed: true }] };
    const result = requiredSectionFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('Abstract');
    expect(result.parts.documentXml).toContain('w:numId');
    expect(result.parts.documentXml).toContain('commentRangeStart');
    expect(result.parts.addedPackageParts?.[0].name).toBe('word/comments.xml');
    expect(result.parts.contentTypesXml).toContain('/word/comments.xml');
  });

  it('odbija zastarjelo sidro bez djelomične izmjene', () => {
    const result = requiredSectionFixer(parts, { version: 1, sections: [{ id: 'abstract', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 1, anchorFingerprint: 'stale', position: 'before' }, headingLevel: 1, numbered: false, confirmed: true }] });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('stale-anchor');
    expect(result.parts.documentXml).toBe(documentXml);
  });

  it('druga primjena istog plana je already-ok', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: RequiredSectionFixParams = { version: 1, sections: [{ id: 'abstract', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 1, anchorFingerprint: anchor.fingerprint, position: 'before' }, headingLevel: 1, numbered: false, confirmed: true }] };
    const first = requiredSectionFixer(parts, params);
    const second = requiredSectionFixer(first.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });
});
