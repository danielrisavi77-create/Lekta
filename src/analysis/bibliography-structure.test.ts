import { describe, expect, it } from 'vitest';
import { analyzeBibliographyStructure, bibliographyAnchorFingerprint } from './bibliography-structure';

describe('bibliography structure', () => {
  it('strukturira zapise, pronalazi duplikate i citatnice bez teksta dokumenta', () => {
    const result = analyzeBibliographyStructure([
      { index: 1, text: 'Uvod', headingLevel: 1 },
      { index: 2, text: 'U radu se navodi (Horvat, 2020).' },
      { index: 3, text: 'Literatura', headingLevel: 1 },
      { index: 4, text: 'Horvat, I. (2020). Naslov rada. Zagreb: Izdavač.' },
      { index: 5, text: 'Horvat, I. (2020). Naslov rada. Zagreb: Izdavač.' },
    ]);

    expect(result.entries).toHaveLength(2);
    expect(result.duplicateGroups).toHaveLength(1);
    expect(result.entries[0].cited).toBe(true);
    expect(result.summary.highConfidence).toBe(2);
    expect(result.entries[0].anchorFingerprint).toBe(
      bibliographyAnchorFingerprint([4], result.entries[0].rawText),
    );
  });

  it('označava nepotpun zapis i ne izmišlja nedostajuća polja', () => {
    const result = analyzeBibliographyStructure([
      { index: 1, text: 'Bibliografija', headingLevel: 1 },
      { index: 2, text: 'Nepotpun zapis bez godine' },
    ]);
    expect(result.entries[0].confidence).not.toBe('high');
    expect(result.entries[0].fields.year).toBeUndefined();
    expect(result.confirmationActions).toContain('enrich-metadata');
  });
});
