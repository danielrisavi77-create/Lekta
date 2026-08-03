-- Optimize Completion App read policies and FK lookup paths.
-- `(select auth.uid())` lets PostgreSQL evaluate the auth helper once per
-- statement instead of re-running it for each candidate row.

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
        and p.owner_user_id = (select auth.uid())
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
        and p.owner_user_id = (select auth.uid())
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
        and p.owner_user_id = (select auth.uid())
    )
  );

create index if not exists completion_events_task_project_idx
  on public.completion_events (task_id, academic_project_id)
  where task_id is not null;
