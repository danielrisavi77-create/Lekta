/**
 * T84 SC-1: kljuc za `corpus_search_many` reze se na CORPUS_TITLE_MAX (tocno 400) code pointa nakon
 * normalizacije, a naslov za bodovanje ostaje pun. Baseline je u tests/corpus-check-title-bound.test.ts,
 * mutacije u tests/gate-mutations.test.ts.
 */
export const EXPECTED_CORPUS_TITLE_MAX = 400;

export function corpusTitleBoundProblems(src: string): string[] {
  const out: string[] = [];
  const m = /^const CORPUS_TITLE_MAX = (\d+);/m.exec(src);
  if (!m) out.push('corpus-check: nema CORPUS_TITLE_MAX');
  else if (Number(m[1]) !== EXPECTED_CORPUS_TITLE_MAX) out.push(`corpus-check: CORPUS_TITLE_MAX je ${m[1]}, ocekivano ${EXPECTED_CORPUS_TITLE_MAX}`);
  if (!/qs: keys\.map\(corpusQueryKey\),/.test(src)) out.push('corpus-check: kljuc ide bazi bez gornje granice duljine');
  if (/r\.title\.slice\(/.test(src)) out.push('corpus-check: naslov za bodovanje je skracen');
  return out;
}
