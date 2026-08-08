-- Keep "sent to mentor" distinct from "mentor has seen this version".
-- The initial Completion schema already contains mentor_last_seen_version_label;
-- a user reporting a send event must not promote that fact into mentor-seen truth.

alter table public.completion_project_state
  add column if not exists mentor_last_sent_version_label varchar(80);

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
         mentor_last_sent_version_label = coalesce(v_label, mentor_last_sent_version_label),
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

revoke all on function public.completion_report_mentor_submission(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.completion_report_mentor_submission(uuid, uuid, text)
  to service_role;
