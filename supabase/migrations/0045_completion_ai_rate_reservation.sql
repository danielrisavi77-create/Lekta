-- Atomic spend/abuse reservation for live Academic Completion AI actions.
-- Called only by trusted service-role code immediately before a real provider
-- request. A policy-denied action never reaches this function because the
-- provider adapter is never invoked.

create or replace function public.completion_ai_reserve(
  p_user uuid,
  p_project uuid,
  p_task uuid,
  p_capability text,
  p_provider text,
  p_model text,
  p_ten_minute_limit integer default 4,
  p_daily_limit integer default 12
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_usage_id uuid;
  v_ten_minute_count integer;
  v_daily_count integer;
begin
  if p_ten_minute_limit < 1 or p_daily_limit < 1 then
    raise exception 'COMPLETION_AI_INVALID_LIMIT'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.academic_projects p
    where p.id = p_project and p.user_id = p_user
  ) then
    raise exception 'COMPLETION_AI_PROJECT_NOT_OWNED'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.completion_tasks t
    where t.id = p_task
      and t.academic_project_id = p_project
      and t.capability = p_capability
  ) then
    raise exception 'COMPLETION_AI_TASK_MISMATCH'
      using errcode = '23503';
  end if;

  -- Serialize reservations per user so parallel requests cannot all observe the
  -- same pre-insert count and overshoot the provider-spend ceiling.
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select count(*)::integer
    into v_ten_minute_count
  from public.completion_ai_usage
  where user_id = p_user
    and created_at >= now() - interval '10 minutes';

  if v_ten_minute_count >= p_ten_minute_limit then
    raise exception 'COMPLETION_AI_RATE_LIMIT_10M'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
    into v_daily_count
  from public.completion_ai_usage
  where user_id = p_user
    and created_at >= now() - interval '24 hours';

  if v_daily_count >= p_daily_limit then
    raise exception 'COMPLETION_AI_RATE_LIMIT_24H'
      using errcode = 'P0001';
  end if;

  insert into public.completion_ai_usage(
    academic_project_id,
    user_id,
    task_id,
    capability,
    provider_id,
    model_id,
    input_tokens,
    output_tokens
  ) values (
    p_project,
    p_user,
    p_task,
    p_capability,
    p_provider,
    p_model,
    0,
    0
  ) returning id into v_usage_id;

  return v_usage_id;
end
$$;

create or replace function public.completion_ai_finalize(
  p_usage_id uuid,
  p_user uuid,
  p_input_tokens integer,
  p_output_tokens integer
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'COMPLETION_AI_INVALID_USAGE'
      using errcode = '22023';
  end if;

  update public.completion_ai_usage
     set input_tokens = p_input_tokens,
         output_tokens = p_output_tokens
   where id = p_usage_id
     and user_id = p_user;

  return found;
end
$$;

revoke all on function public.completion_ai_reserve(uuid, uuid, uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.completion_ai_finalize(uuid, uuid, integer, integer)
  from public, anon, authenticated;

grant execute on function public.completion_ai_reserve(uuid, uuid, uuid, text, text, text, integer, integer)
  to service_role;
grant execute on function public.completion_ai_finalize(uuid, uuid, integer, integer)
  to service_role;
