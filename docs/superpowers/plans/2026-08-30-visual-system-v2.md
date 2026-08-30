# Visual System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to execute this plan task by task.

**Goal:** Redizajnirati vizualni sustav i hijerarhiju svih glavnih Lekta povr?ina tako da korisniku budu jasni upload, rezultat, prioritetni nalazi i sljede?i korak, uz zadr?avanje svih postoje?ih funkcija i sigurnosnih granica.

**Architecture:** Uvesti jedan shared, code-native visual layer koji se naslanja na postoje?e design tokene i page-mode root klase. Intake, Results Cockpit, trust, tools, archive i workspace dobit ?e ciljane stilove, dok ?e operativne/admin stranice zadr?ati gusto?u i samo naslijediti tipografiju, navigaciju, fokus i surface tokene. Postoje?i TypeScript kontroleri i analiti?ki modeli ostaju izvor pona?anja.

**Tech Stack:** Vite, TypeScript strict, postoje?i CSS, postoje?i lokalni @fontsource fontovi, Vitest + happy-dom, postoje?i Playwright CLI i postoje?i build/security guardovi. Bez novih runtime dependencies.

**Spec:** docs/superpowers/specs/2026-08-30-visual-system-v2-design.md

## Global Constraints

- Raditi isklju?ivo u izoliranom visual-system-v2 worktreeu.
- Ne mijenjati parser, audit, citation, scoring, repair, profile, Supabase, security classification ili sadr?aj rada.
- Sa?uvati postoje?e rute, linkove, upload/preview/repair akcije, stanja gre?ke i keyboard semantics.
- Prije svakog commita pokrenuti relevantne testove; prije zavr?etka npm run check mora biti zelen.
- Svaki novi behavior test ide kroz red-green-refactor. CSS promjene moraju imati barem markup/token regresijsku provjeru ili browser smoke provjeru.
- Ne uvoditi kontinuiranu animaciju, novu mre?nu ovisnost, generirane bitmap assete ni la?ne brojke ili tvrdnje.
- Po?tovati reduced-motion, WCAG AA kontrast, vidljiv fokus i touch target od najmanje 44px.

## Task 1: Establish the shared Visual System v2 foundation

**Files:**
- Modify: src/shared/design-system.css
- Modify: src/routes/shared/route-shell.css
- Modify: src/shared/motion.css if needed for shared event transitions
- Test: tests/visual-system-foundation.test.ts

**Steps:**

1. Inspect current tokens and write a failing test for the v2 contract: local font families are referenced, page-mode surfaces alias the shared tokens, focus/reduced-motion hooks exist, and no new generic palette is introduced.
2. Run the focused test and confirm it fails for the missing contract.
3. Add a small, documented token layer and route-shell refinements. Keep compatibility aliases for existing route selectors instead of renaming all markup.
4. Add the smallest necessary focus, reduced-motion and interaction-state adjustments.
5. Run the focused test plus TypeScript/build checks relevant to CSS imports.
6. Review the diff for accidental legacy selector bleed, then commit this task.

## Task 2: Rebuild the intake page as the premium correction-desk entry

**Files:**
- Modify: src/routes/intake/intake.css
- Inspect and only minimally modify: index.html, src/routes/intake/intake-controller.ts
- Test: tests/intake-route.test.ts or the closest existing intake test

**Steps:**

1. Add or extend a failing DOM regression test that asserts the upload control, true .docx/20 MB copy, local privacy message, memory action and learn-more link remain available and correctly labelled.
2. Run the focused test and confirm the baseline behavior is captured before styling.
3. Refine intake CSS to match the approved direction: dominant correction desk, more tactile paper edge and correction mark, stronger Newsreader/Inter Tight hierarchy, one black/red primary action, restrained asymmetry, and responsive behavior without overflow.
4. Preserve every existing upload state, file input behavior, error state, keyboard state and reduced-motion behavior.
5. Run the focused test and a Playwright desktop/mobile smoke check.
6. Commit the intake task after review.

## Task 3: Make Results Cockpit findings-first without removing interactions

**Files:**
- Modify: src/ui/results/result-visuals.css
- Modify only if needed: src/ui/results/results-cockpit.ts, src/ui/results/priority-findings.ts
- Test: existing results/visual-model tests and a new focused renderer contract test if needed

**Steps:**

1. Add failing assertions for the existing action hooks, priority finding answers, non-scored fallback text and advanced toggle. Do not assert fake numeric values.
2. Run the focused tests and confirm they fail only for any missing contract, not because the analysis model was changed.
3. Restyle the cockpit around the approved hierarchy: one readiness halo, technical score as supporting data, status and count summary, up to three priority findings with ?to, za?to, gdje, ?to u?initi, then DNA/categories and advanced actions.
4. Use shared paper/desk tokens, sharper editorial edges, explicit severity and fixability states, and one dominant CTA. Keep all existing data attributes and action handlers intact.
5. Add responsive rules for 1440px desktop, 1280px laptop and 390px mobile. Mobile must keep the priority finding content above advanced details.
6. Run focused tests, browser snapshots and reduced-motion checks, then commit.

## Task 4: Align trust, tools and archive surfaces with the same system

**Files:**
- Modify: src/routes/learn-more/learn-more.css
- Modify: src/shared/tool-page.css
- Modify: src/routes/my-work/my-work.css
- Inspect related static route markup only where shared classes need a safe hook
- Tests: existing route smoke tests plus tests/visual-system-foundation.test.ts extensions if token contracts are shared

**Steps:**

1. Capture current route links and visible trust/tool/archive content in focused assertions before styling.
2. Refine learn-more into an editorial trust narrative with evidence and limitations, without inventing claims or changing legal meaning.
3. Refine tools into a clear correction-tool index with one focal tool and accessible states, without changing tool algorithms.
4. Refine Moji radovi and archive cards using the same paper language while keeping operational density and all actions.
5. Run focused tests and route smoke checks on desktop and mobile. Check that deep links and old aliases still resolve.
6. Commit this task.

## Task 5: Apply shared visual treatment to workspace and remaining operational modes

**Files:**
- Modify: src/routes/workspace/workspace.css
- Modify: src/shared/premium.css only for compatible shared overrides
- Inspect: src/routes/workspace/workspace-shell.ts, src/routes/shared/route-shell.ts
- Tests: existing workspace, repair, preview and navigation tests

**Steps:**

1. Add a failing regression check for workspace navigation and primary actions if a visual hook is missing.
2. Refine the document workspace to use the same typography, desk/paper surfaces, status rail and explicit focus states, while preserving preview, profile, repair, download and navigation actions.
3. Keep admin, verification and legal pages readable and operational; do not apply decorative cockpit density to them.
4. Run the focused suite and inspect the diff for accidental changes in security-sensitive paths.
5. Commit this task.

## Task 6: Browser QA, performance guard and final verification

**Files:**
- Modify only if QA finds a targeted visual regression.
- Artifacts: output/playwright/ for local screenshots/snapshots only

**Steps:**

1. Start a local server from the isolated worktree on an unused port, never replacing the existing manual localhost session.
2. Use Playwright CLI snapshots/screenshots for intake, learn-more, tools, results/workspace, archive and one operational route at 1440px, 1280px, 768px and 390px widths.
3. Verify no horizontal overflow, no clipped focus ring, no broken deep link, no continuous animation, and usable reduced-motion behavior.
4. Run npm run test:ux when available, then run npm run check from the isolated worktree.
5. Run classification/build checks already included by npm run check; report any environment-only issue without claiming green.
6. Review git diff/stat and worktree status, then prepare the branch for user review. Do not merge to master in this task unless explicitly requested after visual review.

## Definition of done

- The five acceptance questions are answerable immediately on intake/results screens.
- Existing functions, data, actions, URLs and security boundaries are preserved.
- Visual language is shared across page modes, but operational pages remain appropriately dense.
- Browser checks cover desktop and mobile, and there is no horizontal overflow or continuous page-wide animation.
- npm run check passes in the isolated worktree, or any blocker is reported with exact command output.
