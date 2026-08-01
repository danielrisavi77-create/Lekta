import { describe, expect, it } from 'vitest';
import { analyzeFieldIntegrity } from './field-integrity';

describe('field-integrity analyzer', () => {
  it('prepoznaje jednostavna i složena polja, cached grešku i bookmark', () => {
    const documentXml = '<w:document><w:body><w:p><w:bookmarkStart w:id="1" w:name="Naslov"/><w:r><w:t>Naslov</w:t></w:r><w:bookmarkEnd w:id="1"/></w:p><w:p><w:fldSimple w:instr=" REF Naslov "><w:r><w:t>Naslov</w:t></w:r></w:fldSimple></w:p><w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText>TO</w:instrText></w:r><w:r><w:instrText>C \\o &quot;1-3&quot;</w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>stari sadržaj</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p><w:p><w:fldSimple w:instr=" REF NePostoji "><w:r><w:t>Error! Reference source not found</w:t></w:r></w:fldSimple></w:p></w:body></w:document>';
    const result = analyzeFieldIntegrity({ parts: { 'word/document.xml': documentXml }, paragraphs: [{ index: 0, text: 'Sadržaj' }, { index: 1, text: 'Uvod........ 1', headingLevel: 1 }, { index: 2, text: 'Literatura........ 2' }] });
    expect(result.fields.map((field) => field.kind)).toEqual(['ref', 'toc', 'ref']);
    expect(result.fields[0].status).toBe('ok');
    expect(result.fields[1].status).toBe('stale');
    expect(result.fields[2].status).toBe('error-reference-not-found');
    expect(result.bookmarks[0]).toMatchObject({ name: 'Naslov', status: 'ok' });
  });

  it('pronalazi jasno omeđen ručni sadržaj', () => {
    const result = analyzeFieldIntegrity({ parts: {}, paragraphs: [
      { index: 0, text: 'Sadržaj', headingLevel: 1 },
      { index: 1, text: 'Uvod........ 1' },
      { index: 2, text: 'Metodologija........ 4' },
      { index: 3, text: 'Uvod', headingLevel: 1 },
    ] });
    expect(result.manualTocCandidates).toHaveLength(1);
    expect(result.manualTocCandidates[0].replacementAllowed).toBe(true);
  });
});
