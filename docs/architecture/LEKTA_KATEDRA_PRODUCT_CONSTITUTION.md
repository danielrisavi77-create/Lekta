# Lekta × Katedra Product Constitution v0.1

Status: foundation contract

Purpose: define the permanent product boundary between Lekta and Katedra before account, project, rules, billing, analytics, or UI integration begins.

## 1. North-star architecture

Lekta and Katedra are two separate products in one academic-work ecosystem.

- Katedra is the process and reasoning copilot: from topic to defense.
- Lekta is the independent verification and document-compliance engine: from draft to submission readiness.
- They may share identity, project metadata, academic rules, entitlements, analytics vocabulary, and structured results.
- They must not silently share raw academic documents or generative conversation content unless a later feature has explicit user consent and a documented retention policy.

Canonical sentence:

> Katedra helps the work become better. Lekta checks what actually exists in the document.

## 2. Product responsibilities

### Katedra MAY

- guide topic definition and research planning;
- help formulate research questions, hypotheses, structure, and work plans;
- help organize literature and source-gathering workflows;
- explain academic rules received from the shared Academic Core;
- provide semantic review of argumentation, structure, evidence, clarity, and mentor feedback;
- help resolve issues reported by Lekta;
- support deadline planning and progress tracking;
- prepare defense workflows;
- maintain an AI-usage/process ledger when the user chooses to use that functionality;
- generate faculty-aware disclosure guidance from verified Academic Core policy data;
- use generative AI when clearly framed as assistance rather than verification.

### Katedra MUST NOT

- declare a document formally compliant with faculty rules;
- mark a Lekta issue as verified-fixed without a new Lekta check;
- maintain its own independent copy of institution-specific normative rules once those rules exist in Academic Core;
- represent LLM judgment as deterministic document verification;
- claim official faculty approval, certification, or acceptance.

### Lekta MAY

- parse and inspect the actual document structure;
- run deterministic or explicitly classified heuristic checks;
- compare machine-checkable document properties against verified Academic Core rules;
- score technical/submission compliance;
- inspect formatting, structure, citations, bibliography relationships, document mechanics, and submission requirements within declared coverage;
- apply deterministic AutoFix operations only where a verified rule explicitly permits an approved fixer;
- return structured issue data to Katedra;
- verify that an issue is resolved only after a new analysis of the changed document.

### Lekta MUST NOT

- write or invent the student's academic argument, findings, analysis, or conclusion;
- use generative rewriting as part of a deterministic compliance verdict;
- treat a Katedra recommendation as proof that a document issue is fixed;
- claim that a technical score equals academic quality or official acceptance;
- silently upload the raw document when local analysis is the promised mode.

## 3. Trust boundary

The system must preserve an observable separation between assistance and verification.

- Katedra output is advice, planning, explanation, review, or generative assistance.
- Lekta output is a documented technical/compliance analysis with provenance and coverage limits.
- Where the same underlying academic rule is used by both products, the rule comes from one shared source of truth.
- Katedra may explain a Lekta finding, but only Lekta may verify it against the document.

This separation is mandatory for user trust and future institutional/B2B positioning.

## 4. Shared system primitives

Both products may depend on the following shared primitives:

1. User identity
2. Project identity
3. AcademicRuleSet
4. Institution/program/work-type taxonomy
5. Academic-year/version metadata
6. AI-policy metadata
7. Citation-style identifiers
8. LektaResult contract
9. Entitlement contract
10. Analytics event vocabulary

These primitives are product-neutral. Neither Lekta nor Katedra owns a conflicting duplicate.

## 5. One-account rule

There is one canonical user identity across both products.

- A user who creates an account in either application receives the same canonical user ID.
- Purchases and entitlements are attached to that canonical user ID.
- Project membership is attached to that canonical user ID.
- Separate visual brands and separate application domains do not imply separate accounts.

Implementation provider may change, but the domain rule does not.

## 6. One-project rule

A single academic work has one canonical `projectId` across the ecosystem.

The same project may contain:

- Katedra progress and process state;
- shared academic metadata;
- latest Lekta score and structured result metadata;
- entitlement status;
- deadline and stage;
- optional AI-usage ledger metadata.

The raw `.docx` file is not part of the required shared project record.

## 7. One-rules-source rule

Institution-specific normative rules must have one authoritative source in Academic Core.

Katedra must not hard-code a rule that can be resolved from Academic Core.

Each normative rule should preserve, where available:

- stable `ruleId`;
- profile/institution/program/work-type context;
- value;
- authority level;
- source ID;
- source page or location;
- verification status;
- verification timestamp;
- academic-year/version context;
- machine-checkability;
- AutoFix eligibility and fixer ID.

Lekta's existing `RuleEntry` and source/verification model is the starting point, not a parallel replacement.

## 8. Result handoff rule

Lekta returns structured results, not prose-only summaries, for cross-product handoff.

Minimum issue identity:

- `issueId`
- `checkId`
- `ruleId` when applicable
- category
- severity
- status
- human-readable summary
- machine location/context when available
- `fixable`
- `fixerId` when applicable

Katedra may consume this data to create a resolution plan.

## 9. Verification state machine

Cross-product issue lifecycle:

`OPEN -> USER_CHANGED -> RECHECK_REQUIRED -> VERIFIED_FIXED`

Rules:

- Katedra may move a user workflow from `OPEN` to `USER_CHANGED` or `RECHECK_REQUIRED`.
- Only a subsequent Lekta analysis may establish `VERIFIED_FIXED`.
- If the issue reappears, it returns to `OPEN`.

## 10. Data and privacy defaults

Default architecture:

- project metadata may sync through the shared backend;
- account identity and entitlements may sync;
- Lekta result metadata may sync;
- Katedra progress may sync;
- raw academic documents remain local unless a feature explicitly requires upload and obtains explicit consent;
- generative conversation content is not automatically shared with Lekta;
- no product may weaken another product's privacy promise by implication.

Any exception requires:

1. explicit feature purpose;
2. explicit consent where required;
3. documented processor path;
4. retention rule;
5. deletion behavior;
6. UI copy that accurately distinguishes local from cloud processing.

## 11. Billing and entitlement rule

Billing is shared at the user/project entitlement layer even if offers are presented differently in each application.

Examples:

- a one-document Lekta Check may unlock only a Lekta result;
- a Lekta Fix may unlock approved repair operations;
- a Thesis/Diplomski Pass may unlock features in both Lekta and Katedra for one project and one validity window.

The client never becomes the authority for entitlement validity.

## 12. Analytics rule

Both products use the same canonical identifiers:

- `userId`
- `projectId`
- `rulesetId` / profile identifier
- `entitlementId` when relevant

Core cross-product funnel vocabulary should support at least:

- `project_created`
- `katedra_plan_completed`
- `draft_marked_ready`
- `lekta_check_started`
- `lekta_check_completed`
- `lekta_result_handoff_to_katedra`
- `resolution_plan_started`
- `lekta_recheck_completed`
- `submission_preflight_completed`
- `defense_stage_started`

Vendor-specific analytics may vary; event semantics must not.

## 13. B2C and B2B boundary

B2C may present Katedra and Lekta together as a connected workflow.

B2B institutional positioning remains primarily Lekta-led unless an explicitly restricted Katedra Learn mode is created.

Institutional Lekta must be able to truthfully say that the compliance engine does not write the student's academic content.

## 14. Architecture change gate

A proposed feature that crosses the Katedra/Lekta boundary must answer:

1. Is this assistance or verification?
2. Which product owns the user-facing responsibility?
3. Which shared contract does it read/write?
4. Does it create a second source of academic rules?
5. Does it change document/privacy behavior?
6. Can it falsely make generative output look verified?
7. Does it alter entitlement semantics?

If answers are unclear, the feature is not ready to implement.

## 15. Definition of foundation-complete

Foundation v0.1 is complete when:

- this constitution is accepted as the product boundary;
- shared domain contracts exist for Project, AcademicRuleSet, LektaResult, and Entitlement;
- both products can reference the same canonical identifiers;
- Katedra-specific hard-coded faculty rules have a migration path to Academic Core;
- the first deep-link Katedra -> Lekta can be implemented without inventing new data models.
