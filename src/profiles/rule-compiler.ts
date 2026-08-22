import type { ThesisProfile, RuleEntry } from './profile-schema';

/**
 * Option A: `ruleEntries` are the authored source of truth.
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
  'justify',
  'footnote-font',
  'footnote-size',
  'footnote-spacing',
  'heading-rules',
  'element-caption-rules',
  'bibliography-rules',
  'citation-sync-rules',
  'legal-footnote-repair-rules',
  'table-figure-rescue-rules',
  'section-surgery-rules',
  'croatian-typography-rules',
  'consistency-rules',
  'required-section-rules',
  'link-rules',
  'cross-file-submission-rules',
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
/**
 * Statusi koji znace "jos nije proslo ljudski pass". Takav ruleEntry se cuva u podacima (izvor,
 * stranica, doslovan citat), ali NE ulazi u effectiveRules, pa ne mijenja ni analizu ni ocjenu.
 * 'advisory' i unosi bez statusa namjerno NISU ovdje: oni su postojece, vec uhodano ponasanje.
 */
const PENDING_HUMAN_PASS: ReadonlySet<string> = new Set(['draft', 'ai-confirmed', 'needs-recheck', 'retired']);

function applyEntry(eff: EffectiveRules, entry: RuleEntry): boolean {
  const value = entry.value as any;
  switch (entry.checkId) {
    case 'font': eff.font = value; return true;
    case 'font-size': eff.size = value; return true;
    case 'line-spacing': eff.spacing = value; return true;
    case 'margins':
      // Vrijednost smije nositi `minimum: true` (izvor kaze "najmanje 2,5 cm"). Zastavica se
      // odvaja od strana, jer normalizeCheckFlags trazi da SVE cetiri strane budu brojevi.
      if (value && typeof value === 'object') {
        const { minimum, ...sides } = value as Record<string, unknown>;
        eff.margins = sides as never;
        if (minimum === true) eff.marginsMinimum = true;
      } else {
        eff.margins = value;
      }
      return true;
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
    case 'paper-size':
      // Naziv formata ('A3') ili lista naziva (['A3','A0']) -> eff.paperSizes (projektni radovi).
      // Boolean zadrzava naslijedeno ponasanje: true -> eff.requireA4 (standardni A4 tekst).
      if (typeof value === 'string') { eff.paperSizes = [value]; return true; }
      if (Array.isArray(value)) { eff.paperSizes = value; return true; }
      eff.requireA4 = boolOf(value); return true;
    case 'justify': eff.justify = boolOf(value); return true;
    case 'footnote-font': eff.footnoteFont = value; return true;
    case 'footnote-size': eff.footnoteSize = value; return true;
    case 'footnote-spacing': eff.footnoteSpacing = value; return true;
    case 'heading-rules': eff.headingRules = value; return true;
    case 'element-caption-rules': eff.elementCaptionRules = value; return true;
    case 'bibliography-rules': eff.bibliographyRules = value; return true;
    case 'citation-sync-rules': eff.citationSyncRules = value; return true;
    case 'legal-footnote-repair-rules': eff.legalFootnoteRepairRules = value; return true;
    case 'table-figure-rescue-rules': eff.tableFigureRescueRules = value; return true;
    case 'section-surgery-rules': eff.sectionSurgeryRules = value; return true;
    case 'croatian-typography-rules': eff.croatianTypographyRules = value; return true;
    case 'consistency-rules': eff.consistencyRules = value; return true;
    case 'required-section-rules': eff.requiredSectionRules = value; return true;
    case 'link-rules': eff.linkRules = value; return true;
    case 'cross-file-submission-rules': eff.crossFileSubmissionRules = value; return true;
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
    // Pravilo koje jos CEKA ljudsku potvrdu ne smije mijenjati ponasanje analize. Zapisano je u
    // podacima s punom provenijencijom, ali do passa ostaje inertno: isti prag koji
    // gen-profile-runtime-maps.mts vec primjenjuje na repair-map (status === 'verified').
    // Bez ovoga bi 'ai-confirmed' unos utjecao na mjerenje prije nego ga je itko potvrdio.
    // Primjenjuje se na PRIVREMENI objekt kad se ceka pass: vrijednost se odbaci, ali se i dalje
    // vidi je li checkId uopce prepoznat, pa dijagnostika za nemapiran checkId ostaje ziva.
    const pending = !!entry.status && PENDING_HUMAN_PASS.has(entry.status);
    const recognised = applyEntry(pending ? ({} as EffectiveRules) : eff, entry);
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
