/**
 * T84 SC-1: naslov se reze na CORPUS_TITLE_MAX prije `corpus_search_many`. Baseline je u
 * tests/corpus-check-title-bound.test.ts, mutacija u tests/gate-mutations.test.ts.
 */
export function corpusTitleBoundProblems(src: string): string[] {
  const out: string[] = [];
  if (!/export const CORPUS_TITLE_MAX = \d+;/.test(src)) out.push('corpus-check: nema CORPUS_TITLE_MAX');
  if (!/title: typeof r\?\.title === 'string' \? r\.title\.slice\(0, CORPUS_TITLE_MAX\) : null,/.test(src)) {
    out.push('corpus-check: naslov ide bazi bez gornje granice duljine');
  }
  return out;
}
