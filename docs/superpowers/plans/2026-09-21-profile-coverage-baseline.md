# Profile Coverage Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Build a private, generated profile coverage matrix and blocker backlog that joins completion-ledger claims with per-rule source evidence for all registered and legal-department profiles.

**Architecture:** Keep the aggregation pure in `src/verification/profile-coverage-backlog.ts`. The CLI adapter loads the existing drafts runtime and generated ledger inputs, then writes a private artifact under `docs/generated`. Tests exercise the pure builder and the generated artifact contract without putting draft evidence into the public profile claims projection.

**Tech Stack:** TypeScript strict, Vitest, Vite Node CLI, existing completion ledger and `RuleEntry` schema.

**Spec:** `docs/superpowers/specs/2026-09-21-profile-coverage-program-design.md`

## Global Constraints

- Do not invent faculty rules or source pages.
- Keep source quotes, pages and signatures out of `data/profiles/profile-claims.json` and the browser bundle.
- Do not alter parser or repair behavior without golden and idempotence coverage.
- The registered denominator is 407 profiles and 131 faculty units; three legal-department profiles are reported separately.
- Generated artifacts must be regenerated from typed source and protected by drift tests.

## Review Focus

- Duplicate ledger rows for one profile must produce one profile record while preserving every work-type row.
- Program rows with `profileId: null` must not enter the profile denominator.
- Legal-department profiles with no `unitId` must remain visible in a separate group.
- A rule with missing page or quote must be reported as incomplete evidence, never silently treated as verified evidence.
- A profile at B must be classified as `real-corpus` rather than complete, because generated proof is not A evidence.

### Task 1: Pure backlog model

**Files:**
- Create: `src/verification/profile-coverage-backlog.ts`
- Test: `tests/profile-coverage-backlog.test.ts`

**Interfaces:**
- Consumes: `LedgerRow` from `src/verification/completion-ledger.ts`, `RuleEntry` and profile identity fields from `src/profiles/profile-schema.ts`.
- Produces: `buildProfileCoverageBacklog(input): ProfileCoverageBacklog` with profile records, faculty aggregates and a summary.

- [ ] Write tests for one A, B, C, D, E profile, duplicate ledger rows, null program rows, legal-department profiles, and missing rule evidence.
- [ ] Run the focused test and confirm it fails because the builder is not present.
- [ ] Implement the smallest pure builder with deterministic sorting and blocker classification.
- [ ] Run the focused test and the existing profile and ledger tests.

### Task 2: Generator and artifact

**Files:**
- Create: `scripts/generate-profile-coverage-backlog.mts`
- Create: `docs/generated/profile-coverage-backlog.json`
- Modify: `package.json` to add `profile-coverage-backlog`
- Test: `tests/profile-coverage-backlog.test.ts`

**Interfaces:**
- Consumes: `VERIFIED_PROFILES_WITH_DRAFTS`, `LEGAL_DEPARTMENTS_WITH_DRAFTS`, `docs/generated/completion-ledger.json`, and `docs/generated/faculty-matrix.json`.
- Produces: deterministic JSON artifact with evidence rows and aggregate blocker counts.

- [ ] Add the generator after the pure builder tests are green.
- [ ] Generate the artifact in the isolated worktree.
- [ ] Add drift coverage comparing the generated artifact with a fresh build from current inputs.
- [ ] Assert that the artifact includes 407 registered profiles and three legal-department profiles, with no null program rows.

### Task 3: Verification and handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-09-21-profile-coverage-program-design.md` only if implementation evidence changes the contract.
- Modify: `docs/generated/profile-coverage-backlog.json` through the generator only.

- [ ] Run focused tests, `npm run orphan-scan`, and the relevant generation checks.
- [ ] Run the isolated project gate and read the Vitest `Test Files` summary, not only the process exit code.
- [ ] Report the exact C, D and E backlog from the generated artifact and leave later profile promotion phases as explicit pending work.

