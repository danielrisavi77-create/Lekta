-- Keep the durable stored result bound to the semantic repair request. If its completion RPC
-- fails after Storage and repair_jobs succeed, a later recovery can find and reuse this job.
alter table public.repair_jobs
  add column if not exists request_fingerprint text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.repair_jobs'::regclass
       and conname = 'repair_jobs_request_fingerprint_check'
  ) then
    alter table public.repair_jobs
      add constraint repair_jobs_request_fingerprint_check
      check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
end;
$$;

create unique index if not exists repair_jobs_user_request_fingerprint_uidx
  on public.repair_jobs (user_id, request_fingerprint)
  where request_fingerprint is not null;

comment on column public.repair_jobs.request_fingerprint is
  'SHA-256 identity of the semantic repair request; unique per user to prevent duplicate durable results after a lost completion update.';
