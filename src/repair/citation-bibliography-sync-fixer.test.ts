import { describe, expect, it } from 'vitest';
import { citationAnchorFingerprint } from '../analysis/citation-bibliography-sync';
import { bibliographyAnchorFingerprint } from '../analysis/bibliography-structure';
import { citationBibliographySyncFixer, type CitationBibliographySyncParams } from './citation-bibliography-sync-fixer';
import { parseXml, paragraphText as parserParagraphText } from '../docx/parser';

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

  it('krug 5: korisnikov zapis uz okvir (w:framePr) umece se kao na masteru; predlozak uz isti okvir se odbija s razlogom', () => {
    const framed = '<w:pPr><w:framePr w:w="9000" w:wrap="around" w:vAnchor="text" w:hAnchor="page" w:x="1500" w:y="1"/></w:pPr>';
    const cite = 'Tekst (Novak, 2021).';
    const horvat = 'Horvat, I. (2020). Naslov.';
    const zoric = 'Zorić, P. (2019). Naslov Z.';
    const documentXml = `<w:document><w:body>${paragraph(cite)}${paragraph('Literatura')}${paragraph(horvat)}<w:p>${framed}<w:r><w:t>${zoric}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`;
    const parts = { documentXml, stylesXml: '' };
    const start = cite.indexOf('Novak, 2021');
    const params = (entry: Partial<CitationBibliographySyncParams['entries'][number]>): CitationBibliographySyncParams => ({
      version: 1,
      citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + 'Novak, 2021'.length, anchorFingerprint: citationAnchorFingerprint(1, cite), replacementText: 'Novak, 2021', reason: 'citat uz dodani zapis literature' }],
      entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: '', action: 'add', insertionAnchor: { paragraphIndex: 4, anchorFingerprint: bibliographyAnchorFingerprint([4], zoric) }, ...entry }],
      mappings: [{ citationId: 'c1', bibliographyEntryId: 'e1', confirmed: true }],
    });
    // Generator: okvir je bas na odlomku sidra (zadnji zapis), iza kojeg ide korisnikov zapis.
    const anchorEnd = documentXml.indexOf('</w:p>', documentXml.indexOf(zoric)) + '</w:p>'.length;
    expect(documentXml.slice(documentXml.lastIndexOf('<w:p>', anchorEnd), anchorEnd)).toContain('<w:framePr ');
    const literal = params({ replacementText: 'Novak, N. (2021). Drugi naslov.' });
    const result = citationBibliographySyncFixer(parts, literal);
    // Izlaz fixera s origin/master (d135a179) nad istim ulazom, bajt za bajt: zapis iza sidra sa svojstvima sidra.
    expect(result.applied).toBe(true);
    expect(result.skippedActions).toBeUndefined();
    expect(result.parts.documentXml).toBe(`${documentXml.slice(0, anchorEnd)}<w:p>${framed}<w:r><w:t xml:space="preserve">Novak, N. (2021). Drugi naslov.</w:t></w:r></w:p>${documentXml.slice(anchorEnd)}`);
    const second = citationBibliographySyncFixer(result.parts, literal);
    expect(second.applied).toBe(false);
    expect(second.parts.documentXml).toBe(result.parts.documentXml);
    // Predlozak (Z36 tocka 3) uz isti okvir: nista se ne umece, razlog ide u skippedActions.
    const viaTemplate = citationBibliographySyncFixer(parts, params({ citationId: 'c1' }));
    expect(viaTemplate.applied).toBe(false);
    expect(viaTemplate.parts.documentXml).toBe(documentXml);
    expect(viaTemplate.skippedActions).toEqual(['zapis literature nije umetnut: popis literature je u okviru (w:framePr), a novi odlomak bi promijenio okvir']);
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

  it('krug 4: formula (m:t) ispred citata; nepromijenjen citat se samo cita, vidljivi tekst odlomka ostaje isti', () => {
    // Ulazi iz pregleda kruga 4: parser cita m:t (localName t), w:t ga nema; znak bez slova ne mijenja otisak.
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
    const seenBy = (xml: string) => parserParagraphText(parseXml(`<w:document ${ns}><w:body>${xml}</w:body></w:document>`, 'test').getElementsByTagName('w:p')[0]).trim();
    const anchor = 'Horvat, I. (2020). Naslov.';
    for (const symbol of ['≈', '→', '+']) {
      const citationXml = `<w:p><w:r><w:t xml:space="preserve">Tekst </w:t></w:r><m:oMath><m:r><m:t>${symbol}</m:t></m:r></m:oMath><w:r><w:t xml:space="preserve"> više (Novak, 2022) i (Horvat, 2020).</w:t></w:r></w:p>`;
      const seen = seenBy(citationXml);
      expect(seen).toBe(`Tekst ${symbol} više (Novak, 2022) i (Horvat, 2020).`);
      const parts = { documentXml: `<w:document><w:body>${citationXml}${paragraph('Literatura')}${paragraph(anchor)}<w:sectPr/></w:body></w:document>`, stylesXml: '' };
      const visible = paragraphTexts(parts.documentXml)[0];
      const start = seen.indexOf('Novak, 2022');
      // Generator: u tekstu w:t isti odmaci pokazuju drugi isjecak, a otisak odlomka je isti.
      expect(visible.slice(start, start + 'Novak, 2022'.length)).not.toBe('Novak, 2022');
      expect(citationAnchorFingerprint(1, visible)).toBe(citationAnchorFingerprint(1, seen));
      const citation = { id: 'c1', paragraphIndex: 1, start, end: start + 'Novak, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, seen), replacementText: 'Novak, 2022', reason: 'citat uz dodani zapis literature' };
      const params: CitationBibliographySyncParams = {
        version: 1,
        citations: [citation],
        entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: '', action: 'add', citationId: 'c1', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: bibliographyAnchorFingerprint([3], anchor) } }],
        mappings: [{ citationId: 'c1', bibliographyEntryId: 'e1', confirmed: true }],
      };
      const result = citationBibliographySyncFixer(parts, params);
      expect(result.applied).toBe(true);
      expect(result.parts.documentXml).toContain(citationXml);
      expect(paragraphTexts(result.parts.documentXml)[0]).toBe(visible);
      const second = citationBibliographySyncFixer(result.parts, params);
      expect(second.reason).toBe('already-ok');
      expect(second.parts.documentXml).toBe(result.parts.documentXml);
      // Samo potvrdjena veza na postojeci zapis, bez 'add': nista se ne pise.
      const horvat = seen.indexOf('Horvat, 2020');
      const mapped = citationBibliographySyncFixer(parts, { version: 1, citations: [{ ...citation, id: 'c2', start: horvat, end: horvat + 'Horvat, 2020'.length, replacementText: 'Horvat, 2020' }], entries: [], mappings: [{ citationId: 'c2', bibliographyEntryId: 'bibliography-3', confirmed: true }] });
      expect(mapped.reason).toBe('already-ok');
      expect(mapped.parts.documentXml).toBe(parts.documentXml);
    }
  });

  it('krug 5: formula sa slovom ili znamenkom (m:t) ispred i iza citata ne obara stavku; potvrda Horvat se primjenjuje', () => {
    const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
    const seenBy = (xml: string) => parserParagraphText(parseXml(`<w:document ${ns}><w:body>${xml}</w:body></w:document>`, 'test').getElementsByTagName('w:p')[0]).trim();
    const horvatText = 'Drugi odlomak (Horvat, 2020).';
    const anchor = 'Horvat, I. (2020). Naslov.';
    for (const [before, after] of [['x2', ''], ['', 'y3'], ['a1', 'b2']]) {
      const math = (value: string) => (value ? `<m:oMath><m:r><m:t>${value}</m:t></m:r></m:oMath>` : '');
      const citationXml = `<w:p><w:r><w:t xml:space="preserve">Tekst </w:t></w:r>${math(before)}<w:r><w:t xml:space="preserve"> navodi (Novak, 2022) i </w:t></w:r>${math(after)}<w:r><w:t>.</w:t></w:r></w:p>`;
      const seen = seenBy(citationXml);
      const visible = paragraphTexts(citationXml)[0];
      // Generator: slovo ili znamenka formule mijenja otisak w:t teksta, a analiza je vidi s trazene strane citata.
      expect(citationAnchorFingerprint(1, visible)).not.toBe(citationAnchorFingerprint(1, seen));
      if (before) expect(seen.indexOf(before)).toBeLessThan(seen.indexOf('Novak'));
      if (after) expect(seen.indexOf(after)).toBeGreaterThan(seen.indexOf('Novak'));
      const parts = { documentXml: `<w:document><w:body>${citationXml}${paragraph(horvatText)}${paragraph('Literatura')}${paragraph(anchor)}<w:sectPr/></w:body></w:document>`, stylesXml: '' };
      const novak = seen.indexOf('Novak, 2022');
      const horvat = horvatText.indexOf('Horvat, 2020');
      const params: CitationBibliographySyncParams = {
        version: 1,
        citations: [
          { id: 'c1', paragraphIndex: 1, start: novak, end: novak + 'Novak, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, seen), replacementText: 'Novak, 2022', reason: 'citat uz dodani zapis literature' },
          { id: 'c2', paragraphIndex: 2, start: horvat, end: horvat + 'Horvat, 2020'.length, anchorFingerprint: citationAnchorFingerprint(2, horvatText), replacementText: 'Horvat, 2020, str. 5', reason: 'lokator' },
        ],
        entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: '', action: 'add', citationId: 'c1', insertionAnchor: { paragraphIndex: 4, anchorFingerprint: bibliographyAnchorFingerprint([4], anchor) } }],
        mappings: [{ citationId: 'c1', bibliographyEntryId: 'e1', confirmed: true }, { citationId: 'c2', bibliographyEntryId: 'bibliography-4', confirmed: true }],
      };
      const result = citationBibliographySyncFixer(parts, params);
      expect(result.applied).toBe(true);
      expect(result.parts.documentXml).toContain(citationXml);
      expect(paragraphTexts(result.parts.documentXml).slice(1)).toEqual(['Drugi odlomak (Horvat, 2020, str. 5).', 'Literatura', anchor, 'Novak, [ime]. (2022). [Naslov djela]. [Mjesto: Izdavač].']);
      const second = citationBibliographySyncFixer(result.parts, params);
      expect(second.applied).toBe(false);
      expect(second.parts.documentXml).toBe(result.parts.documentXml);
      // Citat iz kojeg se cita zapis ne moze ostati nepromijenjen (plan mu dodaje lokator): preskace se samo
      // on i njegov predlozak, s razlogom; potvrda Horvat se i dalje primjenjuje.
      const blocked = { ...params, citations: [{ ...params.citations[0], replacementText: 'Novak, 2022, str. 7' }, params.citations[1]] };
      const skipped = citationBibliographySyncFixer(parts, blocked);
      expect(skipped.applied).toBe(true);
      expect(skipped.parts.documentXml).toContain(citationXml);
      expect(paragraphTexts(skipped.parts.documentXml).slice(1)).toEqual(['Drugi odlomak (Horvat, 2020, str. 5).', 'Literatura', anchor]);
      expect(skipped.skippedActions).toEqual(['zapis literature nije umetnut ni citat izmijenjen: citat iz kojeg se cita zapis ne moze ostati nepromijenjen, a odlomak s formulom, okvirom ili poljem se ne pise']);
      const skippedSecond = citationBibliographySyncFixer(skipped.parts, blocked);
      expect(skippedSecond.applied).toBe(false);
      expect(skippedSecond.parts.documentXml).toBe(skipped.parts.documentXml);
    }
  });

  it('krug 4: formula sa slovom uz izmijenjen citat bez dodanog zapisa: odlomak se ne pise', () => {
    const citationXml = '<w:p><w:r><w:t xml:space="preserve">Tekst </w:t></w:r><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath><w:r><w:t xml:space="preserve"> više (Novak, 2022).</w:t></w:r></w:p>';
    const seen = 'Tekst x više (Novak, 2022).';
    const anchor = 'Horvat, I. (2020). Naslov.';
    const parts = { documentXml: `<w:document><w:body>${citationXml}${paragraph('Literatura')}${paragraph(anchor)}<w:sectPr/></w:body></w:document>`, stylesXml: '' };
    const start = seen.indexOf('Novak, 2022');
    const result = citationBibliographySyncFixer(parts, {
      version: 1,
      citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + 'Novak, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, seen), replacementText: 'Novak, 2022, str. 5', reason: 'lokator' }],
      entries: [],
      mappings: [],
    });
    expect(result.applied).toBe(false);
    expect(result.parts.documentXml).toBe(parts.documentXml);
  });

  it('krug 4: pomaknut raspon plana nad cistim odlomkom nikad ne upisuje rawText', () => {
    const text = 'Tekst više (Novak, 2022) i (Horvat, 2020).';
    const anchor = 'Horvat, I. (2020). Naslov.';
    const parts = { documentXml: `<w:document><w:body>${paragraph(text)}${paragraph('Literatura')}${paragraph(anchor)}<w:sectPr/></w:body></w:document>`, stylesXml: '' };
    const start = text.indexOf('Novak, 2022') + 1;
    const result = citationBibliographySyncFixer(parts, {
      version: 1,
      citations: [{ id: 'c1', paragraphIndex: 1, start, end: start + 'Novak, 2022'.length, anchorFingerprint: citationAnchorFingerprint(1, text), replacementText: 'Novak, 2022', reason: 'citat uz dodani zapis literature' }],
      entries: [{ id: 'e1', paragraphIndices: [], anchorFingerprint: '', action: 'add', replacementText: 'Novak, N. (2022). Naslov.', insertionAnchor: { paragraphIndex: 3, anchorFingerprint: bibliographyAnchorFingerprint([3], anchor) } }],
      mappings: [{ citationId: 'c1', bibliographyEntryId: 'e1', confirmed: true }],
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('invalid-params');
    expect(result.parts.documentXml).toBe(parts.documentXml);
  });
});
