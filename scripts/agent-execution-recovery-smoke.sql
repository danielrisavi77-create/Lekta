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
create table public.agent_steps(step_id uuid primary key,run_id uuid,attempt smallint,status text,
  lease_owner text not null default 'fixture-worker', claimed_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default now()+interval '5 minutes');
create table public.agent_payload_manifests(manifest_id uuid primary key default gen_random_uuid(),user_id uuid,project_id uuid,run_id uuid,material_id text,storage_bucket text,storage_path text unique,manifest_path text unique,expires_at timestamptz,deleted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,version text default 'fixture-version',unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated;
grant execute on function auth.uid() to authenticated;
grant select,insert,update on storage.objects to authenticated;
grant select on public.agent_payload_manifests to authenticated;
create policy fixture_storage_access on storage.objects for all to authenticated using(true) with check(true);
create table auth.users(id uuid primary key);
create table public.katedra_wallets(user_id uuid primary key,balance bigint,updated_at timestamptz default now());
create table public.katedra_usage(user_id uuid,model text,input_tokens integer,output_tokens integer,charged bigint);
\i supabase/migrations/0068_katedra_billing_v2.sql
\i supabase/migrations/0083_billing_pending_marker.sql
\i supabase/migrations/0082_replace_agent_payloads_for_run.sql
\i supabase/migrations/0104_agent_snapshot_privacy_and_cleanup.sql
\i supabase/migrations/0105_agent_payload_deletion_authority.sql
\i supabase/migrations/0106_atomic_agent_context.sql
\i supabase/migrations/0107_agent_context_plan_approval.sql
\i supabase/migrations/0109_katedra_billing_reconciliation.sql
\i supabase/migrations/0110_katedra_billing_usage_evidence.sql
\i supabase/migrations/0111_revoke_agent_run_consent.sql
create or replace function storage.allow_any_operation(expected_operations text[]) returns boolean language sql stable as $$
  select regexp_replace(coalesce(current_setting('storage.operation',true),''),'^storage\.','')=any(expected_operations);
$$;
\i supabase/migrations/0112_agent_payload_upload_intents.sql
\i supabase/migrations/0113_material_payload_custody.sql
\i supabase/migrations/0114_agent_provider_execution_recovery.sql
\i supabase/migrations/0114_agent_provider_execution_recovery.sql
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
insert into auth.users values('20000000-0000-0000-0000-000000000001');
insert into public.academic_projects values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',null);
insert into public.katedra_project_locks values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','locked','diplomski');
insert into public.entitlements values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','katedra_pass_diplomski','active','stripe',now()+interval '1 day');
insert into public.katedra_wallets(user_id,balance) values('20000000-0000-0000-0000-000000000001',1000);
insert into public.agent_runs(run_id,user_id,project_id,status,snapshot_consent_version,snapshot_consent_at) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','running','agentic-snapshot-v1',now());
insert into public.agent_steps(step_id,run_id,attempt,status) values('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',1,'running');
insert into public.agent_payload_manifests(user_id,project_id,run_id,material_id,storage_bucket,storage_path,manifest_path,expires_at,context_revision)
values('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','run-context','katedra-temporary-materials',
'20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000001/contexts/50000000-0000-0000-0000-000000000001/manuscript-context.json',
'20000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000001/10000000-0000-0000-0000-000000000001/contexts/50000000-0000-0000-0000-000000000001/manuscript-context.manifest.json',now()+interval '72 hours','50000000-0000-0000-0000-000000000001');

-- Pure identifiers; no manuscript text or real provider is involved.
create function pg_temp.identity(request_id text) returns jsonb language sql as $$ select jsonb_build_object(
'userId','20000000-0000-0000-0000-000000000001','projectId','30000000-0000-0000-0000-000000000001',
'runId','10000000-0000-0000-0000-000000000001','contextRevision','50000000-0000-0000-0000-000000000001',
'stepId','40000000-0000-0000-0000-000000000001','attempt',1,'operation','provider','provider','fixture',
'model','fixture-model','inputSha256',repeat('a',64),'requestId',request_id) $$;

create function pg_temp.upload_payload(m uuid,k text,h text,b integer,p text) returns void language plpgsql as $$
declare token uuid:=gen_random_uuid(); result text; begin
  result:=public.begin_agent_payload_upload(m,k,token,h,b);
  if result<>'upload' then raise exception 'UPLOAD_NOT_AUTHORIZED'; end if;
  insert into storage.objects(bucket_id,name) values('katedra-temporary-materials',p);
  result:=public.finish_agent_payload_upload(m,k,token,true);
  if result<>'uploaded' then raise exception 'UPLOAD_NOT_CONFIRMED'; end if;
end $$;

do $$ declare claim jsonb; second jsonb; started jsonb; ex uuid; token uuid; owner uuid:=gen_random_uuid(); evidence jsonb; begin
  claim:=public.claim_agent_provider_execution(pg_temp.identity('one-execution'),owner);
  if claim->>'status'<>'claimed' then raise exception 'FIRST_CLAIM_NOT_GRANTED'; end if;
  ex:=(claim->>'executionId')::uuid;
  second:=public.claim_agent_provider_execution(pg_temp.identity('one-execution'),gen_random_uuid());
  if second->>'status'<>'busy' then raise exception 'SECOND_OWNER_GRANTED'; end if;
  begin
    perform public.claim_agent_provider_execution(pg_temp.identity('one-execution')||jsonb_build_object('model','changed'),owner);
    raise exception 'CHANGED_IDENTITY_ACCEPTED';
  exception when unique_violation then null; end;
  started:=public.start_agent_provider_execution(ex,owner,'fixture-worker',now());
  if started->>'status'<>'start' then raise exception 'START_NOT_GRANTED'; end if;
  token:=(started->>'startToken')::uuid;
  if token is null then raise exception 'START_TOKEN_MISSING'; end if;
  perform public.replace_agent_payloads_for_run('20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{}');
  if (select run_id from public.agent_payload_manifests where manifest_id=(started->>'manifestId')::uuid)
    is distinct from '10000000-0000-0000-0000-000000000001'::uuid then raise exception 'EXECUTION_PAYLOAD_DETACHED'; end if;
  begin
    perform public.replace_agent_payloads_for_run('20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',array['agent-execution:'||ex::text]);
    raise exception 'RAW_RESPONSE_USED_AS_MATERIAL';
  exception when invalid_parameter_value then null; end;
  if public.can_read_agent_payload('katedra-temporary-materials',started->>'storagePath') then
    raise exception 'UNVERIFIED_RESPONSE_EXPOSED_TO_OWNER_STORAGE'; end if;
  second:=public.start_agent_provider_execution(ex,owner,'fixture-worker',now());
  if second->>'status'<>'unresolved' or second ? 'startToken' then raise exception 'SECOND_PROVIDER_START_GRANTED'; end if;
  second:=public.claim_agent_provider_execution(pg_temp.identity('one-execution'),owner);
  if second->>'status'<>'unresolved' then raise exception 'UNKNOWN_OUTCOME_REISSUED'; end if;
  evidence:=jsonb_build_object(
    'responseSha256',repeat('b',64),'responseBytes',10,'descriptorSha256',repeat('c',64),'descriptorBytes',20,
    'inputTokens',10,'outputTokens',20,'charged',110,'pricingVersion','fixture-v1');
  second:=public.record_agent_provider_response(ex,token,evidence);
  if second->>'status'<>'response_recorded' then raise exception 'RESPONSE_EVIDENCE_NOT_RECORDED'; end if;
  begin
    perform public.commit_agent_provider_response(ex);
    raise exception 'INCOMPLETE_RESPONSE_PUBLISHED';
  exception when sqlstate '40901' then null; end;
  raise notice 'EXECUTION_AT_MOST_ONCE_START_PASS';
  perform pg_temp.upload_payload((started->>'manifestId')::uuid,'body',repeat('b',64),10,started->>'storagePath');
  perform pg_temp.upload_payload((started->>'manifestId')::uuid,'manifest',repeat('c',64),20,started->>'manifestPath');
  second:=public.commit_agent_provider_response(ex);
  if second->>'status'<>'response_ready' then raise exception 'COMPLETED_RESPONSE_NOT_PUBLISHED'; end if;
  perform public.commit_agent_provider_response(ex);
  second:=public.claim_agent_provider_execution(pg_temp.identity('one-execution'),gen_random_uuid());
  if second->>'status'<>'response_ready' or second->>'responseSha256'<>repeat('b',64) then raise exception 'ORIGINAL_RESPONSE_NOT_RECOVERABLE'; end if;
  second:=public.settle_agent_provider_execution(ex);
  if second->>'status'<>'settled' or (second->>'charged')::integer<>110 then raise exception 'ORIGINAL_CHARGE_NOT_SETTLED'; end if;
  second:=public.settle_agent_provider_execution(ex);
  if second->>'status'<>'already_settled' or (select balance from public.katedra_wallets)<>890
    or (select count(*) from public.katedra_usage)<>1 then raise exception 'REPLAY_DOUBLE_DEBIT'; end if;
  begin
    perform public.record_agent_provider_response(ex,token,evidence||jsonb_build_object('charged',220,'pricingVersion','fixture-v2'));
    raise exception 'REPLAY_REPRICED';
  exception when unique_violation then null; end;
  delete from storage.objects where name in(started->>'storagePath',started->>'manifestPath');
  update public.agent_payload_manifests set deleted_at=now(),content_deleted_at=now() where manifest_id=(started->>'manifestId')::uuid;
  delete from public.agent_payload_manifests where manifest_id=(started->>'manifestId')::uuid;
  second:=public.claim_agent_provider_execution(pg_temp.identity('one-execution'),owner);
  if second->>'status'<>'unavailable' or not exists(select 1 from public.agent_provider_executions where execution_id=ex)
    then raise exception 'DELETED_RESPONSE_REOPENED_EXECUTION'; end if;
  raise notice 'EXECUTION_ORIGINAL_RESPONSE_AND_CHARGE_PASS';
end $$;
do $$ declare owner uuid:=gen_random_uuid(); next_owner uuid:=gen_random_uuid(); claim jsonb; started jsonb; ex uuid; begin
  claim:=public.claim_agent_provider_execution(pg_temp.identity('unstarted-lease'),owner);
  ex:=(claim->>'executionId')::uuid;
  update public.agent_steps set lease_expires_at=now()-interval '1 second';
  begin
    perform public.start_agent_provider_execution(ex,owner,'fixture-worker',now());
    raise exception 'EXPIRED_STEP_LEASE_STARTED';
  exception when sqlstate '40901' then null; end;
  update public.agent_steps set lease_expires_at=now()+interval '5 minutes';
  update public.agent_steps set claimed_at=now()+interval '1 second';
  begin
    perform public.start_agent_provider_execution(ex,owner,'fixture-worker',now());
    raise exception 'REASSIGNED_STEP_LEASE_STARTED';
  exception when sqlstate '40901' then null; end;
  update public.agent_steps set claimed_at=now();
  begin
    perform public.start_agent_provider_execution(ex,owner,'different-worker',now());
    raise exception 'FOREIGN_STEP_WORKER_STARTED';
  exception when sqlstate '40901' then null; end;

  -- Fixture clock advancement: direct table mutation is not granted to service.
  update public.agent_provider_executions set lease_expires_at=now()-interval '1 second' where execution_id=ex;
  claim:=public.claim_agent_provider_execution(pg_temp.identity('unstarted-lease'),next_owner);
  if claim->>'status'<>'claimed' then raise exception 'UNSTARTED_LEASE_NOT_RECLAIMABLE'; end if;
  begin
    perform public.start_agent_provider_execution(ex,owner,'fixture-worker',now());
    raise exception 'OLD_OWNER_STARTED';
  exception when sqlstate '40901' then null; end;
  started:=public.start_agent_provider_execution(ex,next_owner,'fixture-worker',now());
  if started->>'status'<>'start' then raise exception 'NEW_OWNER_CANNOT_START'; end if;
  update public.agent_provider_executions set lease_expires_at=now()-interval '1 second' where execution_id=ex;
  claim:=public.claim_agent_provider_execution(pg_temp.identity('unstarted-lease'),owner);
  if claim->>'status'<>'unresolved' then raise exception 'STARTED_EXPIRED_LEASE_REISSUED'; end if;
  claim:=public.claim_agent_provider_execution(pg_temp.identity('legacy-billing'),owner);
  perform public.record_katedra_billing_usage('20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','legacy-billing',110,'fixture-model',10,20);
  begin
    perform public.start_agent_provider_execution((claim->>'executionId')::uuid,owner,'fixture-worker',now());
    raise exception 'LEGACY_BILLED_IDENTITY_REGENERATED';
  exception when unique_violation then null; end;
  raise notice 'EXECUTION_LEASE_AND_LEGACY_BILLING_PASS';
end $$;

do $$ declare owner uuid:=gen_random_uuid(); claim jsonb; started jsonb; ex uuid; evidence jsonb; begin
  claim:=public.claim_agent_provider_execution(pg_temp.identity('withdraw-in-flight'),owner);
  ex:=(claim->>'executionId')::uuid;
  started:=public.start_agent_provider_execution(ex,owner,'fixture-worker',now());
  perform public.revoke_agent_run_consent('20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
  evidence:=jsonb_build_object('responseSha256',repeat('d',64),'responseBytes',10,
    'descriptorSha256',repeat('e',64),'descriptorBytes',20,
    'inputTokens',10,'outputTokens',20,'charged',110,'pricingVersion','fixture-v1');
  perform public.record_agent_provider_response(ex,(started->>'startToken')::uuid,evidence);
  if (select input_tokens from public.agent_provider_executions where execution_id=ex)<>10 then
    raise exception 'LATE_USAGE_LOST'; end if;
  begin
    perform public.commit_agent_provider_response(ex);
    raise exception 'WITHDRAWN_RESPONSE_PUBLISHED';
  exception when sqlstate '40901' then null; end;
  begin
    perform public.begin_agent_payload_upload((started->>'manifestId')::uuid,'body',gen_random_uuid(),repeat('d',64),10);
    raise exception 'WITHDRAWN_RESPONSE_UPLOAD_ALLOWED';
  exception when sqlstate '40901' then null; end;
  begin
    perform public.claim_agent_provider_execution(pg_temp.identity('withdraw-in-flight'),owner);
    raise exception 'WITHDRAWN_RESPONSE_RETRIEVED';
  exception when sqlstate '40901' then null; end;
  if (select balance from public.katedra_wallets)<>890 then raise exception 'INCOMPLETE_RESPONSE_DEBITED'; end if;
  raise notice 'EXECUTION_WITHDRAWAL_AND_LATE_USAGE_PASS';
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
  begin
    perform public.claim_agent_provider_execution('{}',gen_random_uuid());
    raise exception 'CLIENT_CLAIM_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform public.start_agent_provider_execution(gen_random_uuid(),gen_random_uuid(),'fixture-worker',now());
    raise exception 'CLIENT_START_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform public.settle_agent_provider_execution(gen_random_uuid());
    raise exception 'CLIENT_SETTLEMENT_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.agent_provider_executions;
    raise exception 'CLIENT_EXECUTION_METADATA_READ';
  exception when insufficient_privilege then null; end;
  raise notice 'EXECUTION_SERVICE_ONLY_PASS';
end $$;
rollback;
