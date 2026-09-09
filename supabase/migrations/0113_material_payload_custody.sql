-- Material bytes follow the same pre-allocation and upload-intent custody as
-- run contexts. Consent is metadata; file names and content are not stored here.
alter table public.agent_payload_manifests
  add column if not exists material_consent_version text,
  add column if not exists material_consent_at timestamptz,
  add column if not exists material_upload_complete boolean not null default false;

-- Immutable attachment history contains identifiers only. Detachment/reuse
-- cannot erase the authority needed to revoke older derived temporary copies.
create table if not exists public.agent_material_run_lineage(
  manifest_id uuid not null references public.agent_payload_manifests(manifest_id) on delete cascade,
  run_id uuid not null references public.agent_runs(run_id) on delete cascade,
  primary key(manifest_id,run_id)
);
alter table public.agent_material_run_lineage enable row level security;
revoke all on public.agent_material_run_lineage from public,anon,authenticated,service_role;
grant select on public.agent_material_run_lineage to service_role;
insert into public.agent_material_run_lineage(manifest_id,run_id)
select m.manifest_id,m.run_id from public.agent_payload_manifests m
where m.run_id is not null and m.material_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict do nothing;
insert into public.agent_material_run_lineage(manifest_id,run_id)
select m.manifest_id,c.run_id from public.agent_payload_manifests m
join public.agent_payload_manifests c on c.user_id=m.user_id and c.project_id=m.project_id
  and m.material_id=any(c.context_material_ids) and c.run_id is not null
where m.material_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict do nothing;
create or replace function public.record_material_run_lineage()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.run_id is not null and new.material_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    insert into public.agent_material_run_lineage(manifest_id,run_id) values(new.manifest_id,new.run_id) on conflict do nothing;
  end if;
  return new;
end $$;
revoke all on function public.record_material_run_lineage() from public,anon,authenticated;
drop trigger if exists material_run_lineage_record on public.agent_payload_manifests;
create trigger material_run_lineage_record after insert or update of run_id on public.agent_payload_manifests
for each row execute function public.record_material_run_lineage();

-- Legacy unbound uploads have no trustworthy byte/hash evidence either.
insert into public.agent_payload_upload_intents(manifest_id,object_kind,upload_token,body_sha256,body_bytes,state)
select m.manifest_id,k.kind,gen_random_uuid(),repeat('0',64),0,'uncertain'
from public.agent_payload_manifests m cross join (values('body'),('manifest')) k(kind)
where m.run_id is null and m.content_deleted_at is null and m.upload_protocol_version=0
on conflict do nothing;

create or replace function public.guard_material_payload_custody()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.material_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return new; end if;
  if tg_op='INSERT' then
    if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
      or new.material_consent_version is distinct from 'material-storage-v1'
      or new.material_consent_at is distinct from now() or new.material_upload_complete then
      raise exception 'Material allocation requires service-recorded consent' using errcode='42501';
    end if;
  else
    if row(new.material_consent_version,new.material_consent_at) is distinct from row(old.material_consent_version,old.material_consent_at)
      or (old.material_upload_complete and not new.material_upload_complete) then
      raise exception 'Material consent identity is immutable' using errcode='40901';
    end if;
    if new.run_id is not null and new.run_id is distinct from old.run_id and not new.material_upload_complete then
      raise exception 'Incomplete material cannot be attached' using errcode='40901';
    end if;
    if new.material_upload_complete and not old.material_upload_complete then
      if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role'
        or (select count(*) from public.agent_payload_upload_intents u where u.manifest_id=new.manifest_id and u.state='uploaded')<>2
        or (select count(*) from storage.objects o where o.bucket_id=new.storage_bucket and o.name in(new.storage_path,new.manifest_path))<>2 then
        raise exception 'Material publication requires completed uploads' using errcode='40901';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_material_payload_custody() from public,anon,authenticated;
drop trigger if exists material_payload_custody_guard on public.agent_payload_manifests;
create trigger material_payload_custody_guard before insert or update on public.agent_payload_manifests
for each row execute function public.guard_material_payload_custody();

create or replace function public.reserve_material_payload(
  p_user_id uuid,p_project_id uuid,p_run_id uuid,p_material_id uuid,p_consent_version text
) returns table(manifest_id uuid,storage_path text,manifest_path text,created_at timestamptz,expires_at timestamptz,consent_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.agent_payload_manifests; prefix text; r public.agent_runs;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Only service may allocate materials' using errcode='42501'; end if;
  if p_consent_version is distinct from 'material-storage-v1' or p_material_id is null
    or p_material_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Current material consent and UUID are required' using errcode='22023';
  end if;
  if p_run_id is not null then
    select * into r from public.agent_runs where run_id=p_run_id and user_id=p_user_id and project_id=p_project_id for update;
    if not found or r.snapshot_consent_version is distinct from 'agentic-snapshot-v1' or r.snapshot_consent_at is null
      or r.status not in ('initializing','pending','running','paused','blocked') then raise exception 'Run consent is unavailable' using errcode='40901'; end if;
  end if;
  if not exists(select 1 from public.academic_projects p
    join public.katedra_project_locks l on l.project_id=p.id and l.user_id=p.user_id and l.status='locked'
    join public.entitlements e on e.user_id=l.user_id and e.academic_project_id=p.id
      and e.product_id='katedra_pass_'||l.product_key and e.provider='stripe' and e.status='active' and e.purchase_expires_at>now()
    where p.id=p_project_id and p.user_id=p_user_id and p.deleted_at is null) then
    raise exception 'An active exact project Pass is required' using errcode='42501';
  end if;
  prefix:=p_user_id::text||'/'||p_project_id::text||'/'||p_material_id::text;
  -- Serialize first allocation without extending an existing manifest on replay.
  perform pg_advisory_xact_lock(hashtextextended('material:'||prefix,0));
  select * into m from public.agent_payload_manifests a where a.storage_path=prefix||'-body' for update;
  if found then
    if row(m.user_id,m.project_id,m.run_id,m.material_id) is distinct from row(p_user_id,p_project_id,p_run_id,p_material_id::text)
      or m.material_consent_version is distinct from p_consent_version or m.material_consent_at is null
      or m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now() or m.upload_protocol_version<>1 then
      raise exception 'Material allocation is unavailable' using errcode='40901';
    end if;
  else
    insert into public.agent_payload_manifests(user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at,material_consent_version,material_consent_at)
    values(p_user_id,p_project_id,p_run_id,p_material_id::text,'katedra-temporary-materials',prefix||'-body',prefix||'.manifest.json',now()+interval '72 hours',p_consent_version,now()) returning * into m;
  end if;
  return query select m.manifest_id,m.storage_path,m.manifest_path,m.created_at,m.expires_at,m.material_consent_at;
end $$;
revoke all on function public.reserve_material_payload(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_material_payload(uuid,uuid,uuid,uuid,text) to service_role;

create or replace function public.complete_material_payload(p_user_id uuid,p_project_id uuid,p_manifest_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.agent_payload_manifests; expected_run uuid; r public.agent_runs;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Only service may publish materials' using errcode='42501'; end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id and user_id=p_user_id and project_id=p_project_id;
  if not found then raise exception 'Material allocation is unavailable' using errcode='40901'; end if;
  expected_run:=m.run_id;
  if expected_run is not null then
    select * into r from public.agent_runs where run_id=expected_run and user_id=p_user_id and project_id=p_project_id for update;
    if not found or r.snapshot_consent_version is distinct from 'agentic-snapshot-v1' or r.snapshot_consent_at is null
      or r.status not in ('initializing','pending','running','paused','blocked') then raise exception 'Run consent is unavailable' using errcode='40901'; end if;
  end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id for update;
  if m.run_id is distinct from expected_run or m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now()
    or m.material_consent_version is distinct from 'material-storage-v1' or m.material_consent_at is null
    or (select count(*) from public.agent_payload_upload_intents u where u.manifest_id=m.manifest_id and u.state='uploaded')<>2
    or (select count(*) from storage.objects o where o.bucket_id=m.storage_bucket and o.name in(m.storage_path,m.manifest_path))<>2 then
    raise exception 'Material uploads are incomplete or revoked' using errcode='40901';
  end if;
  if not exists(select 1 from public.academic_projects p
    join public.katedra_project_locks l on l.project_id=p.id and l.user_id=p.user_id and l.status='locked'
    join public.entitlements e on e.user_id=l.user_id and e.academic_project_id=p.id
      and e.product_id='katedra_pass_'||l.product_key and e.provider='stripe' and e.status='active' and e.purchase_expires_at>now()
    where p.id=p_project_id and p.user_id=p_user_id and p.deleted_at is null) then
    raise exception 'An active exact project Pass is required' using errcode='42501';
  end if;
  update public.agent_payload_manifests set material_upload_complete=true where manifest_id=p_manifest_id;
  return p_manifest_id;
end $$;
revoke all on function public.complete_material_payload(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_material_payload(uuid,uuid,uuid) to service_role;

drop policy if exists material_server_upload_only on storage.objects;
create policy material_server_upload_only on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'katedra-temporary-materials');
drop policy if exists material_no_client_overwrite on storage.objects;
create policy material_no_client_overwrite on storage.objects as restrictive for update to authenticated
using(bucket_id<>'katedra-temporary-materials') with check(bucket_id<>'katedra-temporary-materials');

create or replace function public.begin_agent_payload_upload(
  p_manifest_id uuid,p_object_kind text,p_upload_token uuid,p_sha256 text,p_bytes bigint
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.agent_payload_manifests; r public.agent_runs; u public.agent_payload_upload_intents; expected_run uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only the service may authorize payload uploads' using errcode='42501';
  end if;
  if p_object_kind not in ('body','manifest') or p_object_kind is null or p_upload_token is null
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 0 and 33554432 then
    raise exception 'Invalid upload identity' using errcode='22023';
  end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id;
  if not found then raise exception 'Payload is missing' using errcode='40901'; end if;
  expected_run:=m.run_id;
  if expected_run is not null then
    select * into r from public.agent_runs where run_id=expected_run and user_id=m.user_id and project_id=m.project_id for update;
    if not found or r.snapshot_consent_version is distinct from 'agentic-snapshot-v1'
      or r.snapshot_consent_at is null or r.status not in ('initializing','pending','running','paused','blocked') then
      raise exception 'Run consent is absent or revoked' using errcode='40901';
    end if;
  end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id for update;
  if not found or m.run_id is distinct from expected_run then
    raise exception 'Payload binding changed; no upload was authorized' using errcode='40901';
  end if;
  if m.run_id is null or m.material_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    if m.material_consent_version is distinct from 'material-storage-v1' or m.material_consent_at is null then
      raise exception 'Material consent is absent' using errcode='40901';
    end if;
  end if;
  if m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now() then
    raise exception 'Upload allocation is expired or revoked' using errcode='40901';
  end if;
  if not exists(select 1 from public.academic_projects p
    join public.katedra_project_locks l on l.project_id=p.id and l.user_id=p.user_id and l.status='locked'
    join public.entitlements e on e.user_id=l.user_id and e.academic_project_id=p.id
      and e.product_id='katedra_pass_'||l.product_key and e.provider='stripe' and e.status='active' and e.purchase_expires_at>now()
    where p.id=m.project_id and p.user_id=m.user_id and p.deleted_at is null) then
    raise exception 'An active exact project Pass is required' using errcode='42501';
  end if;
  select * into u from public.agent_payload_upload_intents where manifest_id=p_manifest_id and object_kind=p_object_kind for update;
  if found then
    if u.body_sha256<>p_sha256 or u.body_bytes<>p_bytes then raise exception 'Upload identity differs' using errcode='40901'; end if;
    -- Even the same token cannot authorize a second HTTP upload after an
    -- ambiguous start response. Stored bytes may be read and hash-checked.
    return case when u.state='uploaded' then 'stored' else 'uncertain' end;
  end if;
  insert into public.agent_payload_upload_intents(manifest_id,object_kind,upload_token,body_sha256,body_bytes,state)
    values(p_manifest_id,p_object_kind,p_upload_token,p_sha256,p_bytes,'uploading');
  return 'upload';
end $$;


create or replace function public.can_read_agent_payload(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.agent_payload_manifests m
    join public.academic_projects p on p.id=m.project_id and p.user_id=m.user_id and p.deleted_at is null
    where m.user_id=(select auth.uid()) and m.storage_bucket=p_bucket
      and p_path in(m.storage_path,m.manifest_path)
      and (m.material_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or (m.material_consent_version='material-storage-v1' and m.material_consent_at is not null and m.material_upload_complete))
      and m.deleted_at is null and m.content_deleted_at is null and m.expires_at>now()
      and (m.run_id is null or exists(
        select 1 from public.agent_runs r where r.run_id=m.run_id and r.user_id=m.user_id and r.project_id=m.project_id
          and r.snapshot_consent_version='agentic-snapshot-v1' and r.snapshot_consent_at is not null
      ))
  );
$$;
revoke all on function public.can_read_agent_payload(text,text) from public,anon;
grant execute on function public.can_read_agent_payload(text,text) to authenticated;

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
          and e.provider = 'stripe'
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
    and m.material_consent_version='material-storage-v1' and m.material_consent_at is not null and m.material_upload_complete
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

-- Privacy controls remain available after entitlement expiry and tombstoning.
-- Only metadata is exposed; cursor ordering bounds each response to 101 rows.
create or replace function public.list_material_payload_privacy(p_user_id uuid,p_project_id uuid,p_after uuid default null)
returns table(material_id text,manifest_id uuid,created_at timestamptz,expires_at timestamptz,cleanup text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (select auth.uid()) is distinct from p_user_id and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only the owner may inspect material privacy' using errcode='42501';
  end if;
  if not exists(select 1 from public.academic_projects p where p.id=p_project_id and p.user_id=p_user_id and p.deleted_at is null) then
    raise exception 'Project is not owned by this account' using errcode='42501';
  end if;
  return query select m.material_id,m.manifest_id,m.created_at,m.expires_at,
    case when m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now() then 'pending' else 'retained' end
  from public.agent_payload_manifests m where m.user_id=p_user_id and m.project_id=p_project_id
    and (m.content_deleted_at is null or exists(
      select 1 from public.agent_material_run_lineage l join public.agent_payload_manifests related on related.run_id=l.run_id
      where l.manifest_id=m.manifest_id and related.user_id=m.user_id and related.project_id=m.project_id and related.content_deleted_at is null
    )) and (p_after is null or m.manifest_id>p_after)
    and m.material_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  order by m.manifest_id limit 101;
end $$;
revoke all on function public.list_material_payload_privacy(uuid,uuid,uuid) from public,anon;
grant execute on function public.list_material_payload_privacy(uuid,uuid,uuid) to authenticated,service_role;

-- Unlike the legacy deletion RPC, explicit consent withdrawal also stops the
-- dependent run and revokes its temporary copies. Lock the run before the
-- manifest, then recheck binding: concurrent attachment must never escape it.
create or replace function public.withdraw_material_payload_consent(p_user_id uuid,p_project_id uuid,p_material_id text)
returns table(manifest_id uuid,material_id text,storage_bucket text,storage_path text,manifest_path text,deleted_at timestamptz,run_id uuid,revoked_run_ids uuid[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.agent_payload_manifests; observed_run uuid; observed_runs uuid[]; current_runs uuid[]; affected_run uuid;
begin
  if (select auth.uid()) is distinct from p_user_id and coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Consent withdrawal requires the authenticated owner' using errcode='42501';
  end if;
  if p_material_id is null or p_material_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid material identity' using errcode='22023';
  end if;
  if not exists(select 1 from public.academic_projects p where p.id=p_project_id and p.user_id=p_user_id and p.deleted_at is null) then
    raise exception 'Project is not owned by this account' using errcode='42501';
  end if;
  select * into m from public.agent_payload_manifests a where a.user_id=p_user_id and a.project_id=p_project_id and a.material_id=p_material_id;
  if not found then raise exception 'Material was not found' using errcode='P0002'; end if;
  observed_run:=m.run_id;
  select coalesce(array_agg(l.run_id order by l.run_id),'{}'::uuid[]) into observed_runs
    from public.agent_material_run_lineage l where l.manifest_id=m.manifest_id;
  perform 1 from public.agent_runs r where r.run_id=any(observed_runs) and r.user_id=p_user_id and r.project_id=p_project_id order by r.run_id for update;
  select * into m from public.agent_payload_manifests a where a.manifest_id=m.manifest_id for update;
  if not found or m.run_id is distinct from observed_run then
    raise exception 'Material binding changed; retry withdrawal' using errcode='40901';
  end if;
  select coalesce(array_agg(l.run_id order by l.run_id),'{}'::uuid[]) into current_runs
    from public.agent_material_run_lineage l where l.manifest_id=m.manifest_id;
  if current_runs is distinct from observed_runs then
    raise exception 'Material history changed; retry withdrawal' using errcode='40901';
  end if;
  foreach affected_run in array observed_runs loop
    perform public.revoke_agent_run_consent(p_user_id,p_project_id,affected_run);
  end loop;
  update public.agent_payload_manifests a set deleted_at=coalesce(a.deleted_at,now()),
    deletion_requested_at=coalesce(a.deletion_requested_at,now()),updated_at=now() where a.manifest_id=m.manifest_id;
  return query select a.manifest_id,a.material_id,a.storage_bucket,a.storage_path,a.manifest_path,a.deleted_at,a.run_id,observed_runs
    from public.agent_payload_manifests a where a.manifest_id=m.manifest_id;
end $$;
revoke all on function public.withdraw_material_payload_consent(uuid,uuid,text) from public,anon;
grant execute on function public.withdraw_material_payload_consent(uuid,uuid,text) to authenticated,service_role;

-- Keep the lineage discoverable until dependent copies also have confirmed
-- cleanup. Deleting a physically removed original must not hide their queue.
create or replace function public.guard_unresolved_agent_payload_delete()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if (old.content_deleted_at is null and exists(select 1 from public.agent_payload_upload_intents u where u.manifest_id=old.manifest_id))
    or exists(select 1 from public.agent_material_run_lineage l join public.agent_payload_manifests related on related.run_id=l.run_id
      where l.manifest_id=old.manifest_id and related.content_deleted_at is null) then
    raise exception 'Physical payload cleanup must finish before removing its evidence' using errcode='40901';
  end if;
  return old;
end $$;
