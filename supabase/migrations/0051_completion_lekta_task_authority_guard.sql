-- Epic 12 authority guard:
-- LEKTA_FINDING tasks are projections of document-verification findings and may
-- not be manually completed/reopened through the generic user task RPC.
-- Their status is controlled only by the Lekta reconciliation lifecycle.

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
  v_task_type text;
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

  select status, task_type
    into v_current, v_task_type
  from public.completion_tasks
  where id = p_task and academic_project_id = p_project
  for update;

  if v_current is null then
    raise exception 'COMPLETION_TASK_NOT_FOUND'
      using errcode = '23503';
  end if;

  if v_task_type = 'LEKTA_FINDING' then
    raise exception 'COMPLETION_LEKTA_TASK_REQUIRES_LEKTA_RECHECK'
      using errcode = '42501';
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

revoke all on function public.completion_set_task_status(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.completion_set_task_status(uuid, uuid, uuid, text)
  to service_role;
