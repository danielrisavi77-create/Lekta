-- Preserve the fact that a processing request is recovering a paid/free result whose first
-- delivery was not stored. If the recovery worker disappears, status can return to the safe
-- completed_unstored state instead of permanently converting the request to unknown.
alter table public.repair_request_keys
  add column if not exists recovery_attempt boolean not null default false;

create or replace function public.track_repair_request_recovery_attempt()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'completed_unstored' and new.status = 'processing' then
    new.recovery_attempt := true;
  elsif new.status <> 'processing' then
    new.recovery_attempt := false;
  end if;
  return new;
end;
$$;
revoke all on function public.track_repair_request_recovery_attempt() from public, anon, authenticated;

drop trigger if exists repair_request_recovery_attempt_flag on public.repair_request_keys;
create trigger repair_request_recovery_attempt_flag
  before update of status on public.repair_request_keys
  for each row execute function public.track_repair_request_recovery_attempt();

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

  if v_request.status = 'completed_unstored' then
    update public.repair_request_keys
       set request_id = p_request_id, status = 'processing', updated_at = now()
     where user_id = p_user_id and request_id = v_request.request_id;
    return jsonb_build_object('status', 'processing', 'claimed', true, 'jobId', null, 'recovery', true);
  end if;

  if v_request.status = 'processing'
     and v_request.recovery_attempt
     and v_request.updated_at < now() - interval '30 minutes' then
    -- Do not claim again in this same call. The client gets a definitive unstored state and its next
    -- explicit retry is rechecked against the same already-active slot by the Edge handler.
    update public.repair_request_keys
       set status = 'completed_unstored', updated_at = now()
     where user_id = p_user_id and request_id = v_request.request_id;
    return jsonb_build_object('status', 'completed_unstored', 'claimed', false, 'jobId', null);
  end if;

  if v_request.status = 'processing'
     and not v_request.recovery_attempt
     and v_request.updated_at < now() - interval '10 minutes' then
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

  if v_request.status = 'processing'
     and v_request.recovery_attempt
     and v_request.updated_at < now() - interval '30 minutes' then
    update public.repair_request_keys
       set status = 'completed_unstored', updated_at = now()
     where user_id = p_user_id and request_id = p_request_id;
    return jsonb_build_object('status', 'completed_unstored', 'jobId', null);
  end if;

  if v_request.status = 'processing'
     and not v_request.recovery_attempt
     and v_request.updated_at < now() - interval '10 minutes' then
    update public.repair_request_keys
       set status = 'unknown', updated_at = now()
     where user_id = p_user_id and request_id = p_request_id;
    return jsonb_build_object('status', 'unknown', 'jobId', v_request.job_id);
  end if;

  return jsonb_build_object('status', v_request.status, 'jobId', v_request.job_id);
end;
$$;

revoke all on function public.claim_repair_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.repair_request_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_repair_request(uuid, uuid, text) to service_role;
grant execute on function public.repair_request_status(uuid, uuid) to service_role;
