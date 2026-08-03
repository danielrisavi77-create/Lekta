# Academic Completion Persistence v0.1

## Purpose

Academic Completion is the third product in the shared Academic Suite workflow.

It reuses the existing canonical identities:

- account: `auth.users.id`
- academic project: `academic_projects.id`

It does **not** create a second Supabase project, a second account table or a second commerce authority.

## Migrations

### `0037_completion_app_foundation.sql`

Adds:

- `completion_project_state`
- `completion_tasks`
- `completion_events`

### `0038_completion_app_write_hardening.sql`

Hardens:

- authenticated access to read-only owned completion state;
- server-owned writes;
- task/event project consistency.

## Data boundary

The completion schema intentionally has no generic JSON payload or academic-content columns.

It must not store:

- raw `.docx`;
- thesis body text;
- mentor message bodies;
- source passages;
- AI prompts;
- model outputs;
- transcript content.

Allowed persistence is structured project metadata only.

## `completion_project_state`

One row per `academic_projects.id`.

Stores:

- stage;
- target submission/defense dates;
- typed deadline authority metadata;
- minimal mentor workflow state;
- optional approval booleans + typed authority;
- active policy ruleset ID/version;
- AI-governance state;
- user-reported submission/defense timestamps.

It does not duplicate the project's work type/profile/title; those remain in `academic_projects`.

It does not persist capability decisions; the app reconstructs them from the pinned active ruleset and fails closed if ruleset state is stale.

## `completion_tasks`

Stores typed task metadata:

- sanitized title max 160 chars, no newline/tab;
- task type;
- status;
- priority;
- stage;
- typed authority;
- optional AI capability;
- related official rule IDs;
- related Lekta finding IDs.

A task row is not a container for raw mentor feedback or academic prose.

## `completion_events`

Content-free audit/workflow history.

Stores only typed event metadata such as:

- project/task IDs;
- event type;
- AI capability;
- policy rule IDs;
- provider/model IDs;
- typed authority;
- timestamps.

There is intentionally no `payload jsonb`, `prompt`, `response` or content excerpt column.

## RLS / write authority

Authenticated users may `SELECT` completion rows only when the parent `academic_projects.owner_user_id = auth.uid()`.

Authenticated direct writes are intentionally not exposed.

All completion mutations must be performed by trusted server code that:

1. authenticates the user;
2. validates ownership of `academic_projects.id`;
3. validates typed input;
4. performs the mutation with server credentials;
5. writes only content-free audit metadata.

This prevents a browser client from fabricating authority such as `OFFICIAL_RULE`, `KATEDRA_ASSESSED` or `LEKTA_VERIFIED`.

## Cross-project integrity

`completion_events(task_id, academic_project_id)` must reference the same project pair in `completion_tasks`.

A user who owns multiple projects cannot create an event under project A that points to a task in project B.

## Product ownership boundaries

- Academic Completion owns the completion tables above.
- Lekta still owns `lekta_checks` and deterministic document-verification truth.
- Katedra remains content/AI execution product; its legacy state is not reused as Completion App state.
- `products -> entitlements -> document_slots` remains the shared commerce authority.
