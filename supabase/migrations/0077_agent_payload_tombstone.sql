-- Canonical, idempotent deletion for temporary agent payloads.
--
-- Storage objects are removed by the caller after this RPC returns the
-- database-owned paths. The manifest is tombstoned first so a worker can
-- never load a material after the user has explicitly deleted it. A payload
-- attached to an active run is rejected rather than silently changing that
-- run's context midway through execution.

create or replace function public.tombstone_agent_payload(
  p_user_id uuid,
  p_project_id uuid,
  p_material_id text
) returns table (
  manifest_id uuid,
  material_id text,
  storage_bucket text,
  storage_path text,
  manifest_path text,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  payload public.agent_payload_manifests%rowtype;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may delete payloads only for the authenticated account' using errcode = '42501';
  end if;
  if p_user_id is null or p_project_id is null or nullif(trim(p_material_id), '') is null
     or length(p_material_id) > 200 then
    raise exception 'Invalid agent payload deletion request' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user_id and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the user' using errcode = '42501';
  end if;

  select m.* into payload
  from public.agent_payload_manifests m
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.material_id = p_material_id
  order by m.created_at desc
  limit 1
  for update;

  if payload.manifest_id is null then
    raise exception 'Material is missing or does not belong to the project' using errcode = 'P0002';
  end if;

  if payload.deleted_at is null and payload.run_id is not null and exists (
    select 1 from public.agent_runs r
    where r.run_id = payload.run_id
      and r.status in ('initializing', 'pending', 'running', 'paused')
  ) then
    raise exception 'Cannot delete a material attached to an active agent run' using errcode = '40901';
  end if;

  update public.agent_payload_manifests m
  set deleted_at = coalesce(m.deleted_at, now()), updated_at = now()
  where m.manifest_id = payload.manifest_id
  returning m.manifest_id, m.material_id, m.storage_bucket,
    m.storage_path, m.manifest_path, m.deleted_at
  into manifest_id, material_id, storage_bucket, storage_path, manifest_path, deleted_at;

  return next;
end $$;

revoke all on function public.tombstone_agent_payload(uuid, uuid, text)
  from public, anon;
grant execute on function public.tombstone_agent_payload(uuid, uuid, text)
  to authenticated, service_role;
