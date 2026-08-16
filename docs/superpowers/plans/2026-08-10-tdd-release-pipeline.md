# TDD Release Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only GitHub Actions gate for the slow closed-loop repair suite and execute the full PR, verification, review, merge and release sequence.

**Architecture:** Keep the existing fast `check`, UX, conformance, strict-open and security workflows separate. Add one focused workflow that installs Node 24 dependencies and runs `npm run test:slow`; validate that workflow with a repository test so its contract cannot silently drift. Word COM remains a manual Windows gate, and deployment remains staged and explicit.

**Tech Stack:** GitHub Actions YAML, Node 24, npm, Vitest, Python 3.12, Word COM, Netlify build chain.

## Global Constraints

- `npm run check` remains `tsc --noEmit && vitest run && vite build`.
- `npm run test:slow` remains separate from `npm run check` because it runs the full closed-loop repair matrix.
- CI permissions are `contents: read`; no workflow may receive secrets for the slow gate.
- Do not change parser, audits, citation engine, repair engine or Netlify build ordering.
- Word COM verification is manual on Windows through `npm run verify:word` and `npm run verify:word:worst`.
- Production deployment happens only after staging smoke and `scripts/verify-deploy-dist.mjs`.
- Every behavior change follows RED, minimal implementation, GREEN, full regression verification.
- Do not stage `.claude/settings.local.json` or `.superpowers/`.

---

### Task 1: Add the slow workflow contract test

**Files:**
- Create: `tests/repair-slow-workflow.test.ts`
- Read: `.github/workflows/repair-slow.yml` after Task 2

**Interfaces:**
- Produces a test contract that requires the workflow to contain `push`, `pull_request`, `workflow_dispatch`, Node `24`, `npm ci`, `npm run test:slow`, and `contents: read`.

- [ ] **Step 1: Write the failing test**

Create a Vitest test that reads the workflow as UTF-8 and checks each required line using exact regular expressions:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = resolve(process.cwd(), '.github/workflows/repair-slow.yml');

describe('repair slow workflow contract', () => {
  it('defines the read-only Node 24 closed-loop gate', () => {
    const yaml = readFileSync(workflow, 'utf8');
    expect(yaml).toMatch(/name:\s*repair-slow/);
    expect(yaml).toMatch(/push:/);
    expect(yaml).toMatch(/pull_request:/);
    expect(yaml).toMatch(/workflow_dispatch:/);
    expect(yaml).toMatch(/permissions:\s*\n\s+contents:\s*read/);
    expect(yaml).toMatch(/node-version:\s*24/);
    expect(yaml).toMatch(/run:\s*npm ci/);
    expect(yaml).toMatch(/run:\s*npm run test:slow/);
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run:

```powershell
npm run test -- run tests/repair-slow-workflow.test.ts
```

Expected: FAIL because `.github/workflows/repair-slow.yml` does not yet exist.

- [ ] **Step 3: Commit the failing test**

```powershell
git add tests/repair-slow-workflow.test.ts
git commit -m "test: define repair slow workflow contract"
```

### Task 2: Implement the slow GitHub Actions gate

**Files:**
- Create: `.github/workflows/repair-slow.yml`
- Test: `tests/repair-slow-workflow.test.ts`

**Interfaces:**
- Consumes the npm script `test:slow` from `package.json`.
- Produces a workflow named `repair-slow` with read-only permissions and Node 24.

- [ ] **Step 1: Write the minimal workflow**

Create:

```yaml
name: repair-slow

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  closed-loop:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v7

      - name: Node 24
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Instaliraj ovisnosti
        run: npm ci

      - name: Closed-loop repair matrica
        run: npm run test:slow
```

- [ ] **Step 2: Run the contract test to verify GREEN**

Run:

```powershell
npm run test -- run tests/repair-slow-workflow.test.ts
```

Expected: 1 test passed.

- [ ] **Step 3: Validate YAML and repository formatting**

Run:

```powershell
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 4: Commit the workflow**

```powershell
git add .github/workflows/repair-slow.yml tests/repair-slow-workflow.test.ts
git commit -m "ci: gate repairs with slow closed-loop suite"
```

### Task 3: Run the release verification gates

**Files:**
- No source changes.
- Evidence: command output and CI run checks.

- [ ] **Step 1: Run the hard local gate**

```powershell
npm run check
```

Expected: TypeScript, 3452 regular tests and Vite build pass.

- [ ] **Step 2: Run the slow closed-loop gate**

```powershell
npm run test:slow
```

Expected: all 398 slow tests pass.

- [ ] **Step 3: Run Tier 1 strict-open verification**

```powershell
npm run verify:strict-open
```

Expected: every input fixture and generated repaired DOCX opens through python-docx and lxml.

- [ ] **Step 4: Run Word COM verification on Windows**

```powershell
npm run verify:word
npm run verify:word:worst
```

Expected: both commands exit 0 with `OpenAndRepair=false` and no visible-text regression.

### Task 4: Open PR, review and merge

**Files:**
- No source changes after Task 2 unless review finds a concrete defect.

- [ ] **Step 1: Authenticate GitHub CLI and inspect scope**

```powershell
gh auth status
git status -sb
```

Expected: authenticated account, current branch `audit/remediation-2026-07-16`, and only intended commits. Keep `.superpowers/` untracked.

- [ ] **Step 2: Push the implementation branch**

```powershell
git push -u origin audit/remediation-2026-07-16
```

- [ ] **Step 3: Open a draft PR toward `master`**

```powershell
gh pr create --draft --base master --head audit/remediation-2026-07-16 --title "ci: add slow closed-loop repair gate" --body-file .artifacts/repair-slow-pr.md
```

The PR body must list the workflow, the TDD contract test, the RED and GREEN commands, and all verification results.

- [ ] **Step 4: Review the PR**

Confirm the changed files are limited to the workflow, its test, the plan and spec. Confirm CI checks are green and no production code changed.

- [ ] **Step 5: Merge only after review**

Merge the PR into `master` using the repository's GitHub merge control. Do not force-push or delete the feature branch before the merged result is verified.

### Task 5: Staging smoke and production release

**Files:**
- No source changes unless staging exposes a reproducible defect, which starts a new TDD task.

- [ ] **Step 1: Build the deploy artifact through the existing Netlify chain**

Use the configured `netlify.toml` build command, which runs Vite build, generated pages and `scripts/verify-deploy-dist.mjs`.

- [ ] **Step 2: Run staging smoke**

Verify the deployed staging URL, upload a representative DOCX, run analysis, and confirm the repair panel, re-check and download flow. Record the URL and timestamp.

- [ ] **Step 3: Verify the release artifact**

```powershell
node scripts/verify-deploy-dist.mjs
```

Expected: no dev-only tools, legal pages present, canonical origin consistent and CSP checks green.

- [ ] **Step 4: Deploy production explicitly**

Deploy only after staging smoke, strict-open, both Word gates and artifact verification are recorded. Then repeat the health and representative upload smoke on the production URL.
