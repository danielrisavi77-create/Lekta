import { describe, expect, it } from 'vitest';
import { legalFootnoteAnchorFingerprint, legalMarkerAnchorFingerprint } from '../analysis/legal-footnote-structure';
import { legalFootnoteRepairFixer, type LegalFootnoteRepairParams } from './legal-footnote-repair-fixer';

const parts = {
  documentXml: '<w:document><w:body><w:p><w:r><w:t>Tekst </w:t></w:r><w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t>1</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p></w:body></w:document>',
  footnotesXml: '<w:footnotes><w:footnote w:id="1"><w:p><w:r><w:t>ibid., str. 5.</w:t></w:r></w:p></w:footnote></w:footnotes>',
  stylesXml: '',
};

describe('legalFootnoteRepairFixer', () => {
  it('pretvara potvrđeni ručni marker i mijenja samo potvrđeni tekst fusnote', () => {
    const params: LegalFootnoteRepairParams = {
      version: 1,
      markers: [{ paragraphIndex: 1, start: 6, end: 7, footnoteId: 1, anchorFingerprint: legalMarkerAnchorFingerprint(1, 6, 7, 'Tekst 1.'), confirmed: true }],
      operations: [{ id: 'op-1', footnoteId: 1, kind: 'fix-ibid', anchorFingerprint: legalFootnoteAnchorFingerprint(1, 'ibid., str. 5.'), start: 0, end: 'ibid., str. 5.'.length, replacementText: 'Ibid., str. 5.', confirmed: true, reason: 'standardizacija' }],
      bibliographyLinks: [],
    };
    const result = legalFootnoteRepairFixer(parts, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml).toContain('w:footnoteReference w:id="1"');
    expect(result.parts.documentXml).not.toContain('<w:t>1</w:t>');
    expect(result.parts.footnotesXml).toContain('Ibid., str. 5.');
  });

  it('odbija zastarjelo sidro atomski i drugi prolaz je already-ok', () => {
    const text = 'Tekst 1.';
    const params: LegalFootnoteRepairParams = {
      version: 1,
      markers: [{ paragraphIndex: 1, start: 6, end: 7, footnoteId: 1, anchorFingerprint: legalMarkerAnchorFingerprint(1, 6, 7, text), confirmed: true }],
      operations: [{ id: 'op-1', footnoteId: 1, kind: 'fix-ibid', anchorFingerprint: legalFootnoteAnchorFingerprint(1, 'ibid., str. 5.'), start: 0, end: 'ibid., str. 5.'.length, replacementText: 'Ibid., str. 5.', confirmed: true, reason: 'standardizacija' }],
      bibliographyLinks: [],
    };
    const first = legalFootnoteRepairFixer(parts, params);
    const second = legalFootnoteRepairFixer(first.parts, params);
    expect(second.reason).toBe('already-ok');
    const stale = legalFootnoteRepairFixer(parts, { ...params, operations: [{ ...params.operations[0], anchorFingerprint: 'legal-footnote-deadbeef' }] });
    expect(stale.reason).toBe('invalid-params');
    expect(stale.parts).toEqual(parts);
  });

  it('pomice stvarnu oznaku prije interpunkcije samo u jednostavnom odlomku', () => {
    const documentXml = '<w:document><w:body><w:p><w:r><w:t>Tekst.</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="1"/></w:r></w:p></w:body></w:document>';
    const currentText = 'Tekst.';
    const params: LegalFootnoteRepairParams = {
      version: 1,
      markers: [],
      operations: [{ id: 'move-1', footnoteId: 1, kind: 'move-marker', paragraphIndex: 1, start: 5, end: 5, markerPosition: 'before-punctuation', anchorFingerprint: legalMarkerAnchorFingerprint(1, 5, 5, currentText), confirmed: true, reason: 'profil' }],
      bibliographyLinks: [],
    };
    const result = legalFootnoteRepairFixer({ ...parts, documentXml }, params);
    expect(result.applied).toBe(true);
    expect(result.parts.documentXml.indexOf('w:footnoteReference')).toBeLessThan(result.parts.documentXml.indexOf('<w:t>.</w:t>'));
    expect(legalFootnoteRepairFixer(result.parts, params).reason).toBe('already-ok');
  });
});
