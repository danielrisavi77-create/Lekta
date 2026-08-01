import { describe, expect, it } from 'vitest';
import { analyzeTypographyStructure, extractBodyParagraphs } from './typography-structure';

const doc = `<?xml version="1.0"?><w:document><w:body>
<w:p><w:r><w:t>Ovo  je tekst,bez razmaka...!!</w:t><w:tab/></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Tablica  je,zaštićena...</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>URL https://example.test/a  b i e-mail a@b.test</w:t></w:r></w:p>
<w:sectPr/></w:body></w:document>`;

describe('typography-structure', () => {
  it('analizira samo izravne body odlomke i sigurne promjene', () => {
    expect(extractBodyParagraphs(doc)).toHaveLength(2);
    const result = analyzeTypographyStructure(doc);
    expect(result.occurrences.some((x) => x.category === 'multiple-spaces')).toBe(true);
    expect(result.occurrences.some((x) => x.category === 'ellipsis')).toBe(true);
    expect(result.occurrences.some((x) => x.rawText.includes('https'))).toBe(false);
    expect(result.summary.high).toBeGreaterThan(0);
  });

  it('profilne kategorije uključuje samo uz potvrđena pravila', () => {
    const withoutProfile = analyzeTypographyStructure('<w:document><w:body><w:p><w:r><w:t>1.5 20%</w:t></w:r></w:p></w:body></w:document>', { rules: { decimalSeparator: ',' }, profileRulesVerified: false });
    const withProfile = analyzeTypographyStructure('<w:document><w:body><w:p><w:r><w:t>1.5 20%</w:t></w:r></w:p></w:body></w:document>', { rules: { decimalSeparator: ',' }, profileRulesVerified: true });
    expect(withoutProfile.occurrences.some((x) => x.category === 'decimal-comma')).toBe(false);
    expect(withProfile.occurrences.some((x) => x.category === 'decimal-comma')).toBe(true);
  });
});
