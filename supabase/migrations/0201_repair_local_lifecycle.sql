alter table public.repair_local_jobs
  add column if not exists device_event_sequence integer not null default 0
    check (device_event_sequence >= 0),
  add column if not exists checkpoint_sha256 text
    check (checkpoint_sha256 is null or checkpoint_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists output_sha256 text
    check (output_sha256 is null or output_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists completion_report_sha256 text
    check (completion_report_sha256 is null or completion_report_sha256 ~ '^[0-9a-f]{64}$'),
  add column if not exists last_event_at timestamptz,
  add column if not exists last_event_sha256 text
    check (last_event_sha256 is null or last_event_sha256 ~ '^[0-9a-f]{64}$');

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'repair_local_jobs_completion_evidence_check'
       and conrelid = 'public.repair_local_jobs'::regclass
  ) then
    alter table public.repair_local_jobs
      add constraint repair_local_jobs_completion_evidence_check check (
        local_state <> 'completed' or (
          output_sha256 is not null
          and completion_report_sha256 is not null
          and completed_at is not null
        )
      );
  end if;
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'repair_local_jobs_retry_checkpoint_check'
       and conrelid = 'public.repair_local_jobs'::regclass
  ) then
    alter table public.repair_local_jobs
      add constraint repair_local_jobs_retry_checkpoint_check check (
        local_state <> 'retryable' or checkpoint_sha256 is not null
      );
  end if;
end;
$$;

create or replace function public.advance_local_repair_job(
  p_job_id uuid,
  p_device_key_sha256 text,
  p_sequence integer,
  p_event text,
  p_occurred_at timestamptz,
  p_checkpoint_sha256 text,
  p_output_sha256 text,
  p_report_sha256 text,
  p_event_sha256 text
)
returns table (
  local_state text,
  device_event_sequence integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state text;
  v_sequence integer;
  v_last_event_sha256 text;
  v_claimed_at timestamptz;
  v_last_event_at timestamptz;
begin
  if current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may advance a local repair job' using errcode = '42501';
  end if;
  if p_job_id is null
     or p_device_key_sha256 !~ '^[0-9a-f]{64}$'
     or p_sequence is null
     or p_sequence < 1
     or p_event is null
     or p_event not in ('processing', 'heartbeat', 'retryable', 'completed', 'local_failed')
     or p_occurred_at is null
     or p_occurred_at > now() + interval '10 minutes'
     or (p_event <> 'completed' and p_occurred_at < now() - interval '10 minutes')
     or (p_checkpoint_sha256 is not null and p_checkpoint_sha256 !~ '^[0-9a-f]{64}$')
     or (p_output_sha256 is not null and p_output_sha256 !~ '^[0-9a-f]{64}$')
     or (p_report_sha256 is not null and p_report_sha256 !~ '^[0-9a-f]{64}$')
     or p_event_sha256 !~ '^[0-9a-f]{64}$'
     or (p_event = 'processing' and (
       p_checkpoint_sha256 is not null or p_output_sha256 is not null or p_report_sha256 is not null
     ))
     or (p_event = 'heartbeat' and (
       p_output_sha256 is not null or p_report_sha256 is not null
     ))
     or (p_event = 'retryable' and (
       p_checkpoint_sha256 is null or p_output_sha256 is not null or p_report_sha256 is not null
     ))
     or (p_event = 'completed' and (
       p_output_sha256 is null or p_report_sha256 is null
     ))
     or (p_event = 'local_failed' and (
       p_output_sha256 is not null or p_report_sha256 is not null
     )) then
    raise exception 'Invalid local repair lifecycle event' using errcode = '22023';
  end if;

  select local_job.local_state,
         local_job.device_event_sequence,
         local_job.last_event_sha256,
         local_job.claimed_at,
         local_job.last_event_at
    into v_state, v_sequence, v_last_event_sha256, v_claimed_at, v_last_event_at
    from public.repair_local_jobs as local_job
   where local_job.job_id = p_job_id
     and local_job.device_key_sha256 = p_device_key_sha256
     for update;
  if not found or v_claimed_at is null or p_occurred_at < v_claimed_at then
    return;
  end if;

  -- A lost HTTP response may repeat the exact signed event. Only the same
  -- sequence plus the same canonical event hash is idempotently accepted.
  if p_sequence = v_sequence
     and p_event_sha256 = v_last_event_sha256 then
    return query select v_state, v_sequence;
    return;
  end if;
  if p_sequence <= v_sequence
     or (v_last_event_at is not null and p_occurred_at < v_last_event_at)
     or not (
       (p_event = 'processing' and v_state in ('claimed', 'retryable'))
       or (p_event = 'heartbeat' and v_state = 'processing')
       or (p_event = 'retryable' and v_state in ('claimed', 'processing'))
       or (p_event = 'completed' and v_state = 'processing')
       or (p_event = 'local_failed' and v_state in ('claimed', 'processing', 'retryable'))
     ) then
    return;
  end if;

  return query
  update public.repair_local_jobs as local_job
     set local_state = case p_event
           when 'processing' then 'processing'
           when 'heartbeat' then local_job.local_state
           when 'retryable' then 'retryable'
           when 'completed' then 'completed'
           when 'local_failed' then 'local_failed'
         end,
         device_event_sequence = p_sequence,
         checkpoint_sha256 = coalesce(p_checkpoint_sha256, local_job.checkpoint_sha256),
         output_sha256 = case
           when p_event = 'completed' then p_output_sha256
           else local_job.output_sha256
         end,
         completion_report_sha256 = case
           when p_event = 'completed' then p_report_sha256
           else local_job.completion_report_sha256
         end,
         heartbeat_at = case
           when p_event in ('processing', 'heartbeat', 'retryable') then p_occurred_at
           else local_job.heartbeat_at
         end,
         completed_at = case
           when p_event = 'completed' then p_occurred_at
           else local_job.completed_at
         end,
         last_event_at = p_occurred_at,
         last_event_sha256 = p_event_sha256,
         updated_at = now()
   where local_job.job_id = p_job_id
     and local_job.device_key_sha256 = p_device_key_sha256
     and local_job.device_event_sequence = v_sequence
  returning local_job.local_state, local_job.device_event_sequence;
end;
$$;

revoke all on function public.advance_local_repair_job(
  uuid, text, integer, text, timestamptz, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.advance_local_repair_job(
  uuid, text, integer, text, timestamptz, text, text, text, text
) to service_role;
