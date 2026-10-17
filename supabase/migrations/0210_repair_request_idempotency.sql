-- Stable request identity prevents a lost response or parallel tab from starting the same repair twice.
-- Only an authenticated, validated repair can create a row; there is no standalone reservation endpoint.

create table if not exists public.repair_request_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null check (status in (
    'processing', 'completed', 'completed_unstored', 'no_change', 'retryable', 'unknown'
  )),
  job_id uuid references public.repair_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- Defense in depth: even a client that fails to derive the same request UUID cannot claim the same
-- semantic input twice for one account while its idempotency record is retained.
create unique index if not exists repair_request_keys_user_fingerprint_uidx
  on public.repair_request_keys (user_id, request_fingerprint);
create index if not exists repair_request_keys_created_at_idx
  on public.repair_request_keys (created_at);

alter table public.repair_request_keys enable row level security;
drop policy if exists repair_request_keys_select_own on public.repair_request_keys;
create policy repair_request_keys_select_own on public.repair_request_keys
  for select to authenticated using (user_id = auth.uid());

revoke all on table public.repair_request_keys from anon, authenticated;
grant select on table public.repair_request_keys to authenticated;
grant select, insert, update, delete on table public.repair_request_keys to service_role;

comment on table public.repair_request_keys is
  'Repair idempotency keys contain only an account id, deterministic request UUID, SHA-256 fingerprint, outcome state and optional job id. Unknown and unstored outcomes are retained to prevent a duplicate charge.';

-- Atomically claim a validated request. Locks by both semantic fingerprint and request UUID prevent
-- cross-tab/device races and request-id reuse races. This function is called only after a real upload
-- passes authentication, attempt limits, DOCX bounds, fingerprint matching, consent and fixer checks.
create or replace function public.claim_repair_request(
  p_user_id uuid,
  p_request_id uuid,
  p_request_fingerprint text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.repair_request_keys%rowtype;
begin
  if p_user_id is null or p_request_id is null or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_repair_request_identity' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':fingerprint:' || p_request_fingerprint, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':request:' || p_request_id::text, 0));

  select * into v_request
    from public.repair_request_keys
   where user_id = p_user_id and request_id = p_request_id
   for update;
  if found and v_request.request_fingerprint <> p_request_fingerprint then
    return jsonb_build_object('status', 'conflict', 'claimed', false, 'jobId', null);
  end if;

  select * into v_request
    from public.repair_request_keys
   where user_id = p_user_id and request_fingerprint = p_request_fingerprint
   for update;

  if not found then
    insert into public.repair_request_keys (
      user_id, request_id, request_fingerprint, status
    ) values (p_user_id, p_request_id, p_request_fingerprint, 'processing');
    return jsonb_build_object('status', 'processing', 'claimed', true, 'jobId', null);
  end if;

  -- A completed repair whose response was lost and whose result could not be stored can be
  -- recovered by rerunning this exact semantic request. The Edge Function must permit this only
  -- through an already-active document slot (or FREE_MODE), never by consuming another slot.
  if v_request.status = 'completed_unstored' then
    update public.repair_request_keys
       set request_id = p_request_id, status = 'processing', updated_at = now()
     where user_id = p_user_id and request_id = v_request.request_id;
    return jsonb_build_object('status', 'processing', 'claimed', true, 'jobId', null, 'recovery', true);
  end if;

  if v_request.status = 'processing' and v_request.updated_at < now() - interval '10 minutes' then
    update public.repair_request_keys
       set status = 'unknown', updated_at = now()
     where user_id = p_user_id and request_id = v_request.request_id;
    return jsonb_build_object('status', 'unknown', 'claimed', false, 'jobId', v_request.job_id);
  end if;

  if v_request.status = 'retryable' then
    update public.repair_request_keys
       set request_id = p_request_id, status = 'processing', updated_at = now()
     where user_id = p_user_id and request_id = v_request.request_id;
    return jsonb_build_object('status', 'processing', 'claimed', true, 'jobId', null);
  end if;

  return jsonb_build_object('status', v_request.status, 'claimed', false, 'jobId', v_request.job_id);
end;
$$;

-- A status check is read-only except for a one-time stale processing -> unknown transition.
create or replace function public.repair_request_status(
  p_user_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.repair_request_keys%rowtype;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'invalid_repair_request_identity' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':request:' || p_request_id::text, 0));
  select * into v_request
    from public.repair_request_keys
   where user_id = p_user_id and request_id = p_request_id
   for update;

  if not found then
    return jsonb_build_object('status', 'missing', 'jobId', null);
  end if;

  if v_request.status = 'processing' and v_request.updated_at < now() - interval '10 minutes' then
    update public.repair_request_keys
       set status = 'unknown', updated_at = now()
     where user_id = p_user_id and request_id = p_request_id;
    return jsonb_build_object('status', 'unknown', 'jobId', v_request.job_id);
  end if;

  return jsonb_build_object('status', v_request.status, 'jobId', v_request.job_id);
end;
$$;

create or replace function public.finish_repair_request(
  p_user_id uuid,
  p_request_id uuid,
  p_request_fingerprint text,
  p_status text,
  p_job_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('completed', 'completed_unstored', 'no_change', 'retryable') then
    raise exception 'invalid_repair_request_state' using errcode = '22023';
  end if;
  if p_status = 'completed' and p_job_id is null then
    raise exception 'completed_repair_requires_job' using errcode = '22023';
  end if;
  update public.repair_request_keys
     set status = p_status,
         job_id = case when p_status = 'completed' then p_job_id else null end,
         updated_at = now()
   where user_id = p_user_id
     and request_id = p_request_id
     and request_fingerprint = p_request_fingerprint
     and status in ('processing', 'unknown');
  return found;
end;
$$;

revoke all on function public.claim_repair_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.repair_request_status(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_repair_request(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_repair_request(uuid, uuid, text) to service_role;
grant execute on function public.repair_request_status(uuid, uuid) to service_role;
grant execute on function public.finish_repair_request(uuid, uuid, text, text, uuid) to service_role;

-- Keep uncertain/unstored outcomes and completed jobs until their underlying job is deleted. Compact
-- terminal, non-billable records can be purged after 30 days. The unique fingerprint index protects
-- all retained records, including completed jobs visible in the user's repair history.
create or replace function public.purge_repair_request_keys(retention_days int default 30)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if retention_days < 1 then
    raise exception 'retention_days_must_be_positive' using errcode = '22023';
  end if;
  delete from public.repair_request_keys
   where created_at < now() - make_interval(days => retention_days)
     and status in ('completed', 'no_change', 'retryable')
     and job_id is null;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function public.purge_repair_request_keys(int) from anon, authenticated, public;

do $$
declare
  v_name constant text := 'purge-repair-request-keys';
  v_schedule constant text := '35 3 * * *';
  v_command constant text := 'select public.purge_repair_request_keys(30);';
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null or to_regclass('cron.job') is null then
    raise exception '0210: pg_cron nije dostupan, retencija repair_request_keys se ne moze zakazati'
      using errcode = '55000';
  end if;
  if exists (select 1 from cron.job where jobname = v_name and schedule = v_schedule and command = v_command) then
    return;
  end if;
  if exists (select 1 from cron.job where jobname = v_name) then
    perform cron.unschedule(v_name);
  end if;
  perform cron.schedule(v_name, v_schedule, v_command);
end $$;
