import { describe, expect, it } from 'vitest';

import { analyzeFieldIntegrity } from '../src/analysis/field-integrity';
import { validateAssistedParams } from '../src/repair/contract/assisted-request-policy';
import { fieldIntegrityFixer } from '../src/repair/field-integrity-fixer';
import { fieldIntegrityRepairableItem } from '../src/ui/repair-items';

const ORPHAN_TOC_XML = [
  '<w:document><w:body><w:p>',
  '<w:r><w:t>Vlada UAE. Pristupljeno 8. kolovoza 2026.</w:t></w:r>',
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
  '<w:r><w:instrText> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>',
  '<w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r>',
  '<w:r><w:instrText> PAGEREF _Toc2 \\h </w:instrText></w:r>',
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
  '</w:p></w:body></w:document>',
].join('');

const NESTED_ORPHAN_TOC_XML = [
  '<w:document><w:body><w:p>',
  '<w:r><w:t>Vlada UAE. Pristupljeno 8. kolovoza 2026.</w:t></w:r>',
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
  '<w:r><w:instrText> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r>',
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
  '<w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r>',
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
  '<w:r><w:instrText> PAGEREF _Toc2 \\h </w:instrText></w:r>',
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
  '</w:p></w:body></w:document>',
].join('');

function visibleText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)]
    .map((match) => match[1])
    .join('')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function forcedRemovalParams(xml: string) {
  const field = analyzeFieldIntegrity({ parts: { 'word/document.xml': xml } })
    .fields.find((candidate) => candidate.kind === 'toc');
  if (!field) throw new Error('Fixture mora sadrzavati TOC polje.');
  return {
    version: 1 as const,
    fields: [{
      id: field.id,
      part: field.part,
      anchorFingerprint: field.anchorFingerprint,
      action: 'remove-orphan-control' as const,
      confirmed: true as const,
    }],
  };
}

function withOrphanPayload(payload: string): string {
  return ORPHAN_TOC_XML.replace(
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
    `${payload}<w:r><w:fldChar w:fldCharType="end"/></w:r>`,
  );
}

describe('orphan TOC field-control repair', () => {
  it('offers an explicit structural action, validates it, and removes no visible text', () => {
    const integrity = analyzeFieldIntegrity({
      parts: { 'word/document.xml': ORPHAN_TOC_XML },
    });
    expect(integrity.fields).toHaveLength(1);
    expect(integrity.fields[0]).toMatchObject({
      kind: 'toc',
      status: 'needs-render',
      cachedResult: '',
    });
    expect(integrity.fields[0].instruction).toContain('PAGEREF _Toc1');

    const items = fieldIntegrityRepairableItem({ details: { fieldIntegrity: integrity } });
    expect(items).toHaveLength(1);
    expect(items[0].label).toContain('uklanjanje nevaljane skrivene kontrole');
    expect(items[0].requiresConfirmation).toBe(true);
    expect(items[0].confirmationText).toContain('nevaljana skrivena kontrola');
    const params = items[0].params as any;
    expect(params.fields).toHaveLength(1);
    expect(params.fields[0].action).toBe('remove-orphan-control');
    expect(params.settings).toBeUndefined();
    expect(validateAssistedParams('field-integrity-fixer', params)).toBe(true);

    const result = fieldIntegrityFixer({
      documentXml: ORPHAN_TOC_XML,
      stylesXml: '<w:styles/>',
    }, params);

    expect(result.applied).toBe(true);
    expect(result.afterLabel).toBe('Nevaljana skrivena kontrola uklonjena');
    expect(result.parts.documentXml).toContain(
      '<w:t>Vlada UAE. Pristupljeno 8. kolovoza 2026.</w:t>',
    );
    expect(visibleText(result.parts.documentXml)).toBe(visibleText(ORPHAN_TOC_XML));
    expect(result.parts.documentXml).not.toContain('w:fldChar');
    expect(result.parts.documentXml).not.toContain('w:instrText');
    expect(result.parts.documentXml).not.toContain('PAGEREF');

    const second = fieldIntegrityFixer(result.parts, params);
    expect(second.applied).toBe(false);
    expect(second.parts.documentXml).toBe(result.parts.documentXml);
  });

  it('balances and removes the outer field while safely consuming nested PAGEREF controls', () => {
    const beforeText = visibleText(NESTED_ORPHAN_TOC_XML);
    const result = fieldIntegrityFixer(
      { documentXml: NESTED_ORPHAN_TOC_XML, stylesXml: '<w:styles/>' },
      forcedRemovalParams(NESTED_ORPHAN_TOC_XML),
    );

    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).not.toContain('w:fldChar');
    expect(result.parts.documentXml).not.toContain('w:instrText');
    expect(visibleText(result.parts.documentXml)).toBe(beforeText);
  });

  it('rejects a field separator even when the cached result is empty', () => {
    const xml = withOrphanPayload('<w:r><w:fldChar w:fldCharType="separate"/></w:r>');
    const result = fieldIntegrityFixer(
      { documentXml: xml, stylesXml: '<w:styles/>' },
      forcedRemovalParams(xml),
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(xml);
  });

  it('rejects cached visible text without changing the document', () => {
    const xml = withOrphanPayload(
      '<w:r><w:t>1 Uvod</w:t></w:r>',
    );
    const result = fieldIntegrityFixer(
      { documentXml: xml, stylesXml: '<w:styles/>' },
      forcedRemovalParams(xml),
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(xml);
  });

  it.each([
    ['symbol', '<w:r><w:sym w:font="Symbol" w:char="F0B7"/></w:r>'],
    ['math', '<w:r><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:r>'],
    ['drawing', '<w:r><w:drawing><wp:inline/></w:drawing></w:r>'],
    ['tab', '<w:r><w:tab/></w:r>'],
    ['break', '<w:r><w:br w:type="line"/></w:r>'],
    ['object', '<w:r><w:object><v:shape/></w:object></w:r>'],
  ])('rejects renderable %s content inside the candidate field', (_name, payload) => {
    const xml = withOrphanPayload(payload);
    const result = fieldIntegrityFixer(
      { documentXml: xml, stylesXml: '<w:styles/>' },
      forcedRemovalParams(xml),
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(xml);
  });

  it('rejects malformed nesting when the nested end has no matching outer end', () => {
    const xml = NESTED_ORPHAN_TOC_XML.replace(
      '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
      '</w:p>',
    );
    const result = fieldIntegrityFixer(
      { documentXml: xml, stylesXml: '<w:styles/>' },
      forcedRemovalParams(xml),
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(xml);
  });

  it('rejects an apparent field whose controls cross a paragraph boundary', () => {
    const xml = ORPHAN_TOC_XML.replace(
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>',
      '</w:p><w:p><w:r><w:fldChar w:fldCharType="end"/></w:r>',
    );
    const result = fieldIntegrityFixer(
      { documentXml: xml, stylesXml: '<w:styles/>' },
      forcedRemovalParams(xml),
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('unsupported-structure');
    expect(result.parts.documentXml).toBe(xml);
  });

  it('does not relabel an ordinary empty TOC field as removable', () => {
    const ordinary = ORPHAN_TOC_XML.replace(
      '<w:r><w:instrText> PAGEREF _Toc1 \\h </w:instrText></w:r>'
        + '<w:r><w:instrText> PAGEREF _Toc2 \\h </w:instrText></w:r>',
      '',
    );
    const integrity = analyzeFieldIntegrity({ parts: { 'word/document.xml': ordinary } });
    const params = fieldIntegrityRepairableItem({
      details: { fieldIntegrity: integrity },
    })[0].params as any;
    expect(params.fields[0].action).toBe('mark-dirty');
  });

  it('does not offer removal when the analyzer reports any cached result', () => {
    const integrity = analyzeFieldIntegrity({ parts: { 'word/document.xml': ORPHAN_TOC_XML } });
    const withCachedResult = {
      ...integrity,
      fields: integrity.fields.map((field) => ({
        ...field,
        cachedResult: '1 Uvod 1',
      })),
    };

    const params = fieldIntegrityRepairableItem({
      details: { fieldIntegrity: withCachedResult },
    })[0].params as any;

    expect(params.fields[0].action).toBe('mark-dirty');
  });
});
