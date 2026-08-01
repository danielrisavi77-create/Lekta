import { describe, expect, it } from 'vitest';
import { compileEffectiveRules } from '../src/profiles/rule-compiler';
import { bibliographyRepairableItem, citationBibliographySyncRepairableItem, legalFootnoteRepairableItem } from '../src/ui/repair-items';

describe('bibliography repair profile gate', () => {
  it('compiler prenosi verificirano bibliography-rules pravilo', () => {
    const profile: any = {
      id: 'test',
      rules: {},
      ruleEntries: [{ ruleId: 'biblio', checkId: 'bibliography-rules', value: { sort: 'alphabetical' } }],
    };
    expect(compileEffectiveRules(profile).bibliographyRules).toEqual({ sort: 'alphabetical' });
  });

  it('ne nudi fixer bez verificiranog izvora', () => {
    const result = {
      details: {
        bibliographyStructure: {
          entries: [{ id: 'b-1', rawText: 'Horvat, I. (2020). Naslov.', paragraphIndices: [2], anchorFingerprint: 'x', confidence: 'high', fields: {}, evidence: [], flags: [] }],
          summary: { total: 1, highConfidence: 1, review: 0 },
        },
      },
    };
    expect(bibliographyRepairableItem(result, { bibliographyRules: { sort: 'alphabetical' }, ruleEntries: [] })).toEqual([]);
  });

  it('nudi fixer samo uz potpuno verificirano pravilo', () => {
    const result = {
      details: {
        bibliographyStructure: {
          entries: [{ id: 'b-1', rawText: 'Horvat, I. (2020). Naslov.', paragraphIndices: [2], anchorFingerprint: 'x', confidence: 'high', fields: {}, evidence: [], flags: [] }],
          summary: { total: 1, highConfidence: 1, review: 0 },
          duplicateGroups: [],
        },
      },
    };
    const items = bibliographyRepairableItem(result, { ruleEntries: [{ checkId: 'bibliography-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value: { sort: 'alphabetical' } }] });
    expect(items[0]?.fixerId).toBe('bibliography-repair-fixer');
  });

  it('compiler prenosi citation-sync-rules i UI ostaje zatvoren bez verifikacije', () => {
    const profile: any = { id: 'test', rules: {}, ruleEntries: [{ ruleId: 'sync', checkId: 'citation-sync-rules', value: { mode: 'author-year' } }] };
    expect(compileEffectiveRules(profile).citationSyncRules).toEqual({ mode: 'author-year' });
    const result = { details: { citationBibliographySync: { citations: [{ id: 'c1', rawText: '(Horvat, 2022)', author: 'Horvat', year: '2022', confidence: 'high' }], links: [{ citationId: 'c1', status: 'missing', candidates: [], reason: 'nedostaje' }], missingEntries: [{ id: 'c1' }], duplicateCandidates: [], summary: { citations: 1, matched: 0, missing: 1, ambiguous: 0, pageIssues: 0 } }, bibliographyStructure: { entries: [] } } };
    expect(citationBibliographySyncRepairableItem(result, { citationSyncRules: { mode: 'author-year' }, ruleEntries: [] })).toEqual([]);
  });

  it('compiler prenosi legal-footnote-repair-rules', () => {
    const profile: any = { id: 'legal-test', rules: {}, ruleEntries: [{ ruleId: 'legal', checkId: 'legal-footnote-repair-rules', value: { mode: 'legal-notes' } }] };
    expect(compileEffectiveRules(profile).legalFootnoteRepairRules).toEqual({ mode: 'legal-notes' });
  });

  it('legal footnote repair ostaje zatvoren bez verificiranog pravila', () => {
    const result = { details: { legalFootnoteStructure: { candidates: [{ footnoteId: 1, rawText: 'Ibid.', type: 'ibid', confidence: 'high', evidence: [], operations: [{ id: 'op-1', kind: 'fix-ibid', before: 'ibid.', after: 'Ibid.', reason: 'case', confidence: 'high' }] }], markers: [], warnings: [], summary: { footnotes: 1, operations: 1 } } } };
    expect(legalFootnoteRepairableItem(result, { legalFootnoteRepairRules: { mode: 'legal-notes' }, ruleEntries: [] })).toEqual([]);
    expect(legalFootnoteRepairableItem(result, { ruleEntries: [{ checkId: 'legal-footnote-repair-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value: { mode: 'legal-notes' } }] })[0]?.fixerId).toBe('legal-footnote-repair-fixer');
  });
});
