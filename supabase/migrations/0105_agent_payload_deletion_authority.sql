-- Fizicko brisanje potvrduje samo serverski postupak nakon Storage API uspjeha.
-- Korisnik moze zatraziti opoziv, ali ne smije sam potvrditi nestanak bajtova.
-- Oporavak ukljucuje stare tombstone retke bez deletion_requested_at.

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
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may finalize physical payload deletion' using errcode = '42501';
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
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Only service role may finalize physical payload deletion' using errcode = '42501';
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
      and (m.deleted_at is not null or m.deletion_requested_at is not null or m.expires_at <= p_now)
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

revoke all on function public.finalize_agent_run_payload_deletion(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.finalize_agent_run_payload_deletion(uuid, uuid, uuid, uuid[]) to service_role;
revoke all on function public.finalize_user_agent_payload_deletion(uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_user_agent_payload_deletion(uuid, uuid[], timestamptz) to service_role;
