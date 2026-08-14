-- Keep a newly-created agent run invisible to workers until all private input
-- payloads are registered and the run context is present.

alter table public.agent_runs
  drop constraint if exists agent_runs_status_check;

alter table public.agent_runs
  add constraint agent_runs_status_check check (status in (
    'initializing', 'pending', 'running', 'paused', 'completed', 'blocked', 'failed', 'cancelled'
  ));

alter table public.agent_runs
  alter column status set default 'initializing';

drop index if exists public.agent_runs_one_active_per_project_idx;
create unique index if not exists agent_runs_one_active_per_project_idx
  on public.agent_runs (project_id)
  where status in ('initializing', 'pending', 'running', 'paused');

create or replace function public.attach_agent_payloads_to_run(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_material_ids text[]
) returns table (material_id text, manifest_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may attach payloads only for the authenticated account' using errcode = '42501';
  end if;
  if coalesce(array_length(p_material_ids, 1), 0) > 100 then
    raise exception 'Too many payloads to attach' using errcode = '22023';
  end if;
  if not exists (select 1 from public.academic_projects p where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;
  if not exists (select 1 from public.agent_runs r where r.run_id = p_run_id and r.project_id = p_project_id and r.user_id = p_user_id and r.status in ('initializing', 'pending', 'running', 'paused')) then
    raise exception 'Agent run is missing, inactive or does not belong to the project' using errcode = '40901';
  end if;
  if not exists (select 1 from public.katedra_project_locks l where l.project_id = p_project_id and l.user_id = p_user_id)
     or not exists (select 1 from public.entitlements e where e.user_id = p_user_id and e.academic_project_id = p_project_id and e.status = 'active' and e.purchase_expires_at > now()) then
    raise exception 'An active paid project entitlement is required for temporary payloads' using errcode = '42501';
  end if;

  return query
  update public.agent_payload_manifests m
  set run_id = p_run_id, updated_at = now()
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and (m.run_id is null or not exists (select 1 from public.agent_runs previous where previous.run_id = m.run_id and previous.status in ('initializing', 'pending', 'running', 'paused')))
    and m.deleted_at is null
    and m.expires_at > now()
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
  returning m.material_id, m.manifest_id;
end $$;

create or replace function public.activate_agent_run(
  p_user_id uuid,
  p_run_id uuid
) returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may activate only its own agent run' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.agent_runs r
    where r.run_id = p_run_id and r.user_id = p_user_id and r.status = 'initializing'
  ) then
    raise exception 'Agent run is not initializing or does not belong to the user' using errcode = '40901';
  end if;
  if not exists (
    select 1 from public.katedra_project_locks l
    join public.agent_runs r on r.project_id = l.project_id and r.run_id = p_run_id
    where l.user_id = p_user_id
  ) or not exists (
    select 1 from public.entitlements e
    join public.agent_runs r on r.project_id = e.academic_project_id and r.run_id = p_run_id
    where e.user_id = p_user_id and e.status = 'active' and e.purchase_expires_at > now()
  ) then
    raise exception 'An active paid project entitlement is required to activate the run' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.agent_payload_manifests m
    where m.run_id = p_run_id
      and m.material_id = 'run-context'
      and m.deleted_at is null
      and m.expires_at > now()
  ) then
    raise exception 'Agent run context is not ready' using errcode = '40901';
  end if;

  return query
  update public.agent_runs r
  set status = 'pending', updated_at = now()
  where r.run_id = p_run_id and r.user_id = p_user_id and r.status = 'initializing'
  returning r.run_id, r.status;
end $$;

create or replace function public.cancel_agent_run(
  p_user_id uuid,
  p_run_id uuid
) returns table (run_id uuid, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may cancel only its own agent run' using errcode = '42501';
  end if;
  return query
  update public.agent_runs r
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where r.run_id = p_run_id and r.user_id = p_user_id
    and r.status in ('initializing', 'pending', 'running', 'paused')
  returning r.run_id, r.status;
  if not found then
    raise exception 'Agent run is not active or does not belong to the user' using errcode = '40901';
  end if;
end $$;

revoke all on function public.activate_agent_run(uuid, uuid) from public, anon;
grant execute on function public.activate_agent_run(uuid, uuid) to authenticated, service_role;
