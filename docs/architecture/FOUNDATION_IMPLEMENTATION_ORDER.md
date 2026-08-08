# Lekta × Katedra Foundation Implementation Order

This is the execution order after Product Constitution v0.1 and Shared Domain Contracts v0.1.

## Phase 1 — Contracts only

Goal: no production behavior change.

1. Accept Product Constitution.
2. Accept shared domain contracts.
3. Map existing Lekta types to shared contracts.
4. Inventory Katedra hard-coded faculty rules and classify each as:
   - migrate to Academic Core;
   - keep as generic guidance;
   - keep as project/mentor preference;
   - delete as unsafe/unverified.
5. Define initial analytics event dictionary.

Exit gate: both apps can be developed without inventing competing domain meanings.

## Phase 2 — Academic Core export seam

Goal: Katedra consumes Lekta-owned normative data.

1. Add a read-only adapter in Lekta that converts existing profile/rule structures into `AcademicRuleSetRef` + `SharedAcademicRule[]`.
2. Preserve existing `RuleEntry` as authoring/source-of-truth structure.
3. Add tests proving exported shared rules preserve:
   - ruleId;
   - source/provenance;
   - verification status;
   - academic year;
   - machineCheckable;
   - AutoFix metadata.
4. Create one golden export for FPZG graduate work.

Exit gate: Katedra can obtain faculty rules without duplicating them.

## Phase 3 — Katedra cleanup

Goal: remove overlap and ambiguous authority.

1. Rename Katedra `Audit rada` -> `Katedra Review`.
2. Remove deterministic compliance claims from Katedra.
3. Replace hard-coded supported-faculty normative statements with Academic Core consumption.
4. Keep generic writing guidance clearly labeled as guidance, not faculty rules.
5. Keep mentor/course instructions separate from institutional rules.
6. Preserve Katedra review dimensions:
   - thesis/research question;
   - argumentation;
   - evidence quality;
   - conceptual structure;
   - mentor feedback;
   - defense preparation.

Exit gate: there is no user-facing confusion about which product verifies compliance.

## Phase 4 — ProjectManifest local v0.1

Goal: one project identity before shared cloud persistence.

1. Katedra creates `ProjectManifest` locally.
2. Store canonical `projectId` with:
   - institution/program/work type;
   - topic;
   - academic year;
   - deadline;
   - selected ruleset;
   - stage.
3. Add export/import for debugging and migration.
4. Do not require login yet for this milestone.

Exit gate: a project can travel from Katedra to Lekta without losing context.

## Phase 5 — First Katedra -> Lekta deep-link

Goal: first user-visible integration.

1. Add `Provjeri draft u Lekti` CTA in Katedra.
2. Send only safe project/profile identifiers in the URL.
3. Lekta validates incoming identifiers.
4. Lekta preselects the exact institution/program/work type when valid.
5. User manually selects the local `.docx`.
6. Unknown/unsupported context falls back to explicit selection, never a silent default.

Exit gate: Katedra user reaches correctly configured Lekta in one click.

## Phase 6 — LektaResult v0.1

Goal: stable machine-readable handoff.

1. Build an adapter from current Lekta analysis/report types to `LektaResult`.
2. Create stable `issueKey` mapping for findings that can recur across re-checks.
3. Attach `ruleId` / `checkId` wherever available.
4. Attach fixability metadata.
5. Never include raw document text by default in the handoff payload.
6. Add schema validation tests.

Exit gate: Lekta output can be consumed by another product without parsing UI prose.

## Phase 7 — Lekta -> Katedra resolution handoff

Goal: closed loop begins.

1. Add `Riješi u Katedri` CTA after a Lekta result.
2. Transfer structured issues via a safe handoff mechanism.
3. Katedra creates a resolution plan grouped by severity/category.
4. Katedra may mark an item `USER_CHANGED` / `RECHECK_REQUIRED`.
5. Katedra cannot mark `VERIFIED_FIXED`.

Exit gate: user can move from detection to guided resolution.

## Phase 8 — Re-check reconciliation

Goal: independent verification loop.

1. User edits local document.
2. User runs Lekta again.
3. Reconcile findings using `issueKey`, `ruleId`, and check context.
4. Only absent/resolved findings proven by the new Lekta run become `VERIFIED_FIXED`.
5. Reappearing issues return to `OPEN`.

Exit gate: Katedra -> Lekta -> Katedra -> Lekta loop is operational.

## Phase 9 — Shared account

Goal: one identity across both apps.

1. Use one auth project/provider.
2. Canonical `userId` is shared.
3. Each app has its own UI/session handling but resolves to the same identity.
4. Introduce secure cross-app sign-in/redirect flow as needed.
5. Do not attempt to share localStorage across different domains.

Exit gate: user has one account and sees the same project identity in both apps.

## Phase 10 — Shared backend project metadata

Goal: cross-device continuity without giving up local document privacy.

Persist:

- ProjectManifest metadata;
- Katedra progress;
- latest Lekta analysis metadata/score;
- structured issue state;
- entitlements;
- optional AI ledger.

Do not persist by default:

- raw `.docx`;
- full Claude conversation;
- source documents;
- mentor documents.

Exit gate: same project appears consistently across both apps/devices.

## Phase 11 — Shared entitlements

Goal: one purchase can unlock both products.

1. Keep server authoritative.
2. Map existing Lekta product/pass infrastructure into the shared `Entitlement` contract.
3. Define capabilities, not UI assumptions.
4. Initial candidate products:
   - Lekta Check;
   - Lekta Fix;
   - Katedra Pro;
   - Diplomski/Thesis Pass;
   - Pass Plus with AutoFix.
5. Do not change prices until the product loop is validated.

Exit gate: one project pass can unlock defined features across both applications.

## Phase 12 — AI Usage Ledger

Goal: transparent process evidence, not detector theater.

1. Capture user-approved AI use events in Katedra.
2. Use verified Academic Core AI policy to generate disclosure guidance.
3. Keep ledger wording factual and user-reviewable.
4. Export process diary / disclosure material.
5. Do not present ledger as institutional certification.

Exit gate: AI-use transparency is grounded in actual workflow and actual faculty policy.

## Phase 13 — Shared analytics

Goal: measure the ecosystem as one funnel.

Track at least:

`project_created -> katedra_plan_completed -> draft_marked_ready -> lekta_check_completed -> handoff_to_katedra -> recheck_completed -> purchase_completed -> submission_preflight_completed -> defense_stage_started`

Exit gate: product decisions can be based on cross-product conversion and retention.

## Phase 14 — B2B separation

Goal: institutional credibility.

1. Keep Lekta Campus as the primary institutional compliance product.
2. Katedra generative assistance is not automatically part of the B2B offer.
3. If needed, create `Katedra Learn` with restricted/socratic functionality.
4. Preserve the truthful statement that Lekta compliance does not write student content.

## Do not do yet

Until the closed loop works, do not:

- merge the repositories;
- build a new umbrella brand;
- create a second faculty-rules database;
- duplicate auth providers;
- implement raw-document cloud sync by default;
- add major new Katedra/Lekta overlapping features;
- build complex subscription logic;
- rewrite Lekta's existing RuleEntry/profile engine merely to match the shared facade.

## Immediate next coding milestone

The next implementation milestone after foundation acceptance is intentionally small:

```text
Katedra project
    -> Provjeri u Lekti
Lekta preselected profile
    -> local DOCX analysis
LektaResult
    -> Riješi u Katedri
Katedra resolution plan
    -> Lekta re-check
```

Everything else is downstream of proving this loop.
