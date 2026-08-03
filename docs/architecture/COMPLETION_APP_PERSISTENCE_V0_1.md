# Academic Completion Persistence v0.1

## Purpose

Academic Completion is the third product in the shared Academic Suite workflow.

It reuses the existing canonical identities:

- account: `auth.users.id`
- academic project: `academic_projects.id`

It does **not** create a second Supabase project, a second account table or a second commerce authority.

## Migrations

### `0041_completion_app_foundation.sql`

Adds:

- `completion_project_state`
- `completion_tasks`
- `completion_events`
- a narrow `set_completion_updated_at()` trigger helper.

### `0042_completion_app_access_hardening.sql`

Hardens:

- authenticated access to read-only owned completion state;
- explicit least-privilege table grants;
- server-owned writes;
- RLS ownership through the real shared-core key `academic_projects.user_id`.

### `0043_completion_app_permanent_account_gate.sql`

Reuses `academic_suite_is_permanent_user()` so Supabase anonymous-auth sessions cannot access Completion project/state data even though anonymous users carry the `authenticated` Postgres role.

The Completion migrations intentionally start after the existing Academic Suite `0040` migration. They must not reuse `0037`–`0039`, which already belong to the shared foundation.

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

Permanent authenticated users may `SELECT` completion rows only when the parent `academic_projects.user_id = auth.uid()`.

Authenticated direct writes are intentionally not exposed. Anonymous-auth sessions are blocked by a restrictive permanent-account policy.

All completion mutations must be performed by trusted server code that:

1. authenticates a permanent user;
2. validates ownership of `academic_projects.id` through `academic_projects.user_id`;
3. validates typed input;
4. performs the mutation with server credentials;
5. writes only content-free audit metadata.

This prevents a browser client from fabricating authority such as `OFFICIAL_RULE`, `KATEDRA_ASSESSED` or `LEKTA_VERIFIED`.

## Cross-project integrity

`completion_events(task_id, academic_project_id)` references the same project pair in `completion_tasks` through a deferrable composite foreign key.

A user who owns multiple projects cannot create an event under project A that points to a task in project B.

Individual task deletion is intentionally blocked while an event references the task; workflow code should cancel/archive tasks instead of erasing audit history. Deleting the parent academic project removes completion data through the project-level cascade.

## Product ownership boundaries

- Academic Completion owns the completion tables above.
- Lekta still owns `lekta_checks` and deterministic document-verification truth.
- Katedra remains content/AI execution product; its legacy state is not reused as Completion App state.
- `products -> entitlements -> document_slots` remains the shared commerce authority.
