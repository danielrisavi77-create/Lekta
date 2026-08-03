-- Academic Completion shared persistence foundation.
-- Canonical shared DB authority remains the existing Lekta Supabase project.
-- This migration stores structured workflow metadata only. It intentionally
-- does NOT add raw thesis/document text, mentor-message bodies, prompts,
-- model outputs, source passages, or generic JSON payload columns.

create table if not exists public.completion_project_state (
  academic_project_id uuid primary key references public.academic_projects(id) on delete cascade,

  stage text not null default 'TOPIC_ACTIVE'
    check (stage in (
      'TOPIC_ACTIVE','PLANNING','RESEARCH','DRAFTING','REVISION',
      'MENTOR_REVIEW','FINAL_CHECK','SUBMISSION','DEFENSE','COMPLETED'
    )),

  target_submission_date date,
  target_defense_date date,
  deadline_authority_type text not null default 'USER_REPORTED'
    check (deadline_authority_type in (
      'USER_REPORTED','OFFICIAL_RULE','MENTOR_REPORTED','SYSTEM_ASSESSED',
      'KATEDRA_ASSESSED','LEKTA_VERIFIED'
    )),
  deadline_source_id text,
  deadline_source_label varchar(160),

  mentor_last_sent_at timestamptz,
  mentor_last_seen_version_label varchar(80),
  mentor_waiting_for_response boolean not null default false,

  topic_approved boolean,
  topic_approval_authority_type text
    check (topic_approval_authority_type is null or topic_approval_authority_type in (
      'USER_REPORTED','OFFICIAL_RULE','MENTOR_REPORTED','SYSTEM_ASSESSED',
      'KATEDRA_ASSESSED','LEKTA_VERIFIED'
    )),
  structure_approved boolean,
  structure_approval_authority_type text
    check (structure_approval_authority_type is null or structure_approval_authority_type in (
      'USER_REPORTED','OFFICIAL_RULE','MENTOR_REPORTED','SYSTEM_ASSESSED',
      'KATEDRA_ASSESSED','LEKTA_VERIFIED'
    )),
  methodology_approved boolean,
  methodology_approval_authority_type text
    check (methodology_approval_authority_type is null or methodology_approval_authority_type in (
      'USER_REPORTED','OFFICIAL_RULE','MENTOR_REPORTED','SYSTEM_ASSESSED',
      'KATEDRA_ASSESSED','LEKTA_VERIFIED'
    )),
  defense_approved boolean,
  defense_approval_authority_type text
    check (defense_approval_authority_type is null or defense_approval_authority_type in (
      'USER_REPORTED','OFFICIAL_RULE','MENTOR_REPORTED','SYSTEM_ASSESSED',
      'KATEDRA_ASSESSED','LEKTA_VERIFIED'
    )),

  ai_policy_ruleset_id text,
  ai_policy_ruleset_version text,
  ai_policy_verified_at date,
  ai_mentor_consultation text not null default 'NOT_ASKED'
    check (ai_mentor_consultation in (
      'NOT_ASKED','USER_REPORTED_CONSULTED','USER_REPORTED_PERMISSION_GIVEN',
      'USER_REPORTED_RESTRICTED','UNKNOWN'
    )),
  ai_disclosure_state text not null default 'NOT_STARTED'
    check (ai_disclosure_state in (
      'NOT_STARTED','USAGE_EVENTS_EXIST','DRAFT_READY','USER_REPORTED_INCLUDED'
    )),
  ai_data_safety_acknowledged boolean not null default false,

  submitted_at timestamptz,
  defended_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.completion_tasks (
  id uuid primary key default gen_random_uuid(),
  academic_project_id uuid not null references public.academic_projects(id) on delete cascade,

  task_type varchar(64) not null,
  title varchar(160) not null
    check (char_length(btrim(title)) between 1 and 160)
    check (title !~ E'[\n\r\t]'),
  status text not null default 'OPEN'
    check (status in ('OPEN','IN_PROGRESS','WAITING_EXTERNAL','READY_TO_SEND','DONE','CANCELLED')),
  priority text not null default 'MEDIUM'
    check (priority in ('CRITICAL','HIGH','MEDIUM','LOW')),
  stage text not null
    check (stage in (
      'TOPIC_ACTIVE','PLANNING','RESEARCH','DRAFTING','REVISION',
      'MENTOR_REVIEW','FINAL_CHECK','SUBMISSION','DEFENSE','COMPLETED'
    )),

  authority_type text not null
    check (authority_type in (
      'USER_REPORTED','OFFICIAL_RULE','MENTOR_REPORTED','SYSTEM_ASSESSED',
      'KATEDRA_ASSESSED','LEKTA_VERIFIED'
    )),
  authority_source_id text,
  authority_source_label varchar(160),

  capability text
    check (capability is null or capability in (
      'RESEARCH_DISCOVERY','QUESTION_COACHING','STRUCTURE_ASSIST','LANGUAGE_REVIEW',
      'CONTENT_REVIEW','PARAPHRASE','GENERATE_SUBMISSION_TEXT','DEFENSE_PREP',
      'DISCLOSURE_HELP','TRANSCRIPTION','TRANSLATION'
    )),

  related_rule_ids text[] not null default '{}',
  related_lekta_finding_ids text[] not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.completion_events (
  id uuid primary key default gen_random_uuid(),
  academic_project_id uuid not null references public.academic_projects(id) on delete cascade,
  task_id uuid references public.completion_tasks(id) on delete set null,

  event_type text not null
    check (event_type in (
      'PROJECT_CREATED','DEADLINE_SET','STAGE_CHANGED','TASK_CREATED','TASK_STATUS_CHANGED',
      'MENTOR_SUBMISSION_REPORTED','MENTOR_WAITING_CHANGED','MENTOR_APPROVAL_REPORTED',
      'POLICY_LOADED','AI_MENTOR_CONSULTATION_REPORTED','AI_DISCLOSURE_STATE_CHANGED',
      'AI_DATA_SAFETY_ACKNOWLEDGED','AI_ACTION_AUTHORIZED','AI_ACTION_DENIED',
      'LEKTA_CHECK_IMPORTED','LEKTA_FINDING_USER_CHANGED','LEKTA_FINDING_RECHECK_REQUIRED',
      'SUBMISSION_REPORTED','DEFENSE_REPORTED'
    )),

  capability text
    check (capability is null or capability in (
      'RESEARCH_DISCOVERY','QUESTION_COACHING','STRUCTURE_ASSIST','LANGUAGE_REVIEW',
      'CONTENT_REVIEW','PARAPHRASE','GENERATE_SUBMISSION_TEXT','DEFENSE_PREP',
      'DISCLOSURE_HELP','TRANSCRIPTION','TRANSLATION'
    )),
  policy_rule_ids text[] not null default '{}',
  provider_id varchar(80),
  model_id varchar(120),

  authority_type text not null
    check (authority_type in (
      'USER_REPORTED','OFFICIAL_RULE','MENTOR_REPORTED','SYSTEM_ASSESSED',
      'KATEDRA_ASSESSED','LEKTA_VERIFIED'
    )),
  authority_source_id text,
  authority_source_label varchar(160),

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists completion_tasks_project_status_idx
  on public.completion_tasks (academic_project_id, status, priority);

create index if not exists completion_events_project_occurred_idx
  on public.completion_events (academic_project_id, occurred_at desc);

create trigger completion_project_state_set_updated_at
  before update on public.completion_project_state
  for each row execute function public.set_academic_updated_at();

create trigger completion_tasks_set_updated_at
  before update on public.completion_tasks
  for each row execute function public.set_academic_updated_at();

alter table public.completion_project_state enable row level security;
alter table public.completion_tasks enable row level security;
alter table public.completion_events enable row level security;

create policy "completion state select own project"
  on public.completion_project_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_project_state.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion state insert own project"
  on public.completion_project_state
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_project_state.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion state update own project"
  on public.completion_project_state
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_project_state.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_project_state.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion state delete own project"
  on public.completion_project_state
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_project_state.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion tasks select own project"
  on public.completion_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_tasks.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion tasks insert own project"
  on public.completion_tasks
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_tasks.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion tasks update own project"
  on public.completion_tasks
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_tasks.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_tasks.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion tasks delete own project"
  on public.completion_tasks
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_tasks.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion events select own project"
  on public.completion_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_events.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion events insert own project"
  on public.completion_events
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_events.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

create policy "completion events delete own project"
  on public.completion_events
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.academic_projects p
      where p.id = completion_events.academic_project_id
        and p.owner_user_id = auth.uid()
    )
  );

comment on table public.completion_project_state is
  'Academic Completion structured project metadata only; never raw thesis/document content.';
comment on table public.completion_tasks is
  'Academic Completion typed task metadata with sanitized short titles; no raw mentor-message bodies.';
comment on table public.completion_events is
  'Academic Completion content-free audit/workflow events; intentionally no generic payload/prompt/output column.';
