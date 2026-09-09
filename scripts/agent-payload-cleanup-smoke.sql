-- Samo bacivi PostgreSQL: minimalan ulazni shape prije ugovora, stvarne migracije.
-- Ne dokazuje Storage API brisanje. Sve promjene i fixture vracaju se rollbackom.
\set ON_ERROR_STOP on
begin;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if;
end $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;
create table public.agent_runs (
  run_id uuid primary key, user_id uuid not null, project_id uuid not null,
  status text not null, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.agent_payload_manifests (
  manifest_id uuid primary key, user_id uuid not null, project_id uuid not null,
  run_id uuid, material_id text not null, storage_bucket text not null,
  storage_path text not null unique, manifest_path text not null unique,
  expires_at timestamptz not null, deleted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
\i supabase/migrations/0104_agent_snapshot_privacy_and_cleanup.sql
\i supabase/migrations/0105_agent_payload_deletion_authority.sql
-- Ponovna primjena mora zavrsiti istim sigurnim ugovorom.
\i supabase/migrations/0104_agent_snapshot_privacy_and_cleanup.sql
\i supabase/migrations/0105_agent_payload_deletion_authority.sql

insert into public.agent_runs (run_id,user_id,project_id,status) values
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','blocked'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','blocked');
insert into public.agent_payload_manifests (manifest_id,user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at,deleted_at) values
 ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','run-context','fixture','one.json','one-manifest.json',now()+interval '1 day',null),
 ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','legacy','fixture','two.json','two-manifest.json',now()+interval '1 day',now()),
 ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','foreign','fixture','three.json','three-manifest.json',now()+interval '1 day',null);

set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
  begin
    perform public.finalize_agent_run_payload_deletion(
      '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',array['40000000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'AUTH_FINALIZE_ALLOWED: client can claim physical deletion';
  exception when insufficient_privilege then null; end;
  begin
    perform public.finalize_user_agent_payload_deletion(
      '20000000-0000-0000-0000-000000000001',array['40000000-0000-0000-0000-000000000002']::uuid[]);
    raise exception 'AUTH_FINALIZE_ALLOWED: client can claim account payload deletion';
  exception when insufficient_privilege then null; end;
  begin
    perform public.request_user_agent_payload_deletion('20000000-0000-0000-0000-000000000002');
    raise exception 'FOREIGN_DELETE_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Stari tombstone mora se dohvatiti i prije isteka, bez novog zahtjeva korisnika.
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$ declare found_ids uuid[]; begin
  select array_agg(manifest_id) into found_ids from public.list_pending_agent_payload_deletions();
  if found_ids is distinct from array['40000000-0000-0000-0000-000000000002']::uuid[] then
    raise exception 'LEGACY_TOMBSTONE_NOT_RECOVERED';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$ declare n integer; begin
  select count(*) into n from public.request_agent_run_payload_deletion(
    '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
  if n <> 2 then raise exception 'OWNER_REQUEST_FAILED'; end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.agent_payload_manifests where content_deleted_at is not null) then
    raise exception 'REQUEST_IS_NOT_PHYSICAL_DELETE';
  end if;
end $$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.record_agent_payload_deletion_failure(array['40000000-0000-0000-0000-000000000001']::uuid[],'storage_delete_failed');
select * from public.list_pending_agent_payload_deletions();
select * from public.finalize_agent_payload_deletions(array['40000000-0000-0000-0000-000000000001']::uuid[]);
reset role;
do $$ begin
  if (select payload_cleanup_status from public.agent_runs where run_id='10000000-0000-0000-0000-000000000001') = 'deleted' then
    raise exception 'PARTIAL_DELETE_MARKED_COMPLETE';
  end if;
end $$;
set local role service_role;
do $$ declare n integer; begin
  select deleted into n from public.finalize_agent_payload_deletions(array['40000000-0000-0000-0000-000000000002']::uuid[]);
  if n <> 1 then raise exception 'FINALIZE_FAILED'; end if;
  select deleted into n from public.finalize_agent_payload_deletions(array['40000000-0000-0000-0000-000000000002']::uuid[]);
  if n <> 0 then raise exception 'FINALIZE_NOT_IDEMPOTENT'; end if;
end $$;
reset role;
do $$ begin
  if (select payload_cleanup_status from public.agent_runs where run_id='10000000-0000-0000-0000-000000000001') <> 'deleted' then
    raise exception 'COMPLETE_DELETE_NOT_RECORDED';
  end if;
  if exists(select 1 from public.agent_payload_manifests where manifest_id='40000000-0000-0000-0000-000000000003' and (deleted_at is not null or content_deleted_at is not null)) then
    raise exception 'FOREIGN_CONTENT_CHANGED';
  end if;
  raise notice 'AGENT_PAYLOAD_CLEANUP_SQL_PASS';
end $$;
rollback;
