import { describe, expect, it } from 'vitest';
import { analyzeRequiredSectionsStructure } from './required-sections-structure';

const doc = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;
const p = (text: string, style = 'Heading1') => `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

describe('required sections structure', () => {
  it('prepoznaje postojeći Sažetak i predlaže Abstract', () => {
    const xml = doc(`${p('Sažetak')}<w:p><w:r><w:t>Tekst</w:t></w:r></w:p>${p('Uvod')}`);
    const result = analyzeRequiredSectionsStructure({ documentXml: xml, paragraphs: [{ index: 1, text: 'Sažetak', headingLevel: 1 }, { index: 2, text: 'Tekst' }, { index: 3, text: 'Uvod', headingLevel: 1 }], profileRequiredSections: [{ key: 'summary-hr', label: 'Sažetak' }, { key: 'abstract', label: 'Abstract' }] });
    expect(result.candidates.find((x) => x.kind === 'summary-hr')?.present).toBe(true);
    expect(result.candidates.find((x) => x.kind === 'abstract')?.present).toBe(false);
    expect(result.candidates.find((x) => x.kind === 'abstract')?.insertionAnchor).toBeDefined();
  });

  it('ne duplicira alias Keywords', () => {
    const xml = doc(`${p('Keywords')}${p('Uvod')}`);
    const result = analyzeRequiredSectionsStructure({ documentXml: xml, paragraphs: [{ index: 1, text: 'Keywords', headingLevel: 1 }, { index: 2, text: 'Uvod', headingLevel: 1 }], profileRequiredSections: [{ key: 'keywords-en', label: 'Keywords' }] });
    expect(result.candidates[0].present).toBe(true);
    expect(result.summary.missing).toBe(0);
  });

  it('koristi verificirani tekst izjave samo kada je profil dao pravilo', () => {
    const result = analyzeRequiredSectionsStructure({ documentXml: doc(p('Uvod')), paragraphs: [{ index: 1, text: 'Uvod', headingLevel: 1 }], rules: { order: ['originality-statement'], labels: { 'originality-statement': 'Izjava' }, contentPolicy: { 'originality-statement': 'verified-statement' }, statementText: { 'originality-statement': 'Službeni tekst.' } } });
    expect(result.candidates[0].verifiedStatement).toBe('Službeni tekst.');
    expect(result.candidates[0].contentPolicy).toBe('verified-statement');
  });
});
