-- Academic Completion access hardening.
-- Browser clients may read only rows for academic projects they own.
-- All completion mutations remain trusted-server/service-role operations so a
-- browser cannot spoof authority types, fabricated AI events, or verified state.

revoke all on table public.completion_project_state from anon, authenticated;
revoke all on table public.completion_tasks from anon, authenticated;
revoke all on table public.completion_events from anon, authenticated;

grant select on table public.completion_project_state to authenticated;
grant select on table public.completion_tasks to authenticated;
grant select on table public.completion_events to authenticated;

grant select, insert, update, delete on table public.completion_project_state to service_role;
grant select, insert, update, delete on table public.completion_tasks to service_role;
grant select, insert, update, delete on table public.completion_events to service_role;

drop policy if exists "completion state select own project"
  on public.completion_project_state;
drop policy if exists "completion tasks select own project"
  on public.completion_tasks;
drop policy if exists "completion events select own project"
  on public.completion_events;

create policy "completion state select own project"
  on public.completion_project_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_project_state.academic_project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "completion tasks select own project"
  on public.completion_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_tasks.academic_project_id
        and p.user_id = (select auth.uid())
    )
  );

create policy "completion events select own project"
  on public.completion_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_events.academic_project_id
        and p.user_id = (select auth.uid())
    )
  );

comment on table public.completion_project_state is
  'Academic Completion structured project metadata. Authenticated owners may read; trusted server code owns mutations.';
comment on table public.completion_tasks is
  'Academic Completion sanitized typed task metadata. Authenticated owners may read; trusted server code owns mutations.';
comment on table public.completion_events is
  'Content-free completion audit events. Authenticated owners may read; trusted server code owns event creation.';
