import { describe, expect, it } from 'vitest';
import { analyzeFieldIntegrity } from '../analysis/field-integrity';
import { fieldIntegrityFixer } from './field-integrity-fixer';

const baseParts = () => ({
  documentXml: '<w:document><w:body><w:p><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:body></w:document>',
  stylesXml: '<w:styles/>',
  packageXmlParts: { 'word/settings.xml': '<w:settings/>' },
});

describe('field-integrity-fixer', () => {
  it('označi polje dirty, postavi updateFields i čuva rezultat', () => {
    const parts = baseParts();
    const field = analyzeFieldIntegrity({ parts: { 'word/document.xml': parts.documentXml, 'word/settings.xml': parts.packageXmlParts['word/settings.xml'] } }).fields[0];
    const result = fieldIntegrityFixer(parts, { version: 1, fields: [{ id: field.id, part: field.part, anchorFingerprint: field.anchorFingerprint, action: 'mark-dirty', confirmed: true }], settings: { updateFieldsOnOpen: true } });
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:dirty="true"');
    expect(result.parts.documentXml).toContain('<w:t>1</w:t>');
    expect(result.parts.packageXmlParts?.['word/settings.xml']).toContain('w:updateFields w:val="true"');
  });

  it('druga primjena istog plana je already-ok', () => {
    const parts = baseParts();
    const field = analyzeFieldIntegrity({ parts: { 'word/document.xml': parts.documentXml } }).fields[0];
    const params = { version: 1 as const, fields: [{ id: field.id, part: field.part, anchorFingerprint: field.anchorFingerprint, action: 'mark-dirty' as const, confirmed: true as const }] };
    const first = fieldIntegrityFixer(parts, params);
    const second = fieldIntegrityFixer(first.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });

  it('odbija zastarjelo sidro bez djelomične izmjene', () => {
    const parts = baseParts();
    const result = fieldIntegrityFixer(parts, { version: 1, fields: [{ id: 'word/document.xml:999', part: 'word/document.xml', anchorFingerprint: 'staro', action: 'mark-dirty', confirmed: true }] });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('no-target');
    expect(result.parts.documentXml).toBe(parts.documentXml);
  });

  it('zamijeni samo potvrđeni ručni sadržaj i drugu primjenu tretira kao already-ok', () => {
    const documentXml = '<w:document><w:body><w:p><w:r><w:t>Sadržaj</w:t></w:r></w:p><w:p><w:r><w:t>Uvod........ 1</w:t></w:r></w:p><w:p><w:r><w:t>Metodologija........ 4</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p></w:body></w:document>';
    const analysis = analyzeFieldIntegrity({ parts: { 'word/document.xml': documentXml }, paragraphs: [{ index: 0, text: 'Sadržaj' }, { index: 1, text: 'Uvod........ 1' }, { index: 2, text: 'Metodologija........ 4' }, { index: 3, text: 'Uvod', headingLevel: 1 }] });
    const candidate = analysis.manualTocCandidates[0];
    const params = { version: 1 as const, fields: [], manualToc: [{ startParagraphIndex: candidate.startParagraphIndex, endParagraphIndex: candidate.endParagraphIndex, anchorFingerprint: candidate.anchorFingerprint, action: 'replace-with-live-toc' as const, confirmed: true as const }] };
    const first = fieldIntegrityFixer({ documentXml, stylesXml: '<w:styles/>' }, params);
    expect(first.applied).toBe(true);
    expect(first.parts.documentXml).toContain('Table of Contents');
    const second = fieldIntegrityFixer(first.parts, params);
    expect(second.reason).toBe('already-ok');
  });
});
