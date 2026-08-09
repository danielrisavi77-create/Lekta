# Analysis Measurement Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make unavailable DOCX measurements explicit and exclude them from the compliance score.

**Architecture:** Extend the existing `Check` model with a measurement status while preserving `evidence` as a compatibility field. Centralize score eligibility in scoring helpers, then mark the known fail-open checks as `unknown` after analysis gathers measurements. Update the score explanation UI to use the same eligibility rule.

**Tech Stack:** TypeScript strict, Vitest, Vite, existing DOCX analyzer and happy-dom UI tests.

## Global Constraints

- `npm run check` must pass before completion.
- Do not modify the OOXML parser, citation engine or audit algorithms without a golden baseline.
- Visible document text and content-generation boundaries remain unchanged.
- Croatian is the default language for domain comments and UI copy.
- No em or en dashes in new text.

---

### Task 1: Lock the scoring contract with failing tests

**Files:**
- Modify: `tests/verification-coverage.test.ts`
- Create: `tests/scoring-status.test.ts`

**Interfaces:**
- Consumes: existing `makeCheck`, `markAssumedEvidence`, `verificationCoverage`.
- Produces: executable expectations for `measurementStatus`, `status: 'info'` on non-scored checks, and score eligibility.

- [ ] **Step 1: Add the failing unit tests**

Add tests asserting:

```ts
const unknown = makeCheck('formatting', 'Dominantni font', 'pass', 8, 8, '');
markAssumedEvidence([unknown], { 'format.font.dominant': true });
expect(unknown).toMatchObject({
  status: 'unknown',
  measurementStatus: 'unavailable',
  earned: 0,
  scored: false,
});

const info = makeCheck('formatting', 'Dominantni font', 'pass', 0, 0, '');
expect(info).toMatchObject({ status: 'info', measurementStatus: 'not-applicable', scored: false });
```

Also add a score helper test with one measured 8/8 check and one unavailable 8/8 check, expecting `earned: 8`, `max: 8`, `score: 100`, while `verificationCoverage` remains 50 percent.

- [ ] **Step 2: Run the focused tests and verify the expected red failure**

Run: `npm test -- tests/verification-coverage.test.ts tests/scoring-status.test.ts`

Expected: failure because `measurementStatus` and the new score eligibility behavior do not yet exist, and the existing tests still assert that unavailable values retain full points.

### Task 2: Implement the canonical measurement status and score eligibility

**Files:**
- Modify: `src/scoring/checks.ts`
- Modify: `src/analysis/analyze-docx.ts:237-242`

**Interfaces:**
- Consumes: existing `Check` records and stable check IDs.
- Produces: `MeasurementStatus`, `scoreTotals(checks)`, and checks whose unavailable measurements are explicitly `unknown`.

- [ ] **Step 1: Add the minimal scoring model**

In `src/scoring/checks.ts`, add:

```ts
export type MeasurementStatus = 'measured' | 'unavailable' | 'ambiguous' | 'not-applicable';
```

Add `measurementStatus` to `Check`. Initialize it to `measured` for `max > 0` and `not-applicable` otherwise. Change the `max === 0` branch to use `status: 'info'` and `scored: false`.

Update `markAssumedEvidence()` so a matching scored check becomes `evidence: 'assumed'`, `measurementStatus: 'unavailable'`, `status: 'unknown'`, `earned: 0` and `scored: false`.

Add:

```ts
export function scoreTotals(checks: Check[]): { earned: number; max: number; score: number | null } {
  const measured = checks.filter((check) => check.scored && check.measurementStatus === 'measured' && check.max > 0);
  const earned = measured.reduce((sum, check) => sum + check.earned, 0);
  const max = measured.reduce((sum, check) => sum + check.max, 0);
  return { earned, max, score: max ? Math.round((earned / max) * 100) : null };
}
```

Keep `verificationCoverage()` based on all `max > 0` checks so it continues to expose unavailable measurements.

- [ ] **Step 2: Replace the analyzer's local score calculation**

Import `scoreTotals` in `src/analysis/analyze-docx.ts` and replace the local `scoredChecks`, `max`, `earned`, and `score` reduction with the helper result. Build `categories` from checks eligible for scoring, so unavailable checks do not appear as awarded category points.

- [ ] **Step 3: Run focused tests and verify green**

Run: `npm test -- tests/verification-coverage.test.ts tests/scoring-status.test.ts`

Expected: PASS, including the regression proving an unavailable 8-point check contributes neither numerator nor denominator.

### Task 3: Align the result explanation UI with the score contract

**Files:**
- Modify: `src/ui/app.ts:831-843`
- Modify: `tests/verification-coverage.test.ts` only if a pure helper assertion is needed; do not add DOM setup for unrelated UI.

**Interfaces:**
- Consumes: `Check.measurementStatus` and `Check.scored` from analysis results.
- Produces: score breakdown rows that list only measured, scored checks.

- [ ] **Step 1: Add a regression assertion for score breakdown eligibility**

Extract the existing measured-check predicate into an exported pure helper in `src/scoring/checks.ts`, then test that it returns false for `measurementStatus: 'unavailable'` and `true` for a measured scored check.

- [ ] **Step 2: Use the predicate in the UI**

Change `scoreBreakdownHtml()` to filter with the shared eligibility helper. Leave existing copy and score labels intact, because this task changes evidence semantics, not product wording.

- [ ] **Step 3: Run the focused UI tests**

Run: `npm test -- tests/scoring-status.test.ts tests/ui/repair-panel.test.ts`

Expected: PASS.

### Task 4: Update analyzer regression expectations

**Files:**
- Modify: tests that explicitly assert old fail-open behavior, beginning with `tests/verification-coverage.test.ts` and any synthetic fixture test reported by the focused suite.
- Modify: `tests/helpers/golden-normalize.ts` only if a new deterministic field must be intentionally snapshotted. Do not snapshot `measurementStatus` unless the golden contract requires it.

**Interfaces:**
- Consumes: the new check contract.
- Produces: regression coverage proving measured synthetic documents remain pass and unmeasured documents become unknown without changing visible text.

- [ ] **Step 1: Run targeted analyzer suites**

Run: `npm test -- tests/docx-golden.test.ts tests/synthetic-golden.test.ts tests/analyze-docx-client.test.ts tests/verification-coverage.test.ts`

- [ ] **Step 2: Update only assertions that describe the intentionally changed status or score**

Preserve all measured-document `pass` assertions. Change only tests whose comments and expectations explicitly require `100/100` for unavailable measurements or `pass` for max-zero informational checks.

- [ ] **Step 3: Run the full project gate**

Run: `npm run check`

Expected: `tsc --noEmit`, the complete Vitest suite and `vite build` all exit successfully.
