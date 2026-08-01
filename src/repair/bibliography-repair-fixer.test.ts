import { describe, expect, it } from 'vitest';
import { bibliographyAnchorFingerprint } from '../analysis/bibliography-structure';
import { bibliographyRepairFixer, type BibliographyRepairParams } from './bibliography-repair-fixer';

const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('bibliographyRepairFixer', () => {
  it('primjenjuje hanging indent, normalizira zapis i sortira odabrane odlomke', () => {
    const first = 'Zupan, I. (2020). Zapis. https://example.org/a.';
    const second = 'Anić, A. (2019). Drugi zapis. doi:10.1234/abc';
    const parts = {
      documentXml: `<w:document><w:body>${paragraph('Literatura')}${paragraph(first)}${paragraph(second)}<w:sectPr/></w:body></w:document>`,
      stylesXml: '',
      documentRelsXml: '<Relationships></Relationships>',
    };
    const params: BibliographyRepairParams = {
      version: 1,
      entries: [
        { id: 'z', paragraphIndices: [2], anchorFingerprint: bibliographyAnchorFingerprint([2], first), normalizeText: true, hyperlink: 'url' },
        { id: 'a', paragraphIndices: [3], anchorFingerprint: bibliographyAnchorFingerprint([3], second), normalizeText: true, hyperlink: 'doi' },
      ],
      order: ['a', 'z'],
      options: { hangingIndentTwips: 709, stripUrlTerminalPunctuation: true },
    };
    const result = bibliographyRepairFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml.indexOf('Drugi zapis')).toBeLessThan(result.parts.documentXml.indexOf('Zapis.'));
    expect(result.parts.documentXml).toContain('w:hanging="709"');
    expect(result.parts.documentRelsXml).toContain('hyperlink');
  });

  it('odbija promijenjeni anchor i ne mijenja dokument', () => {
    const parts = { documentXml: `<w:document><w:body>${paragraph('Literatura')}${paragraph('Horvat, I. (2020). Naslov.')}</w:body></w:document>`, stylesXml: '' };
    const result = bibliographyRepairFixer(parts, {
      version: 1,
      entries: [{ id: 'x', paragraphIndices: [2], anchorFingerprint: 'biblio-stale', normalizeText: true }],
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('invalid-params');
    expect(result.parts.documentXml).toBe(parts.documentXml);
  });

  it('drugu primjenu istog plana prepoznaje kao already-ok', () => {
    const text = 'Horvat, I. (2020). Naslov.';
    const parts = { documentXml: `<w:document><w:body>${paragraph('Literatura')}${paragraph(text)}</w:body></w:document>`, stylesXml: '' };
    const params: BibliographyRepairParams = { version: 1, entries: [{ id: 'x', paragraphIndices: [2], anchorFingerprint: bibliographyAnchorFingerprint([2], text), normalizeText: true }], options: { hangingIndentTwips: 709 } };
    const first = bibliographyRepairFixer(parts, params);
    const second = bibliographyRepairFixer(first.parts, params);
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });

  it('prepoznaje already-ok nakon potvrđene zamjene teksta', () => {
    const text = 'Horvat, I. (2020). Naslov.';
    const replacementText = 'Horvat, I. (2020). Naslov rada.';
    const parts = { documentXml: `<w:document><w:body>${paragraph('Literatura')}${paragraph(text)}</w:body></w:document>`, stylesXml: '' };
    const params: BibliographyRepairParams = {
      version: 1,
      entries: [{ id: 'x', paragraphIndices: [2], anchorFingerprint: bibliographyAnchorFingerprint([2], text), replacementText }],
    };
    const first = bibliographyRepairFixer(parts, params);
    const second = bibliographyRepairFixer(first.parts, params);
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });

  it('dodaje potvrđenu a/b/c oznaku uz godinu', () => {
    const text = 'Horvat, I. (2020). Naslov.';
    const parts = { documentXml: `<w:document><w:body>${paragraph('Literatura')}${paragraph(text)}</w:body></w:document>`, stylesXml: '' };
    const result = bibliographyRepairFixer(parts, {
      version: 1,
      entries: [{ id: 'x', paragraphIndices: [2], anchorFingerprint: bibliographyAnchorFingerprint([2], text) }],
      suffixes: [{ entryId: 'x', suffix: 'a' }],
    });
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('2020a');
  });
});
