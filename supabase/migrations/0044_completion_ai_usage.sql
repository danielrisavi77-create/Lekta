-- Academic Completion live-AI usage telemetry.
-- Stores only project/task/capability/provider/model/token metadata required for
-- spend controls and abuse protection. It must never store prompts, model
-- output, thesis text, mentor-message bodies, or source passages.

create table if not exists public.completion_ai_usage (
  id uuid primary key default gen_random_uuid(),
  academic_project_id uuid not null references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  capability text not null
    check (capability in (
      'RESEARCH_DISCOVERY','QUESTION_COACHING','STRUCTURE_ASSIST','LANGUAGE_REVIEW',
      'CONTENT_REVIEW','PARAPHRASE','GENERATE_SUBMISSION_TEXT','DEFENSE_PREP',
      'DISCLOSURE_HELP','TRANSCRIPTION','TRANSLATION'
    )),
  provider_id varchar(80) not null,
  model_id varchar(120) not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  created_at timestamptz not null default now(),

  constraint completion_ai_usage_task_project_fkey
    foreign key (task_id, academic_project_id)
    references public.completion_tasks(id, academic_project_id)
    deferrable initially deferred
);

create index if not exists completion_ai_usage_user_time_idx
  on public.completion_ai_usage (user_id, created_at desc);

create index if not exists completion_ai_usage_project_time_idx
  on public.completion_ai_usage (academic_project_id, created_at desc);

create index if not exists completion_ai_usage_task_project_idx
  on public.completion_ai_usage (task_id, academic_project_id);

create or replace function public.validate_completion_ai_usage_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.academic_projects p
    where p.id = new.academic_project_id
      and p.user_id = new.user_id
  ) then
    raise exception 'Completion AI usage user does not own project %', new.academic_project_id
      using errcode = '23503';
  end if;
  return new;
end
$$;

revoke all on function public.validate_completion_ai_usage_owner()
  from public, anon, authenticated;
grant execute on function public.validate_completion_ai_usage_owner()
  to service_role;

drop trigger if exists completion_ai_usage_validate_owner
  on public.completion_ai_usage;
create trigger completion_ai_usage_validate_owner
  before insert or update of academic_project_id, user_id
  on public.completion_ai_usage
  for each row execute function public.validate_completion_ai_usage_owner();

alter table public.completion_ai_usage enable row level security;

-- Usage telemetry is server-internal in v0.1. No browser role receives access.
revoke all on table public.completion_ai_usage from anon, authenticated;
grant select, insert on table public.completion_ai_usage to service_role;

comment on table public.completion_ai_usage is
  'Content-free Academic Completion AI usage telemetry for project-scoped spend and abuse controls.';
