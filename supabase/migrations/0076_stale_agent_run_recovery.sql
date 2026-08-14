-- Recover a server-side crash between create_agent_run and activate_agent_run.
-- Only the owner's stale initializing run for the requested project is cancelled.

create or replace function public.cleanup_stale_initializing_agent_run(
  p_user_id uuid,
  p_project_id uuid
) returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may recover only its own agent run' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.academic_projects p
    where p.id = p_project_id
      and p.user_id = p_user_id
      and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;

  return query
  update public.agent_runs r
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where r.run_id = (
    select candidate.run_id
    from public.agent_runs candidate
    where candidate.user_id = p_user_id
      and candidate.project_id = p_project_id
      and candidate.status = 'initializing'
      and candidate.updated_at < now() - interval '10 minutes'
    order by candidate.updated_at asc
    limit 1
    for update skip locked
  )
  returning r.run_id, r.status;
end $$;

revoke all on function public.cleanup_stale_initializing_agent_run(uuid, uuid) from public, anon;
grant execute on function public.cleanup_stale_initializing_agent_run(uuid, uuid) to authenticated, service_role;
