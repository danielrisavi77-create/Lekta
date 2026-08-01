import { describe, expect, it } from 'vitest';
import { analyzeLegalFootnoteStructure, legalFootnoteAnchorFingerprint, legalMarkerAnchorFingerprint } from './legal-footnote-structure';

describe('analyzeLegalFootnoteStructure', () => {
  it('povezuje pravne fusnote, detektira ručni superscript marker i predlaže Ibid. popravak', () => {
    const result = analyzeLegalFootnoteStructure({
      paragraphs: [{ index: 1, text: 'Tekst 1.', runs: [{ text: 'Tekst ' }, { text: '1', vertAlign: 'superscript' }, { text: '.' }] }],
      footnotes: [{ id: 1, text: 'Horvat, M., Rimsko pravo, Zagreb, 2020., str. 4.' }, { id: 2, text: 'ibid., str. 5.' }],
      engine: {
        notes: [{ id: 1, type: 'book', text: 'Horvat, M., Rimsko pravo, Zagreb, 2020., str. 4.', anchorId: 1, resolved: true }, { id: 2, type: 'ibid', text: 'ibid., str. 5.', anchorId: 1, resolved: true }],
        problems: [{ kind: 'ibidCapital', note: 2, message: 'Ibid. treba početi velikim slovom.' }],
      },
      rules: { mode: 'legal-notes', marker: { convertManualNumbers: true }, repeatedCitation: { ibidPolicy: 'immediate-previous' } },
    });
    expect(result.markers[0]).toMatchObject({ footnoteId: 1, confidence: 'high' });
    expect(result.candidates[1].operations[0]).toMatchObject({ kind: 'fix-ibid', after: 'Ibid., str. 5.' });
    expect(result.summary.operations).toBe(2);
  });

  it('ne predlaže konverziju bez verificiranog pravila i čuva stabilna sidra', () => {
    const text = 'Tekst 1.';
    const result = analyzeLegalFootnoteStructure({ paragraphs: [{ index: 3, text, runs: [{ text: 'Tekst ' }, { text: '1', vertAlign: 'superscript' }] }], footnotes: [{ id: 1, text: 'Zakon o radu, Narodne novine, br. 93/14.' }] });
    expect(result.markers).toHaveLength(0);
    expect(legalMarkerAnchorFingerprint(3, 5, 6, text)).toMatch(/^legal-marker-/);
    expect(legalFootnoteAnchorFingerprint(1, 'Zakon o radu, Narodne novine, br. 93/14.')).toMatch(/^legal-footnote-/);
  });

  it('predlaže položaj stvarne oznake i bez uključivanja konverzije ručnih brojeva', () => {
    const result = analyzeLegalFootnoteStructure({
      paragraphs: [{ index: 4, text: 'Tekst.', runs: [{ text: 'Tekst.' }], fnMarks: [{ id: 1, offset: 6 }] }],
      footnotes: [{ id: 1, text: 'Zakon o radu, Narodne novine, br. 93/14.' }],
      rules: { mode: 'legal-notes', marker: { position: 'before-punctuation' } },
    });
    expect(result.markers[0].operation).toMatchObject({ kind: 'move-marker', paragraphIndex: 4, markerPosition: 'before-punctuation' });
  });
});
