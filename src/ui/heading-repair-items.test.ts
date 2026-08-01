import { describe, expect, it } from 'vitest';
import { headingStructureRepairableItem } from './repair-items';

describe('headingStructureRepairableItem', () => {
  it('prenosi potvrđeni assisted plan i uklanjanje ručnih prefiksa', () => {
    const items = headingStructureRepairableItem({
      details: {
        headingStructure: { candidates: [], warnings: [] },
        headingNumberingPlan: {
          rules: { maxLevel: 3, format: 'decimal', trailingDot: true },
          mappings: [{
            paragraphIndex: 2,
            text: '1. Uvod',
            level: 1,
            numbered: true,
            removeManualNumbering: true,
            manualPrefix: '1.',
            confidence: 'high',
            existingHeading: false,
            selectedByDefault: true,
            evidence: ['numerirani prefiks'],
          }],
          warnings: [],
          summary: { total: 1, numbered: 1, unnumbered: 0, removeManualPrefixes: 1, needsConfirmation: 1 },
          tocComparison: { hasTocField: false, tocEntryCount: 0, expectedHeadingCount: 1, status: 'not-present' },
        },
      },
    }, { headingRules: { maxLevel: 3, numbering: { maxLevel: 3, format: 'decimal', trailingDot: true } } });

    expect(items[0].params.targets).toEqual([
      expect.objectContaining({ paragraphIndex: 2, numbered: true, removeManualNumbering: true }),
    ]);
    expect(items[0].requiresConfirmation).toBe(true);
  });

  it('predodabire sigurne kandidate i prenosi upozorenja', () => {
    const items = headingStructureRepairableItem({
      details: {
        headingStructure: {
          candidates: [
            {
              paragraphIndex: 4,
              text: '1. Uvod',
              proposedLevel: 1,
              confidence: 'high',
              score: 8,
              evidence: ['numerirani prefiks'],
              numbered: true,
              numberPrefix: '1',
              existingHeading: false,
              selectedByDefault: true,
            },
            {
              paragraphIndex: 8,
              text: 'Metoda',
              proposedLevel: 2,
              confidence: 'medium',
              score: 4,
              evidence: ['podebljano'],
              numbered: false,
              numberPrefix: null,
              existingHeading: false,
              selectedByDefault: false,
            },
          ],
          warnings: [{ kind: 'skipped-level', paragraphIndex: 8, message: 'Preskok razine' }],
        },
      },
      },
      { headingRules: { maxLevel: 3 } },
    );

    expect(items).toHaveLength(1);
    expect(items[0].fixerId).toBe('heading-style-fixer');
    expect((items[0].params.targets as Array<Record<string, unknown>>)).toEqual([
      expect.objectContaining({ paragraphIndex: 4, level: 1, numbered: true }),
    ]);
    expect(items[0].headingWarnings?.[0].message).toBe('Preskok razine');
    expect(items[0].requiresConfirmation).toBe(true);
  });
});
