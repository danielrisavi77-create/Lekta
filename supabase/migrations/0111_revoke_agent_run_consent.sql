-- Withdrawal is independent of billing/feature activation. Physical deletion
-- is acknowledged only by the existing service-role finalizer after Storage removal.
create or replace function public.revoke_agent_run_consent(
  p_user_id uuid, p_project_id uuid, p_run_id uuid
) returns table (manifest_id uuid, storage_bucket text, storage_path text, manifest_path text)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is distinct from p_user_id
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Consent withdrawal requires the authenticated owner' using errcode = '42501';
  end if;
  perform 1 from public.agent_runs r
    where r.run_id=p_run_id and r.project_id=p_project_id and r.user_id=p_user_id
    for update;
  if not found then
    raise exception 'Agent run was not found for this owner and project' using errcode = 'P0002';
  end if;

  update public.agent_runs r set
    snapshot_consent_version=null, snapshot_consent_at=null,
    status=case when r.status in ('completed','failed','cancelled') then r.status else 'cancelled' end,
    cancelled_at=case when r.status in ('completed','failed','cancelled') then r.cancelled_at else now() end,
    updated_at=now()
    where r.run_id=p_run_id and r.project_id=p_project_id and r.user_id=p_user_id;

  return query select * from public.request_agent_run_payload_deletion(p_user_id,p_project_id,p_run_id,now());
end $$;
revoke all on function public.revoke_agent_run_consent(uuid,uuid,uuid) from public,anon;
grant execute on function public.revoke_agent_run_consent(uuid,uuid,uuid) to authenticated,service_role;

-- Serialize new run-bound payloads with withdrawal. Without this lock, a
-- registration could pass its initial check before withdrawal and insert after
-- the tombstone update, leaving a newly accessible object behind.
create or replace function public.guard_agent_payload_run_consent()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare r public.agent_runs%rowtype;
begin
  if new.run_id is null then return new; end if;
  select * into r from public.agent_runs ar
    where ar.run_id=new.run_id and ar.user_id=new.user_id and ar.project_id=new.project_id
    for update;
  if not found or r.snapshot_consent_version is distinct from 'agentic-snapshot-v1'
    or r.snapshot_consent_at is null or r.status not in ('initializing','pending','running','paused','blocked') then
    raise exception 'Run payload consent is absent or revoked' using errcode='40901';
  end if;
  return new;
end $$;
revoke all on function public.guard_agent_payload_run_consent() from public,anon,authenticated;
drop trigger if exists agent_payload_run_consent_guard on public.agent_payload_manifests;
create trigger agent_payload_run_consent_guard before insert or update of run_id
on public.agent_payload_manifests for each row execute function public.guard_agent_payload_run_consent();

-- Existing paid-project policies alone permit reads of tombstoned objects.
-- This restrictive policy removes that access while physical cleanup is pending.
-- It grants no new rights and does not alter the managed Storage schema.
create or replace function public.can_read_agent_payload(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp
as $$
  select exists(
    select 1 from public.agent_payload_manifests m
    join public.academic_projects p on p.id=m.project_id and p.user_id=m.user_id and p.deleted_at is null
    where m.user_id=(select auth.uid()) and m.storage_bucket=p_bucket
      and p_path in(m.storage_path,m.manifest_path)
      and m.deleted_at is null and m.content_deleted_at is null and m.expires_at>now()
      and (m.run_id is null or exists(
        select 1 from public.agent_runs r where r.run_id=m.run_id and r.user_id=m.user_id and r.project_id=m.project_id
          and r.snapshot_consent_version='agentic-snapshot-v1' and r.snapshot_consent_at is not null
      ))
  );
$$;
revoke all on function public.can_read_agent_payload(text,text) from public,anon;
grant execute on function public.can_read_agent_payload(text,text) to authenticated;
drop policy if exists agent_payload_live_read on storage.objects;
create policy agent_payload_live_read on storage.objects as restrictive for select to authenticated
using(bucket_id<>'katedra-temporary-materials' or public.can_read_agent_payload(bucket_id,name));
