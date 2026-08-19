/**
 * JEDNO mjesto koje sastavlja PUN popis ponudjenih popravaka iz rezultata analize.
 *
 * Zasto postoji: sastavljanje je zivjelo samo u `src/ui/app.ts` kao dugacak inline izraz koji zove
 * dvadesetak graditelja stavki. Real-corpus harness (`tests/real-corpus/harness.ts`) je isti posao
 * radio NA SVOJ NACIN i zvao samo dva graditelja (`buildRepairableItems` + `universalRepairableItems`).
 *
 * Posljedica je bila mjerenje koje opisuje tok koji nitko ne izvodi: nakon sirenja korpusa s 12 na
 * 50 stvarnih radova pokrivenost je OSTALA na 4 fixera (font, margins, paper-size, alignment), jer
 * harness numeriranje, sadrzaj, naslovnicu, natpise, bibliografiju i sekcije nikad nije ni ponudio.
 * Korpus nije bio usko grlo, nego dvostruko vodjeno sastavljanje. Isti obrazac vec je zabiljezen u
 * CLAUDE.md kao razlog zbog kojeg `src/repair/default-selection.ts` postoji.
 *
 * Bez DOM-a i bez globalnog stanja, da ga harness moze zvati jednako kao UI.
 */
import type { RepairableItem } from './repair-panel';
import {
  buildRepairableItems,
  asRecommendation,
  universalRepairableItems,
  paragraphSpacingRepairableItem,
  pageNumberingRepairableItem,
  footnoteSpacingRepairableItem,
  pageNumberAlignmentRepairableItem,
  introSectionRepairableItem,
  tocFieldRepairableItem,
  headingFormatRepairableItem,
  headingStructureRepairableItem,
  footnoteTypographyRepairableItem,
  headingCaseRepairableItem,
  titlePageRepairableItem,
  elementCaptionRepairableItem,
  bibliographyRepairableItem,
  citationBibliographySyncRepairableItem,
  legalFootnoteRepairableItem,
  finalDocumentInspectorRepairableItem,
  fieldIntegrityRepairableItem,
  croatianTypographyRepairableItem,
  consistencyRepairableItem,
  tableFigureRescueRepairableItem,
  sectionSurgeryRepairableItem,
  requiredSectionsRepairableItem,
  linkDoiRepairableItem,
  crossFileSubmissionRepairableItem,
} from './repair-items';
import type { RuleEntry } from '../profiles/profile-schema';

export interface RepairAssemblyInput {
  /** Rezultat analyzeDocx (checks, issues, details). */
  result: any;
  /** Hidrirani profil (currentProfile().p / resolveProfile). */
  profile: any;
  /** Pecena repair pravila profila (repairEntriesFor). */
  entries: RuleEntry[];
  /** Predlozak naslovnice, kad je poznat; bez njega se naslovnica ne nudi. */
  titleTemplate?: unknown;
  /**
   * `false` (default) = teaser: samo PREKRSENE dimenzije (Opcija A).
   * `true` = "uskladi cijeli dokument" (Feature B, placeno).
   */
  includeNonViolated?: boolean;
}

/**
 * Pun popis ponudjenih stavki, istim redoslijedom i istim pravilima kao sucelje.
 *
 * Filtriranje na `violated` NIJE ovdje: o tome sto je PREDODABRANO odlucuje
 * `src/repair/default-selection.ts` (`buildDefaultRepairRequests`), da postoji jedno mjesto
 * odluke i za UI checkbox i za testove.
 */
export function buildAllRepairableItems(input: RepairAssemblyInput): RepairableItem[] {
  const { result: r, profile: rawProfile, entries, titleTemplate, includeNonViolated = false } = input;
  /**
   * SEDAM asistiranih graditelja (element-caption, bibliography, citation-sync, legal-footnote,
   * table-figure-rescue, section-surgery, required-sections) ne citaju `entries` nego
   * `profile.ruleEntries`. `resolveProfile()` to polje NEMA, a app.ts ga postavlja rucno prije
   * poziva; sastavljac to nije radio, pa je za svakog pozivatelja koji se na njega osloni (npr.
   * real-corpus harness) tih sedam fixera bilo mrtvo, bez ijedne poruke.
   *
   * Radi se na KOPIJI profila: mutiranje tudjeg objekta bi se prelilo na pozivatelja i na sljedeci
   * dokument u istom prolazu.
   */
  const profile = entries?.length ? { ...rawProfile, ruleEntries: entries } : rawProfile;
  const only = <T extends { violated?: boolean }>(items: T[]): T[] =>
    includeNonViolated ? items : items.filter((item) => item.violated !== false);

  return [
    ...buildRepairableItems(r?.checks || [], profile, entries, includeNonViolated ? { includeNonViolated: true } : {}),
    ...only(universalRepairableItems(r?.issues || [])),
    ...only(paragraphSpacingRepairableItem(r?.checks || [], profile, r)),
    ...only(pageNumberingRepairableItem(r, profile)),
    ...only(footnoteSpacingRepairableItem(r?.checks || [], profile)),
    ...only(pageNumberAlignmentRepairableItem(r?.checks || [], profile)),
    ...only(introSectionRepairableItem(r, profile)),
    ...only(tocFieldRepairableItem(r, profile)),
    ...only(headingFormatRepairableItem(r?.checks || [], profile)),
    ...only(headingStructureRepairableItem(r, profile)),
    ...only(footnoteTypographyRepairableItem(r?.checks || [], profile)),
    ...only(headingCaseRepairableItem(r?.checks || [], profile)),
    ...(titleTemplate ? only(titlePageRepairableItem(r, profile, titleTemplate as any)) : []),
    ...only(asRecommendation(profile, 'element-caption-rules', elementCaptionRepairableItem(r, profile))),
    ...only(asRecommendation(profile, 'bibliography-rules', bibliographyRepairableItem(r, profile))),
    ...only(asRecommendation(profile, 'citation-sync-rules', citationBibliographySyncRepairableItem(r, profile))),
    ...only(asRecommendation(profile, 'legal-footnote-repair-rules', legalFootnoteRepairableItem(r, profile))),
    ...only(finalDocumentInspectorRepairableItem(r)),
    ...only(fieldIntegrityRepairableItem(r)),
    ...only(croatianTypographyRepairableItem(r)),
    ...only(consistencyRepairableItem(r)),
    ...only(asRecommendation(profile, 'table-figure-rescue-rules', tableFigureRescueRepairableItem(r, profile))),
    ...only(asRecommendation(profile, 'section-surgery-rules', sectionSurgeryRepairableItem(r, profile))),
    ...only(asRecommendation(profile, 'required-section-rules', requiredSectionsRepairableItem(r, profile))),
    ...only(linkDoiRepairableItem(r, profile)),
    ...only(crossFileSubmissionRepairableItem(r, profile)),
  ];
}
