alter table public.repair_local_jobs
  add column if not exists claim_recovery_token_sha256 text unique check (
    claim_recovery_token_sha256 is null
    or claim_recovery_token_sha256 ~ '^[0-9a-f]{64}$'
  );

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'repair_local_jobs_recovery_scope_check'
       and conrelid = 'public.repair_local_jobs'::regclass
  ) then
    alter table public.repair_local_jobs
      add constraint repair_local_jobs_recovery_scope_check check (
        claim_recovery_token_sha256 is null or local_state = 'claimed'
      );
  end if;
end;
$$;

-- Bearer recovery exists only between the first device binding and the first
-- accepted processing event. Revocation and expiry must also remove both token
-- digests even when those states are set by a future administrative path.
create or replace function public.clear_local_repair_bearer_material()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.local_state in ('processing', 'retryable', 'completed', 'local_failed', 'expired', 'revoked') then
    new.claim_recovery_token_sha256 := null;
  end if;
  if new.local_state in ('expired', 'revoked') then
    new.claim_token_sha256 := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_local_repair_bearer_material()
  from public, anon, authenticated;

drop trigger if exists repair_local_jobs_clear_bearer_material on public.repair_local_jobs;

create trigger repair_local_jobs_clear_bearer_material
before insert or update of local_state on public.repair_local_jobs
for each row execute function public.clear_local_repair_bearer_material();

-- Clean rows that may have expired between the claim/lifecycle migrations and this forward migration.
update public.repair_local_jobs
   set local_state = 'expired',
       updated_at = now()
 where local_state in ('claimable', 'claimed')
   and claim_expires_at <= now();

update public.repair_local_jobs
   set claim_token_sha256 = null,
       claim_recovery_token_sha256 = null,
       updated_at = now()
 where local_state = 'revoked';

drop function if exists public.claim_local_repair_job(uuid, text, text, text);

create function public.claim_local_repair_job(
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

  -- A claim attempt is also a bounded cleanup opportunity. The row lock taken
  -- by UPDATE makes expiry/recovery compete atomically with the claim itself.
  update public.repair_local_jobs as local_job
     set local_state = 'expired',
         updated_at = now()
   where local_job.job_id = p_job_id
     and local_job.local_state in ('claimable', 'claimed')
     and local_job.claim_expires_at <= now();

  update public.repair_local_jobs as local_job
     set claim_token_sha256 = null,
         claim_recovery_token_sha256 = null,
         updated_at = now()
   where local_job.job_id = p_job_id
     and local_job.local_state = 'revoked'
     and (local_job.claim_token_sha256 is not null
       or local_job.claim_recovery_token_sha256 is not null);

  return query
  with claimed as (
    update public.repair_local_jobs as local_job
       set local_state = 'claimed',
           claim_recovery_token_sha256 = case
             when local_job.local_state = 'claimable' then p_claim_token_sha256
             else local_job.claim_recovery_token_sha256
           end,
           claim_token_sha256 = null,
           device_public_key_spki = p_device_public_key_spki,
           device_key_sha256 = p_device_key_sha256,
           claimed_at = coalesce(local_job.claimed_at, now()),
           heartbeat_at = now(),
           updated_at = now()
     where local_job.job_id = p_job_id
       and local_job.claim_expires_at > now()
       and (
         (local_job.local_state = 'claimable'
           and local_job.claim_token_sha256 = p_claim_token_sha256
           and local_job.device_public_key_spki is null
           and local_job.device_key_sha256 is null)
         or
         (local_job.local_state = 'claimed'
           and local_job.claim_recovery_token_sha256 = p_claim_token_sha256
           and local_job.device_public_key_spki = p_device_public_key_spki
           and local_job.device_key_sha256 = p_device_key_sha256
           and local_job.device_event_sequence = 0)
       )
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

create index if not exists repair_local_jobs_recoverable_expiry
  on public.repair_local_jobs (claim_expires_at)
  where local_state in ('claimable', 'claimed');
