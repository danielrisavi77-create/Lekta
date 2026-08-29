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
  'page-number-title-suppression',
  'page-number-start-at-intro',
  'paper-size',
  'justify',
  'footnote-font',
  'footnote-size',
  'footnote-spacing',
  'footnote-justify',
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

/**
 * `{min, max}` cjelobrojni raspon -> popis svih vrijednosti u njemu, ili `null` ako to nije takav
 * raspon. USKO namjerno: samo cjelobrojne granice i najvise 50 clanova. Decimalni korak nema
 * jednoznacno prosirenje (10-12 pt je 10/11/12, ali 10-12 moglo bi ukljucivati i 10,5), a sirok
 * raspon je znak da vrijednost nije nabrojiva pa se ne smije tiho pretvoriti u popis.
 */
function expandNumericRange(value: unknown): number[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value as object);
  if (keys.length !== 2 || !keys.includes('min') || !keys.includes('max')) return null;
  const { min, max } = value as { min: unknown; max: unknown };
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
  const lo = min as number;
  const hi = max as number;
  if (hi < lo || hi - lo > 50) return null;
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

/**
 * Dijelovi rada u obliku koji motor stvarno cita: `{key, label, terms}`.
 *
 * `detectRequiredSections` trazi dio po `r.terms`, pa goli niz imena (`["sazetak","uvod"]`) daje
 * `terms = []` i svaki dio ispadne NEPREPOZNAT, iako ga rad ima. Autorski sloj taj oblik ipak
 * koristi, pa se prevodi ovdje umjesto da se u svakom nacrtu prepisuje rucno.
 *
 * Objektni unosi prolaze netaknuti; string dobiva sam sebe kao jedini pojam, sto je tocno ono sto
 * bi covjek napisao (`sectionName` ionako normalizira dijakritiku i velika slova pri usporedbi).
 */
export function normalizeRequiredSections(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (typeof item !== 'string') return item;
    const name = item.trim();
    return { key: name, label: name, terms: [name] };
  });
}

function applyEntry(eff: EffectiveRules, entry: RuleEntry): boolean {
  const value = entry.value as any;
  switch (entry.checkId) {
    case 'font': eff.font = value; return true;
    case 'font-size':
      // Raspon se PROSIRUJE u popis. Motor cita `profile.size.some(...)`, pa bi mu doslovan
      // `{min:10,max:12}` (fbf-specijalisticki) pukao cim `ruleEntries` postanu zivi, sto je smjer
      // migracije Option A. Dok su prazni, ovo nista ne mijenja (effectiveRules === rules).
      // Uz to je zrcalo isti propis vec zapisalo kao `[10,11,12]`, pa je usporedba tvrdnje i
      // bodovane vrijednosti prijavljivala raskorak ondje gdje se strane savrseno slazu, i
      // demotirala velicinu pisma na profilu bez ijednog stvarnog neslaganja.
      eff.size = expandNumericRange(value) ?? (value as never);
      return true;
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
    // Goli niz imena se NORMALIZIRA u oblik koji motor stvarno cita. `detectRequiredSections`
    // gleda `r.terms`, pa bi `["sazetak","uvod"]` dalo `terms = []` i svaki dio bi ispao
    // NEPREPOZNAT: profil bi izgubio bodove za dijelove koje rad ima. Izmjereno 2026-08-24: cetiri
    // nacrta (erf, grad x2, pmf-geografija) nose upravo taj oblik i zato nikad nisu ni primijenjeni.
    // Objektni oblik `{key,label,terms}` prolazi netaknut.
    case 'required-sections': eff.requiredSections = normalizeRequiredSections(value); return true;
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
    // Dvije PODPROVJERE numeriranja, svaka vrijedna 3 boda u `evaluatePageNumbers`. Postojale su u
    // motoru i u `advisory-levers` (kao zastita od demotije), ali ih autorski sloj nije mogao
    // izraziti: `page-numbers` postavlja samo `requirePageNumbers`. Bez ovoga se odredba tipa
    // "naslovnu stranicu (...) ne numerirati" morala upisivati ravno u `rules`, mimo provenijencije.
    case 'page-number-title-suppression': eff.checkTitlePageNumberSuppression = boolOf(value); return true;
    case 'page-number-start-at-intro': eff.checkPageNumberStartAtIntro = boolOf(value); return true;
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
    // Cetvrta grana provjere "Oblikovanje fusnota" (uz font, velicinu i prored). Motor ju je citao
    // kao `profile.footnoteJustify` i pet je profila vec nosi, ali autorski sloj ju nije mogao
    // izraziti. NE dodaje bodove: sve cetiri grane ulaze u JEDNU provjeru (`footFmtOk`).
    case 'footnote-justify': eff.footnoteJustify = boolOf(value); return true;
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
