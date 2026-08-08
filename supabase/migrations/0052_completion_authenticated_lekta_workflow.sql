-- Epic 12.5 production hardening:
-- User-triggered Lekta workflow mutations should run under the caller's
-- authenticated session rather than requiring the Completion web app to hold
-- a global service-role/secret credential for normal user actions.
--
-- These RPCs are SECURITY DEFINER because the handoff token table and workflow
-- projections are intentionally not browser-writable. Every entry point:
--   1. derives the user from auth.uid();
--   2. rejects anonymous/non-permanent accounts;
--   3. verifies project ownership;
--   4. exposes EXECUTE only to authenticated (not PUBLIC/anon).

create or replace function public.completion_prepare_lekta_handoff_user(
  p_project uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_mark_recheck boolean default false
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_finding record;
  v_marked integer := 0;
begin
  if v_user is null then
    raise exception 'COMPLETION_AUTHENTICATED_USER_REQUIRED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = v_user
      and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'COMPLETION_PERMANENT_ACCOUNT_REQUIRED'
      using errcode = '42501';
  end if;

  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'COMPLETION_LEKTA_TOKEN_INVALID'
      using errcode = '22023';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'COMPLETION_LEKTA_TOKEN_EXPIRY_INVALID'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.academic_projects p
    where p.id = p_project
      and p.user_id = v_user
  ) then
    raise exception 'COMPLETION_PROJECT_NOT_OWNED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.completion_project_state s
    where s.academic_project_id = p_project
  ) then
    raise exception 'COMPLETION_STATE_NOT_FOUND'
      using errcode = '23503';
  end if;

  if p_mark_recheck then
    for v_finding in
      select f.issue_key, f.task_id
      from public.completion_lekta_findings f
      where f.academic_project_id = p_project
        and f.present_in_latest = true
        and f.lifecycle_status = 'USER_CHANGED'
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

  delete from public.completion_lekta_handoff_tokens
   where user_id = v_user
     and academic_project_id = p_project;

  insert into public.completion_lekta_handoff_tokens(
    academic_project_id,
    user_id,
    token_hash,
    expires_at
  ) values (
    p_project,
    v_user,
    p_token_hash,
    p_expires_at
  );

  return v_marked;
end
$$;

revoke all on function public.completion_prepare_lekta_handoff_user(uuid, text, timestamptz, boolean)
  from public, anon;
grant execute on function public.completion_prepare_lekta_handoff_user(uuid, text, timestamptz, boolean)
  to authenticated;

create or replace function public.completion_mark_lekta_finding_changed_user(
  p_project uuid,
  p_issue_key text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_present boolean;
  v_task uuid;
begin
  if v_user is null then
    raise exception 'COMPLETION_AUTHENTICATED_USER_REQUIRED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = v_user
      and coalesce(u.is_anonymous, false) = false
  ) then
    raise exception 'COMPLETION_PERMANENT_ACCOUNT_REQUIRED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.academic_projects p
    where p.id = p_project
      and p.user_id = v_user
  ) then
    raise exception 'COMPLETION_PROJECT_NOT_OWNED'
      using errcode = '42501';
  end if;

  select f.lifecycle_status, f.present_in_latest, f.task_id
    into v_status, v_present, v_task
  from public.completion_lekta_findings f
  where f.academic_project_id = p_project
    and f.issue_key = p_issue_key
  for update;

  if v_status is null then
    raise exception 'COMPLETION_LEKTA_FINDING_NOT_FOUND'
      using errcode = '23503';
  end if;

  if not v_present or v_status = 'VERIFIED_FIXED' then
    raise exception 'COMPLETION_LEKTA_FINDING_NOT_CURRENT'
      using errcode = '22023';
  end if;

  if v_status = 'USER_CHANGED' then
    return false;
  end if;

  if v_status <> 'OPEN' then
    raise exception 'COMPLETION_LEKTA_FINDING_RECHECK_ALREADY_REQUIRED'
      using errcode = '22023';
  end if;

  update public.completion_lekta_findings
     set lifecycle_status = 'USER_CHANGED'
   where academic_project_id = p_project
     and issue_key = p_issue_key;

  if v_task is not null then
    update public.completion_tasks
       set status = 'IN_PROGRESS'
     where id = v_task
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
    v_task,
    'LEKTA_FINDING_USER_CHANGED',
    p_issue_key,
    'USER_CHANGED',
    'USER_REPORTED',
    'Lekta finding control'
  );

  return true;
end
$$;

revoke all on function public.completion_mark_lekta_finding_changed_user(uuid, text)
  from public, anon;
grant execute on function public.completion_mark_lekta_finding_changed_user(uuid, text)
  to authenticated;
