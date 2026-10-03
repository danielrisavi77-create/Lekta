# Remaining audit and production proof implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task, with one writer in the isolated worktree.

**Goal:** Close the recorded navigation defects and remaining feasible audit checks, then publish and prove the tested production version.
**Architecture:** Preserve the existing Vite application and deterministic document processing. Repair URLs at their owning source; regenerate only affected projections. Keep credentials and detailed runtime evidence outside tracked files.
**Tech Stack:** TypeScript, Vite, Vitest, Playwright, Deno, Supabase, Netlify, Windows Word.
**Spec:** User request in this thread, 2026-09-30: verify remaining items and provide production deployment proof. Existing evidence: output/playwright/complete-audit-2026-09-30/AUDIT.md and output/playwright/audit-followup-2026-09-30/FOLLOWUP.md.

## Global constraints

- One writer, feature branch from fe0d1b0159dba6d53847b47214561d9ff6857ac9.
- Synthetic documents/accounts only; preserve author text. No activation of production payments.
- Missing credentials or unavailable external services remain explicitly unverified.
- Heavy commands run through scripts/with-gate-lock.mjs; VITEST_MAX_THREADS=1.
- Before commit: full npm run check, orphan-scan and read-only cross-provider review.
- Release: clean candidate, full release:check, proof-only commit, strict production build, identified Netlify artifact and strict live smoke.

## Review focus

- Tool links resolve correctly from /rad/ while retaining faculty/level query parameters.
- Source links identify the actual existing evidence document, not a guessed address or a different edition.
- Public bundles contain no private source registry, credentials or student text.
- Downloaded files contain expected synthetic content and open correctly, not merely enabled download buttons.
- Production build identity, asset hashes and observed routes agree with the tested release.

## Tasks

- [x] Inventory prior audit gaps, route families, skipped tests and release caveats; record a coverage matrix in output/playwright/production-proof-2026-09-30.
- [x] Add failing URL resolution tests in tests/tool-suggestions.test.ts; fix src/ui/tool-suggestions.ts and run targeted tests.
- [ ] Resolve malformed faculty source links (23 registry records confirmed against snapshots) using official publisher pages and snapshot identity. Correct data/sources/source-registry.json and affected profile metadata where confirmed; add regression coverage and regenerate affected split/server projections twice. Where identity cannot be confirmed, explicitly present unavailable source links instead of inventing them.
- [ ] Verify generated routes/internal links, source link validity, actual DOCX/PDF exports, fresh-session analysis/history, source lookup, mobile accessibility and logged-in flows. Use screenshots and synthetic data. Record SMTP/Stripe prerequisites separately.
- [ ] Exercise feasible previously skipped checks: OS-specific tests on their supported platform, Academic Suite DB workflow, projection content verification and staging extraction probe.
- [ ] Run full local check, orphan-scan and bounded independent review; fix any introduced findings; commit/push and merge after current CI.
- [ ] Run clean full release:check including Word tiers. Commit only the resulting proof and validate the strict proof gate. Build production with exact candidate SHA and correct production settings.
- [ ] Publish the verified artifact to the existing production site. Verify Netlify published deploy identity, public build-info, matching asset hashes, strict post-deploy-smoke and fresh browser screenshots/interactions.
- [ ] Deliver a concise evidence report with exact commits, deploy ID, checks, screenshots and remaining external blockers. Do not claim all possible states were tested.

## Findings confirmed during execution

- Nine actual DOCX downloads passed across Chromium, Firefox and WebKit. Two print PDFs retain extractable synthetic text; decorative shadows/3D paper were removed and browser regression tests passed.
- Mobile /rad/ upload accessibility and benchmark table keyboard access were corrected after observed axe failures.
- Real CrossRef lookup passed in the UI for existing and nonexistent DOI controls. Staging extraction probe passed; Academic Suite DB run 36767139225 passed on base fe0d1b01.
- Source fixes expanded from the initial eight records to all 23 malformed registry records used by public profile URLs. All downloaded PDF/DOC/DOCX bytes (including two ZIP members) match archived hashes. No academic rule value changed.
- External prerequisites remain: staging Stripe keys and an authorized email recipient. The local management token returns HTTP 403 for production, but the connected Supabase plugin has verified access. Production public profile-rules reports an older dataset version; production admin-stats lacks the already-staged opportunities view. Back up both deployed functions, verify migration/RPC readiness, review their precise deployment diffs, and deploy the tested versions after gates.
- Full gate found dependent metadata drift in the generated repair recipe and Katedra export, plus one old relative-link expectation. Regenerate those exact projections twice, verify URL-only semantic differences and unchanged repair parameters, and rerun the full gate. Preserve the failed run as evidence (9115 passed, 3 failed, 10 skipped).
- Dependent regeneration is stable: recipe changes 105 URL occurrences, Katedra export 22; repair parameter authority is unchanged. All 27 targeted regression tests and 15 Firefox/WebKit/mobile-WebKit cases passed; new browser tests are included in the permanent matrix.
- Production read-only SQL smoke returned valid objects for all seven admin RPCs; metadata confirms anon/authenticated cannot execute them and service_role can. This is database proof, not a logged-in production browser session.
