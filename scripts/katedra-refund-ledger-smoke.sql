-- Bacivi PostgreSQL, bez stvarnih Stripe poziva i bez novcanih transakcija.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
alter default privileges in schema public grant all on tables to service_role;
create table public.academic_projects(id uuid primary key,user_id uuid);
insert into public.academic_projects values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
\i supabase/migrations/0108_katedra_refund_reconciliation.sql
\i supabase/migrations/0108_katedra_refund_reconciliation.sql
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$ begin
  begin
    perform public.claim_katedra_pass_refund('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cs_fixture','pi_fixture',1000,'eur');
    raise exception 'CLIENT_REFUND_CLAIM_ALLOWED';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $$ declare first_claim jsonb; second_claim jsonb; lease uuid; begin
  first_claim:=public.claim_katedra_pass_refund('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cs_fixture','pi_fixture',1000,'eur');
  begin
    update public.katedra_pass_refunds set payment_intent_id='pi_rebound';
    raise exception 'DIRECT_REFUND_UPDATE_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.katedra_pass_refunds;
    raise exception 'DIRECT_REFUND_DELETE_ALLOWED';
  exception when insufficient_privilege then null; end;
  lease:=(first_claim->>'lease_token')::uuid;
  if lease is null then raise exception 'CLAIM_MISSING'; end if;
  second_claim:=public.claim_katedra_pass_refund('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cs_fixture','pi_fixture',1000,'eur');
  if second_claim is not null then raise exception 'DOUBLE_REFUND_LEASE'; end if;
  begin
    perform public.claim_katedra_pass_refund('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cs_fixture','pi_other',1000,'eur');
    raise exception 'PAYMENT_IDENTITY_REBOUND';
  exception when unique_violation then null; end;
  perform public.mark_katedra_refund_attempt('cs_fixture',lease);
  perform public.record_katedra_pass_refund('cs_fixture',lease,'re_fixture','pending',null);
  second_claim:=public.claim_katedra_pass_refund('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cs_fixture','pi_fixture',1000,'eur');
  if second_claim->>'refund_id'<>'re_fixture' or second_claim->>'creation_attempted_at' is null then raise exception 'REFUND_IDENTITY_LOST'; end if;
  begin
    perform public.record_katedra_pass_refund('cs_fixture',lease,'re_fixture','succeeded',null);
    raise exception 'STALE_LEASE_ACCEPTED';
  exception when sqlstate '40901' then null; end;
  perform public.record_katedra_pass_refund('cs_fixture',(second_claim->>'lease_token')::uuid,'re_fixture','succeeded',null);
  first_claim:=public.claim_katedra_pass_refund('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','cs_fixture','pi_fixture',1000,'eur');
  if first_claim->>'status'<>'succeeded' or first_claim->>'refund_id'<>'re_fixture' then raise exception 'SETTLED_REFUND_NOT_REPLAYED'; end if;
  raise notice 'KATEDRA_REFUND_LEDGER_SQL_PASS';
end $$;
reset role;
rollback;
