/**
 * Pin za `RepairableItem.checkIds`: koje STABILNE checkId-jeve stavke popravka smiju tvrditi.
 *
 * Tri pravila koja ovaj test cuva (u duhu wiredCheckIds garda):
 *   1. checkIds dolaze iz check-fixer-map izvora istine (checkIdsForFixer /
 *      CHECK_IDS_BY_DIMENSION), NIKAD iz matchKeys: hrvatski naslovi su UI korelacija.
 *      Dokaz nuznosti: bibliografska stavka nosi 'Potpunost bibliografskih zapisa' u
 *      matchKeys, a taj check je NAMJERNO manual (tests/result-readiness.test.ts).
 *   2. PREPORUKA (recommended:true, odnosno violated:false bez profila) nikad ne nosi
 *      checkIds: po CLAUDE.md ne smije moci pomaknuti ocjenu, pa ni njenu projekciju.
 *   3. Stavka BEZ checkIds je svjesna odluka (UNBOUND lista dolje), ne propust: novi
 *      graditelj mora ili dobiti checkIds ili biti dopisan u UNBOUND.
 */
import { describe, expect, it } from 'vitest';
import {
  buildRepairableItems,
  universalRepairableItems,
  paragraphSpacingRepairableItem,
  footnoteSpacingRepairableItem,
  pageNumberAlignmentRepairableItem,
  pageNumberingRepairableItem,
  headingFormatRepairableItem,
  headingStructureRepairableItem,
  headingCaseRepairableItem,
  footnoteTypographyRepairableItem,
  bibliographyRepairableItem,
  citationBibliographySyncRepairableItem,
  requiredSectionsRepairableItem,
  tocFieldItem,
} from '../src/ui/repair-items';
import { checkIdsForFixer, wiredCheckIds } from '../src/analysis/check-fixer-map';
import { CHECK_ID_BY_TITLE, isPaperSizeCheckId } from '../src/scoring/check-id-registry';
import type { RepairableItem } from '../src/ui/repair-panel';

const REGISTERED = new Set(Object.values(CHECK_ID_BY_TITLE));
const WIRED = new Set(wiredCheckIds());

/**
 * Stavke koje SVJESNO ne tvrde nijedan checkId (projekcija ih posteno preskace).
 * Razlozi: sinteticki ruleId bez veze na bodovan check, forma cija primjena ne
 * garantira zatvaranje checka, ili se stavka nudi i kad je check 'pass' (tocField).
 * Dodavanje checkIds nekoj od ovih je SVJESNA odluka: makni je odavde i dopisi
 * izvor istine u check-fixer-map ili literal s komentarom.
 */
const UNBOUND_RULE_IDS = new Set([
  'toc-field-universal',
  'croatian-typography-universal',
  'consistency-engine-assisted',
  'cross-file-submission-consistency-assisted',
  'title-page-repair-assisted',
  'final-document-inspector-assisted',
  'field-integrity-assisted',
  'table-figure-rescue-assisted',
  'section-surgery-assisted',
  'legal-footnote-repair-assisted',
  'link-doi-repair-assisted',
]);

/** Zajednicke tvrdnje za svaku stavku koja NOSI checkIds. */
function expectValidCheckIds(item: RepairableItem): void {
  const ids = item.checkIds ?? [];
  expect(ids.length, `${item.ruleId}: prazan checkIds se izostavlja, ne salje kao []`).toBeGreaterThan(0);
  for (const id of ids) {
    const known = REGISTERED.has(id) || isPaperSizeCheckId(id);
    expect(known, `${item.ruleId} -> ${id} nije registriran checkId`).toBe(true);
    if (!isPaperSizeCheckId(id)) {
      expect(WIRED.has(id), `${item.ruleId} -> ${id} nije u wiredCheckIds`).toBe(true);
    }
  }
  const fromIndex = checkIdsForFixer(item.fixerId);
  if (fromIndex.length) {
    for (const id of ids) {
      expect(fromIndex, `${item.ruleId} -> ${id} nije podskup checkIdsForFixer(${item.fixerId})`).toContain(id);
    }
  }
}

describe('dimenzijske i univerzalne stavke nose ocekivane checkIds', () => {
  const cases: Array<[string, RepairableItem[], string[]]> = [
    ['empty-paragraphs', universalRepairableItems([]), ['element.empty-paragraphs']],
    ['paragraph-spacing', paragraphSpacingRepairableItem([], { checkParagraphSpacingZero: true }), ['format.spacing.paragraph']],
    ['footnote-spacing', footnoteSpacingRepairableItem([], { checkFootnoteParagraphSpacingZero: true }), ['footnote.spacing']],
    ['page-number-alignment', pageNumberAlignmentRepairableItem([], { pageNumberAlignment: 'right' }), ['page.numbers.position']],
    ['heading-format', headingFormatRepairableItem([], { headingRules: { size: 14, maxLevel: 1, levels: { '1': { bold: true } } } }), ['structure.heading.format']],
    ['heading-case', headingCaseRepairableItem([], { headingRules: { maxLevel: 1, levels: { '1': { uppercase: true } } } }), ['structure.heading.format']],
    ['footnote-typography', footnoteTypographyRepairableItem([], { footnoteFont: ['Times New Roman'], footnoteSize: 10 }), ['footnote.format']],
    [
      'page-numbering',
      pageNumberingRepairableItem(
        { details: { sections: [{ paragraphIndex: 4 }, { paragraphIndex: 99 }], introParagraphIndex: 5 }, checks: [] },
        { checkPageNumberStartAtIntro: true },
      ),
      ['page.numbers.start', 'page.numbers.scheme'],
    ],
    [
      'heading-structure',
      headingStructureRepairableItem(
        { details: { headingStructure: { candidates: [{ paragraphIndex: 1, proposedLevel: 1, numbered: false, selectedByDefault: true, confidence: 'high' }], warnings: [] } } },
        {},
      ),
      ['structure.heading.word-styles'],
    ],
  ];

  for (const [name, items, expected] of cases) {
    it(`${name} -> [${expected.join(', ')}]`, () => {
      expect(items).toHaveLength(1);
      expect([...(items[0].checkIds ?? [])].sort()).toEqual([...expected].sort());
      expectValidCheckIds(items[0]);
    });
  }
});

describe('buildRepairableItems (profil): checkIds po dimenziji, preporuka bez njih', () => {
  it('verificirano font pravilo nosi format.font.dominant', () => {
    const items = buildRepairableItems([], {}, [
      { ruleId: 'x--font', checkId: 'font', fixerId: 'font-fixer', autoFixable: true, status: 'verified', value: ['Times New Roman'] } as any,
    ], { includeNonViolated: true });
    expect(items).toHaveLength(1);
    expect(items[0].checkIds).toEqual(['format.font.dominant']);
    expectValidCheckIds(items[0]);
  });

  it('paper-size cita STVARNI dinamicki check.id; bez checka posteno ne tvrdi nista', () => {
    const entry: any = { ruleId: 'x--paper', checkId: 'paper-size', fixerId: 'paper-size-fixer', autoFixable: true, status: 'verified', value: ['A4'] };
    const withCheck = buildRepairableItems(
      [{ id: 'page.size.a4', title: 'Format stranice (A4)', status: 'fail', earned: 0, max: 2, scored: true } as any],
      {}, [entry], { includeNonViolated: true },
    );
    expect(withCheck[0].checkIds).toEqual(['page.size.a4']);
    const withoutCheck = buildRepairableItems([], {}, [entry], { includeNonViolated: true });
    expect(withoutCheck[0].checkIds).toBeUndefined();
  });

  it('GARD (CLAUDE.md): advisory preporuka NIKAD ne nosi checkIds', () => {
    const items = buildRepairableItems([], {}, [
      { ruleId: 'x--spacing-adv', checkId: 'line-spacing', fixerId: 'line-spacing-fixer', recommended: true, status: 'advisory', value: 1.5 } as any,
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].recommended).toBe(true);
    expect(items[0].violated).toBe(false);
    expect(items[0].checkIds).toBeUndefined();
  });
});

describe('assisted stavke s zivim fixId-em', () => {
  const bibliographyResult = {
    details: {
      bibliographyStructure: {
        entries: [{ id: 'b-1', rawText: 'Horvat, I. (2020). Naslov.', paragraphIndices: [2], anchorFingerprint: 'x', confidence: 'high', fields: {}, evidence: [], flags: [] }],
        summary: { total: 1, highConfidence: 1, review: 0 },
        duplicateGroups: [],
      },
    },
  };

  it('bibliography-repair tvrdi sort + sufiks, IZRICITO bez reference.completeness', () => {
    const items = bibliographyRepairableItem(bibliographyResult, {
      ruleEntries: [{ checkId: 'bibliography-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value: { sort: 'alphabetical' } }],
    });
    expect(items).toHaveLength(1);
    expect([...(items[0].checkIds ?? [])].sort()).toEqual(['citation.author-year.suffix', 'reference.alphabetical']);
    expect(items[0].checkIds).not.toContain('reference.completeness');
    expectValidCheckIds(items[0]);
  });

  it('citation-bibliography-sync tvrdi oba sync ID-a', () => {
    const result = {
      details: {
        citationBibliographySync: { citations: [{ id: 'c1', rawText: '(Horvat, 2022)', author: 'Horvat', year: '2022', confidence: 'high' }], links: [{ citationId: 'c1', status: 'missing', candidates: [], reason: 'nedostaje' }], missingEntries: [{ id: 'c1' }], duplicateCandidates: [], summary: { citations: 1, matched: 0, missing: 1, ambiguous: 0, pageIssues: 0 } },
        bibliographyStructure: { entries: [] },
      },
    };
    const items = citationBibliographySyncRepairableItem(result, {
      ruleEntries: [{ checkId: 'citation-sync-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value: { mode: 'author-year' } }],
    });
    expect(items).toHaveLength(1);
    expect([...(items[0].checkIds ?? [])].sort()).toEqual(['citation.author-year.missing-reference', 'reference.uncited']);
    expectValidCheckIds(items[0]);
  });

  it('required-sections tvrdi structure.sections.profile', () => {
    const result = {
      details: {
        requiredSectionsStructure: {
          summary: { text: 'Nedostaje 1 dio.' },
          candidates: [{ id: 's1', kind: 'sazetak', label: 'Sažetak', confidence: 'high', headingLevel: 1, present: false }],
        },
      },
    };
    const items = requiredSectionsRepairableItem(result, {
      ruleEntries: [{ checkId: 'required-section-rules', status: 'verified', sourceId: 's', sourcePage: '1', quote: 'pravilo', value: {} }],
    });
    expect(items).toHaveLength(1);
    expect(items[0].checkIds).toEqual(['structure.sections.profile']);
    expectValidCheckIds(items[0]);
  });
});

describe('UNBOUND stavke: svjesno bez checkIds', () => {
  it('tocFieldItem ne tvrdi nista o ocjeni (nudi se i kad je check pass)', () => {
    const items = tocFieldItem({ details: { sadrzajParagraphIndex: 2, hasTocField: false } }, { requireToc: true });
    expect(items).toHaveLength(1);
    expect(UNBOUND_RULE_IDS.has(items[0].ruleId)).toBe(true);
    expect(items[0].checkIds).toBeUndefined();
  });

  it('UNBOUND lista sadrzi samo stvarne ruleId-jeve (zastita od tipfelera pri buducem uredjivanju)', () => {
    // Popis zivih ruleId literala u repair-items.ts; kad graditelj nestane ili se preimenuje,
    // ovaj test podsjeti da se UNBOUND lista odrzi u koraku.
    const known = new Set([
      'empty-paragraphs-universal', 'croatian-typography-universal', 'consistency-engine-assisted',
      'cross-file-submission-consistency-assisted', 'paragraph-spacing-universal', 'page-numbering-universal',
      'footnote-spacing-universal', 'page-number-alignment-universal', 'heading-format-universal',
      'heading-structure-universal', 'title-page-repair-assisted', 'element-caption-repair-assisted',
      'citation-bibliography-sync-assisted', 'final-document-inspector-assisted', 'field-integrity-assisted',
      'table-figure-rescue-assisted', 'section-surgery-assisted', 'legal-footnote-repair-assisted',
      'bibliography-repair-assisted', 'heading-case-universal', 'footnote-typography-universal',
      'section-insert-intro', 'required-section-rules', 'link-doi-repair-assisted', 'toc-field-universal',
    ]);
    for (const ruleId of UNBOUND_RULE_IDS) {
      expect(known.has(ruleId), `UNBOUND sadrzi nepoznat ruleId: ${ruleId}`).toBe(true);
    }
  });
});
