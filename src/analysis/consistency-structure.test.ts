import { describe, expect, it } from 'vitest';
import { analyzeConsistencyStructure } from './consistency-structure';

const documentXml = `<w:document><w:body>
<w:p><w:r><w:t>Europska unija i EU, zatim E.U. i COVID-19.</w:t></w:r></w:p>
<w:p><w:r><w:t>Sjedinjene Američke Države i SAD. Tabela 1 i Tablica 2.</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Introduction</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>EU  E.U.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:sectPr/></w:body></w:document>`;

describe('consistency-structure', () => {
  it('grupira pune nazive, kratice, oznake i jezike naslova', () => {
    const result = analyzeConsistencyStructure({
      documentXml,
      paragraphs: [
        { index: 3, text: 'Uvod', headingLevel: 1 },
        { index: 4, text: 'Introduction', headingLevel: 1 },
      ],
    });
    expect(result.groups.some((group) => group.variants.some((variant) => variant.text === 'EU') && group.variants.some((variant) => variant.text === 'E.U.'))).toBe(true);
    expect(result.groups.some((group) => group.zone === 'element-label')).toBe(true);
    expect(result.groups.some((group) => group.zone === 'heading-language')).toBe(true);
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('pronalazi nesklad naslovnice i core metadata bez automatskog izbora', () => {
    const result = analyzeConsistencyStructure({
      documentXml: '<w:document><w:body><w:p><w:r><w:t>Stvarni naslov rada</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
      paragraphs: [{ index: 1, text: 'Stvarni naslov rada' }],
      packageXmlParts: { 'docProps/core.xml': '<cp:coreProperties><dc:title>Stari naslov rada</dc:title></cp:coreProperties>' },
    });
    expect(result.metadataMismatches[0]?.field).toBe('dc:title');
    expect(result.metadataMismatches[0]?.documentValue).toBe('Stari naslov rada');
  });
});
