-- Resume must revalidate the exact project Pass because a paused run may outlive it.
-- Keep Katedra content out of this contract: only project, lock and entitlement data
-- are consulted before the state transition.

create or replace function public.resume_agent_run(
  p_user_id uuid,
  p_run_id uuid
) returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may resume only its own agent run' using errcode = '42501';
  end if;

  return query
  update public.agent_runs r
  set status = 'running', paused_at = null, updated_at = now()
  where r.run_id = p_run_id
    and r.user_id = p_user_id
    and r.status = 'paused'
    and exists (
      select 1
      from public.katedra_project_locks l
      where l.project_id = r.project_id
        and l.user_id = r.user_id
        and l.status = 'locked'
        and exists (
          select 1
          from public.entitlements e
          where e.user_id = r.user_id
            and e.academic_project_id = r.project_id
            and e.product_id = ('katedra_pass_' || l.product_key)
            and e.status = 'active'
            and e.purchase_expires_at > now()
        )
    )
  returning r.run_id, r.status;

  if not found then
    raise exception 'Agent run is not paused or does not belong to the user' using errcode = '40901';
  end if;
end $$;

revoke all on function public.resume_agent_run(uuid, uuid)
  from public, anon;

grant execute on function public.resume_agent_run(uuid, uuid)
  to authenticated, service_role;
