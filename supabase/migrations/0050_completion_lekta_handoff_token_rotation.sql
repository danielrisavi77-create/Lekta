-- Epic 12 hardening: exactly one active handoff capability per project/user.
-- A fresh Completion -> Lekta launch invalidates every older URL/token for the project.
-- The current token may still be reused a few times inside its short expiry window so
-- browser/network retries and repeated local analyses on the same Lekta visit remain usable.

create or replace function public.completion_prepare_lekta_handoff(
  p_user uuid,
  p_project uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_mark_recheck boolean default false
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_finding record;
  v_marked integer := 0;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'COMPLETION_LEKTA_TOKEN_INVALID' using errcode = '22023';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'COMPLETION_LEKTA_TOKEN_EXPIRY_INVALID' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_user and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'COMPLETION_PERMANENT_ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project and p.user_id = p_user
  ) then
    raise exception 'COMPLETION_PROJECT_NOT_OWNED' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.completion_project_state s
    where s.academic_project_id = p_project
  ) then
    raise exception 'COMPLETION_STATE_NOT_FOUND' using errcode = '23503';
  end if;

  if p_mark_recheck then
    for v_finding in
      select issue_key, task_id
      from public.completion_lekta_findings
      where academic_project_id = p_project
        and present_in_latest = true
        and lifecycle_status = 'USER_CHANGED'
      for update
    loop
      update public.completion_lekta_findings
         set lifecycle_status = 'RECHECK_REQUIRED'
       where academic_project_id = p_project
         and issue_key = v_finding.issue_key;

      if v_finding.task_id is not null then
        update public.completion_tasks
           set status = 'IN_PROGRESS'
         where id = v_finding.task_id
           and academic_project_id = p_project
           and status <> 'CANCELLED';
      end if;

      insert into public.completion_events(
        academic_project_id,
        task_id,
        event_type,
        lekta_finding_id,
        lekta_status,
        authority_type,
        authority_source_label
      ) values (
        p_project,
        v_finding.task_id,
        'LEKTA_FINDING_RECHECK_REQUIRED',
        v_finding.issue_key,
        'RECHECK_REQUIRED',
        'USER_REPORTED',
        'Lekta re-check handoff'
      );
      v_marked := v_marked + 1;
    end loop;
  end if;

  -- Capability rotation: no previous handoff URL for this project remains valid.
  delete from public.completion_lekta_handoff_tokens
   where user_id = p_user
     and academic_project_id = p_project;

  insert into public.completion_lekta_handoff_tokens(
    academic_project_id,
    user_id,
    token_hash,
    expires_at
  ) values (
    p_project,
    p_user,
    p_token_hash,
    p_expires_at
  );

  return v_marked;
end
$$;

revoke all on function public.completion_prepare_lekta_handoff(uuid, uuid, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.completion_prepare_lekta_handoff(uuid, uuid, text, timestamptz, boolean)
  to service_role;
