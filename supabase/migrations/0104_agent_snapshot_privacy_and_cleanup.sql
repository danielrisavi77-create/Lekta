-- Recovered from Lekta staging migration journal on 2026-09-08.
-- Original version: 20260822063559, name: 0086_agent_snapshot_privacy_and_cleanup.
-- Body below preserves the recorded SQL. The following authority migration
-- restricts physical-deletion finalization; do not deploy this recovery alone.

-- Agent snapshot privacy contract v1.
--
-- Katedra keeps the manuscript canonical copy in the browser. This migration
-- records the user's explicit consent for a temporary run snapshot and makes
-- terminal payload deletion observable: tombstoned is not the same as
-- content_deleted.

alter table public.agent_runs
  add column if not exists snapshot_consent_version text,
  add column if not exists snapshot_consent_at timestamptz,
  add column if not exists payload_cleanup_status text not null default 'temporarily_uploaded',
  add column if not exists payload_expires_at timestamptz,
  add column if not exists payload_deleted_at timestamptz,
  add column if not exists payload_cleanup_error text;

alter table public.agent_payload_manifests
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists content_deleted_at timestamptz,
  add column if not exists deletion_error text;

alter table public.agent_runs
  drop constraint if exists agent_runs_payload_cleanup_status_check;

alter table public.agent_runs
  add constraint agent_runs_payload_cleanup_status_check check (payload_cleanup_status in (
    'temporarily_uploaded', 'deletion_scheduled', 'deleted', 'deletion_failed'
  ));

create index if not exists agent_runs_payload_cleanup_idx
  on public.agent_runs (payload_cleanup_status, payload_expires_at)
  where payload_cleanup_status <> 'deleted';

create index if not exists agent_payload_manifests_content_cleanup_idx
  on public.agent_payload_manifests (deletion_requested_at)
  where content_deleted_at is null;

create or replace function public.record_agent_run_snapshot_consent(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_consent_version text,
  p_consent_at timestamptz
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may record consent only for the authenticated account' using errcode = '42501';
  end if;
  if p_consent_version <> 'agentic-snapshot-v1'
     or p_consent_at is null
     or p_consent_at > now() + interval '5 minutes'
     or p_consent_at < now() - interval '90 days' then
    raise exception 'Agent snapshot consent is invalid or stale' using errcode = '22023';
  end if;

  update public.agent_runs
  set snapshot_consent_version = p_consent_version,
      snapshot_consent_at = p_consent_at,
      payload_cleanup_status = 'temporarily_uploaded',
      payload_expires_at = coalesce(payload_expires_at, now() + interval '72 hours'),
      payload_cleanup_error = null,
      updated_at = now()
  where run_id = p_run_id
    and project_id = p_project_id
    and user_id = p_user_id
    and status = 'initializing';

  if not found then
    raise exception 'Agent run is missing, inactive or does not belong to the project' using errcode = '40901';
  end if;
end $$;

create or replace function public.request_agent_run_payload_deletion(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_now timestamptz default now()
) returns table (
  manifest_id uuid,
  storage_bucket text,
  storage_path text,
  manifest_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  run_status text;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may delete payloads only for the authenticated account' using errcode = '42501';
  end if;

  select r.status into run_status
  from public.agent_runs r
  where r.run_id = p_run_id and r.project_id = p_project_id and r.user_id = p_user_id;
  if run_status is null then
    raise exception 'Agent run is missing or does not belong to the project' using errcode = 'P0002';
  end if;
  if run_status not in ('completed', 'blocked', 'failed', 'cancelled') then
    raise exception 'Agent run must be terminal before payload deletion' using errcode = '40901';
  end if;

  return query update public.agent_payload_manifests m
  set deleted_at = coalesce(m.deleted_at, p_now),
      deletion_requested_at = coalesce(m.deletion_requested_at, p_now),
      deletion_error = null,
      updated_at = p_now
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.run_id = p_run_id
    and m.content_deleted_at is null
  returning m.manifest_id, m.storage_bucket, m.storage_path, m.manifest_path;

  if not found then
    update public.agent_runs
    set payload_cleanup_status = 'deleted', payload_deleted_at = coalesce(payload_deleted_at, p_now), payload_cleanup_error = null, updated_at = p_now
    where run_id = p_run_id;
  else
    update public.agent_runs
    set payload_cleanup_status = 'deletion_scheduled', payload_cleanup_error = null, updated_at = p_now
    where run_id = p_run_id;
  end if;
end $$;

create or replace function public.finalize_agent_run_payload_deletion(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_manifest_ids uuid[]
) returns table (deleted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may finalize payload deletion only for the authenticated account' using errcode = '42501';
  end if;

  update public.agent_payload_manifests m
  set content_deleted_at = now(), deletion_error = null, updated_at = now()
  where m.user_id = p_user_id
    and m.project_id = p_project_id
    and m.run_id = p_run_id
    and m.manifest_id = any(coalesce(p_manifest_ids, '{}'::uuid[]))
    and m.deleted_at is not null
    and m.content_deleted_at is null;
  get diagnostics deleted_count = row_count;

  if not exists (
    select 1 from public.agent_payload_manifests m
    where m.user_id = p_user_id and m.project_id = p_project_id and m.run_id = p_run_id and m.content_deleted_at is null
  ) then
    update public.agent_runs
    set payload_cleanup_status = 'deleted', payload_deleted_at = now(), payload_cleanup_error = null, updated_at = now()
    where run_id = p_run_id and user_id = p_user_id;
  end if;

  return query select deleted_count;
end $$;

create or replace function public.record_agent_run_payload_deletion_failure(
  p_user_id uuid,
  p_project_id uuid,
  p_run_id uuid,
  p_error_code text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may record payload cleanup only for the authenticated account' using errcode = '42501';
  end if;
  update public.agent_payload_manifests
  set deletion_error = left(coalesce(nullif(trim(p_error_code), ''), 'storage_delete_failed'), 120), updated_at = now()
  where user_id = p_user_id and project_id = p_project_id and run_id = p_run_id and content_deleted_at is null;
  update public.agent_runs
  set payload_cleanup_status = 'deletion_scheduled', payload_cleanup_error = left(coalesce(nullif(trim(p_error_code), ''), 'storage_delete_failed'), 120), updated_at = now()
  where run_id = p_run_id and user_id = p_user_id;
end $$;

-- The scheduled cleanup worker must also see manifests that were already
-- tombstoned by an explicit user/run deletion request. The old
-- cleanup_expired_agent_payloads function intentionally only sees
-- deleted_at IS NULL rows and therefore cannot retry those objects.
create or replace function public.list_pending_agent_payload_deletions(
  p_now timestamptz default now()
) returns table (
  manifest_id uuid,
  storage_bucket text,
  storage_path text,
  manifest_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may list pending temporary payload deletions' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select m.manifest_id
    from public.agent_payload_manifests m
    where m.content_deleted_at is null
      and (m.deletion_requested_at is not null or m.expires_at <= p_now)
    order by m.expires_at asc, m.created_at asc
    limit 500
    for update skip locked
  )
  update public.agent_payload_manifests m
  set deleted_at = coalesce(m.deleted_at, p_now),
      deletion_requested_at = coalesce(m.deletion_requested_at, p_now),
      deletion_error = null,
      updated_at = p_now
  from candidates c
  where m.manifest_id = c.manifest_id
  returning m.manifest_id, m.storage_bucket, m.storage_path, m.manifest_path;
end $$;

create or replace function public.finalize_agent_payload_deletions(
  p_manifest_ids uuid[],
  p_now timestamptz default now()
) returns table (deleted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may finalize temporary payload deletions' using errcode = '42501';
  end if;

  update public.agent_payload_manifests m
  set content_deleted_at = coalesce(m.content_deleted_at, p_now),
      deletion_error = null,
      updated_at = p_now
  where m.manifest_id = any(coalesce(p_manifest_ids, '{}'::uuid[]))
    and m.deleted_at is not null
    and m.content_deleted_at is null;
  get diagnostics deleted_count = row_count;

  update public.agent_runs r
  set payload_cleanup_status = 'deleted',
      payload_deleted_at = coalesce(r.payload_deleted_at, p_now),
      payload_cleanup_error = null,
      updated_at = p_now
  where r.status in ('completed', 'blocked', 'failed', 'cancelled')
    and r.payload_cleanup_status <> 'deleted'
    and not exists (
      select 1 from public.agent_payload_manifests m
      where m.run_id = r.run_id and m.content_deleted_at is null
    );

  return query select coalesce(deleted_count, 0);
end $$;

create or replace function public.record_agent_payload_deletion_failure(
  p_manifest_ids uuid[],
  p_error_code text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may record temporary payload cleanup failures' using errcode = '42501';
  end if;

  update public.agent_payload_manifests m
  set deletion_error = left(coalesce(nullif(trim(p_error_code), ''), 'storage_delete_failed'), 120),
      updated_at = now()
  where m.manifest_id = any(coalesce(p_manifest_ids, '{}'::uuid[]))
    and m.content_deleted_at is null;
end $$;

-- Account deletion is allowed to proceed only after this storage-first
-- contract has returned deletion evidence for every temporary object.
create or replace function public.request_user_agent_payload_deletion(
  p_user_id uuid,
  p_now timestamptz default now()
) returns table (
  manifest_id uuid,
  storage_bucket text,
  storage_path text,
  manifest_path text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may delete only its own temporary payloads' using errcode = '42501';
  end if;

  return query
  update public.agent_payload_manifests m
  set deleted_at = coalesce(m.deleted_at, p_now),
      deletion_requested_at = coalesce(m.deletion_requested_at, p_now),
      deletion_error = null,
      updated_at = p_now
  where m.user_id = p_user_id
    and m.content_deleted_at is null
  returning m.manifest_id, m.storage_bucket, m.storage_path, m.manifest_path;
end $$;

create or replace function public.finalize_user_agent_payload_deletion(
  p_user_id uuid,
  p_manifest_ids uuid[],
  p_now timestamptz default now()
) returns table (deleted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may finalize only its own temporary payloads' using errcode = '42501';
  end if;

  update public.agent_payload_manifests m
  set content_deleted_at = coalesce(m.content_deleted_at, p_now),
      deletion_error = null,
      updated_at = p_now
  where m.user_id = p_user_id
    and m.manifest_id = any(coalesce(p_manifest_ids, '{}'::uuid[]))
    and m.deleted_at is not null
    and m.content_deleted_at is null;
  get diagnostics deleted_count = row_count;
  return query select coalesce(deleted_count, 0);
end $$;

create or replace function public.record_user_agent_payload_deletion_failure(
  p_user_id uuid,
  p_error_code text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'User may record only its own temporary payload cleanup failure' using errcode = '42501';
  end if;

  update public.agent_payload_manifests m
  set deletion_error = left(coalesce(nullif(trim(p_error_code), ''), 'storage_delete_failed'), 120),
      updated_at = now()
  where m.user_id = p_user_id and m.content_deleted_at is null;
end $$;

revoke all on function public.record_agent_run_snapshot_consent(uuid, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.record_agent_run_snapshot_consent(uuid, uuid, uuid, text, timestamptz) to authenticated, service_role;
revoke all on function public.request_agent_run_payload_deletion(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.request_agent_run_payload_deletion(uuid, uuid, uuid, timestamptz) to authenticated, service_role;
revoke all on function public.finalize_agent_run_payload_deletion(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.finalize_agent_run_payload_deletion(uuid, uuid, uuid, uuid[]) to authenticated, service_role;
revoke all on function public.record_agent_run_payload_deletion_failure(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.record_agent_run_payload_deletion_failure(uuid, uuid, uuid, text) to authenticated, service_role;
revoke all on function public.list_pending_agent_payload_deletions(timestamptz) from public, anon, authenticated;
grant execute on function public.list_pending_agent_payload_deletions(timestamptz) to service_role;
revoke all on function public.finalize_agent_payload_deletions(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_agent_payload_deletions(uuid[], timestamptz) to service_role;
revoke all on function public.record_agent_payload_deletion_failure(uuid[], text) from public, anon, authenticated;
grant execute on function public.record_agent_payload_deletion_failure(uuid[], text) to service_role;
revoke all on function public.request_user_agent_payload_deletion(uuid, timestamptz) from public, anon;
grant execute on function public.request_user_agent_payload_deletion(uuid, timestamptz) to authenticated, service_role;
revoke all on function public.finalize_user_agent_payload_deletion(uuid, uuid[], timestamptz) from public, anon;
grant execute on function public.finalize_user_agent_payload_deletion(uuid, uuid[], timestamptz) to authenticated, service_role;
revoke all on function public.record_user_agent_payload_deletion_failure(uuid, text) from public, anon;
grant execute on function public.record_user_agent_payload_deletion_failure(uuid, text) to authenticated, service_role;
