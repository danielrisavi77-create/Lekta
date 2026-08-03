// Lekta × Katedra shared ecosystem contracts v0.1
//
// CANONICAL SOURCE for cross-product semantics.
// Katedra may vendor/mirror this file while the products remain separate repos.
// Breaking semantic changes require a contract version bump.

export const ACADEMIC_SUITE_CONTRACT_VERSION = '0.1' as const;

export type AcademicSuiteContractVersion = typeof ACADEMIC_SUITE_CONTRACT_VERSION;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Canonical account identity. Email is deliberately not part of the identity
 * contract because it is mutable metadata.
 */
export interface SharedUserRef {
  userId: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// Academic work taxonomy
// ---------------------------------------------------------------------------

/** Semantic transport/persistence vocabulary shared by both products. */
export type AcademicWorkType =
  | 'seminar'
  | 'final'
  | 'graduate'
  | 'specialist'
  | 'doctoral'
  | 'article'
  | 'project';

/** Legacy Katedra UI/storage code. Never use this in new cross-product payloads. */
export type LegacyKatedraWorkType = 's' | 'z' | 'd';

export const KATEDRA_LEGACY_WORK_TYPE_TO_CANONICAL = {
  s: 'seminar',
  z: 'final',
  d: 'graduate',
} as const satisfies Record<LegacyKatedraWorkType, AcademicWorkType>;

export function fromLegacyKatedraWorkType(value: LegacyKatedraWorkType): AcademicWorkType {
  return KATEDRA_LEGACY_WORK_TYPE_TO_CANONICAL[value];
}

/**
 * Reverse mapping exists only for the legacy Katedra v1 UI. `null` means the
 * canonical type is valid ecosystem-wide but not supported by that legacy UI.
 */
export function toLegacyKatedraWorkType(value: AcademicWorkType): LegacyKatedraWorkType | null {
  if (value === 'seminar') return 's';
  if (value === 'final') return 'z';
  if (value === 'graduate') return 'd';
  return null;
}

export function isAcademicWorkType(value: unknown): value is AcademicWorkType {
  return (
    value === 'seminar' ||
    value === 'final' ||
    value === 'graduate' ||
    value === 'specialist' ||
    value === 'doctoral' ||
    value === 'article' ||
    value === 'project'
  );
}

export type ProjectStage =
  | 'topic'
  | 'research'
  | 'plan'
  | 'writing'
  | 'mentor-review'
  | 'katedra-review'
  | 'lekta-preflight'
  | 'revision'
  | 'submission'
  | 'defense'
  | 'completed';

// ---------------------------------------------------------------------------
// One academic work = one canonical ecosystem project
// ---------------------------------------------------------------------------

export interface ProjectManifest {
  schemaVersion: AcademicSuiteContractVersion;

  /**
   * Canonical opaque ecosystem project ID. New server-backed projects should
   * use a UUID. Consumers must never infer meaning from its formatting.
   */
  projectId: string;

  /**
   * Temporary migration alias for Katedra's current client-generated `k...`
   * project ID. Do not use as the long-term cross-product identity.
   */
  legacyClientProjectId?: string;

  /** Optional because Katedra supports guest-first project creation. */
  ownerUserId?: string;

  title?: string;
  topic?: string;
  institutionId?: string;
  unitId: string;
  programId?: string;
  profileId?: string;
  workType: AcademicWorkType;
  academicYear?: string;
  mentorName?: string;
  deadline?: string; // ISO date (YYYY-MM-DD)
  stage: ProjectStage;
  rulesetId?: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Academic Core projection
// ---------------------------------------------------------------------------

export type SharedProfileStatus = 'verified' | 'partial' | 'research' | 'generic';

/**
 * A stable reference to the exact academic rules projection selected by the
 * project. Rich authoring/provenance data remains owned by Lekta.
 */
export interface AcademicRuleSetRef {
  schemaVersion: AcademicSuiteContractVersion;
  rulesetId: string;
  profileId: string;
  institutionId?: string;
  unitId: string;
  programId?: string;
  workType: AcademicWorkType;
  academicYear?: string;
  profileStatus: SharedProfileStatus;
  verifiedAt?: string;
  ruleAuthority?: string;
  sourceVersion?: string;
}

/** Read-only coach projection of one Lekta-authored rule for Katedra. */
export interface SharedAcademicRule {
  ruleId: string;
  checkId?: string | null;
  category?: string;
  label?: string;
  value: unknown;
  authority?: string;
  sourceId?: string | null;
  sourcePage?: string | null;
  status?: string;
  lastVerified?: string | null;
  academicYear?: string | null;
  machineCheckable?: boolean;
  autoFixable?: boolean;
  fixerId?: string | null;
}

export interface AcademicRuleSetExport {
  schemaVersion: AcademicSuiteContractVersion;
  sourceProduct: 'lekta';
  sourceVersion: string;
  generatedAt: string;
  ref: AcademicRuleSetRef;
  rules: SharedAcademicRule[];
}

// ---------------------------------------------------------------------------
// Lekta result transport
// ---------------------------------------------------------------------------

/** Canonical Lekta transport severity. */
export type LektaIssueSeverity = 'error' | 'warning' | 'info';

/** Presentation-only vocabulary Katedra may use in its coaching UI. */
export type KatedraDisplaySeverity = 'critical' | 'warning' | 'info';

export function toKatedraDisplaySeverity(severity: LektaIssueSeverity): KatedraDisplaySeverity {
  return severity === 'error' ? 'critical' : severity;
}

/**
 * Normalizes legacy/defensive external values without changing the canonical
 * transport vocabulary. New Lekta payloads should emit only error/warning/info.
 */
export function normalizeLektaIssueSeverity(value: unknown): LektaIssueSeverity {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'error' || normalized === 'critical') return 'error';
  if (normalized === 'warning' || normalized === 'major') return 'warning';
  return 'info';
}

export type IssueResolutionStatus =
  | 'OPEN'
  | 'USER_CHANGED'
  | 'RECHECK_REQUIRED'
  | 'VERIFIED_FIXED';

/** Katedra may additionally let a user defer an item without resolving it. */
export type KatedraIssueWorkflowStatus = IssueResolutionStatus | 'SKIPPED';

export interface LektaIssueLocation {
  section?: string;
  paragraphIndex?: number;
  pageHint?: string;
  elementId?: string;
}

export interface LektaIssueRef {
  /**
   * Stable logical key used to reconcile the same class/location of finding
   * across re-checks. It must not be an array index in new payloads.
   */
  issueKey: string;

  /** Unique occurrence within one analysis, when available. */
  issueInstanceId?: string;

  checkId?: string | null;
  ruleId?: string | null;
  category: string;
  severity: LektaIssueSeverity;
  summary: string;
  detail?: string;
  location?: LektaIssueLocation;
  fixable: boolean;
  fixerId?: string | null;
  status: IssueResolutionStatus;
}

export interface SharedCategoryScore {
  category: string;
  earned: number;
  max: number;
}

export interface LektaResult {
  schemaVersion: AcademicSuiteContractVersion;
  analysisId: string;
  projectId?: string;
  userId?: string;
  rulesetId: string;
  profileId?: string;
  score: number;
  scoreLabel?: string;
  profileStatus?: string;
  categoryScores: SharedCategoryScore[];
  issues: LektaIssueRef[];
  analyzedAt: string;
  documentFingerprint?: string;
  coverageTier?: number;
}

// ---------------------------------------------------------------------------
// Commerce: access rights are separate from Katedra AI-cost accounting
// ---------------------------------------------------------------------------

export type EntitlementScope =
  | 'lekta-check'
  | 'lekta-fix'
  | 'katedra-pro'
  | 'academic-pass'
  | 'academic-pass-plus';

export type EntitlementStatus = 'active' | 'consumed' | 'expired' | 'revoked' | 'refunded';

export interface Entitlement {
  schemaVersion: AcademicSuiteContractVersion;
  entitlementId: string;
  userId: string;
  projectId?: string;
  scope: EntitlementScope;
  capabilities: string[];
  validFrom: string;
  validUntil?: string;
  usageLimit?: number;
  usageCount?: number;
  status: EntitlementStatus;
  sourceProductId: string;
}

export const PASS_CAPABILITIES = {
  academicPass: [
    'katedra.review.full',
    'katedra.ai-ledger',
    'lekta.report.full',
    'lekta.recheck',
    'lekta.final-preflight',
  ],
  academicPassPlus: [
    'katedra.review.full',
    'katedra.ai-ledger',
    'lekta.report.full',
    'lekta.recheck',
    'lekta.final-preflight',
    'lekta.fix',
  ],
} as const;

// ---------------------------------------------------------------------------
// Katedra-owned workflow metadata
// ---------------------------------------------------------------------------

export interface KatedraProjectState {
  schemaVersion: AcademicSuiteContractVersion;
  projectId: string;
  progressPercent: number;
  completedMilestones: string[];
  activeMilestone?: string;
  lastReviewAt?: string;
  latestLektaAnalysisId?: string;
  updatedAt: string;
}

export interface AIUsageLedgerEntry {
  entryId: string;
  projectId: string;
  userId?: string;
  occurredAt: string;
  stage: ProjectStage;
  tool?: string;
  model?: string;
  purpose: string;
  aiContribution: string;
  userContribution?: string;
  userReviewed: boolean;
  userApproved?: boolean;
}

// ---------------------------------------------------------------------------
// Shared analytics semantics
// ---------------------------------------------------------------------------

export type AcademicSuiteApp = 'lekta' | 'katedra';

export type AcademicSuiteEventName =
  | 'project_created'
  | 'katedra_plan_completed'
  | 'draft_marked_ready'
  | 'lekta_check_started'
  | 'lekta_check_completed'
  | 'lekta_result_handoff_to_katedra'
  | 'resolution_plan_started'
  | 'resolution_item_marked_changed'
  | 'lekta_recheck_completed'
  | 'submission_preflight_completed'
  | 'defense_stage_started'
  | 'purchase_completed';

export interface SharedAnalyticsEvent<T = Record<string, unknown>> {
  eventName: AcademicSuiteEventName;
  occurredAt: string;
  anonymousId?: string;
  userId?: string;
  projectId?: string;
  app: AcademicSuiteApp;
  properties: T;
}
