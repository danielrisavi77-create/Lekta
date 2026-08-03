# ADR 002 — Shared Academic Suite Supabase Backbone

Status: accepted for foundation v0.1

## Decision

Lekta and Katedra remain separate products, repos, and deployment surfaces, but they use the **same Supabase project** for account/project/commerce persistence.

The existing production **Lekta Supabase project (`zrrjttizjyfcxmcpgzml`) is the Academic Suite identity/data backbone**.

Katedra must not create or maintain a second independent Supabase Auth/database authority.

## Why Lekta Supabase is the authority

The existing Lekta project already contains:

- live `auth.users` identities;
- the production `products` catalog;
- `entitlements` and `document_slots`;
- Thesis Pass SKUs;
- checkout/repair/preflight/analytics infrastructure;
- a real Supabase migration history.

Therefore Academic Suite extends this backend instead of rebuilding the same concepts in a Katedra-owned project.

## Canonical identities

- Account identity: `auth.users.id`
- Academic project identity: `academic_projects.id` (UUID)

A user moving between Katedra and Lekta remains the same account and same project even though the products have separate domains and UIs.

## Shared schema ownership

```text
auth.users                         EXISTING LEKTA AUTH
    └── academic_projects          SHARED CORE
          ├── katedra_project_state KATEDRA-OWNED STATE
          └── lekta_checks          LEKTA-OWNED CHECK HISTORY

products                           EXISTING LEKTA CATALOG
entitlements                       EXISTING LEKTA COMMERCE
    └── document_slots             EXISTING LEKTA DOCUMENT BINDING

katedra_wallets/topups/usage       KATEDRA AI COMPUTE ACCOUNTING
```

The authoritative migration history lives in the **Lekta repository** under `supabase/migrations/`.

Academic Suite foundation migrations:

- `0035_academic_suite_foundation.sql`
- `0036_academic_suite_rls_hardening.sql`

Katedra may consume the schema and maintain shared TypeScript contracts, but it must not keep a competing production DDL copy.

## Commerce decision

Academic Suite does **not** create a second entitlement system.

Existing Lekta authority remains:

```text
products -> entitlements -> document_slots
```

Foundation extends `entitlements` and `document_slots` with optional `academic_project_id` so an existing Lekta purchase/Pass can be associated with the same project Katedra uses.

Existing pass SKUs remain authoritative packaging. Katedra's token-credit wallet is separate because it accounts for variable Anthropic compute cost; wallet balance is not an ecosystem entitlement.

## Katedra persistence

Foundation v0.1 creates Katedra-owned tables inside the Lekta Supabase project:

- `katedra_project_state`
- `katedra_wallets`
- `katedra_topups`
- `katedra_usage`

The current Katedra `/api/state` path still uses a temporary compatibility table `katedra_projects`. A database trigger mirrors those writes into `academic_projects + katedra_project_state` until the API is migrated directly to Shared Core.

## Lekta persistence boundary

Foundation v0.1 does **not** change Lekta's local-first DOCX promise.

Optional cloud persistence may store only sanitized structured check metadata in `lekta_checks`, such as:

- analysis/project/profile/ruleset IDs;
- score/category scores;
- sanitized structured findings;
- optional non-reversible fingerprint;
- timestamps.

It must not store through this foundation:

- raw `.docx`;
- document body text;
- free-form document-derived `detail` / `location`;
- mentor comments;
- source passages.

Client access to `lekta_checks` is owner-read only. Future writes are trusted-server/service-role operations.

## RLS and authorization

New private Academic Suite tables target the `authenticated` role explicitly and combine authentication with owner predicates.

Existing private Lekta commerce read policies on `entitlements` and `document_slots` are hardened by migration `0036` to target `authenticated` explicitly.

Project-scoped entitlement/check bindings enforce same-user ownership at the database layer.

## Cross-domain login

One Supabase Auth project gives one underlying identity, but does not automatically make browser cookies portable across separate root domains (`katedra.hr`, `lekta.hr`).

Seamless cross-domain SSO/session exchange is a later UX layer. It does not alter this backend decision.

## Consequences

### Positive

- no future account merge;
- existing Lekta commerce/Pass system is reused rather than duplicated;
- one canonical academic project;
- shared project-aware purchases become auditable;
- one database/RLS authority;
- Katedra can join the ecosystem without forcing a risky migration of Lekta production commerce.

### Constraints

- shared/core DB changes are reviewed and migrated from the Lekta repo;
- Katedra cannot introduce production DDL independently;
- product-owned data remains namespaced/responsibility-bound;
- local DOCX privacy is not weakened by shared identity;
- a second independent account or entitlement backend is prohibited unless this ADR is explicitly superseded.
