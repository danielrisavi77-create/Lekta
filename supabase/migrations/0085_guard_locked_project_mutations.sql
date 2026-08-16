-- Defense in depth for the paid-project lock.
--
-- The Katedra API checks the lock before writing, but that check is necessarily
-- separate from the compatibility upsert. These triggers close the race window
-- and also protect direct authenticated writes to the shared Supabase tables.
-- Mutable project metadata remains editable; topic, work type and identity do
-- not change after a paid project has been locked.

create or replace function public.prevent_locked_katedra_project_identity_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  is_locked boolean := false;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if tg_table_name = 'academic_projects' then
    select exists (
      select 1
      from public.katedra_project_locks l
      where l.project_id = old.id
        and l.user_id = old.user_id
        and l.status = 'locked'
    ) into is_locked;

    if is_locked and (
      new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.topic is distinct from old.topic
      or new.work_type is distinct from old.work_type
      or new.legacy_client_project_id is distinct from old.legacy_client_project_id
    ) then
      raise exception 'Locked Katedra project identity is immutable' using errcode = '23514';
    end if;
  elsif tg_table_name = 'katedra_projects' then
    select exists (
      select 1
      from public.katedra_project_locks l
      where l.project_id = case
        when old.project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then old.project_id::uuid
        else null
      end
        and l.user_id = old.user_id
        and l.status = 'locked'
    ) into is_locked;

    if is_locked and (
      new.project_id is distinct from old.project_id
      or new.user_id is distinct from old.user_id
      or new.guest_project_id is distinct from old.guest_project_id
      or new.topic is distinct from old.topic
      or new.work_type is distinct from old.work_type
      or new.work_type_canonical is distinct from old.work_type_canonical
    ) then
      raise exception 'Locked Katedra project identity is immutable' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_locked_katedra_project_identity_change()
  from public, anon, authenticated;

drop trigger if exists academic_projects_locked_identity_guard on public.academic_projects;
create trigger academic_projects_locked_identity_guard
before update on public.academic_projects
for each row execute function public.prevent_locked_katedra_project_identity_change();

drop trigger if exists katedra_projects_locked_identity_guard on public.katedra_projects;
create trigger katedra_projects_locked_identity_guard
before update on public.katedra_projects
for each row execute function public.prevent_locked_katedra_project_identity_change();

-- Storage must enforce the same paid-project boundary as the HTTP routes.
-- Otherwise a browser can call Supabase Storage directly and bypass the API's
-- Pass and upload-rate-limit checks.

drop policy if exists katedra_temporary_materials_select_own on storage.objects;
create policy katedra_temporary_materials_select_paid_project
on storage.objects
for select to authenticated
using (
  bucket_id = 'katedra-temporary-materials'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.academic_projects p
    join public.katedra_project_locks l
      on l.project_id = p.id
     and l.user_id = p.user_id
     and l.status = 'locked'
    join public.entitlements e
      on e.user_id = l.user_id
     and e.academic_project_id = p.id
     and e.provider = 'stripe'
     and e.status = 'active'
     and e.purchase_expires_at > now()
     and e.product_id = ('katedra_pass_' || l.product_key)
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
);

drop policy if exists katedra_temporary_materials_insert_own on storage.objects;
create policy katedra_temporary_materials_insert_paid_project
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'katedra-temporary-materials'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.academic_projects p
    join public.katedra_project_locks l
      on l.project_id = p.id
     and l.user_id = p.user_id
     and l.status = 'locked'
    join public.entitlements e
      on e.user_id = l.user_id
     and e.academic_project_id = p.id
     and e.provider = 'stripe'
     and e.status = 'active'
     and e.purchase_expires_at > now()
     and e.product_id = ('katedra_pass_' || l.product_key)
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
);

drop policy if exists katedra_temporary_materials_update_own on storage.objects;
create policy katedra_temporary_materials_update_paid_project
on storage.objects
for update to authenticated
using (
  bucket_id = 'katedra-temporary-materials'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.academic_projects p
    join public.katedra_project_locks l
      on l.project_id = p.id
     and l.user_id = p.user_id
     and l.status = 'locked'
    join public.entitlements e
      on e.user_id = l.user_id
     and e.academic_project_id = p.id
     and e.provider = 'stripe'
     and e.status = 'active'
     and e.purchase_expires_at > now()
     and e.product_id = ('katedra_pass_' || l.product_key)
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
)
with check (
  bucket_id = 'katedra-temporary-materials'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.academic_projects p
    join public.katedra_project_locks l
      on l.project_id = p.id
     and l.user_id = p.user_id
     and l.status = 'locked'
    join public.entitlements e
      on e.user_id = l.user_id
     and e.academic_project_id = p.id
     and e.provider = 'stripe'
     and e.status = 'active'
     and e.purchase_expires_at > now()
     and e.product_id = ('katedra_pass_' || l.product_key)
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
 );

-- Do not keep the legacy owner-only delete policy. Direct Storage deletion
-- must remain inside the same user/project/active-Pass boundary as upload and
-- read. The public API still performs the canonical tombstone first.
drop policy if exists katedra_temporary_materials_delete_own on storage.objects;
drop policy if exists katedra_temporary_materials_delete_paid_project on storage.objects;
create policy katedra_temporary_materials_delete_paid_project
on storage.objects
for delete to authenticated
using (
  bucket_id = 'katedra-temporary-materials'
  and array_length(storage.foldername(name), 1) >= 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (
    exists (
      select 1
      from public.academic_projects p
      join public.katedra_project_locks l
        on l.project_id = p.id
       and l.user_id = p.user_id
       and l.status = 'locked'
      join public.entitlements e
        on e.user_id = l.user_id
       and e.academic_project_id = p.id
       and e.provider = 'stripe'
       and e.status = 'active'
       and e.purchase_expires_at > now()
       and e.product_id = ('katedra_pass_' || l.product_key)
      where p.id::text = (storage.foldername(name))[2]
        and p.user_id = (select auth.uid())
        and p.deleted_at is null
    )
    or exists (
      select 1
      from public.agent_payload_manifests m
      where m.user_id = (select auth.uid())
        and m.project_id::text = (storage.foldername(name))[2]
        and m.deleted_at is not null
        and (m.storage_path = name or m.manifest_path = name)
    )
  )
  and not exists (
    select 1
    from public.agent_payload_manifests m
    join public.agent_runs r on r.run_id = m.run_id
    where m.user_id = (select auth.uid())
      and m.project_id::text = (storage.foldername(name))[2]
      and m.deleted_at is null
      and (m.storage_path = name or m.manifest_path = name)
      and r.status in ('initializing', 'pending', 'running', 'paused')
  )
);

-- The registration RPC is also callable by an authenticated session. Keep a
-- malicious caller from registering a manifest whose storage path escapes the
-- exact user/project/material namespace and later tricking a service worker
-- into downloading an unrelated object.

create or replace function public.enforce_agent_payload_storage_namespace()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_prefix text := new.user_id::text || '/' || new.project_id::text || '/';
  expected_run_prefix text := new.user_id::text || '/' || new.project_id::text || '/' || coalesce(new.run_id::text, '') || '/';
  expected_manifest_path text := expected_prefix || new.material_id || '.manifest.json';
  expected_storage_prefix text := expected_prefix || new.material_id || '-';
  valid_namespace boolean := false;
begin
  if new.storage_bucket = 'katedra-temporary-materials'
     and new.material_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and new.manifest_path = expected_manifest_path
     and left(new.storage_path, length(expected_storage_prefix)) = expected_storage_prefix
     and position('/' in substr(new.storage_path, length(expected_prefix) + 1)) = 0 then
    valid_namespace := true;
  elsif new.storage_bucket = 'katedra-temporary-materials'
     and new.material_id = 'run-context'
     and new.run_id is not null
     and new.storage_path = expected_run_prefix || 'manuscript-context.json'
     and new.manifest_path = expected_run_prefix || 'manuscript-context.manifest.json' then
    valid_namespace := true;
  elsif new.storage_bucket = 'katedra-temporary-materials'
     and new.material_id ~ '^agent-result:[A-Za-z0-9._-]+:[123]$'
     and new.run_id is not null
     and left(new.storage_path, length(expected_run_prefix || 'results/')) = expected_run_prefix || 'results/'
     and position('/' in substr(new.storage_path, length(expected_run_prefix || 'results/') + 1)) = 0
     and new.storage_path like '%.json'
     and new.manifest_path = left(new.storage_path, length(new.storage_path) - 5) || '.manifest.json' then
    valid_namespace := true;
  end if;

  if not valid_namespace then
    raise exception 'Agent payload storage namespace is invalid' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_agent_payload_storage_namespace()
  from public, anon, authenticated;

drop trigger if exists agent_payload_storage_namespace_guard on public.agent_payload_manifests;
create trigger agent_payload_storage_namespace_guard
before insert or update on public.agent_payload_manifests
for each row execute function public.enforce_agent_payload_storage_namespace();
