\set ON_ERROR_STOP on
begin;
create schema if not exists auth;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table auth.users(id uuid primary key);
create table public.academic_projects(id uuid primary key,user_id uuid,deleted_at timestamptz);
create table public.katedra_wallets(user_id uuid primary key,balance bigint,updated_at timestamptz default now());
create table public.katedra_usage(user_id uuid,model text,input_tokens integer,output_tokens integer,charged bigint);
insert into auth.users values('20000000-0000-0000-0000-000000000001');
insert into public.academic_projects values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',null);
\i supabase/migrations/0068_katedra_billing_v2.sql
\i supabase/migrations/0083_billing_pending_marker.sql
\i supabase/migrations/0109_katedra_billing_reconciliation.sql
\i supabase/migrations/0109_katedra_billing_reconciliation.sql
\i supabase/migrations/0110_katedra_billing_usage_evidence.sql
\i supabase/migrations/0110_katedra_billing_usage_evidence.sql
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare outcome jsonb; begin
  outcome:=public.record_katedra_billing_usage('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','captured-usage',110,'fixture-model',10,20);
  if outcome->>'status'<>'pending_reconciliation' then raise exception 'USAGE_NOT_CAPTURED'; end if;
  if (select input_tokens from public.katedra_billing_attempts where request_id='captured-usage')<>10 then raise exception 'USAGE_DISCARDED'; end if;
  begin
    perform public.record_katedra_billing_usage('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','captured-usage',110,'fixture-model',11,20);
    raise exception 'OBSERVED_USAGE_OVERWRITTEN';
  exception when unique_violation then null; end;
  delete from public.katedra_billing_attempts where request_id='captured-usage';
end $$;
do $$ declare outcome jsonb; begin
  outcome:=public.katedra_consume('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','known-usage',110,'fixture-model',10,20);
  if outcome->>'status'<>'pending_reconciliation' then raise exception 'EXPECTED_PENDING'; end if;
  outcome:=public.reconcile_katedra_billing('known-usage');
  if outcome->>'reason'<>'insufficient_balance' then raise exception 'UNFUNDED_CHARGE'; end if;
  if exists(select 1 from public.list_reconcilable_katedra_billing()) then raise exception 'UNFUNDED_QUEUE'; end if;
  update public.katedra_wallets set balance=1000;
  if (select count(*) from public.list_reconcilable_katedra_billing())<>1 then raise exception 'FUNDED_QUEUE_MISSING'; end if;
  outcome:=public.reconcile_katedra_billing('known-usage');
  if outcome->>'status'<>'settled' then raise exception 'KNOWN_USAGE_NEVER_RECONCILES'; end if;
  outcome:=public.reconcile_katedra_billing('known-usage');
  if outcome->>'status'<>'already_settled' then raise exception 'REPLAY_NOT_TERMINAL'; end if;
  outcome:=public.record_katedra_billing_usage('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','known-usage',110,'fixture-model',10,20);
  if outcome->>'status'<>'already_settled' then raise exception 'LOST_RESPONSE_NOT_RECOVERED'; end if;
  if (select balance from public.katedra_wallets)<>890 or (select count(*) from public.katedra_usage)<>1 then raise exception 'DOUBLE_DEBIT'; end if;
  perform public.katedra_mark_pending('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','unknown-usage',500,'fixture-model');
  outcome:=public.reconcile_katedra_billing('unknown-usage');
  if outcome->>'reason'<>'usage_evidence_required' then raise exception 'ESTIMATE_SETTLED'; end if;
  if exists(select 1 from public.list_reconcilable_katedra_billing()) then raise exception 'UNKNOWN_USAGE_QUEUED'; end if;
  if (select balance from public.katedra_wallets)<>890 then raise exception 'ESTIMATE_DEBITED'; end if;
  outcome:=public.reconcile_katedra_billing('absent');
  if outcome->>'status'<>'missing' then raise exception 'MISSING_ATTEMPT_CREATED'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
  begin
    perform public.reconcile_katedra_billing('unknown-usage');
    raise exception 'CLIENT_SETTLEMENT_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform public.list_reconcilable_katedra_billing();
    raise exception 'CLIENT_QUEUE_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform public.record_katedra_billing_usage('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','known-usage',110,'fixture-model',10,20);
    raise exception 'CLIENT_EVIDENCE_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
-- A downstream usage failure must roll back the wallet debit and ledger transition.
alter table public.katedra_usage add constraint fixture_usage_rejection check(model<>'reject-fixture');
do $$ declare outcome jsonb; begin
  perform public.katedra_consume('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','rollback-usage',1000,'reject-fixture',100,180);
  update public.katedra_wallets set balance=2000;
  begin
    perform public.reconcile_katedra_billing('rollback-usage');
    raise exception 'EXPECTED_USAGE_FAILURE';
  exception when check_violation then null; end;
  if (select balance from public.katedra_wallets)<>2000 then raise exception 'PARTIAL_DEBIT'; end if;
  if (select status from public.katedra_billing_attempts where request_id='rollback-usage')<>'pending_reconciliation' then raise exception 'PARTIAL_SETTLEMENT'; end if;
end $$;
alter table public.katedra_usage drop constraint fixture_usage_rejection;
do $$ declare outcome jsonb; begin
  begin
    perform public.record_katedra_billing_usage('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','unknown-usage',500,'fixture-model',0,0);
    raise exception 'ZERO_USAGE_ACCEPTED_AS_EVIDENCE';
  exception when invalid_parameter_value then null; end;
  outcome:=public.record_katedra_billing_usage('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','unknown-usage',5,'fixture-model',1,0);
  if outcome->>'status'<>'pending_reconciliation' or (select charged from public.katedra_billing_attempts where request_id='unknown-usage')<>5 then raise exception 'ESTIMATE_NOT_REPLACED_WITH_ACTUAL_USAGE'; end if;
  update public.academic_projects set user_id='20000000-0000-0000-0000-000000000002';
  outcome:=public.reconcile_katedra_billing('unknown-usage');
  if outcome->>'reason'<>'project_unavailable' then raise exception 'FOREIGN_PROJECT_SETTLED'; end if;
  if exists(select 1 from public.list_reconcilable_katedra_billing()) then raise exception 'FOREIGN_PROJECT_QUEUED'; end if;
  raise notice 'KATEDRA_BILLING_RECONCILIATION_SQL_PASS';
end $$;
rollback;
