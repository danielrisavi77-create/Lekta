-- Storage writes blobs before committing metadata. Public upload intents track
-- this uncertainty; neither a timeout nor an empty Storage.remove proves absence.
alter table public.agent_payload_manifests add column if not exists upload_protocol_version smallint;
update public.agent_payload_manifests set upload_protocol_version=0 where upload_protocol_version is null;
alter table public.agent_payload_manifests alter column upload_protocol_version set default 1;
alter table public.agent_payload_manifests alter column upload_protocol_version set not null;
create table if not exists public.agent_payload_upload_intents (
  manifest_id uuid not null references public.agent_payload_manifests(manifest_id) on delete cascade,
  object_kind text not null check(object_kind in ('body','manifest')),
  upload_token uuid not null,
  body_sha256 text not null check(body_sha256 ~ '^[0-9a-f]{64}$'),
  body_bytes bigint not null check(body_bytes between 0 and 33554432),
  state text not null check(state in ('uploading','uploaded','uncertain')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_checked_at timestamptz,
  primary key(manifest_id,object_kind)
);
alter table public.agent_payload_upload_intents enable row level security;
revoke all on public.agent_payload_upload_intents from public,anon,authenticated,service_role;
grant select on public.agent_payload_upload_intents to service_role;

-- Do not infer terminal upload evidence for pre-contract objects. Existing
-- non-deleted run payloads require reconciliation; no legacy bytes are rewritten.
insert into public.agent_payload_upload_intents(manifest_id,object_kind,upload_token,body_sha256,body_bytes,state)
select m.manifest_id,k.kind,gen_random_uuid(),repeat('0',64),0,'uncertain'
from public.agent_payload_manifests m cross join (values('body'),('manifest')) k(kind)
where m.run_id is not null and m.content_deleted_at is null and m.upload_protocol_version=0
on conflict do nothing;

create or replace function public.guard_agent_payload_retention()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.expires_at is null or new.expires_at>now()+interval '72 hours' then
      raise exception 'Payload retention exceeds 72 hours' using errcode='22023';
    end if;
  else
    if (old.deleted_at is not null and new.deleted_at is null)
      or (old.content_deleted_at is not null and new.content_deleted_at is null) then
      raise exception 'Revoked payloads cannot be reopened' using errcode='40901';
    end if;
    if row(new.user_id,new.project_id,new.material_id,new.storage_bucket,new.storage_path,new.manifest_path,new.created_at,new.upload_protocol_version)
      is distinct from row(old.user_id,old.project_id,old.material_id,old.storage_bucket,old.storage_path,old.manifest_path,old.created_at,old.upload_protocol_version) then
      raise exception 'Payload identity is immutable' using errcode='40901';
    end if;
    if new.expires_at>old.expires_at and not(
      old.context_state='pending' and new.context_state='active' and new.context_revision=old.context_revision
      and new.expires_at=old.context_expires_at and new.expires_at<=old.created_at+interval '72 hours'
    ) then raise exception 'Payload retention cannot be extended' using errcode='40901'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_payload_retention() from public,anon,authenticated;
drop trigger if exists agent_payload_retention_guard on public.agent_payload_manifests;
create trigger agent_payload_retention_guard before insert or update on public.agent_payload_manifests
for each row execute function public.guard_agent_payload_retention();

create or replace function public.guard_unresolved_agent_payload_delete()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.content_deleted_at is null and exists(select 1 from public.agent_payload_upload_intents u where u.manifest_id=old.manifest_id) then
    raise exception 'Physical payload cleanup must finish before removing its evidence' using errcode='40901';
  end if;
  return old;
end $$;
revoke all on function public.guard_unresolved_agent_payload_delete() from public,anon,authenticated;
drop trigger if exists agent_payload_unresolved_delete_guard on public.agent_payload_manifests;
create trigger agent_payload_unresolved_delete_guard before delete on public.agent_payload_manifests
for each row execute function public.guard_unresolved_agent_payload_delete();

create or replace function public.reserve_agent_result_payload(
  p_user_id uuid,p_project_id uuid,p_run_id uuid,p_step_id uuid,p_attempt integer
) returns table(manifest_id uuid,storage_path text,manifest_path text,created_at timestamptz,expires_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.agent_runs; m public.agent_payload_manifests; target_path text; target_material text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only the service may allocate agent results' using errcode='42501';
  end if;
  select * into r from public.agent_runs where run_id=p_run_id and user_id=p_user_id and project_id=p_project_id for update;
  if not found or r.snapshot_consent_version is distinct from 'agentic-snapshot-v1' or r.snapshot_consent_at is null
    or r.status not in ('pending','running','paused','blocked') then raise exception 'Run result consent is unavailable' using errcode='40901'; end if;
  if p_attempt is null or p_attempt not between 1 and 3 or not exists(select 1 from public.agent_steps s
    where s.step_id=p_step_id and s.run_id=p_run_id and s.attempt=p_attempt and s.status in ('running','verified','failed')) then
    raise exception 'Result step identity is invalid' using errcode='40901';
  end if;
  if not exists(select 1 from public.academic_projects p
    join public.katedra_project_locks l on l.project_id=p.id and l.user_id=p.user_id and l.status='locked'
    join public.entitlements e on e.user_id=l.user_id and e.academic_project_id=p.id
      and e.product_id='katedra_pass_'||l.product_key and e.provider='stripe' and e.status='active' and e.purchase_expires_at>now()
    where p.id=p_project_id and p.user_id=p_user_id and p.deleted_at is null) then
    raise exception 'An active exact project Pass is required' using errcode='42501';
  end if;
  target_path:=p_user_id::text||'/'||p_project_id::text||'/'||p_run_id::text||'/results/'||p_step_id::text||'-'||p_attempt::text||'.json';
  target_material:='agent-result:'||p_step_id::text||':'||p_attempt::text;
  select * into m from public.agent_payload_manifests p where p.storage_path=target_path for update;
  if found then
    if m.user_id is distinct from p_user_id or m.project_id is distinct from p_project_id or m.run_id is distinct from p_run_id
      or m.material_id<>target_material or m.deleted_at is not null or m.content_deleted_at is not null or m.expires_at<=now() or m.upload_protocol_version<>1 then
      raise exception 'Result allocation is unavailable' using errcode='40901';
    end if;
  else
    insert into public.agent_payload_manifests(user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at)
    values(p_user_id,p_project_id,p_run_id,target_material,'katedra-temporary-materials',target_path,left(target_path,length(target_path)-5)||'.manifest.json',now()+interval '72 hours') returning * into m;
  end if;
  return query select m.manifest_id,m.storage_path,m.manifest_path,m.created_at,m.expires_at;
end $$;
revoke all on function public.reserve_agent_result_payload(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_agent_result_payload(uuid,uuid,uuid,uuid,integer) to service_role;

create or replace function public.begin_agent_payload_upload(
  p_manifest_id uuid,p_object_kind text,p_upload_token uuid,p_sha256 text,p_bytes bigint
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.agent_payload_manifests; r public.agent_runs; u public.agent_payload_upload_intents;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only the service may authorize payload uploads' using errcode='42501';
  end if;
  if p_object_kind not in ('body','manifest') or p_object_kind is null or p_upload_token is null
    or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes not between 0 and 33554432 then
    raise exception 'Invalid upload identity' using errcode='22023';
  end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id;
  if not found or m.run_id is null then raise exception 'Run payload is missing' using errcode='40901'; end if;
  -- All upload/finalization paths use run -> manifest -> intent lock order.
  select * into r from public.agent_runs where run_id=m.run_id and user_id=m.user_id and project_id=m.project_id for update;
  if not found or r.snapshot_consent_version is distinct from 'agentic-snapshot-v1'
    or r.snapshot_consent_at is null or r.status not in ('initializing','pending','running','paused','blocked') then
    raise exception 'Run consent is absent or revoked' using errcode='40901';
  end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id for update;
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

create or replace function public.finish_agent_payload_upload(
  p_manifest_id uuid,p_object_kind text,p_upload_token uuid,p_succeeded boolean
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.agent_payload_manifests; u public.agent_payload_upload_intents; object_path text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only the service may acknowledge uploads' using errcode='42501';
  end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id;
  if not found then raise exception 'Payload is missing' using errcode='40901'; end if;
  perform 1 from public.agent_runs where run_id=m.run_id for update;
  perform 1 from public.agent_payload_manifests where manifest_id=p_manifest_id for update;
  select * into u from public.agent_payload_upload_intents where manifest_id=p_manifest_id and object_kind=p_object_kind for update;
  if not found or u.upload_token is distinct from p_upload_token then raise exception 'Upload token mismatch' using errcode='40901'; end if;
  if u.state='uploaded' then return 'uploaded'; end if;
  object_path:=case when p_object_kind='body' then m.storage_path else m.manifest_path end;
  if p_succeeded is true and not exists(select 1 from storage.objects where bucket_id=m.storage_bucket and name=object_path) then
    raise exception 'Successful upload metadata is absent' using errcode='40901';
  end if;
  -- Late success is recorded after revocation: the object must remain
  -- discoverable for cleanup, while restrictive reads keep it inaccessible.
  update public.agent_payload_upload_intents set state=case when p_succeeded is true then 'uploaded' else 'uncertain' end,
    completed_at=case when p_succeeded is true then now() else null end
    where manifest_id=p_manifest_id and object_kind=p_object_kind;
  return case when p_succeeded is true then 'uploaded' else 'uncertain' end;
end $$;

create or replace function public.agent_payload_deletion_ready(p_manifest_ids uuid[])
returns table(manifest_id uuid) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only the service may inspect physical deletion readiness' using errcode='42501';
  end if;
  return query select m.manifest_id from public.agent_payload_manifests m
    where m.manifest_id=any(coalesce(p_manifest_ids,'{}'::uuid[])) and m.deleted_at is not null and m.content_deleted_at is null
      and not exists(select 1 from public.agent_payload_upload_intents u where u.manifest_id=m.manifest_id and u.state<>'uploaded');
end $$;

create or replace function public.claim_agent_payload_upload_reconciliation(p_limit integer default 20)
returns table(manifest_id uuid,object_kind text,upload_token uuid,body_sha256 text,body_bytes bigint,storage_bucket text,storage_path text,storage_version text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Only service may reconcile uploads' using errcode='42501'; end if;
  return query with candidates as (
    select u.manifest_id,u.object_kind from public.agent_payload_upload_intents u
    join public.agent_payload_manifests m on m.manifest_id=u.manifest_id
    where u.state<>'uploaded' and m.upload_protocol_version=1 and m.content_deleted_at is null
      and (u.last_checked_at is null or u.last_checked_at<now()-interval '1 minute')
    order by u.last_checked_at asc nulls first,u.started_at,u.manifest_id,u.object_kind
    limit greatest(0,least(coalesce(p_limit,20),20)) for update of u skip locked
  ), claimed as (
    update public.agent_payload_upload_intents u set last_checked_at=now() from candidates c
    where u.manifest_id=c.manifest_id and u.object_kind=c.object_kind returning u.*
  ) select c.manifest_id,c.object_kind,c.upload_token,c.body_sha256,c.body_bytes,m.storage_bucket,
    case when c.object_kind='body' then m.storage_path else m.manifest_path end,o.version
    from claimed c join public.agent_payload_manifests m on m.manifest_id=c.manifest_id
    left join storage.objects o on o.bucket_id=m.storage_bucket and o.name=case when c.object_kind='body' then m.storage_path else m.manifest_path end;
end $$;

create or replace function public.confirm_agent_payload_upload(
  p_manifest_id uuid,p_object_kind text,p_upload_token uuid,p_sha256 text,p_bytes bigint,p_storage_version text
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.agent_payload_manifests; u public.agent_payload_upload_intents; target_path text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Only service may confirm upload evidence' using errcode='42501'; end if;
  select * into m from public.agent_payload_manifests where manifest_id=p_manifest_id;
  if not found or m.upload_protocol_version<>1 then raise exception 'Upload protocol is not recoverable' using errcode='40901'; end if;
  perform 1 from public.agent_runs where run_id=m.run_id for update;
  perform 1 from public.agent_payload_manifests where manifest_id=p_manifest_id for update;
  select * into u from public.agent_payload_upload_intents where manifest_id=p_manifest_id and object_kind=p_object_kind for update;
  if not found or u.upload_token is distinct from p_upload_token or u.body_sha256 is distinct from p_sha256 or u.body_bytes is distinct from p_bytes then
    raise exception 'Upload evidence identity differs' using errcode='40901';
  end if;
  target_path:=case when p_object_kind='body' then m.storage_path else m.manifest_path end;
  if nullif(p_storage_version,'') is null or not exists(select 1 from storage.objects o
    where o.bucket_id=m.storage_bucket and o.name=target_path and o.version=p_storage_version) then
    raise exception 'Storage version changed during evidence verification' using errcode='40901';
  end if;
  update public.agent_payload_upload_intents set state='uploaded',completed_at=coalesce(completed_at,now())
    where manifest_id=p_manifest_id and object_kind=p_object_kind;
  return 'uploaded';
end $$;

-- Ready work has its own limit: uncertain/legacy uploads cannot monopolize the
-- oldest 500 queue slots. Reconciliation above rotates a separate bounded batch.
create or replace function public.list_pending_agent_payload_deletions(p_now timestamptz default now())
returns table(manifest_id uuid,storage_bucket text,storage_path text,manifest_path text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception 'Only service may list pending deletions' using errcode='42501'; end if;
  return query with candidates as (
    select m.manifest_id from public.agent_payload_manifests m
    where m.content_deleted_at is null and (m.deleted_at is not null or m.deletion_requested_at is not null or m.expires_at<=p_now)
      and not exists(select 1 from public.agent_payload_upload_intents u where u.manifest_id=m.manifest_id and u.state<>'uploaded')
    order by m.expires_at,m.created_at,m.manifest_id limit 500 for update skip locked
  ) update public.agent_payload_manifests m set deleted_at=coalesce(m.deleted_at,p_now),deletion_requested_at=coalesce(m.deletion_requested_at,p_now),deletion_error=null,updated_at=p_now
    from candidates c where m.manifest_id=c.manifest_id
    returning m.manifest_id,m.storage_bucket,m.storage_path,m.manifest_path;
end $$;

create or replace function public.ack_agent_payload_storage_removal(p_manifest_ids uuid[],p_now timestamptz)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare affected integer; run_ids uuid[];
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only the service may finalize physical deletion' using errcode='42501';
  end if;
  select array_agg(distinct m.run_id) into run_ids from public.agent_payload_manifests m where m.manifest_id=any(coalesce(p_manifest_ids,'{}'::uuid[]));
  perform 1 from public.agent_runs r where r.run_id=any(run_ids) order by r.run_id for update;
  perform 1 from public.agent_payload_manifests m where m.manifest_id=any(coalesce(p_manifest_ids,'{}'::uuid[])) order by m.manifest_id for update;
  update public.agent_payload_manifests m set content_deleted_at=p_now,deletion_error=null,updated_at=p_now
    where m.manifest_id in(select d.manifest_id from public.agent_payload_deletion_ready(p_manifest_ids) d);
  get diagnostics affected=row_count;
  update public.agent_runs r set payload_cleanup_status='deleted',payload_deleted_at=coalesce(payload_deleted_at,p_now),payload_cleanup_error=null,updated_at=p_now
    where r.run_id=any(run_ids) and r.status in ('completed','blocked','failed','cancelled')
      and not exists(select 1 from public.agent_payload_manifests m where m.run_id=r.run_id and m.content_deleted_at is null);
  return affected;
end $$;

create or replace function public.finalize_agent_payload_deletions(p_manifest_ids uuid[],p_now timestamptz default now())
returns table(deleted integer) language sql security definer set search_path=public,pg_temp as $$
  select public.ack_agent_payload_storage_removal(p_manifest_ids,p_now);
$$;
create or replace function public.finalize_agent_run_payload_deletion(p_user_id uuid,p_project_id uuid,p_run_id uuid,p_manifest_ids uuid[])
returns table(deleted integer) language sql security definer set search_path=public,pg_temp as $$
  select public.ack_agent_payload_storage_removal(array(select m.manifest_id from public.agent_payload_manifests m
    where m.user_id=p_user_id and m.project_id=p_project_id and m.run_id=p_run_id and m.manifest_id=any(coalesce(p_manifest_ids,'{}'::uuid[]))),now());
$$;
create or replace function public.finalize_user_agent_payload_deletion(p_user_id uuid,p_manifest_ids uuid[],p_now timestamptz default now())
returns table(deleted integer) language sql security definer set search_path=public,pg_temp as $$
  select public.ack_agent_payload_storage_removal(array(select m.manifest_id from public.agent_payload_manifests m
    where m.user_id=p_user_id and m.manifest_id=any(coalesce(p_manifest_ids,'{}'::uuid[]))),p_now);
$$;

-- Only trusted server uploads participate in this protocol. Clients may still
-- upload unbound materials under their existing policy until that separate
-- allocation contract is migrated. This policy never grants upload permission.
-- Signed URLs outlive RLS revocation, so temporary content cannot mint them.
-- The operation helper is a supported Storage contract, checked on staging.
drop policy if exists agent_payload_no_signed_urls on storage.objects;
create policy agent_payload_no_signed_urls on storage.objects as restrictive for select to authenticated
using(bucket_id<>'katedra-temporary-materials' or storage.allow_any_operation(array[
  'object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info',
  'object.list','object.list_v2','object.delete','object.delete_many'
]));
drop policy if exists agent_run_server_upload_only on storage.objects;
create policy agent_run_server_upload_only on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'katedra-temporary-materials' or array_length(string_to_array(name,'/'),1)<=3);
drop policy if exists agent_run_no_client_overwrite on storage.objects;
create policy agent_run_no_client_overwrite on storage.objects as restrictive for update to authenticated
using(bucket_id<>'katedra-temporary-materials' or array_length(string_to_array(name,'/'),1)<=3)
with check(bucket_id<>'katedra-temporary-materials' or array_length(string_to_array(name,'/'),1)<=3);

revoke all on function public.begin_agent_payload_upload(uuid,text,uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.finish_agent_payload_upload(uuid,text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.agent_payload_deletion_ready(uuid[]) from public,anon,authenticated;
revoke all on function public.ack_agent_payload_storage_removal(uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.begin_agent_payload_upload(uuid,text,uuid,text,bigint) to service_role;
grant execute on function public.finish_agent_payload_upload(uuid,text,uuid,boolean) to service_role;
grant execute on function public.agent_payload_deletion_ready(uuid[]) to service_role;
revoke all on function public.claim_agent_payload_upload_reconciliation(integer) from public,anon,authenticated;
revoke all on function public.confirm_agent_payload_upload(uuid,text,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.claim_agent_payload_upload_reconciliation(integer) to service_role;
grant execute on function public.confirm_agent_payload_upload(uuid,text,uuid,text,bigint,text) to service_role;
-- Existing finalizer grants are preserved by CREATE OR REPLACE.
