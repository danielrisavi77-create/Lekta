# Lekta × Katedra Foundation Status — 2026-08-03

Branch in both repositories:

`architecture/lekta-katedra-foundation-v0.1`

This file is the coordination snapshot. Product Constitution and ADRs hold decisions; executable TypeScript contracts hold field semantics.

## Locked / implemented in foundation branch

### Product boundary

- [x] Katedra = process/reasoning/semantic review.
- [x] Lekta = deterministic document/compliance verification.
- [x] Katedra cannot declare formal compliance.
- [x] Lekta does not write academic argument/content.
- [x] Katedra process progress and Lekta compliance score remain separate signals.
- [x] Only Lekta re-check evidence can establish `VERIFIED_FIXED`.

### Shared contracts

- [x] Contract version `0.1` defined.
- [x] Canonical `AcademicWorkType` defined.
- [x] Legacy Katedra `s/z/d` mapping defined and tested.
- [x] `ProjectManifest` defined with guest-first optional owner identity.
- [x] `AcademicRuleSetRef` / `AcademicRuleSetExport` defined.
- [x] `LektaResult` / `LektaIssueRef` defined.
- [x] Canonical Lekta severity remains `error/warning/info`.
- [x] Katedra `critical` is explicitly presentation-only.
- [x] `Entitlement` contract defined separately from AI wallet accounting.
- [x] shared analytics event vocabulary defined.
- [x] Katedra mirrors the same v0.1 contract.

Canonical code:

`Lekta/src/integration/academic-suite-contracts.ts`

Katedra mirror:

`katedra/lib/academic-suite/contracts.ts`

### Identity

- [x] ADR-001 accepted in both repos.
- [x] Katedra Supabase Auth selected as canonical ecosystem identity backend.
- [x] canonical cross-product `userId` = shared Supabase `auth.users.id`.
- [x] Lekta must not create a separate independent production account store.
- [x] seamless cross-domain SSO explicitly separated from identity-backend choice and can ship later.

### Project identity

- [x] Decision: project identity must exist before login and survive login.
- [x] New project IDs should be UUIDs generated at project creation.
- [x] existing Katedra `k...` IDs remain backward-compatible migration aliases.
- [x] additive Katedra DB migration drafted for canonical `project_id`, canonical work type, and contract version.
- [x] existing Katedra row UUID remains a storage row ID rather than silently becoming project identity.

### Academic Core

- [x] Lekta remains academic-rule authoring/source of truth.
- [x] read-only Academic Core export adapter implemented.
- [x] export preserves provenance, verification, machine-checkability, and AutoFix metadata.
- [x] draft/ai-confirmed/needs-recheck/retired rules do not become active Katedra guidance by default.
- [x] export tests added with synthetic FPZG-style graduate profile.
- [x] Katedra legacy pack now has explicit provenance metadata marking its exact source version as unknown rather than pretending it is pinned.

### Lekta result handoff

- [x] privacy-safe `LektaResult` adapter implemented around current result structures.
- [x] adapter does not invent missing `checkId` / `ruleId` / fixability metadata.
- [x] legacy issue reconciliation key is deterministic and excludes `detail`.
- [x] v0.1 handoff omits legacy `detail` / `where` because those presentation fields may contain document-derived context.
- [x] tests added for privacy boundary and deterministic issue key.

## Known compatibility debt — next gates

### Gate A — stable engine issue identity

Current Lekta presentation `Issue` objects do not expose enough explicit stable identity.

Before relying on automatic re-check reconciliation at scale:

- [ ] trace each scored/visible issue back to stable `checkId`;
- [ ] attach `ruleId` where the check comes from a RuleEntry;
- [ ] define explicit structured location identity where needed;
- [ ] attach `autoFixable/fixerId` only from verified rule/fixer data;
- [ ] replace `legacy:*` issue keys where explicit engine identity exists.

### Gate B — Katedra canonical project creation

The additive DB migration exists, but current vanilla engine still generates `k...` IDs.

- [ ] change new Katedra project generation to `crypto.randomUUID()`;
- [ ] retain old IDs as migration aliases;
- [ ] update `/api/state` to read/write canonical `project_id` and canonical work type;
- [ ] ensure login migration does not regenerate project identity.

### Gate C — versioned Katedra rules pack

- [ ] create a generator that consumes Lekta Academic Core export rather than legacy ad-hoc extraction;
- [ ] record exact Lekta commit/release in `sourceVersion`;
- [ ] add deterministic artifact/hash metadata;
- [ ] add drift check so Katedra cannot silently ship an out-of-date pack;
- [ ] decide whether CI copy/release artifact or runtime API is the long-term distribution method (CI artifact is preferred for v1 simplicity).

### Gate D — first integrated transport

- [ ] Katedra -> Lekta deep-link uses canonical semantic work type + project/profile/ruleset context;
- [ ] Lekta validates every incoming identifier;
- [ ] Lekta emits shared `LektaResult` v0.1 after local analysis;
- [ ] Katedra consumes `issueKey/summary/error|warning|info` through its legacy adapter;
- [ ] no raw document content crosses the handoff.

### Gate E — shared commerce

Contract exists; implementation intentionally waits until the first cross-product paid offer is needed.

- [ ] design server-authoritative shared entitlement storage;
- [ ] preserve Katedra token wallet as separate AI cost accounting;
- [ ] map Pass capabilities explicitly (`katedra.*`, `lekta.*`);
- [ ] ensure refunds/revocations propagate by entitlement rather than client flags.

## Testing status

Tests have been added on the foundation branch, but the repositories currently expose no GitHub Actions workflow run for automatic validation on the inspected master commit.

Before merge:

Lekta should run:

```text
npm run check
```

Katedra should run at minimum:

```text
npm run build
npm run lint
```

and the additive Supabase migration should be reviewed/applied in a non-production environment first.

## Merge gate

Do not merge the foundation branch until:

1. Lekta `npm run check` passes;
2. Katedra build/lint passes;
3. the shared TypeScript contract files are semantically identical except their canonical/mirror header comment;
4. the Katedra migration is reviewed for the actual Supabase schema state;
5. no production behavior change has slipped into the branch unintentionally.

## Immediate implementation after merge

The first user-visible target remains intentionally small:

```text
Katedra project
  -> Provjeri u Lekti
Lekta preselected verified profile
  -> local DOCX analysis
LektaResult v0.1
  -> Riješi u Katedri
Katedra resolution plan
  -> Lekta re-check
```

Do not add a new umbrella brand, monorepo migration, raw-document cloud sync, or duplicate auth/rules database before that loop works.
