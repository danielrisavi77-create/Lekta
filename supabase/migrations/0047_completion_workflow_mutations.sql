-- Atomic user-driven Academic Completion workflow mutations.
-- Trusted server code calls these RPCs after authenticating the permanent user.
-- Browser roles do not receive EXECUTE.

alter table public.completion_events
  add column if not exists task_status text
    check (task_status is null or task_status in (
      'OPEN','IN_PROGRESS','WAITING_EXTERNAL','READY_TO_SEND','DONE','CANCELLED'
    ));

alter table public.completion_events
  add column if not exists mentor_waiting boolean;

create or replace function public.completion_set_task_status(
  p_user uuid,
  p_project uuid,
  p_task uuid,
  p_status text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current text;
begin
  if p_status not in ('OPEN','IN_PROGRESS','DONE') then
    raise exception 'COMPLETION_TASK_STATUS_NOT_ALLOWED'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project and p.user_id = p_user
  ) then
    raise exception 'COMPLETION_PROJECT_NOT_OWNED'
      using errcode = '42501';
  end if;

  select status into v_current
  from public.completion_tasks
  where id = p_task and academic_project_id = p_project
  for update;

  if v_current is null then
    raise exception 'COMPLETION_TASK_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_current = 'CANCELLED' then
    raise exception 'COMPLETION_CANCELLED_TASK_IMMUTABLE'
      using errcode = '22023';
  end if;

  if v_current = p_status then
    return false;
  end if;

  update public.completion_tasks
     set status = p_status
   where id = p_task and academic_project_id = p_project;

  insert into public.completion_events(
    academic_project_id,
    task_id,
    event_type,
    task_status,
    authority_type,
    authority_source_label
  ) values (
    p_project,
    p_task,
    'TASK_STATUS_CHANGED',
    p_status,
    'USER_REPORTED',
    'Project task control'
  );

  return true;
end
$$;

create or replace function public.completion_report_mentor_submission(
  p_user uuid,
  p_project uuid,
  p_version_label text default null
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_label text;
begin
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project and p.user_id = p_user
  ) then
    raise exception 'COMPLETION_PROJECT_NOT_OWNED'
      using errcode = '42501';
  end if;

  v_label := nullif(btrim(coalesce(p_version_label, '')), '');
  if v_label is not null and (
    char_length(v_label) > 80 or v_label ~ E'[\n\r\t]'
  ) then
    raise exception 'COMPLETION_VERSION_LABEL_INVALID'
      using errcode = '22023';
  end if;

  update public.completion_project_state
     set mentor_last_sent_at = now(),
         mentor_last_seen_version_label = coalesce(v_label, mentor_last_seen_version_label),
         mentor_waiting_for_response = true
   where academic_project_id = p_project;

  if not found then
    raise exception 'COMPLETION_STATE_NOT_FOUND'
      using errcode = '23503';
  end if;

  insert into public.completion_events(
    academic_project_id,
    event_type,
    mentor_waiting,
    authority_type,
    authority_source_label
  ) values (
    p_project,
    'MENTOR_SUBMISSION_REPORTED',
    true,
    'USER_REPORTED',
    'Project mentor control'
  );

  return true;
end
$$;

create or replace function public.completion_report_mentor_response(
  p_user uuid,
  p_project uuid
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.academic_projects p
    where p.id = p_project and p.user_id = p_user
  ) then
    raise exception 'COMPLETION_PROJECT_NOT_OWNED'
      using errcode = '42501';
  end if;

  update public.completion_project_state
     set mentor_waiting_for_response = false
   where academic_project_id = p_project;

  if not found then
    raise exception 'COMPLETION_STATE_NOT_FOUND'
      using errcode = '23503';
  end if;

  insert into public.completion_events(
    academic_project_id,
    event_type,
    mentor_waiting,
    authority_type,
    authority_source_label
  ) values (
    p_project,
    'MENTOR_WAITING_CHANGED',
    false,
    'USER_REPORTED',
    'Project mentor control'
  );

  return true;
end
$$;

revoke all on function public.completion_set_task_status(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.completion_report_mentor_submission(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.completion_report_mentor_response(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.completion_set_task_status(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.completion_report_mentor_submission(uuid, uuid, text)
  to service_role;
grant execute on function public.completion_report_mentor_response(uuid, uuid)
  to service_role;
