/** Poznati fixeri kao runtime konstanta: profile-validator provjerava clanstvo
 * fixerId-a iz podataka u ovom popisu (tipfeler u draftu = strukturna greska,
 * ne tihi no-op u runtimeu). Tip FixerId se izvodi iz istog popisa. */
export const FIXER_IDS = [
  'margins-fixer',
  'paper-size-fixer',
  'font-fixer',
  'line-spacing-fixer',
  'alignment-fixer',
  'paragraph-spacing-fixer',
  'page-numbering-fixer',
  'footer-page-fixer',
  'section-insert-fixer',
  'empty-paragraph-fixer',
  'footnote-spacing-fixer',
  'page-number-alignment-fixer',
  'toc-field-fixer',
  'heading-format-fixer',
  'heading-style-fixer',
  'title-page-fixer',
  'footnote-typography-fixer',
  'heading-case-fixer',
  'element-caption-fixer',
  'bibliography-repair-fixer',
  'citation-bibliography-sync-fixer',
  'legal-footnote-repair-fixer',
  'final-document-inspector-fixer',
  'table-figure-rescue-fixer',
  'section-surgery-fixer',
  'field-integrity-fixer',
  'croatian-typography-fixer',
  'consistency-fixer',
  'required-section-fixer',
  'link-doi-fixer',
  'submission-metadata-fixer',
] as const;

export type FixerId = (typeof FIXER_IDS)[number];

export interface FixerRequest {
  fixerId: FixerId;
  ruleId: string;
  params: Record<string, unknown>;
}
