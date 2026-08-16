-- Keep the user-callable creation and payload registration RPCs aligned with
-- the same exact locked-product check used by the worker lifecycle RPCs.

create or replace function public.create_agent_run(
  p_user_id uuid,
  p_project_id uuid,
  p_mode text,
  p_source_policy text,
  p_section_ids text[] default null
) returns table (run_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_run_id uuid;
  section_id text;
  step_no integer := 1;
  sections text[];
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may create runs only for the authenticated account' using errcode = '42501';
  end if;
  if p_mode not in ('guided', 'accelerated', 'autonomous') then
    raise exception 'Invalid agent run mode' using errcode = '22023';
  end if;
  if p_source_policy not in ('uploaded_only', 'uploaded_plus_suggestions', 'web_research') then
    raise exception 'Invalid agent source policy' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
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
    raise exception 'An active exact Katedra Pass is required for the agent run' using errcode = '42501';
  end if;

  sections := coalesce(nullif(p_section_ids, '{}'::text[]), array['main']::text[]);

  insert into public.agent_runs (user_id, project_id, mode, source_policy)
  values (p_user_id, p_project_id, p_mode, p_source_policy)
  returning agent_runs.run_id into new_run_id;

  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'intake', 'intake_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'sources', 'sources_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'structure', 'structure_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'planning', 'planning_verifier', null, step_no);
  step_no := step_no + 1;

  foreach section_id in array sections loop
    insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
    values (new_run_id, p_project_id, 'writing', 'writing_verifier', section_id, step_no);
    step_no := step_no + 1;
  end loop;

  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'citation', 'citation_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'review', 'review_verifier', null, step_no);
  step_no := step_no + 1;
  insert into public.agent_steps (run_id, project_id, agent, verifier, section_id, step_order)
  values (new_run_id, p_project_id, 'export', 'export_verifier', null, step_no);

  return query select new_run_id;
end $$;

create or replace function public.register_agent_payload(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_material_id text,
  p_storage_bucket text,
  p_storage_path text,
  p_manifest_path text,
  p_expires_at timestamptz
) returns table (manifest_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_manifest_id uuid;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may register payloads only for the authenticated account' using errcode = '42501';
  end if;
  if p_user_id is null or p_project_id is null
     or nullif(trim(p_material_id), '') is null
     or nullif(trim(p_storage_bucket), '') is null
     or nullif(trim(p_storage_path), '') is null
     or nullif(trim(p_manifest_path), '') is null then
    raise exception 'Agent payload registration is incomplete' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;
  if p_run_id is not null and not exists (
    select 1 from public.agent_runs r
    where r.run_id = p_run_id
      and r.project_id = p_project_id
      and r.user_id = p_user_id
      and r.status in ('initializing', 'pending', 'running', 'paused')
  ) then
    raise exception 'Payload run is missing, inactive or does not belong to the project' using errcode = '40901';
  end if;
  if p_expires_at > now() + interval '7 days' or p_expires_at <= now() then
    raise exception 'Payload expiry must be within the seven day retention window' using errcode = '22023';
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
  if p_storage_bucket <> 'katedra-temporary-materials'
     or p_storage_path not like p_user_id::text || '/' || p_project_id::text || '/%'
     or p_manifest_path not like p_user_id::text || '/' || p_project_id::text || '/%' then
    raise exception 'Payload storage path is outside the project namespace' using errcode = '42501';
  end if;

  insert into public.agent_payload_manifests (
    user_id, project_id, run_id, material_id, storage_bucket,
    storage_path, manifest_path, expires_at
  ) values (
    p_user_id, p_project_id, p_run_id, p_material_id, p_storage_bucket,
    p_storage_path, p_manifest_path, p_expires_at
  )
  on conflict (storage_path) do update
    set expires_at = excluded.expires_at, updated_at = now(), deleted_at = null
  returning agent_payload_manifests.manifest_id into new_manifest_id;

  return query select new_manifest_id;
end $$;
