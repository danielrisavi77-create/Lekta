-- Atomically replace the user-selected input materials for an agent run.
--
-- The web layer must not detach/attach payloads in separate calls: a stale or
-- foreign material id would otherwise leave a partial selection. This RPC
-- validates the complete requested set first, then performs the replacement
-- in the same transaction. Run context and generated result payloads are
-- intentionally preserved.

create or replace function public.replace_agent_payloads_for_run(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_material_ids text[]
) returns table (
  material_id text,
  manifest_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requested_count integer := coalesce(array_length(p_material_ids, 1), 0);
  eligible_count integer := 0;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may replace payloads only for the authenticated account' using errcode = '42501';
  end if;
  if p_user_id is null or p_project_id is null or p_run_id is null then
    raise exception 'Invalid agent payload replacement request' using errcode = '22023';
  end if;
  if requested_count > 100 then
    raise exception 'Too many payloads to replace' using errcode = '22023';
  end if;
  if exists (
    select 1 from (
      select unnest(coalesce(p_material_ids, '{}'::text[])) as material_id
      group by material_id
      having count(*) > 1
    ) duplicate_ids
  ) then
    raise exception 'Duplicate payload ids are not allowed' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_material_ids, '{}'::text[])) as requested(material_id)
    where nullif(trim(requested.material_id), '') is null
       or length(requested.material_id) > 200
       or requested.material_id = 'run-context'
       or requested.material_id like 'agent-result:%'
  ) then
    raise exception 'Only user input material ids may be replaced' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;
  -- Serialize replacement requests for the same run before checking or
  -- mutating its selection. This also keeps the lock order consistent with
  -- worker lifecycle transitions, which lock the run before its steps.
  perform 1
  from public.agent_runs r
  where r.run_id = p_run_id
    and r.project_id = p_project_id
    and r.user_id = p_user_id
    and r.status in ('initializing', 'pending', 'running', 'paused', 'blocked')
  for update;

  if not found then
    raise exception 'Agent run is missing, inactive or does not belong to the project' using errcode = '40901';
  end if;
  if not exists (
    select 1
    from public.katedra_project_locks l
    where l.project_id = p_project_id
      and l.user_id = p_user_id
      and l.status = 'locked'
      and exists (
        select 1 from public.entitlements e
        where e.user_id = p_user_id
          and e.academic_project_id = p_project_id
          and e.product_id = ('katedra_pass_' || l.product_key)
          and e.status = 'active'
          and e.purchase_expires_at > now()
      )
  ) then
    raise exception 'An active exact Katedra Pass is required for temporary payloads' using errcode = '42501';
  end if;

  -- Lock every requested material before eligibility is evaluated. Without
  -- this second lock, two runs could both observe the same unassigned
  -- material and attach it successfully in competing transactions.
  perform 1
  from public.agent_payload_manifests m
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
  order by m.material_id
  for update;

  select count(*)::integer into eligible_count
  from public.agent_payload_manifests m
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
    and m.deleted_at is null
    and m.expires_at > now()
    and (
      m.run_id is null
      or m.run_id = p_run_id
      or not exists (
        select 1 from public.agent_runs previous
        where previous.run_id = m.run_id
          and previous.status in ('initializing', 'pending', 'running', 'paused', 'blocked')
      )
    );

  if eligible_count <> requested_count then
    raise exception 'One or more requested payloads are missing, expired or already active in another run' using errcode = '40901';
  end if;

  update public.agent_payload_manifests m
  set run_id = null, updated_at = now()
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.run_id = p_run_id
    and m.deleted_at is null
    and m.material_id <> 'run-context'
    and m.material_id not like 'agent-result:%';

  return query
  update public.agent_payload_manifests m
  set run_id = p_run_id, updated_at = now()
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
    and m.deleted_at is null
    and m.expires_at > now()
    and (
      m.run_id is null
      or m.run_id = p_run_id
      or not exists (
        select 1 from public.agent_runs previous
        where previous.run_id = m.run_id
          and previous.status in ('initializing', 'pending', 'running', 'paused', 'blocked')
      )
    )
  returning m.material_id, m.manifest_id;
end $$;

revoke all on function public.replace_agent_payloads_for_run(uuid, uuid, uuid, text[])
  from public, anon;
grant execute on function public.replace_agent_payloads_for_run(uuid, uuid, uuid, text[])
  to authenticated, service_role;
