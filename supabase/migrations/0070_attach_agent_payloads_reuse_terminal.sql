-- Allow a live project payload to be reused after its previous run is terminal.
-- 0069 already contains the complete function; this idempotent replacement keeps
-- the staging correction explicit in the Lekta migration history.

create or replace function public.attach_agent_payloads_to_run(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_material_ids text[]
) returns table (material_id text, manifest_id uuid)
language plpgsql
security definer
set search_path = public
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
  if not exists (select 1 from public.agent_runs r where r.run_id = p_run_id and r.project_id = p_project_id and r.user_id = p_user_id and r.status in ('pending', 'running', 'paused')) then
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
    and (m.run_id is null or not exists (select 1 from public.agent_runs previous where previous.run_id = m.run_id and previous.status in ('pending', 'running', 'paused')))
    and m.deleted_at is null
    and m.expires_at > now()
    and m.material_id = any(coalesce(p_material_ids, '{}'::text[]))
  returning m.material_id, m.manifest_id;
end $$;
