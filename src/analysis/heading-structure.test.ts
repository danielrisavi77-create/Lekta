import { describe, expect, it } from 'vitest';
import { detectHeadingStructure } from './heading-structure';

const run = (text: string, props: Record<string, unknown> = {}) => ({ text, runs: [{ text, ...props }] });

describe('detectHeadingStructure', () => {
  it('prepoznaje numerirane ručno oblikovane naslove i razine', () => {
    const result = detectHeadingStructure([
      { index: 1, text: 'Uvod', headingLevel: 1, runs: [{ text: 'Uvod', bold: true, size: 14 }] },
      { index: 2, ...run('1. Teorijski okvir', { bold: true, size: 14 }) },
      { index: 3, ...run('1.1 Ključni pojmovi', { bold: true, size: 12 }) },
      { index: 4, ...run('Ovo je običan odlomak rada koji nije naslov.', { size: 12 }) },
    ], { maxLevel: 3 });

    expect(result.candidates.map((candidate) => [candidate.paragraphIndex, candidate.proposedLevel])).toEqual([
      [2, 1],
      [3, 2],
    ]);
    expect(result.candidates[0].confidence).toBe('high');
    expect(result.summary).toEqual({ total: 2, highConfidence: 2, needsConfirmation: 0 });
  });

  it('izostavlja tablice, popise, opise elemenata i sadržaj', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('Tablica 1. Rezultati', { bold: true, size: 14 }) },
      { index: 2, ...run('- Stavka popisa', { bold: true, size: 14 }) },
      { index: 3, ...run('Slika 2. Model', { bold: true, size: 14 }) },
      { index: 4, ...run('1. Uvod', { bold: true, size: 14 }), styleName: 'TOC 1' },
      { index: 5, ...run('2. Metoda', { bold: true, size: 14 }), cell: { table: 1 } },
    ]);

    expect(result.candidates).toEqual([]);
  });

  it('prijavljuje preskok razine', () => {
    const result = detectHeadingStructure([
      { index: 1, text: '1. Glavno poglavlje', runs: [{ text: '1. Glavno poglavlje', bold: true, size: 14 }] },
      { index: 2, text: '1.1.1 Preduboka razina', runs: [{ text: '1.1.1 Preduboka razina', bold: true, size: 12 }] },
    ], { maxLevel: 3 });

    expect(result.warnings.some((warning) => warning.kind === 'skipped-level')).toBe(true);
  });

  it('ne numeriranom kandidatu bez pouzdane razine traži potvrdu', () => {
    const result = detectHeadingStructure([
      { index: 1, ...run('Metodologija', { bold: true, size: 13 }) },
    ], { maxLevel: 3 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].confidence).toBe('medium');
    expect(result.candidates[0].selectedByDefault).toBe(false);
  });
});
