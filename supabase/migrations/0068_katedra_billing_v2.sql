-- Katedra billing v2.
--
-- The legacy katedra_consume(uuid, bigint, text, integer, integer) overload is
-- intentionally preserved. Katedra's project-scoped runtime uses the overload
-- below, keyed by a request id so retries and browser disconnects cannot charge
-- the same provider attempt twice.

create table if not exists public.katedra_request_reservations (
  request_id       text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  estimated_charge bigint not null check (estimated_charge >= 0),
  status           text not null check (status in ('reserved', 'released')),
  created_at       timestamptz not null default now(),
  released_at      timestamptz
);

create index if not exists katedra_request_reservations_user_time_idx
  on public.katedra_request_reservations (user_id, created_at desc);

create table if not exists public.katedra_billing_attempts (
  request_id    text primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  project_id    uuid not null references public.academic_projects(id) on delete cascade,
  model         text not null,
  input_tokens  integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  charged       bigint not null check (charged >= 0),
  status        text not null check (status in ('reserved', 'settled', 'released', 'pending_reconciliation')),
  created_at    timestamptz not null default now(),
  settled_at    timestamptz,
  updated_at    timestamptz not null default now()
);

create index if not exists katedra_billing_attempts_project_time_idx
  on public.katedra_billing_attempts (project_id, created_at desc);

create index if not exists katedra_billing_attempts_user_time_idx
  on public.katedra_billing_attempts (user_id, created_at desc);

alter table public.katedra_request_reservations enable row level security;
alter table public.katedra_billing_attempts enable row level security;

revoke all on table public.katedra_request_reservations from anon, authenticated;
revoke all on table public.katedra_billing_attempts from anon, authenticated;
grant all privileges on table public.katedra_request_reservations to service_role;
grant all privileges on table public.katedra_billing_attempts to service_role;

create or replace function public.katedra_reserve_request(
  p_user uuid,
  p_request_id text,
  p_estimated_charge bigint default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.katedra_request_reservations;
  active_count integer;
  window_count integer;
  daily_charge bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may reserve AI requests' using errcode = '42501';
  end if;
  if p_user is null or nullif(trim(p_request_id), '') is null
     or length(p_request_id) > 100 or p_estimated_charge < 0 then
    raise exception 'Invalid AI request reservation' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select * into existing
  from public.katedra_request_reservations r
  where r.request_id = p_request_id
  for update;

  if existing.request_id is not null then
    if existing.user_id <> p_user then
      raise exception 'AI request belongs to another user' using errcode = '42501';
    end if;
    return jsonb_build_object('status', existing.status);
  end if;

  select count(*)::integer into active_count
  from public.katedra_request_reservations r
  where r.user_id = p_user
    and r.status = 'reserved'
    and r.created_at >= now() - interval '1 minute';
  if active_count >= 2 then
    return jsonb_build_object('status', 'concurrency');
  end if;

  select count(*)::integer into window_count
  from public.katedra_request_reservations r
  where r.user_id = p_user
    and r.created_at >= now() - interval '1 minute';
  if window_count >= 8 then
    return jsonb_build_object('status', 'rate');
  end if;

  select coalesce(sum(r.estimated_charge), 0)::bigint into daily_charge
  from public.katedra_request_reservations r
  where r.user_id = p_user
    and r.created_at >= now() - interval '24 hours';
  if daily_charge + p_estimated_charge > 100000 then
    return jsonb_build_object('status', 'rate');
  end if;

  insert into public.katedra_request_reservations (
    request_id, user_id, estimated_charge, status
  ) values (
    p_request_id, p_user, p_estimated_charge, 'reserved'
  );

  return jsonb_build_object('status', 'reserved');
end $$;

create or replace function public.katedra_release_request(
  p_user uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may release AI requests' using errcode = '42501';
  end if;

  update public.katedra_request_reservations
  set status = 'released', released_at = coalesce(released_at, now())
  where request_id = p_request_id and user_id = p_user and status = 'reserved';

  return jsonb_build_object('status', 'released');
end $$;

create or replace function public.katedra_consume(
  p_user       uuid,
  p_project_id uuid,
  p_request_id text,
  p_charged    bigint,
  p_model      text,
  p_in         integer,
  p_out        integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.katedra_billing_attempts;
  current_balance bigint;
  next_balance bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may settle AI billing' using errcode = '42501';
  end if;
  if p_user is null or p_project_id is null or nullif(trim(p_request_id), '') is null
     or length(p_request_id) > 100 or p_charged < 0 or p_in < 0 or p_out < 0 then
    raise exception 'Invalid AI billing settlement' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project_id and p.user_id = p_user and p.deleted_at is null
  ) then
    raise exception 'Project is missing or is not owned by the billing user' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_request_id));
  select * into existing
  from public.katedra_billing_attempts a
  where a.request_id = p_request_id
  for update;

  if existing.request_id is not null then
    if existing.user_id <> p_user or existing.project_id <> p_project_id then
      raise exception 'Billing request is bound to another project' using errcode = '23505';
    end if;
    return jsonb_build_object('status', case
      when existing.status = 'settled' then 'already_settled'
      else existing.status
    end);
  end if;

  insert into public.katedra_wallets(user_id, balance)
  values (p_user, 0)
  on conflict (user_id) do nothing;

  select w.balance into current_balance
  from public.katedra_wallets w
  where w.user_id = p_user
  for update;

  if coalesce(current_balance, 0) < p_charged then
    insert into public.katedra_billing_attempts (
      request_id, user_id, project_id, model, input_tokens, output_tokens,
      charged, status
    ) values (
      p_request_id, p_user, p_project_id, p_model, p_in, p_out,
      p_charged, 'pending_reconciliation'
    );
    return jsonb_build_object('status', 'pending_reconciliation');
  end if;

  update public.katedra_wallets
  set balance = balance - p_charged, updated_at = now()
  where user_id = p_user
  returning balance into next_balance;

  insert into public.katedra_usage (
    user_id, model, input_tokens, output_tokens, charged
  ) values (
    p_user, p_model, p_in, p_out, p_charged
  );

  insert into public.katedra_billing_attempts (
    request_id, user_id, project_id, model, input_tokens, output_tokens,
    charged, status, settled_at
  ) values (
    p_request_id, p_user, p_project_id, p_model, p_in, p_out,
    p_charged, 'settled', now()
  );

  return jsonb_build_object('status', 'settled', 'balance', coalesce(next_balance, 0));
end $$;

revoke all on function public.katedra_reserve_request(uuid, text, bigint)
  from public, anon, authenticated;
revoke all on function public.katedra_release_request(uuid, text)
  from public, anon, authenticated;
revoke all on function public.katedra_consume(uuid, uuid, text, bigint, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.katedra_reserve_request(uuid, text, bigint)
  to service_role;
grant execute on function public.katedra_release_request(uuid, text)
  to service_role;
grant execute on function public.katedra_consume(uuid, uuid, text, bigint, text, integer, integer)
  to service_role;
