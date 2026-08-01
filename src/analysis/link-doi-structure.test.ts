import { describe, expect, it } from 'vitest';
import { analyzeLinkDoiStructure } from './link-doi-structure';

const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const doc = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;

describe('link and DOI structure', () => {
  it('prepoznaje običan URL, DOI i tracking parametre', () => {
    const xml = doc(p('https://example.org/a?utm_source=x doi:10.1234/abc'));
    const result = analyzeLinkDoiStructure({ documentXml: xml, paragraphs: [{ index: 1, text: 'https://example.org/a?utm_source=x doi:10.1234/abc' }], rules: { removeTrackingParameters: true } });
    expect(result.summary.total).toBe(2);
    expect(result.summary.doiCandidates).toBe(1);
    expect(result.occurrences.some((x) => x.status === 'tracking-parameters')).toBe(true);
  });

  it('prepoznaje postojeći Word hyperlink i ne tretira e-mail kao URL', () => {
    const xml = doc('<w:p><w:hyperlink r:id="rId5"><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>https://example.org</w:t></w:r></w:hyperlink><w:r><w:t> test@example.org</w:t></w:r></w:p>');
    const rels = '<Relationships><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org" TargetMode="External"/></Relationships>';
    const result = analyzeLinkDoiStructure({ documentXml: xml, documentRelsXml: rels, paragraphs: [{ index: 1, text: 'https://example.org test@example.org' }] });
    expect(result.occurrences).toHaveLength(1);
    expect(result.occurrences[0].status).toBe('hyperlink-ok');
  });
});
