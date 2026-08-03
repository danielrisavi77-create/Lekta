-- Harden Academic Completion persistence before production use.
-- Authenticated clients may read their own completion state through RLS,
-- but completion writes are server-owned so clients cannot spoof authority
-- types such as OFFICIAL_RULE / LEKTA_VERIFIED or inject fabricated AI events.

-- Prevent an event from pointing at a task that belongs to another project.
alter table public.completion_events
  drop constraint if exists completion_events_task_id_fkey;

alter table public.completion_tasks
  add constraint completion_tasks_id_project_key
  unique (id, academic_project_id);

alter table public.completion_events
  add constraint completion_events_task_project_fkey
  foreign key (task_id, academic_project_id)
  references public.completion_tasks(id, academic_project_id)
  deferrable initially deferred;

-- Reads remain user-scoped. Mutations are performed by trusted server code
-- after explicit project-ownership validation; service-role bypasses RLS.
drop policy if exists "completion state insert own project"
  on public.completion_project_state;
drop policy if exists "completion state update own project"
  on public.completion_project_state;
drop policy if exists "completion state delete own project"
  on public.completion_project_state;

drop policy if exists "completion tasks insert own project"
  on public.completion_tasks;
drop policy if exists "completion tasks update own project"
  on public.completion_tasks;
drop policy if exists "completion tasks delete own project"
  on public.completion_tasks;

drop policy if exists "completion events insert own project"
  on public.completion_events;
drop policy if exists "completion events delete own project"
  on public.completion_events;

comment on table public.completion_project_state is
  'Academic Completion structured project metadata. Authenticated users may read owned rows; trusted server code owns mutations.';
comment on table public.completion_tasks is
  'Academic Completion sanitized typed task metadata. Authenticated users may read owned rows; trusted server code owns mutations.';
comment on table public.completion_events is
  'Content-free completion audit events. Authenticated users may read owned rows; trusted server code owns event creation.';
