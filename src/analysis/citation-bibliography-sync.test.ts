import { describe, expect, it } from 'vitest';
import { analyzeBibliographyStructure } from './bibliography-structure';
import { analyzeCitationBibliographySync } from './citation-bibliography-sync';

describe('analyzeCitationBibliographySync', () => {
  it('mapira citat na jedinstveni zapis i izdvaja nedostajući zapis', () => {
    const paragraphs = [
      { index: 1, text: 'Tekst (Horvat, 2022).' },
      { index: 2, text: 'Drugi navod (Novak, 2021).' },
      { index: 3, text: 'Literatura' },
      { index: 4, text: 'Horvat, I. (2022). Naslov rada.' },
    ];
    const structure = analyzeBibliographyStructure(paragraphs, 'hr');
    const result = analyzeCitationBibliographySync(paragraphs, structure);
    expect(result.summary.citations).toBe(2);
    expect(result.summary.matched).toBe(1);
    expect(result.summary.missing).toBe(1);
    expect(result.links.find((link) => link.status === 'matched')?.bibliographyEntryId).toBe('bibliography-4');
  });

  it('ne bira između više zapisa istog autora i godine te prijavljuje lokator', () => {
    const paragraphs = [
      { index: 1, text: '„Izravan navod bez stranice“ (Horvat, 2022).' },
      { index: 2, text: 'Literatura' },
      { index: 3, text: 'Horvat, I. (2022). Prvi rad.' },
      { index: 4, text: 'Horvat, I. (2022). Drugi rad.' },
    ];
    const structure = analyzeBibliographyStructure(paragraphs, 'hr');
    const result = analyzeCitationBibliographySync(paragraphs, structure, { mode: 'author-year', requirePageForDirectQuotes: true });
    expect(result.links[0].status).toBe('ambiguous');
    expect(result.pageIssues).toHaveLength(1);
  });
});
