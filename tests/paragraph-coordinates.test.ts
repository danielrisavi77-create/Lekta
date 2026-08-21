/**
 * Pin za topToGlobal koordinatnu mapu (extractBodyParagraphsWithCoordinates).
 *
 * Dva koordinatna sustava indeksa odlomaka:
 *   - TOP-LEVEL (extractBodyParagraphs): samo izravna djeca w:body, 1-based;
 *   - GLOBALNI (bodyParagraphs/analyzeDocx/preview): SVI w:p potomci u redoslijedu dokumenta,
 *     minus potisnuta mc:Fallback grana.
 * Razilaze se cim dokument ima tablicu ili tekstualni okvir (gotovo svaka naslovnica), pa svaki
 * potrosac typography/consistency/linkDoi indeksa u pregledu MORA ici kroz ovu mapu.
 *
 * Kljucni rubovi (nalaz B5): samozatvoreni <w:p/> na razini bodyja skener ISPUSTA iz top-level
 * liste, a globalni sustav ga BROJI; mc:Fallback se ne broji ni u jednom.
 */
import { describe, expect, it } from 'vitest';
import { extractBodyParagraphs, extractBodyParagraphsWithCoordinates } from '../src/analysis/typography-structure';

const P = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const doc = (body: string) => `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`;

describe('extractBodyParagraphsWithCoordinates', () => {
  it('bez tablica: mapa je identiteta', () => {
    const { paragraphs, topToGlobal } = extractBodyParagraphsWithCoordinates(doc(P('A') + P('B') + P('C')));
    expect(paragraphs.map((p) => p.index)).toEqual([1, 2, 3]);
    expect(topToGlobal).toEqual([1, 2, 3]);
  });

  it('tablica izmedju odlomaka pomice globalne indekse (celijski w:p se broje globalno)', () => {
    const table = `<w:tbl><w:tr><w:tc>${P('celija1')}</w:tc><w:tc>${P('celija2')}</w:tc></w:tr></w:tbl>`;
    const { paragraphs, topToGlobal } = extractBodyParagraphsWithCoordinates(doc(P('A') + table + P('B')));
    expect(paragraphs).toHaveLength(2); // celijski odlomci NISU top-level
    expect(topToGlobal).toEqual([1, 4]); // A=1, celije 2 i 3, B=4
  });

  it('samozatvoreni <w:p/> na razini bodyja: ispusten iz top-level liste, ali GLOBALNO izbrojen', () => {
    const { paragraphs, topToGlobal } = extractBodyParagraphsWithCoordinates(doc('<w:p/>' + P('A')));
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].xml).toContain('>A<');
    expect(topToGlobal).toEqual([2]); // prazan <w:p/> je globalni #1
  });

  it('mc:AlternateContent: Choice w:p se broji globalno, Fallback w:p se preskace (kao bodyParagraphs)', () => {
    const alt = `<mc:AlternateContent><mc:Choice>${P('choice')}</mc:Choice><mc:Fallback>${P('fallback')}</mc:Fallback></mc:AlternateContent>`;
    const { paragraphs, topToGlobal } = extractBodyParagraphsWithCoordinates(doc(P('A') + alt + P('B')));
    expect(paragraphs).toHaveLength(2); // choice/fallback nisu izravna djeca bodyja
    expect(topToGlobal).toEqual([1, 3]); // A=1, choice=2, fallback preskocen, B=3
  });

  it('wrapper extractBodyParagraphs vraca identican paragraphs niz (bajt-neutralnost refaktora)', () => {
    const xml = doc(P('A') + '<w:p/>' + `<w:tbl><w:tr><w:tc>${P('c')}</w:tc></w:tr></w:tbl>` + P('B'));
    expect(extractBodyParagraphs(xml)).toEqual(extractBodyParagraphsWithCoordinates(xml).paragraphs);
  });

  it('dokument bez w:body daje prazno', () => {
    expect(extractBodyParagraphsWithCoordinates('<w:document/>')).toEqual({ paragraphs: [], topToGlobal: [] });
  });
});
