/** Stable analyzer check IDs that actually measure the corresponding profile axis. */
export const DETECTOR_CHECK_BY_RULE: Readonly<Record<string, string>> = {
  font: 'format.font.dominant',
  'font-size': 'format.size.body',
  'line-spacing': 'format.spacing.body',
  justify: 'format.justify.body',
  margins: 'page.margins',
  'word-count': 'scope.words',
  'page-count': 'scope.pages',
  'reference-count': 'reference.min-count',
  'citation-style': 'citation.style-automation',
  'required-sections': 'structure.sections.profile',
  toc: 'toc.present',
  'page-numbers': 'page.numbers.present',
};
