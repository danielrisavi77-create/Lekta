# ADR-001 — Shared identity backend for Lekta × Katedra

Status: **accepted**

Date: 2026-08-03

## Context

Katedra already has Supabase Auth and persistent tables keyed by `auth.users(id)`. Lekta currently does not have an end-user account system that needs migration.

The products must remain separate applications/brands while eventually allowing one user account and project/pass identity across both.

Waiting until seamless SSO is built before choosing the identity authority would create a serious risk: Lekta could introduce a second user store and force account reconciliation later.

## Decision

**The Supabase Auth project used by Katedra is the canonical identity backend for the Lekta × Katedra ecosystem.**

Canonical cross-product `userId` is:

```text
auth.users.id
```

from that shared Supabase project.

Lekta must not introduce a second independent production user identity store.

## Important distinction

Shared identity backend does **not** mean the two top-level domains automatically share a browser session.

There are two separate milestones:

1. **Foundation (now):** both products resolve accounts to the same canonical Supabase user identity.
2. **Unified account UX / SSO (later):** moving from one product/domain to the other can happen without asking the user to authenticate again, implemented through an explicit secure cross-domain handoff/token flow or a future shared parent-domain architecture.

The first decision is permanent architecture. The second is UX/integration work and may ship later.

## Consequences

### Positive

- no future email-based account merging;
- purchases can attach to one `userId`;
- projects can attach to one owner;
- shared entitlements become straightforward;
- Lekta can remain anonymous for free checks while still using the canonical account system when login is needed;
- Katedra keeps its existing auth investment.

### Constraints

- Supabase `service_role` remains server-only in both products;
- each app keeps its own RLS-protected domain tables unless a table is explicitly shared;
- client code must never use email as a join key;
- cross-domain session transfer must be designed explicitly rather than by trying to share localStorage;
- the account system does not imply raw document cloud storage.

## Guest behavior

A Lekta free check and a Katedra guest project may exist without `userId`.

When a guest later authenticates:

- the existing canonical `projectId` remains unchanged;
- `ownerUserId` is attached;
- project identity is not regenerated;
- purchase/entitlement claiming must be server-validated.

## Rejected alternatives

### Separate Supabase/Auth project for Lekta

Rejected because it creates duplicate identities and later account-merge complexity with no current migration benefit.

### Email as shared identity

Rejected because email is mutable and is not a safe primary cross-product key.

### Merge Lekta and Katedra into one application

Rejected. Shared identity is infrastructure; it does not change the product boundary.

## Follow-up

Before Lekta introduces login-dependent functionality:

1. configure it against the canonical Supabase Auth project;
2. define its own RLS policies/tables or shared tables explicitly;
3. implement account handoff only when the user flow requires seamless cross-domain SSO;
4. keep anonymous Lekta analysis available where the product strategy requires it.
