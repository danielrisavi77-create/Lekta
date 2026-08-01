import { describe, expect, it } from 'vitest';
import { citationAnchorFingerprint } from '../analysis/citation-bibliography-sync';
import { bibliographyAnchorFingerprint } from '../analysis/bibliography-structure';
import { citationBibliographySyncFixer, type CitationBibliographySyncParams } from './citation-bibliography-sync-fixer';

const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('citationBibliographySyncFixer', () => {
  it('mijenja samo potvrđene raspone i podržava više citata u istom odlomku', () => {
    const text = 'Tekst (Horvat, 2022) i (Novak, 2021).';
    const first = text.indexOf('Horvat');
    const second = text.indexOf('Novak');
    const parts = { documentXml: `<w:document><w:body>${paragraph(text)}</w:body></w:document>`, stylesXml: '' };
    const params: CitationBibliographySyncParams = {
      version: 1,
      citations: [
        { id: 'c1', paragraphIndex: 1, start: first, end: first + 'Horvat, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, text), replacementText: 'Horvat, 2022b, str. 47', reason: 'isti autor i godina' },
        { id: 'c2', paragraphIndex: 1, start: second, end: second + 'Novak, 2021'.length, anchorFingerprint: citationAnchorFingerprint(1, text), replacementText: 'Novak, 2021, str. 9', reason: 'potvrđeni lokator' },
      ],
      entries: [],
      mappings: [],
    };
    const result = citationBibliographySyncFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('(Horvat, 2022b, str. 47)');
    expect(result.parts.documentXml).toContain('(Novak, 2021, str. 9)');
  });

  it('dodaje i uklanja body-level bibliografske zapise atomically', () => {
    const anchor = 'Horvat, I. (2022). Naslov.';
    const parts = { documentXml: `<w:document><w:body>${paragraph('Literatura')}${paragraph(anchor)}<w:sectPr/></w:body></w:document>`, stylesXml: '' };
    const add = citationBibliographySyncFixer(parts, {
      version: 1,
      citations: [],
      entries: [{ id: 'new', paragraphIndices: [], anchorFingerprint: '', action: 'add', replacementText: 'Novak, N. (2021). Drugi naslov.', insertionAnchor: { paragraphIndex: 2, anchorFingerprint: bibliographyAnchorFingerprint([2], anchor) } }],
      mappings: [],
    });
    expect(add.applied).toBe(true);
    expect(add.parts.documentXml).toContain('Drugi naslov');
    const remove = citationBibliographySyncFixer(add.parts, {
      version: 1,
      citations: [],
      entries: [{ id: 'old', paragraphIndices: [2], anchorFingerprint: bibliographyAnchorFingerprint([2], anchor), action: 'remove' }],
      mappings: [],
    });
    expect(remove.applied).toBe(true);
    expect(remove.parts.documentXml).not.toContain('Horvat, I.');
  });

  it('odbija zastarjeli anchor i drugi prolaz zamjene vraća already-ok', () => {
    const text = 'Tekst (Horvat, 2022).';
    const start = text.indexOf('Horvat');
    const parts = { documentXml: `<w:document><w:body>${paragraph(text)}</w:body></w:document>`, stylesXml: '' };
    const params: CitationBibliographySyncParams = {
      version: 1,
      citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + 'Horvat, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, text), replacementText: 'Horvat, 2022a', reason: 'sufiks' }],
      entries: [],
      mappings: [],
    };
    const first = citationBibliographySyncFixer(parts, params);
    const second = citationBibliographySyncFixer(first.parts, params);
    expect(first.applied).toBe(true);
    expect(second.reason).toBe('already-ok');
    const stale = citationBibliographySyncFixer(parts, { ...params, citations: [{ ...params.citations[0], anchorFingerprint: 'citation-deadbeef' }] });
    expect(stale.reason).toBe('invalid-params');
  });

  it('dopušta potvrđeno mapiranje na postojeći bibliografski zapis bez prepisivanja zapisa', () => {
    const text = 'Tekst (Horvat, 2022).';
    const start = text.indexOf('Horvat');
    const parts = { documentXml: `<w:document><w:body>${paragraph(text)}${paragraph('Literatura')}${paragraph('Horvat, I. (2022). Naslov.')}</w:body></w:document>`, stylesXml: '' };
    const result = citationBibliographySyncFixer(parts, {
      version: 1,
      citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + 'Horvat, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, text), replacementText: 'Horvat, 2022', reason: 'potvrđeno mapiranje' }],
      entries: [],
      mappings: [{ citationId: 'c1', bibliographyEntryId: 'bibliography-3', confirmed: true }],
    });
    expect(result.reason).toBe('already-ok');
    expect(result.parts.documentXml).toContain('Horvat, I. (2022). Naslov.');
  });
});
