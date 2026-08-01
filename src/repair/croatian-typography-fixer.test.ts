import { describe, expect, it } from 'vitest';
import { analyzeTypographyStructure } from '../analysis/typography-structure';
import { croatianTypographyFixer, type CroatianTypographyParams } from './croatian-typography-fixer';

const xml = '<w:document><w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Ovo  je tekst...</w:t><w:tab/></w:r></w:p><w:sectPr/></w:body></w:document>';
const parts = { documentXml: xml, stylesXml: '' };

describe('croatian-typography-fixer', () => {
  it('mijenja samo potvrđene raspone i čuva rPr', () => {
    const analysis = analyzeTypographyStructure(xml);
    const operations = analysis.occurrences.map((x) => ({ id: x.id, category: x.category, paragraphIndex: x.paragraphIndex, textNodeIndex: x.textNodeIndex, nodeKind: x.category === 'text-tabs' ? 'tab' as const : x.category === 'manual-line-breaks' ? 'line-break' as const : 'text' as const, ...(x.category === 'text-tabs' || x.category === 'manual-line-breaks' ? {} : { start: x.start, end: x.end }), before: x.rawText, replacementText: x.proposedText, anchorFingerprint: x.anchorFingerprint, confirmed: true as const }));
    const params: CroatianTypographyParams = { version: 1, categories: [...new Set(operations.map((x) => x.category))].map((category) => ({ category, consent: true as const })), operations };
    const result = croatianTypographyFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('<w:b/>');
    expect(result.parts.documentXml).not.toContain('  ');
    const second = croatianTypographyFixer(result.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });

  it('odbija operaciju bez privole kategorije', () => {
    const analysis = analyzeTypographyStructure(xml);
    const x = analysis.occurrences[0];
    const result = croatianTypographyFixer(parts, { version: 1, categories: [], operations: [{ id: x.id, category: x.category, paragraphIndex: x.paragraphIndex, textNodeIndex: x.textNodeIndex, nodeKind: 'text', start: x.start, end: x.end, before: x.rawText, replacementText: x.proposedText, anchorFingerprint: x.anchorFingerprint, confirmed: true }] });
    expect(result.reason).toBe('invalid-params');
  });
});
