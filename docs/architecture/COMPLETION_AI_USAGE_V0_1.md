# Academic Completion AI Usage v0.1

## Purpose

The first live Academic Completion AI action needs a database-backed spend and abuse boundary without turning AI transcripts into project persistence.

Canonical tables/functions remain in the existing Academic Suite Supabase project.

## `completion_ai_usage`

Stores content-free metadata only:

- `academic_project_id`
- `user_id`
- `task_id`
- authorized capability
- provider/model IDs
- input/output token counts
- timestamp

It must never store:

- user prompts or input text;
- provider/model output;
- thesis/document body text;
- mentor-message bodies;
- source passages;
- personal-data excerpts.

Browser roles receive no direct table access in v0.1. Trusted server code owns reservations and finalization.

## Atomic reservation

`completion_ai_reserve(...)` is a service-role-only RPC called by the provider wrapper immediately before a real provider request.

It:

1. validates that `p_user` owns `p_project`;
2. validates that `p_task` belongs to that same project and declares the requested capability;
3. takes a per-user transactional advisory lock;
4. checks rolling ten-minute and 24-hour request ceilings;
5. inserts a zero-token reservation and returns its UUID.

The advisory lock prevents parallel requests from all observing the same pre-insert count.

The initial pilot defaults supplied by the app are:

- 4 provider calls per rolling 10 minutes;
- 12 provider calls per rolling 24 hours.

These are spend/abuse safety limits, not paid-plan packaging.

## Finalization

`completion_ai_finalize(...)` replaces the reserved row's zero token counts with the actual provider-reported input/output token usage.

A provider failure may leave a zero-token reservation. That is intentional: failed or aborted requests still consume a pilot request slot and cannot be spammed without limit.

## Policy ordering

Rate reservation happens inside the live provider wrapper, not before the academic policy resolver.

Therefore:

- official `DENY` -> provider not called -> no usage reservation;
- `UNKNOWN` -> provider not called -> no usage reservation;
- task/capability mismatch -> provider not called -> no usage reservation;
- authorized action -> reservation -> provider call -> token finalization.

This preserves the stronger invariant established by Academic Completion Epic 6/7: academic-policy denial is an execution boundary, not merely a UI warning.
