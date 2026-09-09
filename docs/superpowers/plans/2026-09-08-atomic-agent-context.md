# Atomic agent context implementation plan

**Goal:** Failed or concurrent context replacement never damages the previous active context or leaves a partial material selection.

**Architecture:** Canonical manifests reserve immutable, revision-specific Storage paths before upload. A run-locked transaction checks both objects and the expected previous manifest, replaces selected materials, tombstones the old context and publishes the new one. Pending reservations expire into the existing Storage-first cleanup queue. Katedra remains the local-first manuscript authority; the database holds identifiers and approval metadata, never manuscript text.

**Tech stack:** PostgreSQL canonical Lekta migrations, Supabase Storage, existing Next.js server clients and Vitest.

**Execution:** Continue in isolated worktrees using executing-plans; no parallel writers. This implements the owner's approved integration plan and does not authorize activation.

- [ ] Lekta: add `0106_atomic_agent_context.sql`, reservation/commit RPCs, canonical active-state filtering and immutable context Storage policies. Preserve exact project entitlement and explicit snapshot consent checks.
- [ ] Add a real PostgreSQL smoke covering foreign users, missing/expired consent, upload failure, bad material rollback, stale concurrent commits, reservation expiry and revision-bound approval. Execute migrations twice; include the test in db-smoke.
- [ ] Katedra: replace fixed-path upserts in `run-context-storage.ts` with reserve, upload without upsert, atomic commit. Context route sends material selection to that commit. Initial run setup uses the same protocol.
- [ ] Katedra: read only committed canonical revisions; store explicit approval against the active revision through a canonical metadata RPC. Old approval must never authorize new content. Update contract preflight before deployment.
- [ ] Test upload/registration interruption, concurrent commits and stale approval through real RPC/Storage on synthetic staging data after journal reconciliation.
- [ ] Run each repository's complete gate and coordinated browser/service checks; update draft PRs. No activation until the full five-action release goal is verified.

Physical deletion can race with mutable fixed paths today. Versioned paths plus insert-only uploads remove that reuse. An allocated manifest remains pending until commit; old readers must fail closed until the coordinated reader update is deployed. No rollback may delete the prior version's paths.
