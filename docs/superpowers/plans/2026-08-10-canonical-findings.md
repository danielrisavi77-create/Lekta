# Canonical Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodati aditivni canonical model nalaza za postojeće `checks[]` i `issues[]` rezultate DOCX analize.

**Architecture:** Novi DOM-free adapter u `src/analysis/canonical-findings.ts` proizvodi jedan `CanonicalFinding` po provjeri i determinističke dodatne zapise za neuparele issueje. `analyzeDocx` ga dodaje u rezultat bez uklanjanja legacy polja, a UI i report sanitizer ga koriste samo kad je prisutan.

**Tech Stack:** TypeScript strict, Vitest, postojeći DOCX analyzer, worker/fallback klijent, happy-dom UI testovi.

## Global Constraints

- `npm run check` must pass before completion.
- Do not modify the OOXML parser, citation engine or audit algorithms without a golden baseline.
- Visible document text and content-generation boundaries remain unchanged.
- Croatian is the default language for domain comments and UI copy.
- No em or en dashes in new text.
- Existing `checks`, `issues`, `details`, triage and repair contracts remain backward compatible.
- `scoreImpact` is null unless the existing `isScoreEligible` predicate is true.
- Canonical locations must not invent paragraph indexes when only a textual `where` is known.
- Canonical IDs must not expose readable document text or location slugs.
- Sanitized canonical findings must not send detail or evidence text to the server boundary.
- Canonical UI must preserve issue title/detail, triage scope, measured check detail and repair matching.
- A `not-applicable` finding without an issue is not an open document problem; unavailable and ambiguous measurements are limitations.
- `score: null` must remain a valid explicit result when no measured scored checks exist.

---

### Task 1: Canonical model and pure adapter

**Files:**
- Create: `src/analysis/canonical-findings.ts`
- Create: `tests/canonical-findings.test.ts`

**Interfaces:**
- Consumes: `Check`, `Issue`, `isScoreEligible` from `src/scoring/checks.ts`.
- Produces: `CanonicalFinding`, `CanonicalFindingInput`, and `buildCanonicalFindings(input)`.

- [ ] **Step 1: Write the failing tests**

Test these behaviors:

```ts
const pass = makeCheck('formatting', 'Font', 'pass', 8, 8, 'Times New Roman 12');
const fail = makeCheck('formatting', 'Margine', 'warn', 2, 6, 'Lijeva margina odstupa', issue('warning', 'formatting', 'Margina', 'Odstupanje', 'Postavke stranice'));
const unknown = makeCheck('formatting', 'Prored', 'unknown', 0, 4, 'Vrijednost nije dostupna');
markAssumedEvidence([unknown], { [unknown.id]: true });

const findings = buildCanonicalFindings({ checks: [pass, fail, unknown], issues: [fail.issue!] });

expect(findings).toHaveLength(3);
expect(findings[0]).toMatchObject({
  id: `check:${pass.id}`,
  checkId: pass.id,
  status: 'pass',
  measurementStatus: 'measured',
  scoreImpact: { earned: 8, max: 8 },
});
expect(findings[2]).toMatchObject({
  status: 'unknown',
  measurementStatus: 'unavailable',
  scoreImpact: null,
  scored: false,
});
```

Add separate assertions that an issue without a matching check gets `checkId: null`, `scoreImpact: null`, a `where` location, and a deterministic duplicate suffix.

- [ ] **Step 2: Run the focused test and verify the expected red failure**

Run: `npm run test -- --run tests/canonical-findings.test.ts`

Expected: FAIL because `src/analysis/canonical-findings.ts` and `buildCanonicalFindings` do not yet exist.

- [ ] **Step 3: Implement the minimal adapter**

Define:

```ts
export interface CanonicalFinding {
  id: string;
  checkId: string | null;
  ruleId: string | null;
  category: string;
  severity: 'error' | 'warning' | 'info';
  status: 'pass' | 'fail' | 'warn' | 'info' | 'unknown';
  measurementStatus: MeasurementStatus;
  title: string;
  detail: string;
  locations: Array<{ where: string }>;
  evidence: string[];
  scored: boolean;
  scoreImpact: { earned: number; max: number } | null;
  blocking: boolean;
}
```

The adapter must deduplicate an issue matching `check.issue` by category, title and where. A check produces one record even when it has no issue. Unmatched issues use `issue:<slug>` and `:2`, `:3` suffixes for repeated bases. Normalize unknown check statuses to `unknown`, warn-like statuses to `warn`, fail-like statuses to `fail`, and all other non-pass values to `info` only when the check is non-scored.

- [ ] **Step 4: Run the focused test and verify green**

Run: `npm run test -- --run tests/canonical-findings.test.ts`

Expected: PASS with all canonical status, score impact, deduplication and unmatched issue assertions green.

### Task 2: Add canonical findings to the analyzer result

**Files:**
- Modify: `src/analysis/analyze-docx.ts`
- Modify: `tests/analyze-docx-client.test.ts`
- Modify: `tests/docx-golden.test.ts` only if the golden normalizer explicitly requires the new top-level field, otherwise keep snapshots unchanged.

**Interfaces:**
- Consumes: `buildCanonicalFindings({ checks, issues })` from Task 1.
- Produces: `result.findings: CanonicalFinding[]`, while preserving `result.checks`, `result.issues`, `result.details` and score fields.

- [ ] **Step 1: Add the failing analyzer assertion**

Extend the existing direct analyzer test with:

```ts
expect(Array.isArray(result.findings)).toBe(true);
expect(result.findings).toHaveLength(result.checks.length);
expect(result.findings.some((finding) => finding.checkId === result.checks[0].id)).toBe(true);
```

- [ ] **Step 2: Run the analyzer test and verify red**

Run: `npm run test -- --run tests/analyze-docx-client.test.ts`

Expected: FAIL because the analyzer result has no `findings` field.

- [ ] **Step 3: Add the adapter call at the result boundary**

Import `buildCanonicalFindings`, compute it after the final `checks` and `issues` arrays are complete, and add `findings` to the returned object. Do not move or delete any existing result property.

- [ ] **Step 4: Run targeted analyzer regressions**

Run: `npm run test -- --run tests/analyze-docx-client.test.ts tests/docx-golden.test.ts tests/synthetic-golden.test.ts`

Expected: PASS, with no intended golden changes because the normalizer excludes the additive field.

### Task 3: Use canonical findings in the UI with legacy fallback

**Files:**
- Modify: `src/ui/finding-view-model.ts`
- Modify: `tests/finding-view-model.test.ts`

**Interfaces:**
- Consumes: optional `findings?: CanonicalFinding[]` in `FindingResultInput`.
- Produces: the same `FindingViewModel[]` shape and behavior for legacy and canonical inputs.

- [ ] **Step 1: Add failing canonical UI tests**

Construct a result with one canonical warning, one canonical info limitation and an empty `issues` array. Assert that `buildFindingViewModels(result)` returns the canonical titles, severity and explanation. Keep the existing legacy test and assert it still works when `findings` is absent.

- [ ] **Step 2: Run the focused UI test and verify red**

Run: `npm run test -- --run tests/finding-view-model.test.ts`

Expected: FAIL because the current UI projection only reads `issues`.

- [ ] **Step 3: Implement the canonical projection**

When `result.findings` is an array, project canonical records into the existing view model. Preserve triage matching by category and title, retain source and tool behavior, map canonical locations to document scope using `where`, and never let canonical `blocking` or `scoreImpact` alter UI session status. When `findings` is absent, execute the current legacy projection unchanged.

- [ ] **Step 4: Run focused UI and triage regressions**

Run: `npm run test -- --run tests/finding-view-model.test.ts tests/triage.test.ts tests/lekta-result-adapter.test.ts`

Expected: PASS with both canonical and legacy projections covered.

### Task 4: Preserve privacy at the report boundary

**Files:**
- Modify: `src/report/report.ts`
- Modify: `tests/report-sanitize.test.ts`

**Interfaces:**
- Consumes: optional `findings?: CanonicalFinding[]` on `AnalysisResultLike`.
- Produces: sanitized canonical findings with the same redaction behavior as checks and issues.

- [ ] **Step 1: Add the failing privacy assertion**

Add a `findings` array to the existing `fullResult()` fixture with `detail`, `evidence` and a `where` value containing `SECRET`. Assert that `sanitizeAnalysisResult(fullResult())` contains no `SECRET` and that the sanitized finding keeps its status, checkId, location and scoreImpact.

- [ ] **Step 2: Run the privacy test and verify red**

Run: `npm run test -- --run tests/report-sanitize.test.ts`

Expected: FAIL because `AnalysisResultLike` and sanitizer currently omit canonical findings.

- [ ] **Step 3: Implement minimal sanitizer support**

Add optional `findings` to `AnalysisResultLike`. Redact `detail` and every `evidence` string with `redactParagraphQuotes`, keep only canonical scalar fields and sanitized `locations`, and omit any future unknown fields from the outbound object.

- [ ] **Step 4: Run privacy and report regressions**

Run: `npm run test -- --run tests/report-sanitize.test.ts tests/report-boundary.test.ts tests/lekta-result-adapter.test.ts`

Expected: PASS and no literal document text in the serialized report request.

### Task 5: Integrated verification and review

**Files:**
- No production changes expected unless a review finds a concrete regression.

- [ ] **Step 1: Run the complete focused canonical suite**

Run: `npm run test -- --run tests/canonical-findings.test.ts tests/analyze-docx-client.test.ts tests/finding-view-model.test.ts tests/report-sanitize.test.ts tests/triage.test.ts tests/lekta-result-adapter.test.ts tests/docx-golden.test.ts tests/synthetic-golden.test.ts`

Expected: PASS.

- [ ] **Step 2: Run typecheck and build**

Run: `npx tsc --noEmit` and `npm run build`.

Expected: both commands exit with code 0.

- [ ] **Step 3: Run the hard gate**

Run: `npm run check`.

Expected: `tsc --noEmit`, the complete Vitest suite and `vite build` all exit successfully. If the suite exceeds the environment timeout, report the exact timeout and retain the successful targeted evidence instead of claiming a green full gate.
