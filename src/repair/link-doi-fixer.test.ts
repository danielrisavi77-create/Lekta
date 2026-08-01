import { describe, expect, it } from 'vitest';
import { extractBodyParagraphs } from '../analysis/typography-structure';
import { linkDoiFixer, type LinkDoiFixParams } from './link-doi-fixer';

const documentXml = '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>doi:10.1234/abc</w:t></w:r></w:p></w:body></w:document>';
const parts = { documentXml, stylesXml: '', documentRelsXml: '<Relationships></Relationships>' };

describe('link DOI fixer', () => {
  it('pretvara DOI u hyperlink i dodaje relaciju', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: LinkDoiFixParams = { version: 1, operations: [{ id: 'doi', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 15, anchorFingerprint: anchor.fingerprint, before: 'doi:10.1234/abc', replacementText: 'https://doi.org/10.1234/abc', targetUrl: 'https://doi.org/10.1234/abc', action: 'normalize-doi', confirmed: true }] };
    const result = linkDoiFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:hyperlink');
    expect(result.parts.documentRelsXml).toContain('https://doi.org/10.1234/abc');
  });

  it('odbija zastarjelo sidro i drugu primjenu označava already-ok', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: LinkDoiFixParams = { version: 1, operations: [{ id: 'doi', part: 'word/document.xml', paragraphIndex: 1, start: 0, end: 15, anchorFingerprint: anchor.fingerprint, before: 'doi:10.1234/abc', replacementText: 'https://doi.org/10.1234/abc', targetUrl: 'https://doi.org/10.1234/abc', action: 'normalize-doi', confirmed: true }] };
    const first = linkDoiFixer(parts, params);
    const second = linkDoiFixer(first.parts, params);
    expect(second.reason).toBe('already-ok');
    expect(linkDoiFixer(parts, { ...params, operations: [{ ...params.operations[0], anchorFingerprint: 'stale' }] }).reason).toBe('stale-anchor');
  });
});
