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

/**
 * DEFINICIJA TAB-STOPA PREZIVLJAVA POPRAVAK.
 *
 * Do 2026-09-03 nije: `editableNodes` je `<w:tab w:val="right" .../>` iz `<w:pPr><w:tabs>` nabrajao
 * kao urediv tabulator, pa ga je ovaj fixer zamjenjivao s `<w:t>`. Nastajalo je
 * `<w:tabs><w:t> </w:t></w:tabs>`, sto Word odbija otvoriti (izmjereno na 6 od 38 stvarnih radova).
 *
 * Odlomak je tipicna potpisna linija s tockastim vodicem ("Potpis: ......"), dakle oblik koji u
 * stvarnim radovima stoji na naslovnici i izjavi o akademskoj cestitosti.
 */
describe('croatian-typography-fixer: tab-stopovi', () => {
  const tabStop = '<w:tab w:val="right" w:leader="dot" w:pos="4536"/>';
  const potpis = `<w:document><w:body><w:p><w:pPr><w:tabs>${tabStop}</w:tabs></w:pPr><w:r><w:t>Potpis:  mentor</w:t><w:tab/></w:r></w:p><w:sectPr/></w:body></w:document>`;

  it('popravak razmaka ne dira definiciju tab-stopa', () => {
    const analysis = analyzeTypographyStructure(potpis);
    const operations = analysis.occurrences.map((x) => ({ id: x.id, category: x.category, paragraphIndex: x.paragraphIndex, textNodeIndex: x.textNodeIndex, nodeKind: x.category === 'text-tabs' ? 'tab' as const : x.category === 'manual-line-breaks' ? 'line-break' as const : 'text' as const, ...(x.category === 'text-tabs' || x.category === 'manual-line-breaks' ? {} : { start: x.start, end: x.end }), before: x.rawText, replacementText: x.proposedText, anchorFingerprint: x.anchorFingerprint, confirmed: true as const }));
    const result = croatianTypographyFixer({ documentXml: potpis, stylesXml: '' }, {
      version: 1,
      categories: [...new Set(operations.map((x) => x.category))].map((category) => ({ category, consent: true as const })),
      operations,
    });
    expect(result.applied).toBe(true);
    // Dvostruki razmak je uklonjen (zahvat se STVARNO dogodio, inace tvrdnja ispod prolazi vakuumski).
    expect(result.parts.documentXml).not.toContain('Potpis:  ');
    // A tab-stop je netaknut i u <w:tabs> nije zavrsio nikakav tekst.
    expect(result.parts.documentXml).toContain(tabStop);
    expect(result.parts.documentXml).toMatch(/<w:tabs>\s*<w:tab w:val="right"[^>]*\/>\s*<\/w:tabs>/);
    const uTabs = /<w:tabs\b[^>]*>([\s\S]*?)<\/w:tabs>/.exec(result.parts.documentXml)?.[1] ?? '';
    // `<w:t` je prefiks od `<w:tab`, pa gola usporedba niza ovdje lazno pada. Granica imena je
    // dio tvrdnje.
    expect(uTabs).not.toMatch(/<w:t(?![A-Za-z])/);
  });
});
