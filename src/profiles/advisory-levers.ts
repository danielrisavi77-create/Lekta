/**
 * Zajednicki "poluge" scored/advisory demotije (audit nalaz #1): mapiranje checkId -> engine flag
 * koji dimenziju pretvara u informativnu (max 0, ne ulazi u ocjenu). Ovo je JEDINI izvor te mape.
 *
 * Namjerno odvojeno od advisory-demotion.ts (koji racuna scored skup preko computePublishedRules i
 * povlaci published-rules/verification-gate/rule-compiler lanac): zivi app.ts cita PECENU advisory
 * mapu (profile-runtime-maps.ts) pa mu treba samo primjena poluga, bez tog racunskog lanca u
 * glavnom chunku. Golden i verifikacijski put i dalje racunaju preko advisory-demotion.ts.
 */

export type ScoreBase = Record<string, unknown>;

/** Mapiranje checkId -> engine "flag off" koji dimenziju pretvara u informativnu provjeru. */
export const DEMOTION: Array<[string, (b: ScoreBase) => void]> = [
  ['font', (b) => { b.checkFont = false; }],
  ['font-size', (b) => { b.checkSize = false; }],
  ['line-spacing', (b) => { b.checkSpacing = false; }],
  ['margins', (b) => { b.checkMargins = false; }],
  ['justify', (b) => { b.checkJustify = false; }],
  ['paper-size', (b) => { b.requireA4 = false; }],
  ['toc', (b) => { b.requireToc = false; }],
  ['page-numbers', (b) => { b.requirePageNumbers = false; }],
];

/** checkId-jevi koje engine tvrdo boduje, a demotion moze prebaciti u informativne. */
export const DEMOTABLE_CHECK_IDS: readonly string[] = DEMOTION.map(([id]) => id);

/**
 * Primijeni demotiju: za svaki checkId iz `demoted` ugasi pripadnu dimenziju na `base` i upisi
 * `base.advisoryDimensions`. Cista funkcija; dijele je i izracun (advisory-demotion) i pecena
 * mapa (profile-runtime-maps) da primjena poluga bude bit-identicna.
 */
export function applyDemotion(base: ScoreBase, demoted: readonly string[]): string[] {
  const set = new Set(demoted);
  for (const [checkId, off] of DEMOTION) {
    if (set.has(checkId)) off(base);
  }
  base.advisoryDimensions = [...demoted];
  return [...demoted];
}
