import { describe, expect, it } from 'vitest';
import { buildHeadingNumberingPlan } from './heading-numbering';
import type { HeadingStructureResult } from './heading-structure';

const structure: HeadingStructureResult = {
  candidates: [{
    paragraphIndex: 3,
    text: '1. Uvod',
    proposedLevel: 1,
    confidence: 'high',
    score: 8,
    evidence: ['numerirani prefiks'],
    numbered: true,
    numberPrefix: '1',
    existingHeading: false,
    selectedByDefault: true,
  }, {
    paragraphIndex: 5,
    text: 'Sažetak',
    proposedLevel: 1,
    confidence: 'medium',
    score: 5,
    evidence: ['kratak odlomak'],
    numbered: false,
    numberPrefix: null,
    existingHeading: false,
    selectedByDefault: false,
  }],
  existingHeadings: [{ paragraphIndex: 7, text: '2. Metoda', level: 1, numbered: true, numberPrefix: '2' }],
  warnings: [],
  summary: { total: 2, highConfidence: 1, needsConfirmation: 1 },
};

describe('buildHeadingNumberingPlan', () => {
  it('gradi assisted mapiranje za numerirane i nenumerirane naslove', () => {
    const plan = buildHeadingNumberingPlan(structure, {
      maxLevel: 3,
      format: 'decimal',
      trailingDot: true,
      unnumberedHeadings: ['Sažetak'],
    }, { hasTocField: true, tocEntryCount: 1 });

    expect(plan?.mappings.map((mapping) => [mapping.paragraphIndex, mapping.numbered])).toEqual([
      [3, true],
      [5, false],
      [7, true],
    ]);
    expect(plan?.summary.removeManualPrefixes).toBe(2);
    expect(plan?.tocComparison.status).toBe('count-mismatch');
    expect(plan?.warnings[0]).toContain('Sadržaj ima');
  });
});
