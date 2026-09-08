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
create table public.agent_runs(run_id uuid primary key,user_id uuid,project_id uuid,status text,cancelled_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.agent_steps(step_id uuid primary key,run_id uuid,attempt smallint,status text);
create table public.agent_payload_manifests(manifest_id uuid primary key default gen_random_uuid(),user_id uuid,project_id uuid,run_id uuid,material_id text,storage_bucket text,storage_path text unique,manifest_path text unique,expires_at timestamptz,deleted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,version text default 'fixture-version',unique(bucket_id,name));
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
\i supabase/migrations/0107_agent_context_plan_approval.sql
\i supabase/migrations/0107_agent_context_plan_approval.sql
\i supabase/migrations/0111_revoke_agent_run_consent.sql
\i supabase/migrations/0111_revoke_agent_run_consent.sql
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
  begin
    perform public.approve_agent_run_context_plan('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',x.context_revision,repeat('a',64),false);
    raise exception 'IMPLICIT_APPROVAL_ACCEPTED';
  exception when invalid_parameter_value then null; end;
  perform public.approve_agent_run_context_plan('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',x.context_revision,repeat('a',64),true);
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
  if exists(select 1 from public.agent_payload_manifests where manifest_id=y.manifest_id and context_plan_approval is not null) then raise exception 'NEW_CONTEXT_INHERITED_APPROVAL'; end if;
  begin
    perform public.approve_agent_run_context_plan('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',x.context_revision,repeat('a',64),true);
    raise exception 'STALE_APPROVAL_ACCEPTED';
  exception when sqlstate '40901' then null; end;
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
-- Withdrawal remains available after Pass expiry and atomically revokes every context.
update public.agent_runs set status='running';
set local role authenticated;
select * from public.revoke_agent_run_consent('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
do $$ begin
  if exists(select 1 from storage.objects where bucket_id='katedra-temporary-materials') then
    raise exception 'REVOKED_CONTENT_READABLE_THROUGH_STORAGE';
  end if;
end $$;
select * from public.revoke_agent_run_consent('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    perform public.revoke_agent_run_consent('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
    raise exception 'FOREIGN_CONSENT_REVOCATION_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.agent_runs where status<>'cancelled' or snapshot_consent_at is not null or snapshot_consent_version is not null) then
    raise exception 'CONSENT_REVOCATION_INCOMPLETE';
  end if;
  if exists(select 1 from public.agent_payload_manifests where deleted_at is null and content_deleted_at is null) then
    raise exception 'CONSENT_REVOCATION_LEFT_ACCESSIBLE_PAYLOAD';
  end if;
  if not exists(select 1 from public.agent_payload_manifests where content_deleted_at is null and deletion_requested_at is not null) then
    raise exception 'REVOCATION_PRETENDED_PHYSICAL_DELETION';
  end if;
  if has_function_privilege('anon','public.revoke_agent_run_consent(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'ANON_REVOCATION_ALLOWED';
  end if;
  begin
    insert into public.agent_payload_manifests(user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at)
      values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','late-result','katedra-temporary-materials','late-result','late-result.manifest',now()+interval '1 hour');
    raise exception 'PAYLOAD_REGISTERED_AFTER_REVOCATION';
  exception when sqlstate '40901' then null; end;
  raise notice 'AGENT_CONSENT_REVOCATION_SQL_PASS';
end $$;
-- The new upload contract is applied after the legacy context fixture so the
-- earlier assertions retain their original authenticated Storage contract.
create or replace function storage.allow_any_operation(expected_operations text[]) returns boolean language sql stable as $$
  select regexp_replace(coalesce(current_setting('storage.operation',true),''),'^storage\.','')=any(expected_operations);
$$;
alter default privileges in schema public grant all on tables to service_role;
\i supabase/migrations/0112_agent_payload_upload_intents.sql
\i supabase/migrations/0112_agent_payload_upload_intents.sql
select set_config('request.jwt.claim.role','service_role',true);
insert into public.agent_runs(run_id,user_id,project_id,status,snapshot_consent_version,snapshot_consent_at)
values('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','running','agentic-snapshot-v1',now());
insert into public.agent_payload_manifests(manifest_id,user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at)
values('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','agent-result:upload:1','katedra-temporary-materials',
'20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000002/results/upload-1.json',
'20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000002/results/upload-1.manifest.json',now()+interval '1 hour');
update public.entitlements set status='active';
insert into storage.objects(bucket_id,name) select storage_bucket,storage_path from public.agent_payload_manifests where manifest_id='40000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('storage.operation','object.sign',true);
do $$ begin
  if exists(select 1 from storage.objects where name like '%/10000000-0000-0000-0000-000000000002/%') then raise exception 'SIGNED_URL_MINTING_ALLOWED'; end if;
end $$;
select set_config('storage.operation','storage.object.get_authenticated',true);
do $$ begin
  if not exists(select 1 from storage.objects where name like '%/10000000-0000-0000-0000-000000000002/%') then raise exception 'AUTHENTICATED_DOWNLOAD_DENIED'; end if;
end $$;
reset role;
delete from storage.objects where name like '%/10000000-0000-0000-0000-000000000002/%';
insert into public.agent_steps values('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',1,'running');
-- More uncertain uploads than the cleanup batch size must not starve ready work.
insert into public.agent_payload_manifests(user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at)
select '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','agent-result:uncertain-'||i||':1','katedra-temporary-materials',
'20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000002/results/uncertain-'||i||'.json',
'20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000002/results/uncertain-'||i||'.manifest.json',now()-interval '1 minute'
from generate_series(1,501) i;
insert into public.agent_payload_upload_intents(manifest_id,object_kind,upload_token,body_sha256,body_bytes,state,started_at)
select manifest_id,'body',gen_random_uuid(),repeat('a',64),50,'uncertain',now()-interval '2 minutes'
from public.agent_payload_manifests where material_id like 'agent-result:uncertain-%';
do $$ declare first_allocation record; replay record; begin
  select * into first_allocation from public.reserve_agent_result_payload('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001',1);
  select * into replay from public.reserve_agent_result_payload('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001',1);
  if first_allocation.manifest_id<>replay.manifest_id or first_allocation.expires_at<>replay.expires_at or first_allocation.created_at<>replay.created_at then raise exception 'RESULT_ALLOCATION_CHANGED_ON_REPLAY'; end if;
  if first_allocation.expires_at>first_allocation.created_at+interval '72 hours' then raise exception 'RESULT_RETENTION_TOO_LONG'; end if;
end $$;
do $$ begin
  begin
    update public.agent_payload_manifests set expires_at=now()+interval '2 hours' where manifest_id='40000000-0000-0000-0000-000000000001';
    raise exception 'RETENTION_EXTENDED_ON_RETRY';
  exception when sqlstate '40901' then null; end;
  if public.begin_agent_payload_upload('40000000-0000-0000-0000-000000000001','body','50000000-0000-0000-0000-000000000001',repeat('a',64),50)<>'upload' then raise exception 'UPLOAD_NOT_AUTHORIZED'; end if;
  if public.begin_agent_payload_upload('40000000-0000-0000-0000-000000000001','body','50000000-0000-0000-0000-000000000001',repeat('a',64),50)<>'uncertain' then raise exception 'UPLOAD_REISSUED'; end if;
  begin
    perform public.begin_agent_payload_upload('40000000-0000-0000-0000-000000000001','body','50000000-0000-0000-0000-000000000001',repeat('b',64),50);
    raise exception 'UPLOAD_IDENTITY_REUSED';
  exception when sqlstate '40901' then null; end;
end $$;
select * from public.revoke_agent_run_consent('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002');
do $$ begin
  if not exists(select 1 from public.list_pending_agent_payload_deletions() where storage_path like '%/60000000-0000-0000-0000-000000000001-1.json') then raise exception 'UNCERTAIN_UPLOADS_STARVED_READY_QUEUE'; end if;
end $$;
create temp table first_recovery_batch as select * from public.claim_agent_payload_upload_reconciliation();
create temp table second_recovery_batch as select * from public.claim_agent_payload_upload_reconciliation();
do $$ begin
  if (select count(*) from first_recovery_batch)<>20 or (select count(*) from second_recovery_batch)<>20 then raise exception 'RECOVERY_BATCH_NOT_BOUNDED'; end if;
  if exists(select 1 from first_recovery_batch a join second_recovery_batch b using(manifest_id,object_kind)) then raise exception 'RECOVERY_BATCH_DID_NOT_ROTATE'; end if;
end $$;
do $$ begin
  begin
    update public.agent_payload_manifests set deleted_at=null where manifest_id='40000000-0000-0000-0000-000000000001';
    raise exception 'REVOKED_PAYLOAD_REOPENED';
  exception when sqlstate '40901' then null; end;
  if exists(select 1 from public.agent_payload_deletion_ready(array['40000000-0000-0000-0000-000000000001'::uuid])) then raise exception 'INFLIGHT_UPLOAD_READY_FOR_DELETE'; end if;
  perform public.finalize_agent_payload_deletions(array['40000000-0000-0000-0000-000000000001'::uuid]);
  if exists(select 1 from public.agent_payload_manifests where manifest_id='40000000-0000-0000-0000-000000000001' and content_deleted_at is not null) then raise exception 'INFLIGHT_UPLOAD_FALSELY_DELETED'; end if;
  begin
    perform public.begin_agent_payload_upload('40000000-0000-0000-0000-000000000001','manifest','50000000-0000-0000-0000-000000000002',repeat('a',64),50);
    raise exception 'SECOND_UPLOAD_STARTED_AFTER_REVOCATION';
  exception when sqlstate '40901' then null; end;
end $$;
-- Simulate a successful late Storage completion; it stays unreadable, but must
-- remain discoverable for the service's subsequent deletion (no Storage trigger).
insert into storage.objects(bucket_id,name) select storage_bucket,storage_path from public.agent_payload_manifests where manifest_id='40000000-0000-0000-0000-000000000001';
select public.finish_agent_payload_upload('40000000-0000-0000-0000-000000000001','body','50000000-0000-0000-0000-000000000001',false);
do $$ begin
  begin
    perform public.confirm_agent_payload_upload('40000000-0000-0000-0000-000000000001','body','50000000-0000-0000-0000-000000000001',repeat('b',64),50,'fixture-version');
    raise exception 'MISMATCHING_RECOVERY_EVIDENCE_ACCEPTED';
  exception when sqlstate '40901' then null; end;
  if public.confirm_agent_payload_upload('40000000-0000-0000-0000-000000000001','body','50000000-0000-0000-0000-000000000001',repeat('a',64),50,'fixture-version')<>'uploaded' then raise exception 'LATE_UPLOAD_NOT_RECOVERED'; end if;
end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from storage.objects) then raise exception 'LATE_UPLOAD_READABLE'; end if;
  begin
    insert into storage.objects(bucket_id,name) values('katedra-temporary-materials','20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000002/results/bypass.json');
    raise exception 'DIRECT_UPLOAD_BYPASSED_INTENT';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.agent_payload_deletion_ready(array['40000000-0000-0000-0000-000000000001'::uuid])) then raise exception 'FINISHED_UPLOAD_NOT_READY'; end if;
end $$;
-- SQL fixture only: actual staging must remove through Storage API.
delete from storage.objects where name like '%/10000000-0000-0000-0000-000000000002/%';
select * from public.finalize_agent_run_payload_deletion('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',array['40000000-0000-0000-0000-000000000001'::uuid]);
-- The second result allocation never authorized any upload; it can also be finalized.
select * from public.finalize_agent_payload_deletions(array(select manifest_id from public.agent_payload_manifests where run_id='10000000-0000-0000-0000-000000000002'));
do $$ begin
  if not exists(select 1 from public.agent_payload_manifests where manifest_id='40000000-0000-0000-0000-000000000001' and content_deleted_at is not null) then raise exception 'CONFIRMED_REMOVAL_NOT_FINALIZED'; end if;
  if exists(select 1 from public.agent_runs where run_id='10000000-0000-0000-0000-000000000002' and payload_cleanup_status='deleted') then raise exception 'UNKNOWN_UPLOADS_FALSELY_FINALIZED'; end if;
  begin
    delete from public.agent_payload_manifests where material_id='agent-result:uncertain-1:1';
    raise exception 'UNRESOLVED_UPLOAD_EVIDENCE_ERASED';
  exception when sqlstate '40901' then null; end;
  if has_table_privilege('service_role','public.agent_payload_upload_intents','UPDATE') then raise exception 'SERVICE_CAN_BYPASS_UPLOAD_RPC'; end if;
  if has_function_privilege('authenticated','public.begin_agent_payload_upload(uuid,text,uuid,text,bigint)','EXECUTE') then raise exception 'OWNER_CAN_FORGE_UPLOAD_START'; end if;
  if has_function_privilege('authenticated','public.finish_agent_payload_upload(uuid,text,uuid,boolean)','EXECUTE') then raise exception 'OWNER_CAN_FORGE_UPLOAD_COMPLETION'; end if;
  raise notice 'AGENT_UPLOAD_INTENT_SQL_PASS';
end $$;
delete from public.agent_payload_manifests where manifest_id='40000000-0000-0000-0000-000000000001';
do $$ begin
  if exists(select 1 from public.agent_payload_upload_intents where manifest_id='40000000-0000-0000-0000-000000000001') then raise exception 'CLEANED_UPLOAD_EVIDENCE_DID_NOT_CASCADE'; end if;
end $$;
rollback;
