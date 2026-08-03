# Shared Domain Contracts v0.1

Status: accepted foundation contract for Lekta and Katedra.

## Canonical source

The executable TypeScript contract is the source of truth:

`src/integration/academic-suite-contracts.ts`

Katedra currently mirrors that contract at:

`lib/academic-suite/contracts.ts`

while the two products remain separate repositories. Breaking semantic changes require a `schemaVersion` bump and a synchronized mirror update.

This document explains the decisions behind the types; it intentionally does not duplicate every interface field so documentation cannot silently drift away from the executable contract.

## 1. Canonical identifiers

Shared identifiers are opaque strings. Consumers must not infer meaning from formatting.

- `userId`: one account identity across Lekta and Katedra.
- `projectId`: one academic work across the ecosystem.
- `rulesetId`: exact academic-rule projection/version selected for a decision.
- `analysisId`: one Lekta analysis run.
- `entitlementId`: one server-authoritative access grant.
- `issueKey`: logical finding identity used for re-check reconciliation.
- `issueInstanceId`: optional identity of one occurrence inside one analysis.
- `ruleId`: stable normative/advisory rule identity.
- `checkId`: stable machine-check identity.

## 2. Guest-first project identity

Katedra supports project work before registration. Therefore `ProjectManifest.ownerUserId` is optional.

The canonical `projectId` must exist from project creation and must survive sign-in unchanged. New projects should use a UUID generated at creation (for example `crypto.randomUUID()`), including guests.

Katedra's existing `k...` client project IDs are legacy-compatible aliases and may remain temporarily as `legacyClientProjectId`. The Supabase row primary key is a storage identity, not automatically the ecosystem project identity.

Rule:

> Login attaches ownership to a project; it does not replace the project's identity.

## 3. Canonical academic work vocabulary

Cross-product payloads use semantic values:

```text
seminar
final
graduate
specialist
doctoral
article
project
```

Katedra may temporarily keep its legacy `s/z/d` vocabulary inside the old UI/state layer, but adapters must translate at the product boundary.

The shared contract contains both translation functions and tests.

## 4. Academic Core ownership

Lekta remains the authoring/source-of-truth system for institution-specific academic rules.

The cross-product contract exposes:

- `AcademicRuleSetRef` — stable project/ruleset reference;
- `SharedAcademicRule` — read-only Katedra coach projection;
- `AcademicRuleSetExport` — versioned export envelope with source provenance.

Katedra may maintain mentor/project instructions, but those are never represented as institution-wide normative rules.

## 5. Lekta severity vs Katedra presentation severity

Canonical transport severity is:

```text
error | warning | info
```

Katedra may display `error` as `critical` in its coaching UI. That translation happens only at presentation/workflow boundaries; transport semantics do not change.

## 6. Issue identity and re-check lifecycle

Canonical cross-product finding shape is `LektaIssueRef`.

The important distinction is:

- `issueKey` = logical reconciliation key across analyses;
- `issueInstanceId` = optional one-analysis occurrence identity;
- `checkId` / `ruleId` = explicit engine/rule identity when Lekta can provide it.

Current legacy Lekta presentation issues do not yet expose enough stable IDs. The v0.1 adapter therefore derives a conservative legacy `issueKey` and leaves unknown `checkId`, `ruleId`, and fixability unset/null rather than inventing verification metadata.

Verification lifecycle:

```text
OPEN -> USER_CHANGED -> RECHECK_REQUIRED -> VERIFIED_FIXED
```

Katedra may additionally use `SKIPPED` as a local workflow state. `SKIPPED` never means resolved.

Only a new Lekta analysis may establish `VERIFIED_FIXED`.

## 7. Privacy boundary

Cross-product handoff does not require the raw `.docx`.

The initial `LektaResult` adapter intentionally omits legacy `Issue.detail` and `Issue.where` because those presentation fields may contain document-derived context. Richer location metadata can be added only when it is structured and explicitly classified as safe for cross-product transport.

The shared payload may contain:

- project/ruleset identifiers;
- score/category scores;
- issue identity/category/severity/summary;
- explicit fixability metadata when supported;
- timestamps and non-sensitive provenance.

It does not automatically contain:

- raw document text;
- full paragraphs;
- mentor comments;
- AI transcripts;
- email addresses;
- secrets.

## 8. Entitlements are not Katedra wallet credits

The shared `Entitlement` contract represents purchased ecosystem capabilities.

Katedra's current token-credit wallet remains a separate variable-cost accounting mechanism for AI usage.

Examples of shared entitlement scopes:

```text
lekta-check
lekta-fix
katedra-pro
academic-pass
academic-pass-plus
```

Capabilities, rather than UI labels, determine access. For example AutoFix is an explicit `lekta.fix` capability.

## 9. Process progress and compliance score stay separate

`KatedraProjectState.progressPercent` represents workflow completion.

`LektaResult.score` represents technical/compliance analysis within Lekta's declared coverage.

They are never combined into one synthetic readiness score.

## 10. AI usage ledger

`AIUsageLedgerEntry` is process-transparency metadata. It is not itself proof of academic honesty or faculty certification.

Institution-specific disclosure guidance must combine actual recorded workflow with verified Academic Core AI-policy data.

## 11. Shared analytics vocabulary

Both products should use the same cross-product event meanings, including:

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

The analytics vendor may change; event semantics do not.

## 12. Deep-link rule

Early integration may use URLs for non-sensitive routing metadata only.

Allowed examples:

```text
projectId
unitId
programId
profileId
workType
rulesetId
```

Incoming identifiers must always be validated by the receiving product. Unknown identifiers fall back to explicit selection; they never silently map to a different faculty/profile.

## 13. Contract evolution

- Every shared payload carries `schemaVersion`.
- Breaking semantic changes increment the version.
- Additive optional fields may remain on the same version when backward compatible.
- Neither application may depend on undocumented fields from the other application.
- The two repositories must not evolve separate meanings for the same field name.

## 14. v0.1 acceptance criteria

Foundation contracts are ready when:

1. both repositories compile against the same contract semantics;
2. legacy Katedra `s/z/d` maps deterministically to the canonical work types;
3. Lekta emits a privacy-safe `LektaResult` adapter;
4. issue identity does not rely on array position for new payloads;
5. guest projects can keep one identity through login;
6. Katedra consumes Lekta-owned academic rules rather than owning a competing normative database;
7. shared entitlements are modeled separately from AI token accounting;
8. only Lekta re-check evidence can establish `VERIFIED_FIXED`.
