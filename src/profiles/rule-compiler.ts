import type { ThesisProfile, RuleEntry } from './profile-schema';

/**
 * Option A — `ruleEntries` are the authored source of truth.
 *
 * `effectiveRules` = clone(legacy `rules` baseline) with every recognised `ruleEntry`
 * overlaid on top. During migration the legacy `rules` object still carries keys that
 * have not yet been expressed as `ruleEntries`. Once a key IS expressed as a ruleEntry
 * it can be deleted from `rules`; the overlay keeps producing it, so the engine never
 * sees a behaviour change. The faithfulness test (`tests/rule-compiler.test.ts`) proves
 * that, for the current data, effectiveRules deep-equals the authored rules, i.e. turning
 * the compiler on is behaviour-neutral.
 *
 * The engine (currentProfile in src/main.ts) consumes `definition.effectiveRules` and
 * only falls back to `definition.rules` if the compiler produced nothing.
 */

export interface RuleCompileDiagnostic {
  profileId: string;
  ruleId: string;
  checkId: string | null;
  level: 'warning';
  message: string;
}

export type EffectiveRules = Record<string, unknown>;

/** checkId values that the compiler knows how to fold into effectiveRules. */
export const COMPILED_CHECK_IDS = [
  'font',
  'font-size',
  'line-spacing',
  'margins',
  'citation-style',
  'required-sections',
  'reference-count',
  'word-count',
  'page-count',
  'toc',
  'page-numbers',
  'paper-size',
] as const;

function boolOf(value: unknown): boolean {
  if (value && typeof value === 'object' && 'required' in (value as Record<string, unknown>)) {
    return !!(value as Record<string, unknown>).required;
  }
  return !!value;
}

function clone<T>(value: T): T {
  return (typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))) as T;
}

/** Folds a single ruleEntry into the mutable effective-rules object. Returns false if the checkId is unknown. */
function applyEntry(eff: EffectiveRules, entry: RuleEntry): boolean {
  const value = entry.value as any;
  switch (entry.checkId) {
    case 'font': eff.font = value; return true;
    case 'font-size': eff.size = value; return true;
    case 'line-spacing': eff.spacing = value; return true;
    case 'margins': eff.margins = value; return true;
    case 'citation-style': eff.recommendedCitation = value; return true;
    case 'required-sections': eff.requiredSections = value; return true;
    case 'reference-count': eff.minReferences = value; return true;
    case 'word-count':
      if (value && typeof value === 'object') {
        if (value.min != null) eff.wordMin = value.min;
        if (value.max != null) eff.wordMax = value.max;
      }
      return true;
    case 'page-count':
      if (value && typeof value === 'object') {
        if (value.min != null) eff.pageMin = value.min;
        if (value.max != null) eff.pageMax = value.max;
        if (value.target != null) eff.pageTarget = value.target;
      }
      return true;
    case 'toc': eff.requireToc = boolOf(value); return true;
    case 'page-numbers': eff.requirePageNumbers = boolOf(value); return true;
    case 'paper-size': eff.requireA4 = boolOf(value); return true;
    default: return false;
  }
}

/** Computes the effective rule set for one profile. Optionally collects diagnostics for unmapped entries. */
export function compileEffectiveRules(
  profile: ThesisProfile,
  diagnostics?: RuleCompileDiagnostic[],
): EffectiveRules {
  const eff: EffectiveRules = clone((profile.rules ?? {}) as EffectiveRules);
  for (const entry of profile.ruleEntries ?? []) {
    const recognised = applyEntry(eff, entry);
    if (!recognised && diagnostics) {
      diagnostics.push({
        profileId: profile.id,
        ruleId: entry.ruleId,
        checkId: entry.checkId ?? null,
        level: 'warning',
        message: `Nepoznat checkId â${entry.checkId ?? '∅'}â; pravilo nije ugraÄeno u effectiveRules.`,
      });
    }
  }
  return eff;
}

/** Returns the profile with a compiled `effectiveRules` field attached. */
export function compileProfile<T extends ThesisProfile>(
  profile: T,
  diagnostics?: RuleCompileDiagnostic[],
): T & { effectiveRules: EffectiveRules } {
  return { ...profile, effectiveRules: compileEffectiveRules(profile, diagnostics) };
}

/** Collects compile diagnostics across a list of profiles (used by tests and the QA console). */
export function collectCompileDiagnostics(profiles: ThesisProfile[]): RuleCompileDiagnostic[] {
  const out: RuleCompileDiagnostic[] = [];
  for (const profile of profiles) compileEffectiveRules(profile, out);
  return out;
}
