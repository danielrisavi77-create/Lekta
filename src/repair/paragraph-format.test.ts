import { describe, expect, it } from 'vitest';
import { detectManualLineBreakParagraphs, patchParagraphStyles, patchParagraphTargets } from './xml-patch';

const styles = '<w:styles><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="160"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliography"/></w:style></w:styles>';
const document = '<w:document><w:body><w:p><w:r><w:t>\t  Tekst</w:t></w:r></w:p><w:p><w:r><w:br/></w:r><w:r><w:t>red</w:t></w:r></w:p></w:body></w:document>';

describe('paragraph formatting OOXML', () => {
  it('postavlja prvu uvlaku, viseću uvlaku i pagination svojstva kroz stilove', () => {
    const result = patchParagraphStyles(styles, [
      { styleId: 'Normal', firstLineTwips: 709, beforeTwentieths: 0, afterTwentieths: 0, widowControl: true, keepLines: true },
      { styleId: 'Bibliography', hangingTwips: 360 },
    ]);
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:firstLine="709"');
    expect(result.xml).toContain('w:widowControl/>');
    expect(result.xml).toContain('w:keepLines/>');
    expect(result.xml).toContain('w:hanging="360"');
    expect(result.xml).toBe(patchParagraphStyles(result.xml, [
      { styleId: 'Normal', firstLineTwips: 709, beforeTwentieths: 0, afterTwentieths: 0, widowControl: true, keepLines: true },
      { styleId: 'Bibliography', hangingTwips: 360 },
    ]).xml);
  });

  it('ciljano uklanja lažnu uvlaku i postavlja nulti prvi red nakon naslova', () => {
    const result = patchParagraphTargets(document, [
      { paragraphIndex: 0, firstLineTwips: 0, removeFakeIndent: true },
    ]);
    expect(result.applied).toBe(true);
    expect(result.xml).toContain('w:firstLine="0"');
    expect(result.xml).toContain('<w:t>Tekst</w:t>');
    expect(result.xml).not.toContain('<w:t>\t  Tekst</w:t>');
    expect(result.xml).toContain('<w:br/>');
  });

  it('vraća indekse odlomaka s ručnim prijelomom retka', () => {
    expect(detectManualLineBreakParagraphs(document)).toEqual([1]);
  });
});
