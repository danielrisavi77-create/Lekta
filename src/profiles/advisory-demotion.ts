/**
 * Scored/advisory demotion (audit nalaz #1): za verificiran profil zivi engine boduje SAMO
 * verificirani "scored" skup (published-rules); ostale strojno provjerljive dimenzije demotiraju
 * se u informativne (max 0, ne ulaze u ocjenu, i dalje se prikazuju kao preporuka s izvorom).
 *
 * Ova funkcija je jedini izvor te logike; koriste je i zivi UI (currentProfile u src/ui/app.ts)
 * i golden ulaz (resolveProfile u src/analysis/golden-entry.ts) da bodovanje bude identicno i
 * golden-zasticeno. Cista je (nema DOM-a): mutira predani `base` objekt (spljosteni rules koji
 * analyzeDocx cita) i vraca listu demotiranih checkId-jeva.
 */
import type { RuleEntry, SourceEntry } from './profile-schema';
import { computePublishedRules } from '../verification/published-rules';

type ScoreBase = Record<string, unknown>;

/** Mapiranje checkId -> engine "flag off" koji dimenziju pretvara u informativnu provjeru. */
const DEMOTION: Array<[string, (b: ScoreBase) => void]> = [
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
 * Demotira advisory dimenzije na `base` prema verificiranom scored skupu profila.
 * Ne radi nista ako profil nema ruleEntries (neverificiran) ili nema definicije.
 * Vraca demotirane checkId-jeve i upisuje ih u `base.advisoryDimensions`.
 */
export function applyScoredAdvisory(
  base: ScoreBase,
  definition: { id: string } | null | undefined,
  ruleEntries: RuleEntry[] | undefined,
  sources: SourceEntry[],
): string[] {
  if (!definition || !ruleEntries || ruleEntries.length === 0) return [];
  const { scored } = computePublishedRules(
    { ...(definition as Record<string, unknown>), ruleEntries } as any,
    sources,
  );
  const scoredIds = new Set(scored.map((e) => e.checkId));
  const demoted: string[] = [];
  for (const [checkId, off] of DEMOTION) {
    if (!scoredIds.has(checkId)) { off(base); demoted.push(checkId); }
  }
  base.advisoryDimensions = demoted;
  return demoted;
}
