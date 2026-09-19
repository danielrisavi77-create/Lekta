-- One paid repair slot may mint one local WordReplica entitlement. The existing
-- repair_jobs.status remains the independent server-result status.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'repair_jobs_local_identity_unique'
       and conrelid = 'public.repair_jobs'::regclass
  ) then
    alter table public.repair_jobs
      add constraint repair_jobs_local_identity_unique unique (id, user_id, slot_id);
  end if;
end;
$$;

create table if not exists public.repair_local_jobs (
  job_id uuid primary key references public.repair_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid not null references public.document_slots(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_size integer not null check (source_size > 0 and source_size <= 20971520),
  target_sha256 text not null check (target_sha256 ~ '^[0-9a-f]{64}$'),
  target_size integer not null check (target_size > 0 and target_size <= 20971520),
  repair_contract jsonb not null check (jsonb_typeof(repair_contract) = 'object'),
  contract_key_id text not null check (contract_key_id ~ '^[A-Za-z0-9._-]{1,80}$'),
  local_state text not null default 'claimable' check (local_state in (
    'paid', 'claimable', 'claimed', 'processing', 'retryable',
    'completed', 'local_failed', 'expired', 'revoked'
  )),
  claim_token_sha256 text unique check (
    claim_token_sha256 is null or claim_token_sha256 ~ '^[0-9a-f]{64}$'
  ),
  claim_expires_at timestamptz not null,
  device_public_key_spki text check (
    device_public_key_spki is null or (length(device_public_key_spki) between 80 and 512
      and device_public_key_spki ~ '^[A-Za-z0-9_-]+$')
  ),
  device_key_sha256 text check (
    device_key_sha256 is null or device_key_sha256 ~ '^[0-9a-f]{64}$'
  ),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_id),
  check (repair_contract ->> 'contractVersion' = '1'),
  check (repair_contract #>> '{contractSignature,keyId}' = contract_key_id),
  check (repair_contract ->> 'jobId' = job_id::text),
  check (repair_contract ->> 'userId' = user_id::text),
  check (repair_contract ->> 'sourceSha256' = source_sha256),
  check (repair_contract ->> 'targetSha256' = target_sha256),
  constraint repair_local_jobs_repair_identity_fk
    foreign key (job_id, user_id, slot_id)
    references public.repair_jobs (id, user_id, slot_id)
    on delete cascade,
  check (local_state <> 'claimable' or (
    claim_token_sha256 is not null
    and device_public_key_spki is null
    and device_key_sha256 is null
    and claimed_at is null
  )),
  check (local_state not in ('claimed', 'processing', 'retryable', 'completed', 'local_failed') or (
    claim_token_sha256 is null
    and device_public_key_spki is not null
    and device_key_sha256 is not null
    and claimed_at is not null
  ))
);

create index if not exists repair_local_jobs_user_time
  on public.repair_local_jobs (user_id, created_at desc);
create index if not exists repair_local_jobs_claimable_expiry
  on public.repair_local_jobs (claim_expires_at)
  where local_state = 'claimable';

alter table public.repair_local_jobs enable row level security;

-- This table contains a bearer-token digest, signed contract and device binding.
-- It is intentionally not client-readable; runner and web status use narrow Edge APIs.
revoke all on table public.repair_local_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.repair_local_jobs to service_role;

create or replace function public.claim_local_repair_job(
  p_job_id uuid,
  p_claim_token_sha256 text,
  p_device_public_key_spki text,
  p_device_key_sha256 text
)
returns table (
  job_id uuid,
  user_id uuid,
  local_state text,
  repair_contract jsonb,
  original_path text,
  result_path text
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role'
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may claim a local repair job' using errcode = '42501';
  end if;
  if p_job_id is null
     or p_claim_token_sha256 !~ '^[0-9a-f]{64}$'
     or length(p_device_public_key_spki) not between 80 and 512
     or p_device_public_key_spki !~ '^[A-Za-z0-9_-]+$'
     or p_device_key_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid local repair claim' using errcode = '22023';
  end if;

  return query
  with claimed as (
    update public.repair_local_jobs as local_job
       set local_state = 'claimed',
           claim_token_sha256 = null,
           device_public_key_spki = p_device_public_key_spki,
           device_key_sha256 = p_device_key_sha256,
           claimed_at = now(),
           heartbeat_at = now(),
           updated_at = now()
     where local_job.job_id = p_job_id
       and local_job.local_state = 'claimable'
       and local_job.claim_token_sha256 = p_claim_token_sha256
       and local_job.claim_expires_at > now()
       and local_job.device_public_key_spki is null
       and local_job.device_key_sha256 is null
     returning local_job.job_id, local_job.user_id, local_job.local_state,
               local_job.repair_contract
  )
  select claimed.job_id, claimed.user_id, claimed.local_state,
         claimed.repair_contract, repair.original_path, repair.result_path
    from claimed
    join public.repair_jobs as repair on repair.id = claimed.job_id;
end;
$$;

revoke all on function public.claim_local_repair_job(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_local_repair_job(uuid, text, text, text)
  to service_role;
