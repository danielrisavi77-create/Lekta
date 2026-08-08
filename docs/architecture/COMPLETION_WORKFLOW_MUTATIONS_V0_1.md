# Academic Completion Workflow Mutations v0.1

## Purpose

Epic 10 turns the persisted Project Home from a read-only view into a controlled workflow surface without introducing academic free-text persistence.

The first mutable facts are intentionally narrow:

- user-controlled task status;
- whether a version has been sent to the mentor;
- whether the project is currently waiting for a mentor response.

## Canonical migrations

- `0047_completion_workflow_mutations.sql`
- `0048_completion_mentor_sent_version.sql`

Both belong to the existing Academic Suite Supabase migration history owned by the Lekta repository.

## Atomic mutation rule

User-facing Next.js routes do not directly update Completion tables.

Trusted server code calls service-role-only, `SECURITY INVOKER` RPCs:

- `completion_set_task_status(...)`
- `completion_report_mentor_submission(...)`
- `completion_report_mentor_response(...)`

Each RPC validates project ownership and performs the state mutation together with its content-free audit event in the same database transaction.

This prevents a state change from succeeding while its workflow audit event fails separately.

## Task status semantics

The v0.1 user-control surface allows only:

- `OPEN`
- `IN_PROGRESS`
- `DONE`

The browser cannot set authority, event type or a verified status. `CANCELLED` remains outside the ordinary user-control surface and a cancelled task cannot be reopened through this RPC.

## Mentor workflow semantics

`completion_report_mentor_submission(...)` records only:

- timestamp sent;
- optional short single-line sent-version label;
- waiting-for-response = true.

`completion_report_mentor_response(...)` records only:

- waiting-for-response = false.

No mentor message body or feedback text is accepted by these RPCs.

## Sent vs seen invariant

A crucial authority distinction is preserved:

- `mentor_last_sent_version_label` = user-reported label of the version sent to the mentor;
- `mentor_last_seen_version_label` = separate state that must not be inferred merely because the user reported a send event.

Migration 0048 exists specifically to prevent a user-reported send from being promoted into a false claim that the mentor saw the version.

Rollback production smoke verification confirmed that sending `v5` while the previous seen version is `v2` results in:

- sent version = `v5`;
- seen version remains `v2`;
- waiting = true;
- transaction rolled back with no test data retained.

## Audit metadata

`completion_events` receives structured fields only:

- `task_status`
- `mentor_waiting`
- project/task IDs
- event type
- authority metadata
- timestamp.

There is no mentor-message body, task free-text payload, thesis content or generic mutation JSON column.

## Browser/API boundary

Application routes add a same-origin `Sec-Fetch-Site` check as defense in depth, but authentication and database ownership remain authoritative.

Browser requests never supply:

- authority type;
- audit event type;
- mentor-message content;
- verified academic state.
