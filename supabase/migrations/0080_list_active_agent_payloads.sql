-- The material list must come from canonical manifest state, not only from
-- Storage. Storage cleanup can be retried after a tombstone, so a stale
-- manifest object must never make a deleted payload visible to Katedra.

create or replace function public.list_active_agent_payloads(
  p_user_id uuid,
  p_project_id uuid
) returns table (
  material_id text,
  manifest_id uuid,
  storage_bucket text,
  storage_path text,
  manifest_path text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may list payloads only for the authenticated account' using errcode = '42501';
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
    raise exception 'An active exact Katedra Pass is required to list payloads' using errcode = '42501';
  end if;

  return query
  select m.material_id, m.manifest_id, m.storage_bucket,
         m.storage_path, m.manifest_path, m.expires_at
  from public.agent_payload_manifests m
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.deleted_at is null
    and m.expires_at > now()
    and m.material_id <> 'run-context'
    and m.material_id not like 'agent-result:%'
  order by m.created_at desc;
end $$;

revoke all on function public.list_active_agent_payloads(uuid, uuid)
  from public, anon;
grant execute on function public.list_active_agent_payloads(uuid, uuid)
  to authenticated, service_role;
