/**
 * LayaEligibleCheckRegistry: jedine provjere ciji nalaz Laya smije savjetodavno procijeniti.
 *
 * Laya se ne pusta na sve checkove. Ulaze samo nalazi s izmjerenom semantickom neizvjesnoscu;
 * sve sto funkcija ili parser mogu pouzdano odluciti ostaje deterministicko. Prosirenje popisa
 * je zasebna odluka nakon dokaza vrijednosti (docs/laya/LAYA_V2_SPEC.md, odjeljak 5).
 */

export const LAYA_ELIGIBLE_CHECKS = ['reference.completeness'] as const;
export type LayaEligibleCheckId = typeof LAYA_ELIGIBLE_CHECKS[number];

/** Kandidati tek nakon dokaza vrijednosti na reference.completeness. Nisu aktivni. */
export const LAYA_FUTURE_CANDIDATES = [
  'reference.uncited',
  'citation.author-year.missing-reference',
  'citation.direct-quote-locator',
] as const;

/** Formalne osi koje Laya nikad ne procjenjuje, bez obzira na buduce prosirenje. */
export const LAYA_FORBIDDEN_CHECK_PREFIXES = [
  'formatting.', 'page.', 'margin.', 'font.', 'spacing.', 'toc.', 'paper-size.',
] as const;

export function isLayaForbiddenCheck(checkId: string): boolean {
  return LAYA_FORBIDDEN_CHECK_PREFIXES.some(prefix => checkId.startsWith(prefix));
}

export function isLayaEligibleCheck(checkId: unknown): checkId is LayaEligibleCheckId {
  return typeof checkId === 'string' && !isLayaForbiddenCheck(checkId)
    && (LAYA_ELIGIBLE_CHECKS as readonly string[]).includes(checkId);
}
