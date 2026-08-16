-- Keep worker claims and completions bound to the immutable paid-project scope.
-- A route-level capability check is not enough: workers and retries run after
-- the browser request, so the canonical database must re-check the run state.

create or replace function public.claim_agent_step(
  p_run_id uuid,
  p_worker_id text
) returns setof public.agent_steps
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run_record public.agent_runs;
  claimed public.agent_steps;
  locked_product text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may claim an agent step' using errcode = '42501';
  end if;
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'Worker id is required' using errcode = '22023';
  end if;

  -- Serialize claims with pause/cancel and completion transitions for the run.
  select r.* into run_record
  from public.agent_runs r
  where r.run_id = p_run_id
  for update;

  if run_record.run_id is null
     or run_record.status not in ('pending', 'running') then
    return;
  end if;

  select l.product_key into locked_product
  from public.katedra_project_locks l
  where l.project_id = run_record.project_id
    and l.user_id = run_record.user_id
    and l.status = 'locked';

  if locked_product is null
     or not exists (
       select 1
       from public.entitlements e
       where e.user_id = run_record.user_id
         and e.academic_project_id = run_record.project_id
         and e.product_id = ('katedra_pass_' || locked_product)
         and e.status = 'active'
         and e.purchase_expires_at > now()
     ) then
    update public.agent_runs
    set status = 'blocked',
        last_error = 'An active exact Katedra Pass is required for the agent run',
        updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running');
    return;
  end if;

  with candidate as (
    select s.step_id
    from public.agent_steps s
    where s.run_id = p_run_id
      and (
        s.status = 'pending'
        or (s.status = 'running' and s.lease_expires_at <= now())
      )
      and not exists (
        select 1 from public.agent_steps previous
        where previous.run_id = s.run_id
          and previous.step_order < s.step_order
          and previous.status <> 'verified'
      )
    order by s.step_order
    for update skip locked
    limit 1
  )
  update public.agent_steps s
  set status = 'running',
      lease_owner = p_worker_id,
      lease_expires_at = now() + interval '5 minutes',
      claimed_at = now(),
      updated_at = now()
  from candidate c
  where s.step_id = c.step_id
  returning s.* into claimed;

  if claimed.step_id is null then
    return;
  end if;

  update public.agent_runs
  set status = 'running', updated_at = now()
  where run_id = p_run_id and status = 'pending';

  return next claimed;
end $$;

create or replace function public.complete_agent_step(
  p_run_id uuid,
  p_step_id uuid,
  p_status text,
  p_attempt smallint,
  p_provider text,
  p_usage jsonb,
  p_worker_id text,
  p_verification jsonb default null,
  p_requeue boolean default false
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_run public.agent_runs;
  current_step public.agent_steps;
  next_status text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may complete an agent step' using errcode = '42501';
  end if;
  if p_status not in ('verified', 'blocked', 'failed') then
    raise exception 'Invalid agent step completion status' using errcode = '22023';
  end if;
  if p_attempt not between 1 and 3 then
    raise exception 'Agent step attempt must be between 1 and 3' using errcode = '22023';
  end if;
  if p_requeue and (p_status <> 'failed' or p_attempt >= 3) then
    raise exception 'Only failed attempts one or two may be requeued' using errcode = '22023';
  end if;

  -- Lock the run before the step so cancel/pause and worker transitions use the
  -- same lock order. Terminal runs cannot be resurrected by a late worker.
  select r.* into current_run
  from public.agent_runs r
  where r.run_id = p_run_id
  for update;

  if current_run.run_id is null
     or current_run.status not in ('pending', 'running', 'paused') then
    raise exception 'Agent run is no longer active' using errcode = '40901';
  end if;

  select s.* into current_step
  from public.agent_steps s
  where s.step_id = p_step_id and s.run_id = p_run_id
  for update;

  if current_step.step_id is null then
    raise exception 'Agent step does not belong to the run' using errcode = '22023';
  end if;
  if current_step.status <> 'running' then
    raise exception 'Agent step is not currently leased' using errcode = '40901';
  end if;
  if current_step.lease_owner <> p_worker_id then
    raise exception 'Agent step lease belongs to another worker' using errcode = '42501';
  end if;
  if current_step.attempt <> p_attempt then
    raise exception 'Agent step attempt is stale' using errcode = '40901';
  end if;
  if current_step.lease_expires_at is null or current_step.lease_expires_at <= now() then
    raise exception 'Agent step lease has expired' using errcode = '40901';
  end if;

  next_status := case when p_requeue then 'pending' else p_status end;
  update public.agent_steps
  set status = next_status,
      attempt = case when p_requeue then p_attempt + 1 else p_attempt end,
      lease_owner = null,
      lease_expires_at = null,
      provider = nullif(trim(p_provider), ''),
      usage = coalesce(p_usage, '{}'::jsonb),
      last_verification = p_verification,
      completed_at = case when p_requeue then null else now() end,
      updated_at = now()
  where step_id = p_step_id;

  if p_requeue then
    update public.agent_runs
    set status = 'running', updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running');
  elsif p_status = 'blocked' then
    update public.agent_runs
    set status = 'blocked', updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running', 'paused');
  elsif p_status = 'failed' then
    update public.agent_runs
    set status = 'failed', updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running', 'paused');
  elsif not exists (
    select 1 from public.agent_steps s
    where s.run_id = p_run_id and s.status <> 'verified'
  ) then
    update public.agent_runs
    set status = 'completed', updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running', 'paused');
  else
    update public.agent_runs
    set status = 'running', updated_at = now()
    where run_id = p_run_id and status in ('pending', 'running');
  end if;
end $$;

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
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.agent_runs r
    where r.run_id = p_run_id and r.project_id = p_project_id
      and r.user_id = p_user_id
      and r.status in ('initializing', 'pending', 'running', 'paused')
  ) then
    raise exception 'Agent run is missing, inactive or does not belong to the project' using errcode = '40901';
  end if;
  if not exists (
    select 1
    from public.katedra_project_locks l
    where l.project_id = p_project_id and l.user_id = p_user_id and l.status = 'locked'
      and exists (
        select 1 from public.entitlements e
        where e.user_id = p_user_id
          and e.academic_project_id = p_project_id
          and e.product_id = ('katedra_pass_' || l.product_key)
          and e.status = 'active'
          and e.purchase_expires_at > now()
      )
  ) then
    raise exception 'An active exact Katedra Pass is required for the agent run' using errcode = '42501';
  end if;

  return query
  update public.agent_payload_manifests m
  set run_id = p_run_id, updated_at = now()
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and (m.run_id is null or not exists (
      select 1 from public.agent_runs previous
      where previous.run_id = m.run_id
        and previous.status in ('initializing', 'pending', 'running', 'paused')
    ))
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
    select 1
    from public.katedra_project_locks l
    join public.agent_runs r on r.project_id = l.project_id and r.run_id = p_run_id
    where l.user_id = p_user_id
      and l.status = 'locked'
      and exists (
        select 1 from public.entitlements e
        where e.user_id = p_user_id
          and e.academic_project_id = r.project_id
          and e.product_id = ('katedra_pass_' || l.product_key)
          and e.status = 'active'
          and e.purchase_expires_at > now()
      )
  ) then
    raise exception 'An active exact Katedra Pass is required to activate the run' using errcode = '42501';
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

revoke all on function public.claim_agent_step(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_agent_step(uuid, text) to service_role;
revoke all on function public.complete_agent_step(uuid, uuid, text, smallint, text, jsonb, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_agent_step(uuid, uuid, text, smallint, text, jsonb, text, jsonb, boolean)
  to service_role;
revoke all on function public.attach_agent_payloads_to_run(uuid, uuid, uuid, text[]) from public, anon;
grant execute on function public.attach_agent_payloads_to_run(uuid, uuid, uuid, text[])
  to authenticated, service_role;
revoke all on function public.activate_agent_run(uuid, uuid) from public, anon;
grant execute on function public.activate_agent_run(uuid, uuid) to authenticated, service_role;
