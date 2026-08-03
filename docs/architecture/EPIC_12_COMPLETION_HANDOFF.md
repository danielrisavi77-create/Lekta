# Epic 12 — Academic Completion ↔ Lekta verification handoff

## Authority boundary

- Lekta remains the only document-verification authority for the actual DOCX.
- Academic Completion stores project/workflow state and a projection of stable Lekta finding identities.
- `VERIFIED_FIXED` may be written only while reconciling a later Lekta check; a user action can only reach `USER_CHANGED`, and starting a re-check can only reach `RECHECK_REQUIRED`.

## Data boundary

The document is analyzed locally in Lekta. The Completion persistence endpoint accepts only the minimized sanitized result projection:

- analysis/ruleset/profile identifiers;
- score/category score metadata;
- stable `rule:` / `check:` finding identity;
- short summary, severity and fixer metadata;
- optional document fingerprint/coverage tier.

The network payload intentionally excludes `projectId` and `userId`; the opaque capability resolves both server-side. It also excludes DOCX bytes/body, issue detail/location, mentor text, source passages, prompts and model output.

## Handoff capability

1. Academic Completion authenticates the permanent user and checks project ownership.
2. Completion generates 32 random bytes and sends only SHA-256(token) to the server-side `completion_prepare_lekta_handoff` RPC.
3. The raw token is placed only after `#handoff=` in the Lekta URL, never in query parameters.
4. Lekta captures the fragment into session storage, binds it to the current project, and removes it from the address bar.
5. A fresh handoff for the same project invalidates every older token.
6. Tokens expire after the short handoff window and are additionally usage-limited in the database.

## Edge deployment invariant

`record-completion-check` uses custom handoff-capability authentication and therefore MUST be deployed with Supabase JWT verification disabled.

- Management API/tool: `verify_jwt=false`
- CLI equivalent: deploy with the no-JWT-verification option supported by the current Supabase CLI.

Do not switch this function back to normal user-JWT authentication without redesigning the cross-origin handoff. CORS is only defense in depth; the project-bound handoff token + service-role-only RPC are the authorization boundary.

## Canonical database migrations

- `0049_completion_lekta_handoff_lifecycle.sql`
- `0050_completion_lekta_handoff_token_rotation.sql`

## Lifecycle invariant

`OPEN -> USER_CHANGED -> RECHECK_REQUIRED -> VERIFIED_FIXED`

If an `OPEN` finding is absent from a later check without first passing through `USER_CHANGED` or `RECHECK_REQUIRED`, it becomes non-current (`present_in_latest=false`) but does **not** become `VERIFIED_FIXED`.
