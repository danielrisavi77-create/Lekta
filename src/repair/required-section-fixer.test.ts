import { describe, expect, it } from 'vitest';
import { extractBodyParagraphs } from '../analysis/typography-structure';
import { requiredSectionFixer, type RequiredSectionFixParams } from './required-section-fixer';

const body = '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p><w:sectPr/>';
const documentXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const parts = { documentXml, stylesXml: '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:styles>', numberingXml: '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:numbering>', packageXmlParts: { '[Content_Types].xml': '<Types></Types>', 'word/_rels/document.xml.rels': '<Relationships></Relationships>' } };

describe('required section fixer', () => {
  it('umeće naslov, stil, numbering i komentar uz sigurno sidro', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: RequiredSectionFixParams = { version: 1, sections: [{ id: 'abstract', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 1, anchorFingerprint: anchor.fingerprint, position: 'before' }, headingLevel: 1, numbered: true, commentText: 'Ovdje unesi sadržaj', confirmed: true }] };
    const result = requiredSectionFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('Abstract');
    expect(result.parts.documentXml).toContain('w:numId');
    expect(result.parts.documentXml).toContain('commentRangeStart');
    expect(result.parts.addedPackageParts?.[0].name).toBe('word/comments.xml');
    expect(result.parts.contentTypesXml).toContain('/word/comments.xml');
  });


  /**
   * TEKSTUALNO SIDRO (2026-08-30).
   *
   * Otisak se racuna nad CIJELIM XML-om odlomka, pa ga promijeni i zahvat koji dira samo
   * oblikovanje. Izmjereno u punom lancu: ovaj je fixer odbijao 7 od 7 puta uz `stale-anchor`, a
   * SAM je primjenjivao 5 od 7. Krivci su utvrdjeni testom u parovima i ima ih tocno dva:
   * `heading-style-fixer` (dodaje `pStyle`) i `final-document-inspector-fixer` (brise `w:rsid*`).
   * Nijedan ne mijenja tekst odlomka, pa je odbijanje bilo lazno.
   */
  describe('tekstualno sidro kad je oblikovanje promijenilo otisak', () => {
    /** Isti odlomak, isti tekst, ali s dodanim `w:rsidR` - dakle drugi otisak. */
    const reformattedBody = '<w:p w:rsidR="00AB12CD"><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Uvod</w:t></w:r></w:p><w:sectPr/>';
    const reformattedXml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${reformattedBody}</w:body></w:document>`;
    const reformattedParts = { ...parts, documentXml: reformattedXml };

    const section = (anchorText?: string) => ({
      id: 'abstract', kind: 'abstract' as const, label: 'Abstract',
      insertionAnchor: { paragraphIndex: 1, anchorFingerprint: extractBodyParagraphs(documentXml)[0].fingerprint, ...(anchorText === undefined ? {} : { anchorText }), position: 'before' as const },
      headingLevel: 1, numbered: false, confirmed: true as const,
    });

    it('BASELINE: otisak se doista razlikuje nakon promjene oblikovanja', () => {
      expect(extractBodyParagraphs(reformattedXml)[0].fingerprint).not.toBe(extractBodyParagraphs(documentXml)[0].fingerprint);
    });

    it('tekstualno sidro spasava zahvat koji bi otisak lazno odbio', () => {
      const result = requiredSectionFixer(reformattedParts, { version: 1, sections: [section('Uvod')] });
      expect(result.reason).toBeUndefined();
      expect(result.applied).toBe(true);
      expect(result.parts.documentXml).toContain('Abstract');
    });

    it('NEGATIVNA KONTROLA: bez tekstualnog sidra ostaje stale-anchor', () => {
      const result = requiredSectionFixer(reformattedParts, { version: 1, sections: [section()] });
      expect(result.reason).toBe('stale-anchor');
      expect(result.parts.documentXml).toBe(reformattedXml);
    });

    it('NEGATIVNA KONTROLA: promijenjen TEKST i dalje daje stale-anchor', () => {
      const result = requiredSectionFixer(reformattedParts, { version: 1, sections: [section('Zakljucak')] });
      expect(result.reason).toBe('stale-anchor');
    });

    it('prazno tekstualno sidro se ne priznaje kao podudaranje', () => {
      const result = requiredSectionFixer(reformattedParts, { version: 1, sections: [section('')] });
      expect(result.reason).toBe('stale-anchor');
    });
  });

  it('odbija zastarjelo sidro bez djelomične izmjene', () => {
    const result = requiredSectionFixer(parts, { version: 1, sections: [{ id: 'abstract', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 1, anchorFingerprint: 'stale', position: 'before' }, headingLevel: 1, numbered: false, confirmed: true }] });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('stale-anchor');
    expect(result.parts.documentXml).toBe(documentXml);
  });

  it('druga primjena istog plana je already-ok', () => {
    const anchor = extractBodyParagraphs(documentXml)[0];
    const params: RequiredSectionFixParams = { version: 1, sections: [{ id: 'abstract', kind: 'abstract', label: 'Abstract', insertionAnchor: { paragraphIndex: 1, anchorFingerprint: anchor.fingerprint, position: 'before' }, headingLevel: 1, numbered: false, confirmed: true }] };
    const first = requiredSectionFixer(parts, params);
    const second = requiredSectionFixer(first.parts, params);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already-ok');
  });
});
