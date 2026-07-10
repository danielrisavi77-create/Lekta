/**
 * Tipovi profila i pravila (Option A).
 *
 * `ruleEntries` su autorski izvor istine; `rules` je naslijedeni agregirani objekt
 * koji engine povijesno cita. `rule-compiler.ts` racuna `effectiveRules` iz oba.
 * Vidi docs/CLAUDE.md ("Option A: ruleEntries su izvor istine").
 *
 * Faza 2 prosiruje ove tipove (autoritet, sourcePage, machineCheckable, datum
 * verifikacije) kako se registri sele iz src/main.ts u tipizirani data/**.
 */

/**
 * Status pravila u verifikacijskom toku (VERIFICATION_PIPELINE.md sekcija 2).
 *
 * `ai-confirmed` je medjukorak: AI je kroz 3-prolaznu adversarijalnu provjeru potvrdio da
 * vrijednost odgovara izvoru, ali pravilo JOS NE boduje. Boduje tek kad ga covjek batch
 * odobri u `verified` (covjek i dalje deklarira verified, AI je samo ubrzao citanje).
 */
export type RuleStatus = 'draft' | 'ai-confirmed' | 'verified' | 'needs-recheck' | 'advisory' | 'retired';

/** Razina autoriteta izvora (VERIFICATION_PIPELINE.md sekcija 3, od najjaceg). */
export type RuleAuthorityLevel = 'binding' | 'program-page' | 'general' | 'mentor-or-course';

/**
 * Granularno pravilo s identitetom; mapira se preko COMPILED_CHECK_IDS u rule-compiler.ts.
 *
 * Osnovna polja (ruleId, checkId, value) su povijesni minimum koji cita rule-compiler.
 * Polja verifikacijskog ugovora (VERIFICATION_PIPELINE.md sekcija 2) su opcionalna dok
 * se profili migriraju; ni engine ni rule-compiler ne ovise o njima, cita ih
 * verification-gate i (buduca) verifikacijska konzola. `sourcePage` se nikad ne nagada
 * (null dok nije rucno potvrden); `scored` je izveden, vidi isRuleScored u verification-gate.
 */
export interface RuleEntry {
  ruleId: string;
  checkId: string | null;
  value: unknown;
  category?: string;
  label?: string;
  machineCheckable?: boolean;
  authority?: RuleAuthorityLevel;
  sourceId?: string | null;
  sourcePage?: string | null;
  quote?: string | null;
  status?: RuleStatus;
  scored?: boolean;
  lastVerified?: string | null;
  verifiedBy?: string | null;
  reviewedBy?: string | null;
  /**
   * Akademska godina VERIFIKACIJE pravila, format "2025./2026." (granica 1.10.).
   * Opcionalni rucni override; kad nije postavljen, izvodi se iz lastVerified /
   * profil.verifiedAt (src/profiles/academic-year.ts). NE znaci "za koju godinu
   * pravilo vrijedi" - to izvor cesto ne kaze i ne nagadamo.
   */
  academicYear?: string | null;
  /**
   * Kako je pravilo potvrdjeno: 'human' (covjek citao izvor), 'human-audit' (covjek u
   * rucnom audit prolazu; postojeci podaci ga koriste) ili 'ai-3pass-batch' (AI
   * 3-prolazna provjera, covjek batch odobrio). Honesty trag: nikad ne tvrdimo cisto
   * ljudsku verifikaciju ako je AI radio citanje. Ne utjece na bodovanje (boduje status verified).
   */
  confirmedVia?: 'human' | 'human-audit' | 'ai-3pass-batch' | 'ai-1pass-batch' | null;
  /**
   * `snapshotHash` izvora protiv kojeg je covjek verificirao pravilo. Ako se trenutni
   * snapshotHash izvora razlikuje od ovoga, izvor je promijenjen nakon verifikacije pa
   * vrata javljaju drift (VERIFICATION_PIPELINE.md sekcija 6, freshness). Postavlja ga
   * verifikacijska konzola pri potvrdi; null dok pravilo nije verificirano.
   */
  verifiedHash?: string | null;
  /**
   * Dopunski sluzbeni izvori za kompozitno pravilo (npr. required-sections gdje strukturu
   * propisuju Upute, a izjavu o izvornosti stranica studijskog programa). Glavni izvor
   * (sourceId/sourcePage/quote/verifiedHash) pokriva vecinu vrijednosti; svaki dopunski
   * ovdje posteno biljezi izvor za dio koji glavni ne pokriva. Kod bodovanog pravila i
   * dopunski moraju biti snapshotirani (vrata to provjeravaju). `covers` opisuje sto podupire.
   */
  additionalSources?: RuleSourceRef[] | null;
  /**
   * Repair Engine (REPAIR_ENGINE.md sekcija 3): smije li se ovo pravilo automatski
   * popraviti u korisnikovom .docx. Default false (undefined se tretira kao false).
   * Smije biti true SAMO na bodovanom, ljudski verificiranom pravilu (status 'verified')
   * i uz postavljen `fixerId`; profile-validator to iznudjuje (autoFixable:true bez
   * fixerId-a ili na pravilu koje nije 'verified' je strukturna greska).
   */
  autoFixable?: boolean;
  /**
   * Id fixera iz src/repair/apply-fixers.ts (npr. 'margins-fixer'). Tip je string (ne uvezeni
   * FixerId union) da profile-schema ostane odvojena od repair modula; null dok pravilo nije
   * autoFixable. params za fixer NE stoje ovdje: izvode se iz vrijednosti profila u tocki spoja.
   */
  fixerId?: string | null;
}

/** Referenca na jedan sluzbeni izvor koji podupire dio kompozitnog pravila. */
export interface RuleSourceRef {
  sourceId: string;
  sourcePage: string | null;
  quote: string | null;
  /** Koji dio vrijednosti ovaj izvor potkrepljuje (npr. "izjava o izvornosti"). */
  covers?: string;
  /** snapshotHash izvora u trenutku verifikacije (drift trag, kao verifiedHash za glavni). */
  verifiedHash?: string | null;
}

/** Vrsta sluzbenog izvora u source registryju (VERIFICATION_PIPELINE.md sekcija 7). */
export type SourceKind =
  | 'pravilnik'
  | 'program-page'
  | 'guidelines'
  | 'citation-style'
  | 'template';

/** Klasa valjanosti izvora: stabilno se boduje, promjenjivo ostaje advisory. */
export type SourceValidityClass = 'stable' | 'volatile';

/**
 * Zapis u source registryju. Snapshot je NEPROMJENJIV (PDF plus hash); `sourcePage`
 * u pravilima uvijek se odnosi na taj snapshot, ne na zivi URL. `fetchedAt`,
 * `snapshotPath` i `snapshotHash` su null za kandidate koji jos nisu snapshotirani;
 * takav izvor ne moze potkrijepiti bodovano pravilo.
 */
export interface SourceEntry {
  id: string;
  kind: SourceKind;
  title: string;
  url: string;
  publisher?: string;
  fetchedAt: string | null;
  snapshotPath: string | null;
  snapshotHash: string | null;
  validityClass: SourceValidityClass;
  lastChecked: string | null;
}

/** Radnja u verifikacijskom ledgeru (VERIFICATION_PIPELINE.md sekcija 8). */
export type LedgerAction =
  | 'drafted'
  | 'ai-confirmed'
  | 'verified'
  | 'rechecked'
  | 'degraded'
  | 'advisory'
  | 'retired';

/**
 * Append-only zapis revizijskog traga. Svaka promjena `status` pravila MORA upisati
 * zapis. Ledger se ne mijenja, samo se dodaje (VERIFICATION_PIPELINE.md sekcija 8).
 */
export interface VerificationLedgerEntry {
  id: string;
  ruleId: string;
  profileId: string;
  action: LedgerAction;
  actor: string;
  timestamp: string;
  sourceId: string | null;
  sourcePage: string | null;
  quote: string | null;
  note?: string;
}

/**
 * Staging datoteka nacrta po fakultetu (data/profiles/<faculty>/drafts/*.json).
 * Jedan dom za nacrte koji jos cekaju ljudsku verifikaciju; verifikacijski moduli ih
 * citaju preko profile-registry (WITH_DRAFTS pogled). Faza D fan-out pise u isti oblik.
 */
export interface DraftsStagingFile {
  generatedAt: string;
  source: string;
  note?: string;
  /** ruleEntries po profileId. */
  profiles: Record<string, RuleEntry[]>;
}

/** Profil ucilista/studija/vrste rada. Minimalan oblik dovoljan za rule-compiler. */
export interface ThesisProfile {
  id: string;
  rules?: Record<string, unknown>;
  ruleEntries?: RuleEntry[];
}

// ---------------------------------------------------------------------------
// Tipovi za izvucene registre (data/**). Koristi ih extract-data + buduci
// tipizirani loaderi (CLAUDE.md backlog 1 i 3). Drze se oblika iz prototipa;
// `rules` ostaje labav (Record) jer ga engine cita dinamicki dok traje split.
// ---------------------------------------------------------------------------

export type ProfileStatusKey = 'verified' | 'partial' | 'research' | 'generic';
export type WorkType =
  | 'seminar'
  | 'final'
  | 'graduate'
  | 'specialist'
  | 'doctoral'
  | 'article'
  | 'project';
export type RuleAuthorityKey =
  | 'official-sources-only'
  | 'official-program-guidelines'
  | 'official-recommended-mentor-priority'
  | 'official-source-with-currency-caveat'
  | 'generic';

export interface SourceRef {
  title: string;
  url: string;
}

export interface FieldValidation {
  status: string;
  validatedAt?: string;
  scope?: string;
  sample?: Record<string, unknown>;
  confirmed?: string[];
  observedDeviations?: string[];
  productDecision?: string;
}

/** Jedan zapis iz VERIFIED_PROFILE_REGISTRY (data/profiles/verified-profiles.json). */
export interface VerifiedProfile {
  id: string;
  unitId: string;
  programs: string[];
  workTypes: WorkType[];
  status: ProfileStatusKey;
  profileLabel: string;
  verifiedAt?: string;
  documentDate?: string;
  rules: Record<string, unknown>;
  ruleEntries?: RuleEntry[];
  facts?: string[];
  note?: string;
  sources?: SourceRef[];
  sourceHierarchy?: string[];
  variant?: string;
  variantLabel?: string;
  submissionFacts?: string[];
  submissionMetadata?: Record<string, unknown> | null;
  validationNote?: string;
  fieldValidation?: FieldValidation | null;
  ruleAuthority?: RuleAuthorityKey;
  repositoryRole?: string;
  normativeScope?: string[];
  advisoryScope?: string[];
  coverage?: { status: string; label: string; note: string } | null;
}

/** Jedan zapis iz LEGAL_DEPARTMENT_REGISTRY (data/profiles/legal-departments.json). */
export interface LegalDepartment {
  id: string;
  name: string;
  status: ProfileStatusKey;
  programs: string[];
  workTypes: WorkType[];
  ruleAuthority?: RuleAuthorityKey;
  rules?: Record<string, unknown>;
  ruleEntries?: RuleEntry[];
  rulesByWorkType?: Record<string, Record<string, unknown>>;
  facts?: string[];
  note?: string;
  manualChecks?: string[];
  sources?: SourceRef[];
  fieldValidation?: FieldValidation;
}

export interface CatalogUnit {
  id: string;
  name: string;
  family: 'social' | 'stem' | 'biomed' | 'arts' | 'mixed';
  programs: string[];
  status: ProfileStatusKey;
}

export interface CatalogInstitution {
  id: string;
  name: string;
  units: CatalogUnit[];
}

export interface CoverageProgram {
  id: string;
  unitId: string;
  name: string;
  level: string;
  expectedWorkTypes: WorkType[];
  expectedProfileIds: string[];
  scope: 'internal' | 'partner' | 'joint';
  deadlineExpectation: string;
  requiresSubmissionCoverage: boolean;
  source: string;
  note?: string;
}

export interface InstitutionalCoverageMatrix {
  version: string;
  verifiedAt: string;
  institutions: Record<string, { name: string; source: string }>;
  programs: CoverageProgram[];
}

export interface PackageDef {
  id: string;
  name: string;
  price: number;
  featured?: boolean;
  desc: string;
  features: string[];
}

// ---------------------------------------------------------------------------
// Meta i pomocni oblici (data/** loaderi). Drze se oblika iz prototipa; dijelovi
// koje engine cita dinamicki ostaju labavi (Record/tuple) dok traje split.
// ---------------------------------------------------------------------------

/** PROFILE_STATUS[status] (data/profiles/profile-status.json). */
export interface ProfileStatusMeta {
  label: string;
  note: string;
  /** Pozitivni "opseg jamstva" red za nepotvrdjene profile: sto se sluzbeno provjerava i
   *  kako puni izvjestaj pomaze. Prikazuje se istaknuto u kartici profila (konverzija). */
  guarantee?: string;
}

/** PROFILE_AUTHORITY[key] (data/profiles/profile-authority.json). */
export interface ProfileAuthorityMeta {
  label: string;
  className: string;
  note: string;
}

/** COVERAGE_STATUS_META[key] (data/coverage/coverage-status-meta.json). */
export interface CoverageStatusMeta {
  label: string;
  icon: string;
}

/** SOCIAL_METHOD_REGISTRY[key] (data/methodology/social-methods.json). */
export interface SocialMethod {
  id: string;
  label: string;
  shortLabel: string;
  facts: string[];
  signals: Array<[string, number]>;
  negativeSignals?: Array<[string, number]>;
  [extra: string]: unknown;
}

/** CHECK_ITEMS zapis (data/checks/check-items.json): [ikona, naslov, opis]. */
export type CheckItem = [string, string, string];

/** FPZG_SUBMISSION_CALENDAR (data/submission/fpzg-calendar.json). Cita se dinamicki. */
export type SubmissionCalendar = Record<string, unknown>;

/** Skupna pravila po obitelji studija (BASE_PROFILES) i FPZG_PARTIAL. */
export type BaseProfiles = Record<string, Record<string, unknown>>;
