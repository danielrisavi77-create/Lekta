# Shared Domain Contracts v0.1

Status: architecture contract for Lekta and Katedra.

This document defines product-neutral identifiers and payloads. It is intentionally implementation-agnostic: Supabase, REST, localStorage, or another transport may carry these objects, but their semantics remain stable.

## 1. Canonical identifiers

All shared identifiers are opaque strings. Clients must not infer semantics from ID formatting.

- `userId`: one account identity across Lekta and Katedra.
- `projectId`: one academic work across the ecosystem.
- `rulesetId`: exact rule/profile version used for a decision.
- `analysisId`: one Lekta analysis run.
- `entitlementId`: server-authoritative access grant.
- `issueInstanceId`: one finding in one analysis.
- `ruleId`: stable normative/advisory rule identity.
- `checkId`: stable machine check identity.

## 2. UserRef

```ts
export interface UserRef {
  userId: string;
  email?: string;
}
```

Rules:

- `userId` is canonical; email is mutable metadata, never the primary cross-product key.
- Both products must accept the same canonical user identity.

## 3. ProjectManifest

```ts
export type WorkType =
  | 'seminar'
  | 'final'
  | 'graduate'
  | 'specialist'
  | 'doctoral'
  | 'article'
  | 'project';

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

export interface ProjectManifest {
  schemaVersion: '0.1';
  projectId: string;
  ownerUserId: string;
  title?: string;
  topic?: string;
  institutionId: string;
  unitId?: string;
  programId?: string;
  workType: WorkType;
  academicYear?: string;
  mentorName?: string;
  deadline?: string; // ISO date
  stage: ProjectStage;
  rulesetId?: string;
  createdAt: string;
  updatedAt: string;
}
```

Rules:

- One real academic work = one `projectId`.
- Project metadata may sync without syncing the raw document.
- `rulesetId` records the rule version currently selected for this project; every analysis also records the exact ruleset it actually used.

## 4. AcademicRuleSetRef

Lekta already owns rich `RuleEntry`, source, verification, and profile structures. The shared contract does not duplicate them. It exposes a stable cross-product reference and a consumable subset.

```ts
export interface AcademicRuleSetRef {
  schemaVersion: '0.1';
  rulesetId: string;
  profileId: string;
  institutionId: string;
  unitId?: string;
  programId?: string;
  workType: WorkType;
  academicYear?: string;
  profileStatus: 'verified' | 'partial' | 'research' | 'generic';
  verifiedAt?: string;
  ruleAuthority?: string;
}
```

For Katedra consumption, each exported rule should minimally expose:

```ts
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
```

Rules:

- The canonical authoring source remains Lekta's verified rule/profile data.
- Katedra consumes exported rule data; it does not create competing normative rules.
- Katedra may add project-specific mentor preferences, but these must be marked as project instructions, not official faculty rules.

## 5. MentorInstruction

```ts
export interface MentorInstruction {
  instructionId: string;
  projectId: string;
  text: string;
  source: 'user-entered' | 'mentor-comment' | 'course-instruction';
  createdAt: string;
}
```

Mentor instructions have priority in the user's workflow where appropriate, but must never be mislabeled as institution-wide normative rules.

## 6. LektaResult

```ts
export type LektaSeverity = 'error' | 'warning' | 'info';
export type IssueResolutionStatus =
  | 'OPEN'
  | 'USER_CHANGED'
  | 'RECHECK_REQUIRED'
  | 'VERIFIED_FIXED';

export interface LektaIssueResult {
  issueInstanceId: string;
  issueKey: string; // stable logical issue family when possible
  checkId?: string | null;
  ruleId?: string | null;
  category: string;
  severity: LektaSeverity;
  summary: string;
  detail?: string;
  location?: {
    section?: string;
    paragraphIndex?: number;
    pageHint?: string;
    elementId?: string;
  };
  fixable: boolean;
  fixerId?: string | null;
  status: IssueResolutionStatus;
}

export interface LektaResult {
  schemaVersion: '0.1';
  analysisId: string;
  projectId?: string;
  userId?: string;
  rulesetId: string;
  profileId?: string;
  score: number;
  scoreLabel?: string;
  profileStatus?: string;
  categoryScores: Array<{
    category: string;
    earned: number;
    max: number;
  }>;
  issues: LektaIssueResult[];
  analyzedAt: string;
  documentFingerprint?: string;
  coverageTier?: number;
}
```

Rules:

- Cross-product handoff does not require raw document text.
- Katedra consumes issues to build a resolution plan.
- Katedra cannot authoritatively set `VERIFIED_FIXED`.
- A subsequent Lekta analysis determines whether the problem no longer exists.

## 7. Cross-product issue state

State flow:

```text
OPEN
  -> USER_CHANGED
  -> RECHECK_REQUIRED
  -> VERIFIED_FIXED
```

Allowed writers:

- Lekta analysis: creates `OPEN`, may establish `VERIFIED_FIXED` on a re-check.
- Katedra/user workflow: may mark `USER_CHANGED` and `RECHECK_REQUIRED`.
- Backend orchestration may reconcile old/new analyses, but must use Lekta evidence for `VERIFIED_FIXED`.

## 8. Entitlement

```ts
export type ProductScope =
  | 'lekta-check'
  | 'lekta-fix'
  | 'katedra-pro'
  | 'project-pass';

export interface Entitlement {
  schemaVersion: '0.1';
  entitlementId: string;
  userId: string;
  projectId?: string;
  scope: ProductScope;
  capabilities: string[];
  validFrom: string;
  validUntil?: string;
  usageLimit?: number;
  usageCount?: number;
  status: 'active' | 'consumed' | 'expired' | 'revoked';
  sourceProductId: string;
}
```

Example project-pass capabilities:

```text
katedra.review.full
katedra.ai-ledger
lekta.report.full
lekta.recheck
lekta.final-preflight
```

AutoFix should remain an explicit capability, e.g. `lekta.fix`, so pricing can evolve independently.

## 9. KatedraProjectState

Katedra-specific state remains Katedra-owned but references the canonical project.

```ts
export interface KatedraProjectState {
  schemaVersion: '0.1';
  projectId: string;
  progressPercent: number;
  completedMilestones: string[];
  activeMilestone?: string;
  lastReviewAt?: string;
  latestLektaAnalysisId?: string;
  updatedAt: string;
}
```

This prevents Katedra process progress from being confused with Lekta compliance score.

## 10. AIUsageLedgerEntry

```ts
export interface AIUsageLedgerEntry {
  entryId: string;
  projectId: string;
  userId: string;
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
```

Rules:

- Ledger is transparency metadata, not proof of academic honesty by itself.
- Institution-specific disclosure output must be generated from the actual ledger plus verified Academic Core policy, not from hard-coded assumptions.

## 11. Shared analytics envelope

```ts
export interface SharedAnalyticsEvent<T = Record<string, unknown>> {
  eventName: string;
  occurredAt: string;
  anonymousId?: string;
  userId?: string;
  projectId?: string;
  app: 'lekta' | 'katedra';
  properties: T;
}
```

Canonical initial events:

```text
project_created
katedra_plan_completed
draft_marked_ready
lekta_check_started
lekta_check_completed
lekta_result_handoff_to_katedra
resolution_plan_started
resolution_item_marked_changed
lekta_recheck_completed
submission_preflight_completed
defense_stage_started
purchase_completed
```

## 12. Deep-link v0.1

The first integration does not require shared persistence.

Katedra -> Lekta may send only non-sensitive routing metadata:

```text
/check?project=<projectId>&institution=<institutionId>&unit=<unitId>&program=<programId>&workType=<workType>&ruleset=<rulesetId>
```

Rules:

- Never put raw document text, mentor comments, AI transcripts, email addresses, or secrets in query parameters.
- Lekta must validate all incoming IDs against its own catalog/profile registry.
- Unknown IDs degrade safely to an explicit selection step; never silently map to another faculty.

## 13. Contract evolution

- All shared payloads carry `schemaVersion`.
- Breaking changes increment the version.
- Additive optional fields do not require a breaking version.
- Neither app may rely on undocumented fields from the other app.

## 14. First implementation acceptance criteria

The architecture is ready for the first integrated MVP when:

1. Katedra can construct a valid `ProjectManifest`.
2. Katedra can select a Lekta `AcademicRuleSetRef` without hard-coding normative rules.
3. Katedra can deep-link to Lekta with project/profile context.
4. Lekta can run a normal local analysis and emit a valid `LektaResult`.
5. Lekta can hand a structured issue set back to Katedra without the raw document.
6. Katedra can create a resolution plan from those issues.
7. Only a new Lekta analysis can mark an issue `VERIFIED_FIXED`.
