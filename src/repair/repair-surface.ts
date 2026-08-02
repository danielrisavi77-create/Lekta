import { FIXER_IDS, type FixerId } from './apply-fixers';

/**
 * Mjesto na kojem se fixer pojavljuje u aplikaciji.
 *
 * `profile` dolazi iz profilnih ruleEntries, `ui-assisted` iz posebne UI analize,
 * a `dispatch-only` je unutarnji pomoćni fixer koji se ne prikazuje kao samostalna
 * opcija korisniku.
 */
export type RepairSurfaceKind = 'profile' | 'ui-assisted' | 'dispatch-only';

export interface RepairSurfaceEntry {
  kind: RepairSurfaceKind;
  entryPoint: string;
  note: string;
}

/** Jedini registar rollout statusa svih registriranih fixera. */
export const REPAIR_SURFACE = {
  'margins-fixer': { kind: 'profile', entryPoint: 'buildRepairableItems', note: 'Cilj dolazi iz profilnih margina.' },
  'paper-size-fixer': { kind: 'profile', entryPoint: 'buildRepairableItems', note: 'Cilj dolazi iz profilne veličine papira.' },
  'font-fixer': { kind: 'profile', entryPoint: 'buildRepairableItems', note: 'Cilj dolazi iz profilne tipografije.' },
  'line-spacing-fixer': { kind: 'profile', entryPoint: 'buildRepairableItems', note: 'Cilj dolazi iz profilnog proreda.' },
  'alignment-fixer': { kind: 'profile', entryPoint: 'buildRepairableItems', note: 'Cilj dolazi iz profilnog poravnanja.' },
  'paragraph-spacing-fixer': { kind: 'ui-assisted', entryPoint: 'paragraphSpacingRepairableItem', note: 'Posebna UI stavka, gated profilnim checkom.' },
  'page-numbering-fixer': { kind: 'ui-assisted', entryPoint: 'pageNumberingRepairableItem', note: 'Posebna UI stavka za shemu numeriranja.' },
  'footer-page-fixer': { kind: 'dispatch-only', entryPoint: 'applyFixers', note: 'Pomoćni fixer; nije samostalna UI stavka.' },
  'section-insert-fixer': { kind: 'ui-assisted', entryPoint: 'introSectionRepairableItem', note: 'Posebna UI stavka s potvrdom mjesta umetanja.' },
  'empty-paragraph-fixer': { kind: 'ui-assisted', entryPoint: 'universalRepairableItems', note: 'Univerzalna UI higijena dokumenta.' },
  'footnote-spacing-fixer': { kind: 'ui-assisted', entryPoint: 'footnoteSpacingRepairableItem', note: 'Posebna UI stavka gated profilnim checkom.' },
  'page-number-alignment-fixer': { kind: 'ui-assisted', entryPoint: 'pageNumberAlignmentRepairableItem', note: 'Posebna UI stavka gated profilnim zahtjevom.' },
  'toc-field-fixer': { kind: 'ui-assisted', entryPoint: 'tocFieldRepairableItem', note: 'Posebna UI stavka za živo Word polje sadržaja.' },
  'heading-format-fixer': { kind: 'ui-assisted', entryPoint: 'headingFormatRepairableItem', note: 'Posebna UI stavka iz profilnih headingRules.' },
  'heading-style-fixer': { kind: 'ui-assisted', entryPoint: 'headingStructureRepairableItem', note: 'Posebna UI stavka za mapiranje strukture naslova.' },
  'title-page-fixer': { kind: 'ui-assisted', entryPoint: 'titlePageRepairableItem', note: 'Posebna UI stavka prema odabranom predlošku naslovnice.' },
  'footnote-typography-fixer': { kind: 'ui-assisted', entryPoint: 'footnoteTypographyRepairableItem', note: 'Posebna UI stavka za tipografiju fusnota.' },
  'heading-case-fixer': { kind: 'ui-assisted', entryPoint: 'headingCaseRepairableItem', note: 'Tekstualna UI stavka koja traži zasebnu potvrdu.' },
  'element-caption-fixer': { kind: 'ui-assisted', entryPoint: 'elementCaptionRepairableItem', note: 'Posebna UI stavka za opise elemenata.' },
  'bibliography-repair-fixer': { kind: 'ui-assisted', entryPoint: 'bibliographyRepairableItem', note: 'Posebna UI stavka za literaturu.' },
  'citation-bibliography-sync-fixer': { kind: 'ui-assisted', entryPoint: 'citationBibliographySyncRepairableItem', note: 'Posebna UI stavka za sinkronizaciju citata.' },
  'legal-footnote-repair-fixer': { kind: 'ui-assisted', entryPoint: 'legalFootnoteRepairableItem', note: 'Posebna UI stavka za pravne fusnote.' },
  'final-document-inspector-fixer': { kind: 'ui-assisted', entryPoint: 'finalDocumentInspectorRepairableItem', note: 'Posebna UI završna inspekcija.' },
  'table-figure-rescue-fixer': { kind: 'ui-assisted', entryPoint: 'tableFigureRescueRepairableItem', note: 'Posebna UI stavka za tablice i slike.' },
  'section-surgery-fixer': { kind: 'ui-assisted', entryPoint: 'sectionSurgeryRepairableItem', note: 'Posebna UI stavka za potvrđene zahvate sekcija.' },
  'field-integrity-fixer': { kind: 'ui-assisted', entryPoint: 'fieldIntegrityRepairableItem', note: 'Posebna UI stavka za integritet Word polja.' },
  'croatian-typography-fixer': { kind: 'ui-assisted', entryPoint: 'croatianTypographyRepairableItem', note: 'Posebna UI stavka za tehničko-tipografske nalaze.' },
  'consistency-fixer': { kind: 'ui-assisted', entryPoint: 'consistencyRepairableItem', note: 'Posebna UI stavka s potvrdom kanonskih varijanti.' },
  'required-section-fixer': { kind: 'ui-assisted', entryPoint: 'requiredSectionsRepairableItem', note: 'Posebna UI stavka koja ne izmišlja akademski sadržaj.' },
  'link-doi-fixer': { kind: 'ui-assisted', entryPoint: 'linkDoiRepairableItem', note: 'Posebna UI stavka za poveznice i DOI.' },
  'submission-metadata-fixer': { kind: 'ui-assisted', entryPoint: 'crossFileSubmissionRepairableItem', note: 'Posebna UI stavka za metapodatke predajnog paketa.' },
} satisfies Record<FixerId, RepairSurfaceEntry>;

/** Vraća sortirane ulaze radi stabilnog izvještaja i lakšeg pregleda diffova. */
export function repairSurfaceInventory() {
  return FIXER_IDS.map((fixerId) => ({ fixerId, ...REPAIR_SURFACE[fixerId] }));
}
