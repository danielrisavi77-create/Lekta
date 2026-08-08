-- Academic Completion permanent-account gate.
-- Supabase anonymous users carry the `authenticated` Postgres role in this
-- project. Reuse the shared Academic Suite helper so Completion project/state
-- data is available only to permanent accounts.

drop policy if exists completion_project_state_permanent_account
  on public.completion_project_state;
create policy completion_project_state_permanent_account
  on public.completion_project_state
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

drop policy if exists completion_tasks_permanent_account
  on public.completion_tasks;
create policy completion_tasks_permanent_account
  on public.completion_tasks
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

drop policy if exists completion_events_permanent_account
  on public.completion_events;
create policy completion_events_permanent_account
  on public.completion_events
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));
