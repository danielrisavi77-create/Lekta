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

/** Granularno pravilo s identitetom; mapira se preko COMPILED_CHECK_IDS u rule-compiler.ts. */
export interface RuleEntry {
  ruleId: string;
  checkId: string | null;
  value: unknown;
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
