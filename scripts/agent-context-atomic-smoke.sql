-- Bacivi PostgreSQL, stvarne RPC funkcije, sintetski Storage metadata i rollback.
\set ON_ERROR_STOP on
begin;
create schema if not exists auth;
create schema if not exists storage;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.academic_projects(id uuid primary key,user_id uuid,deleted_at timestamptz);
create table public.katedra_project_locks(project_id uuid,user_id uuid,status text,product_key text);
create table public.entitlements(user_id uuid,academic_project_id uuid,product_id text,status text,provider text,purchase_expires_at timestamptz);
create table public.agent_runs(run_id uuid primary key,user_id uuid,project_id uuid,status text,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.agent_payload_manifests(manifest_id uuid primary key default gen_random_uuid(),user_id uuid,project_id uuid,run_id uuid,material_id text,storage_bucket text,storage_path text unique,manifest_path text unique,expires_at timestamptz,deleted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant select,insert,update on storage.objects to authenticated;
grant select on public.agent_payload_manifests to authenticated;
create policy fixture_storage_access on storage.objects for all to authenticated using(true) with check(true);
\i supabase/migrations/0082_replace_agent_payloads_for_run.sql
\i supabase/migrations/0104_agent_snapshot_privacy_and_cleanup.sql
\i supabase/migrations/0105_agent_payload_deletion_authority.sql
\i supabase/migrations/0106_atomic_agent_context.sql
\i supabase/migrations/0106_atomic_agent_context.sql
insert into public.academic_projects values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',null);
insert into public.katedra_project_locks values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','locked','diplomski');
insert into public.entitlements values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','katedra_pass_diplomski','active','stripe',now()+interval '1 day');
insert into public.agent_runs(run_id,user_id,project_id,status,snapshot_consent_version,snapshot_consent_at) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','paused','agentic-snapshot-v1',now());
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare x record; y record; z record; active_count integer; begin
  begin
    perform public.reserve_agent_run_context('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
    raise exception 'FOREIGN_RESERVATION_ALLOWED';
  exception when insufficient_privilege then null; end;
  select * into x from public.reserve_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
  begin
    perform public.commit_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',x.manifest_id,'{}');
    raise exception 'MISSING_UPLOAD_COMMITTED';
  exception when sqlstate '40901' then null; end;
  insert into storage.objects(bucket_id,name) values('katedra-temporary-materials',x.storage_path),('katedra-temporary-materials',x.manifest_path);
  perform public.commit_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',x.manifest_id,'{}');
  update storage.objects set name=name where name=x.storage_path;
  if found then raise exception 'IMMUTABLE_CONTEXT_OVERWRITTEN'; end if;
  select * into y from public.reserve_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
  select * into z from public.reserve_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
  insert into storage.objects(bucket_id,name) values('katedra-temporary-materials',y.storage_path),('katedra-temporary-materials',y.manifest_path),('katedra-temporary-materials',z.storage_path),('katedra-temporary-materials',z.manifest_path);
  begin
    perform public.commit_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',y.manifest_id,array['missing-material']);
    raise exception 'BAD_MATERIAL_COMMITTED';
  exception when sqlstate '40901' then null; end;
  if not exists(select 1 from public.agent_payload_manifests where manifest_id=x.manifest_id and deleted_at is null and context_state='active') then raise exception 'OLD_CONTEXT_DAMAGED'; end if;
  perform public.commit_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',y.manifest_id,'{}');
  -- Ponovljen isti commit je siguran; drugi izbor nije isti zahtjev.
  perform public.commit_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',y.manifest_id,'{}');
  begin
    perform public.commit_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',y.manifest_id,array['different']);
    raise exception 'DIFFERENT_REPLAY_ACCEPTED';
  exception when sqlstate '40901' then null; end;
  begin
    perform public.commit_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',z.manifest_id,'{}');
    raise exception 'STALE_CONTEXT_COMMITTED';
  exception when sqlstate '40901' then null; end;
  select count(*) into active_count from public.agent_payload_manifests where material_id='run-context' and context_state='active' and deleted_at is null;
  if active_count<>1 then raise exception 'ACTIVE_CONTEXT_NOT_UNIQUE'; end if;
  if not exists(select 1 from public.agent_payload_manifests where manifest_id=x.manifest_id and deletion_requested_at is not null and content_deleted_at is null) then raise exception 'OLD_CONTEXT_NOT_QUEUED'; end if;
end $$;
create temp table abandoned as select * from public.reserve_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
reset role;
update public.agent_payload_manifests set expires_at=now()-interval '1 minute' where manifest_id=(select manifest_id from abandoned);
set local role authenticated;
do $$ begin
  begin
    insert into storage.objects(bucket_id,name) select 'katedra-temporary-materials',storage_path from abandoned;
    raise exception 'LATE_ORPHAN_UPLOAD_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ begin
  if not exists(select 1 from public.list_pending_agent_payload_deletions() q where q.manifest_id=(select manifest_id from abandoned)) then
    raise exception 'ABANDONED_RESERVATION_NOT_QUEUED';
  end if;
end $$;
select set_config('request.jwt.claim.role','authenticated',true);
update public.agent_runs set snapshot_consent_at=null;
set local role authenticated;
do $$ begin
  begin
    perform public.reserve_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
    raise exception 'MISSING_CONSENT_ALLOWED';
  exception when sqlstate '40901' then null; end;
end $$;
reset role;
update public.agent_runs set snapshot_consent_at=now()-interval '91 days';
set local role authenticated;
do $$ begin
  begin
    perform public.reserve_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
    raise exception 'STALE_CONSENT_ALLOWED';
  exception when sqlstate '40901' then null; end;
end $$;
reset role;
update public.agent_runs set snapshot_consent_at=now();
update public.entitlements set status='expired';
set local role authenticated;
do $$ begin
  begin
    perform public.reserve_agent_run_context('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
    raise exception 'UNPAID_RESERVATION_ALLOWED';
  exception when insufficient_privilege then null; end;
  raise notice 'AGENT_CONTEXT_ATOMIC_SQL_PASS';
end $$;
reset role;
rollback;
