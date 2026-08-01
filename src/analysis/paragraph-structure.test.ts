import { describe, expect, it } from 'vitest';
import { analyzeParagraphFormatting } from './paragraph-structure';

describe('analyzeParagraphFormatting', () => {
  it('prepoznaje lažnu uvlaku, prvi odlomak nakon naslova i ručni prijelom', () => {
    const result = analyzeParagraphFormatting([
      { index: 0, text: 'UVOD', headingLevel: 1 },
      { index: 1, text: '\tPrvi odlomak.' },
      { index: 2, text: 'Drugi red\n u istom odlomku.' },
      { index: 3, text: 'LITERATURA', headingLevel: 1 },
      { index: 4, text: 'Autor, Naslov.' },
    ]);
    expect(result.candidates[0]).toMatchObject({ paragraphIndex: 1, fakeIndent: true, firstAfterHeading: true, selectedByDefault: true });
    expect(result.manualLineBreakParagraphs).toEqual([2]);
    expect(result.candidates.find((candidate) => candidate.paragraphIndex === 4)?.section).toBe('references');
  });

  it('ne predlaže popis kao lažnu uvlaku', () => {
    const result = analyzeParagraphFormatting([{ index: 0, text: '\tstavka', num: true }]);
    expect(result.candidates[0].fakeIndent).toBe(false);
    expect(result.candidates[0].selectedByDefault).toBe(false);
  });

  it('čita početne tabove iz runova i kada je prikazani tekst već triman', () => {
    const result = analyzeParagraphFormatting([{ index: 0, text: 'stavka', runs: [{ text: '\tstavka' }] }]);
    expect(result.candidates[0].fakeIndent).toBe(true);
  });
});
