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

/** Spojeni tekst svakog odlomka (w:t unutar w:p), ne sirovi XML. */
function paragraphTexts(xml: string): string[] {
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((match) => [...match[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => t[1]).join(''));
}

describe('citationBibliographySyncFixer: karakterizacija zatecenog dodavanja zapisa (Z36)', () => {
  it('korisnikov potvrdjeni tekst ulazi doslovno i iza sidra, bez abecednog mjesta', () => {
    const horvat = 'Horvat, I. (2022). Naslov.';
    const zoric = 'Zorić, P. (2020). Naslov Z.';
    const parts = { documentXml: `<w:document><w:body>${paragraph('Literatura')}${paragraph(horvat)}${paragraph(zoric)}<w:sectPr/></w:body></w:document>`, stylesXml: '' };
    const result = citationBibliographySyncFixer(parts, {
      version: 1,
      citations: [],
      entries: [{ id: 'new', paragraphIndices: [], anchorFingerprint: '', action: 'add', replacementText: 'Novak, N. (2021). Drugi naslov.', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: bibliographyAnchorFingerprint([3], zoric) } }],
      mappings: [],
    });
    expect(result.applied).toBe(true);
    expect(paragraphTexts(result.parts.documentXml)).toEqual(['Literatura', horvat, zoric, 'Novak, N. (2021). Drugi naslov.']);
  });

  it('krug 4: w:ptab ispred nepromijenjenog citata ne pomice upis; vidljivi tekst odlomka ostaje isti', () => {
    // Ulaz iz pregleda: analiza cita w:ptab kao tabulator, w:t ga nema, pa odmaci plana ne vrijede u w:t.
    const citationXml = '<w:p><w:r><w:t>Tekst</w:t><w:ptab w:relativeTo="margin" w:alignment="right" w:leader="none"/><w:t>više (Novak, 2022) i (Horvat, 2020).</w:t></w:r></w:p>';
    const seen = 'Tekst\tviše (Novak, 2022) i (Horvat, 2020).';
    const anchor = 'Horvat, I. (2020). Naslov.';
    const parts = { documentXml: `<w:document><w:body>${citationXml}${paragraph('Literatura')}${paragraph(anchor)}<w:sectPr/></w:body></w:document>`, stylesXml: '' };
    const start = seen.indexOf('Novak, 2022');
    const params: CitationBibliographySyncParams = {
      version: 1,
      citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + 'Novak, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, seen), replacementText: 'Novak, 2022', reason: 'citat uz dodani zapis literature' }],
      entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: '', action: 'add', replacementText: 'Novak, N. (2022). Naslov.', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: bibliographyAnchorFingerprint([3], anchor) } }],
      mappings: [{ citationId: 'c1', bibliographyEntryId: 'e1', confirmed: true }],
    };
    // Generator: u tekstu w:t isti odmaci pokazuju drugi isjecak nego u tekstu analize.
    expect(paragraphTexts(parts.documentXml)[0].slice(start, start + 'Novak, 2022'.length)).not.toBe('Novak, 2022');
    const result = citationBibliographySyncFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain(citationXml);
    expect(paragraphTexts(result.parts.documentXml)).toEqual(['Tekstviše (Novak, 2022) i (Horvat, 2020).', 'Literatura', anchor, 'Novak, N. (2022). Naslov.']);
    const second = citationBibliographySyncFixer(result.parts, params);
    expect(second.reason).toBe('already-ok');
    expect(second.parts.documentXml).toBe(result.parts.documentXml);
  });
});
