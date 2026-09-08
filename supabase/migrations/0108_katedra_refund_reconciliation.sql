-- Trajni identitet povrata zivi u kanonskoj bazi, ne u logu ili Stripe cacheu.
-- Samo serverski proces smije mijenjati stanje. Ovaj ugovor ne izvrsava povrat.
create table if not exists public.katedra_pass_refunds(
  session_id text primary key,
  user_id uuid not null,
  project_id uuid not null,
  payment_intent_id text not null unique,
  amount bigint not null check(amount>0),
  currency text not null check(currency ~ '^[a-z]{3}$'),
  refund_id text unique,
  status text not null default 'requested' check(status in('requested','pending','requires_action','succeeded','failed','canceled','needs_review')),
  creation_attempted_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  last_error_code text,
  next_check_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.katedra_pass_refunds enable row level security;
revoke all on public.katedra_pass_refunds from public,anon,authenticated,service_role;
grant select on public.katedra_pass_refunds to service_role;
create index if not exists katedra_pass_refunds_pending_idx on public.katedra_pass_refunds(next_check_at) where status<>'succeeded';

create or replace function public.read_katedra_pass_refund(p_session_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may read refund state' using errcode='42501';
  end if;
  return (select to_jsonb(r) from public.katedra_pass_refunds r where r.session_id=p_session_id);
end $$;

create or replace function public.claim_katedra_pass_refund(
  p_user_id uuid,p_project_id uuid,p_session_id text,p_payment_intent_id text,p_amount bigint,p_currency text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.katedra_pass_refunds;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may reconcile refunds' using errcode='42501';
  end if;
  if p_user_id is null or p_project_id is null or p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]{1,250}$'
    or p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{1,250}$'
    or p_amount is null or p_amount<=0 or p_currency is null or p_currency !~ '^[a-z]{3}$' then
    raise exception 'Invalid refund identity' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('katedra-refund:'||p_session_id));
  select * into item from public.katedra_pass_refunds where session_id=p_session_id for update;
  if not found then
    if not exists(select 1 from public.academic_projects where id=p_project_id and user_id=p_user_id) then
      raise exception 'Refund project owner mismatch' using errcode='42501';
    end if;
    insert into public.katedra_pass_refunds(session_id,user_id,project_id,payment_intent_id,amount,currency)
      values(p_session_id,p_user_id,p_project_id,p_payment_intent_id,p_amount,p_currency) returning * into item;
  end if;
  if item.user_id<>p_user_id or item.project_id<>p_project_id or item.payment_intent_id<>p_payment_intent_id
    or item.amount<>p_amount or item.currency<>p_currency then
    raise exception 'Refund identity is immutable' using errcode='23505';
  end if;
  if item.status='succeeded' then return to_jsonb(item); end if;
  if item.lease_until>now() then return null; end if;
  update public.katedra_pass_refunds set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',
    attempts=attempts+1,updated_at=now() where session_id=p_session_id returning * into item;
  return to_jsonb(item);
end $$;

create or replace function public.mark_katedra_refund_attempt(p_session_id text,p_lease_token uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may mark refund attempts' using errcode='42501';
  end if;
  update public.katedra_pass_refunds set creation_attempted_at=coalesce(creation_attempted_at,now()),updated_at=now()
    where session_id=p_session_id and lease_token=p_lease_token and lease_until>now() and status<>'succeeded';
  if not found then raise exception 'Refund lease expired' using errcode='40901'; end if;
end $$;

create or replace function public.record_katedra_pass_refund(
  p_session_id text,p_lease_token uuid,p_refund_id text,p_status text,p_error_code text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may record refund evidence' using errcode='42501';
  end if;
  if p_status is null or p_status not in('pending','requires_action','succeeded','failed','canceled','needs_review')
    or (p_refund_id is not null and p_refund_id !~ '^re_[A-Za-z0-9_]{1,250}$')
    or (p_status='succeeded' and p_refund_id is null)
    or (p_error_code is not null and p_error_code not in('provider_unavailable','refund_identity_conflict','refund_history_ambiguous','creation_window_expired','invalid_provider_response')) then
    raise exception 'Invalid refund evidence' using errcode='22023';
  end if;
  update public.katedra_pass_refunds set refund_id=coalesce(refund_id,p_refund_id),status=p_status,
    last_error_code=p_error_code,next_check_at=now()+interval '5 minutes',lease_token=null,lease_until=null,updated_at=now()
    where session_id=p_session_id and lease_token=p_lease_token and lease_until>now() and status<>'succeeded'
      and (refund_id is null or p_refund_id is null or refund_id=p_refund_id);
  if not found then raise exception 'Refund lease or identity changed' using errcode='40901'; end if;
end $$;

create or replace function public.list_pending_katedra_pass_refunds()
returns setof public.katedra_pass_refunds language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
    raise exception 'Only service role may list refund work' using errcode='42501';
  end if;
  return query select * from public.katedra_pass_refunds
    where status<>'succeeded' and next_check_at<=now() and (lease_until is null or lease_until<=now())
    order by next_check_at,created_at limit 25;
end $$;
revoke all on function public.claim_katedra_pass_refund(uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.mark_katedra_refund_attempt(text,uuid) from public,anon,authenticated;
revoke all on function public.record_katedra_pass_refund(text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.list_pending_katedra_pass_refunds() from public,anon,authenticated;
revoke all on function public.read_katedra_pass_refund(text) from public,anon,authenticated;
grant execute on function public.claim_katedra_pass_refund(uuid,uuid,text,text,bigint,text) to service_role;
grant execute on function public.mark_katedra_refund_attempt(text,uuid) to service_role;
grant execute on function public.record_katedra_pass_refund(text,uuid,text,text,text) to service_role;
grant execute on function public.list_pending_katedra_pass_refunds() to service_role;
grant execute on function public.read_katedra_pass_refund(text) to service_role;
