/**
 * ZIVI PROFIL: pravila onako kako ih vidi PROIZVOD, ukljucujuci scored/advisory demotiju.
 *
 * Postoji zato sto su ista pravila dosad citana na DVA nacina. `run-closed-loop.mts` je gradio
 * profil kroz draftove, `compileEffectiveRules`, `normalizeCheckFlags` i `applyScoredAdvisory`, dok
 * je `coverage-cells.ts` za dijagnozu nepokrivene celije uzimao goli `resolveProfile`. Razlika nije
 * teorijska: demotija gasi barem jednu bodovanu dimenziju na 383 od 407 profila.
 *
 * IZMJERENO 2026-09-09: od 36 celija za `paper-size-fixer` i `font-fixer` koje su nosile dijagnozu
 * `nema-dokaza`, njih 34 uopce nisu rupa. Os je u zivom profilu demotirana, pa je `paramsForCheck`
 * vraca `null`, generator je ne krsi i fixer legitimno nema sto dokazati. Dijagnoza je tvrdila da
 * fakultet os propisuje a mjerenja nema; istina je da je proizvod ne boduje.
 *
 * Zato ovdje stoji JEDNA definicija koju oba alata uvoze. Dva citanja istih pravila su isti razred
 * kvara kao dva alata koja "isto" mjere svako na svoj nacin.
 */
import { resolveProfile } from '../../src/analysis/golden-entry';
import { draftRuleEntriesFor, VERIFIED_PROFILES_WITH_DRAFTS } from '../../src/profiles/drafts-runtime';
import { compileEffectiveRules } from '../../src/profiles/rule-compiler';
import { normalizeCheckFlags } from '../../src/profiles/profile-baseline';
import { applyScoredAdvisory } from '../../src/profiles/advisory-demotion';
import { SOURCE_REGISTRY } from '../../src/verification/verification-registry';

/**
 * Profil s primijenjenom demotijom, kakav engine doista boduje.
 *
 * Vraca `null` samo ako profil ne postoji; profil bez draftova vraca se kao goli `resolveProfile`,
 * jer za njega nema sto demotirati.
 */
export function liveProfile(profileId: string): Record<string, unknown> | null {
  let base: Record<string, unknown> | null = null;
  try {
    base = resolveProfile(profileId) as Record<string, unknown>;
  } catch {
    return null;
  }
  const withDrafts = (VERIFIED_PROFILES_WITH_DRAFTS as Array<{ id: string }>).find((p) => p.id === profileId);
  if (!withDrafts) return base;
  /**
   * Normalizacija MORA ici nakon overlaya: `applyEntry` upisuje sirovu vrijednost zapisa
   * (`size: 12`), a analizator ocekuje oblik iz `rules` (`size: [12]`). Bez toga 144 profila puca
   * na `profile.size.some is not a function` (izmjereno u closed-loopu).
   */
  const merged = { ...base, ...compileEffectiveRules(withDrafts as never) } as Record<string, unknown>;
  normalizeCheckFlags(merged);
  applyScoredAdvisory(merged as never, withDrafts as never, draftRuleEntriesFor(profileId), SOURCE_REGISTRY as never);
  return merged;
}
