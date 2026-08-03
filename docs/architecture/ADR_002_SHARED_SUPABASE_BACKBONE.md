# ADR 002 — Shared Academic Suite Supabase Backbone

Status: accepted for foundation v0.1

## Decision

Lekta and Katedra remain separate products, repos, and deployment surfaces, but they must use the **same Supabase project** for future account/project/entitlement persistence.

The existing Katedra Supabase project is the selected Academic Suite identity/data backbone.

Lekta must **not** introduce a second independent Supabase Auth user store.

## Canonical shared identities

- Account identity: `auth.users.id`
- Academic project identity: `academic_projects.id` (UUID)

Both are shared across products.

A user moving from Katedra to Lekta remains the same account and the same academic project even though the apps live on different domains.

## Shared schema ownership

```text
auth.users
    └── academic_projects          SHARED CORE
          ├── katedra_project_state KATEDRA-OWNED
          ├── lekta_checks          LEKTA-OWNED
          └── entitlements          SHARED COMMERCE
```

The authoritative migration is maintained in the Katedra repository while Katedra owns the existing Supabase project:

`supabase/migrations/20260805000000_academic_suite_foundation.sql`

Lekta must not maintain a competing copy of that migration.

## Lekta persistence boundary

Foundation v0.1 does **not** change Lekta's local-first DOCX analysis promise.

Future optional cloud persistence may store only a sanitized structured check record in `lekta_checks`, including fields such as:

- `analysis_id`
- shared `project_id`
- `ruleset_id` / `profile_id`
- score and category scores
- structured sanitized issues
- optional non-reversible document fingerprint
- analysis timestamp

It must not store through this shared foundation:

- raw `.docx`
- document body text
- free-form document-derived `detail` / `location`
- mentor comments
- source passages

Browser clients receive owner read access through RLS. Any future Lekta write to `lekta_checks` must use a trusted server/service-role path rather than making deterministic check history client-authoritative.

## Entitlements

Cross-product purchases such as an Academic/Diplomski Pass live in shared `entitlements` rather than being reimplemented independently in Lekta.

This lets one purchase unlock capabilities in both products for the same `auth.users.id` and optional `academic_projects.id`.

Katedra's AI token wallet remains a separate compute-cost mechanism and is not the authority for Lekta access rights.

## Cross-domain login

Shared Supabase Auth establishes one account identity, but it does not by itself provide seamless browser SSO between separate root domains.

A later SSO/session-exchange layer may make `katedra.hr` → `lekta.hr` appear continuously logged in. That UX work does not change the underlying identity decision.

## Consequences

### Positive

- no future user-account merge problem;
- one canonical project across Katedra and Lekta;
- shared entitlements become simple and auditable;
- one RLS/security model for project ownership;
- future project dashboard can aggregate both products without synchronization APIs between separate databases.

### Constraints

- schema changes to shared Core require cross-product review;
- product-owned tables must preserve responsibility boundaries;
- Lekta cannot weaken its local-document privacy promise merely because a shared database exists;
- a second independent account backend is prohibited unless this ADR is explicitly superseded.
