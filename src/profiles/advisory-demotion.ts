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
import { DEMOTABLE_CHECK_IDS, applyDemotion, type ScoreBase } from './advisory-levers';

/** checkId-jevi koje engine tvrdo boduje, a demotion moze prebaciti u informativne. */
export { DEMOTABLE_CHECK_IDS } from './advisory-levers';

/**
 * Izracunaj demotirane advisory dimenzije za profil iz njegovih ruleEntries + izvora (racunski put:
 * povlaci computePublishedRules). Koriste ga golden/verifikacijski put i build-time generator pecene
 * mape (gen-profile-runtime-maps). Zivi app.ts NE zove ovo nego cita pecenu mapu.
 * Prazno ako profil nema ruleEntries (neverificiran) ili nema definicije.
 */
export function computeDemotedAdvisory(
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
  return DEMOTABLE_CHECK_IDS.filter((checkId) => !scoredIds.has(checkId));
}

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
  const demoted = computeDemotedAdvisory(definition, ruleEntries, sources);
  if (demoted.length === 0 && (!definition || !ruleEntries || ruleEntries.length === 0)) return [];
  return applyDemotion(base, demoted);
}
