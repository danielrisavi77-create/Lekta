-- Epic 12: authoritative Lekta -> Academic Completion handoff.
--
-- Privacy boundary:
-- - lekta_checks keeps only the existing sanitized LektaResult projection.
-- - completion_lekta_findings stores stable IDs + short labels/workflow metadata.
-- - no DOCX bytes/body text, issue detail/location, mentor comments, prompts or model outputs.
--
-- Authority boundary:
-- - browser roles cannot mint handoff tokens or mutate finding lifecycle directly.
-- - Completion server mints an opaque token after auth + ownership checks.
-- - Lekta records a check through a service-role-only atomic RPC.
-- - only a NEW Lekta check may transition USER_CHANGED/RECHECK_REQUIRED -> VERIFIED_FIXED.

create table if not exists public.completion_lekta_handoff_tokens (
  id uuid primary key default gen_random_uuid(),
  academic_project_id uuid not null references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash char(64) not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  use_count integer not null default 0 check (use_count between 0 and 10),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists completion_lekta_handoff_project_idx
  on public.completion_lekta_handoff_tokens (academic_project_id, expires_at desc);
create index if not exists completion_lekta_handoff_expiry_idx
  on public.completion_lekta_handoff_tokens (expires_at)
  where use_count < 10;

alter table public.completion_lekta_handoff_tokens enable row level security;

-- Intentionally no browser policy: this is a server-only capability-token table.
revoke all on table public.completion_lekta_handoff_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.completion_lekta_handoff_tokens to service_role;

create or replace function public.validate_completion_lekta_handoff_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.academic_projects p
    where p.id = new.academic_project_id and p.user_id = new.user_id
  ) then
    raise exception 'COMPLETION_LEKTA_HANDOFF_PROJECT_NOT_OWNED'
      using errcode = '23503';
  end if;
  return new;
end
$$;

revoke all on function public.validate_completion_lekta_handoff_owner()
  from public, anon, authenticated;
grant execute on function public.validate_completion_lekta_handoff_owner()
  to service_role;

drop trigger if exists completion_lekta_handoff_validate_owner
  on public.completion_lekta_handoff_tokens;
create trigger completion_lekta_handoff_validate_owner
  before insert or update of academic_project_id, user_id
  on public.completion_lekta_handoff_tokens
  for each row execute function public.validate_completion_lekta_handoff_owner();

create table if not exists public.completion_lekta_findings (
  academic_project_id uuid not null references public.academic_projects(id) on delete cascade,
  issue_key varchar(320) not null,
  check_id varchar(160),
  rule_id varchar(200),
  severity text not null check (severity in ('CRITICAL','WARNING','INFO')),
  label varchar(160) not null
    check (char_length(btrim(label)) between 1 and 160)
    check (label !~ E'[\n\r\t]'),
  lifecycle_status text not null default 'OPEN'
    check (lifecycle_status in ('OPEN','USER_CHANGED','RECHECK_REQUIRED','VERIFIED_FIXED')),
  present_in_latest boolean not null default true,
  task_id uuid,
  first_seen_analysis_id text not null,
  last_seen_analysis_id text,
  verified_fixed_analysis_id text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz,
  verified_fixed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (academic_project_id, issue_key),
  constraint completion_lekta_findings_task_project_fkey
    foreign key (task_id, academic_project_id)
    references public.completion_tasks(id, academic_project_id)
    deferrable initially deferred
);

create index if not exists completion_lekta_findings_project_status_idx
  on public.completion_lekta_findings (academic_project_id, present_in_latest, lifecycle_status, severity);
create index if not exists completion_lekta_findings_task_idx
  on public.completion_lekta_findings (task_id, academic_project_id)
  where task_id is not null;

create trigger completion_lekta_findings_set_updated_at
  before update on public.completion_lekta_findings
  for each row execute function public.set_completion_updated_at();

alter table public.completion_lekta_findings enable row level security;

create policy completion_lekta_findings_select_own
  on public.completion_lekta_findings
  for select to authenticated
  using (exists (
    select 1 from public.academic_projects p
    where p.id = academic_project_id and p.user_id = (select auth.uid())
  ));

create policy completion_lekta_findings_permanent_account
  on public.completion_lekta_findings
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

revoke all on table public.completion_lekta_findings from public, anon, authenticated;
grant select on table public.completion_lekta_findings to authenticated;
grant select, insert, update, delete on table public.completion_lekta_findings to service_role;

comment on table public.completion_lekta_findings is
  'Workflow projection of sanitized Lekta finding identities. VERIFIED_FIXED is written only during a later Lekta check reconciliation.';

alter table public.completion_events
  add column if not exists lekta_finding_id varchar(320),
  add column if not exists lekta_status text
    check (lekta_status is null or lekta_status in ('OPEN','USER_CHANGED','RECHECK_REQUIRED','VERIFIED_FIXED')),
  add column if not exists lekta_analysis_id text;

alter table public.completion_events
  drop constraint if exists completion_events_event_type_check;
alter table public.completion_events
  add constraint completion_events_event_type_check
  check (event_type in (
    'PROJECT_CREATED','DEADLINE_SET','STAGE_CHANGED','TASK_CREATED','TASK_STATUS_CHANGED',
    'MENTOR_SUBMISSION_REPORTED','MENTOR_WAITING_CHANGED','MENTOR_APPROVAL_REPORTED',
    'POLICY_LOADED','AI_MENTOR_CONSULTATION_REPORTED','AI_DISCLOSURE_STATE_CHANGED',
    'AI_DATA_SAFETY_ACKNOWLEDGED','AI_ACTION_AUTHORIZED','AI_ACTION_DENIED',
    'LEKTA_CHECK_IMPORTED','LEKTA_FINDING_USER_CHANGED','LEKTA_FINDING_RECHECK_REQUIRED',
    'LEKTA_FINDING_VERIFIED_FIXED','LEKTA_FINDING_REOPENED',
    'SUBMISSION_REPORTED','DEFENSE_REPORTED'
  ));

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

  delete from public.completion_lekta_handoff_tokens
   where user_id = p_user
     and academic_project_id = p_project
     and (expires_at <= now() or use_count >= 10);

  insert into public.completion_lekta_handoff_tokens(
    academic_project_id, user_id, token_hash, expires_at
  ) values (
    p_project, p_user, p_token_hash, p_expires_at
  );

  return v_marked;
end
$$;

create or replace function public.completion_mark_lekta_finding_changed(
  p_user uuid,
  p_project uuid,
  p_issue_key text
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_present boolean;
  v_task uuid;
begin
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

  select lifecycle_status, present_in_latest, task_id
    into v_status, v_present, v_task
  from public.completion_lekta_findings
  where academic_project_id = p_project
    and issue_key = p_issue_key
  for update;

  if v_status is null then
    raise exception 'COMPLETION_LEKTA_FINDING_NOT_FOUND' using errcode = '23503';
  end if;
  if not v_present or v_status = 'VERIFIED_FIXED' then
    raise exception 'COMPLETION_LEKTA_FINDING_NOT_CURRENT' using errcode = '22023';
  end if;
  if v_status = 'USER_CHANGED' then
    return false;
  end if;
  if v_status <> 'OPEN' then
    raise exception 'COMPLETION_LEKTA_FINDING_RECHECK_ALREADY_REQUIRED' using errcode = '22023';
  end if;

  update public.completion_lekta_findings
     set lifecycle_status = 'USER_CHANGED'
   where academic_project_id = p_project and issue_key = p_issue_key;

  if v_task is not null then
    update public.completion_tasks
       set status = 'IN_PROGRESS'
     where id = v_task and academic_project_id = p_project and status <> 'CANCELLED';
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

create or replace function public.lekta_record_completion_check_with_token(
  p_token_hash text,
  p_analysis_id text,
  p_profile_id text,
  p_ruleset_id text,
  p_ruleset_version text,
  p_score integer,
  p_category_scores jsonb,
  p_issues jsonb,
  p_document_fingerprint text,
  p_coverage_tier smallint,
  p_checked_at timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_token public.completion_lekta_handoff_tokens%rowtype;
  v_project public.academic_projects%rowtype;
  v_check_id uuid;
  v_issue jsonb;
  v_issue_key text;
  v_check_key text;
  v_rule_key text;
  v_label text;
  v_severity text;
  v_previous_status text;
  v_existing_task uuid;
  v_task uuid;
  v_stage text;
  v_missing record;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'COMPLETION_LEKTA_TOKEN_INVALID' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_analysis_id, ''))) = 0 or char_length(p_analysis_id) > 200 then
    raise exception 'COMPLETION_LEKTA_ANALYSIS_ID_INVALID' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_ruleset_id, ''))) = 0 or char_length(p_ruleset_id) > 500 then
    raise exception 'COMPLETION_LEKTA_RULESET_INVALID' using errcode = '22023';
  end if;
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'COMPLETION_LEKTA_SCORE_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_category_scores, '[]'::jsonb)) <> 'array' then
    raise exception 'COMPLETION_LEKTA_CATEGORY_SCORES_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_issues, '[]'::jsonb)) > 500 then
    raise exception 'COMPLETION_LEKTA_ISSUES_INVALID' using errcode = '22023';
  end if;

  select * into v_token
  from public.completion_lekta_handoff_tokens t
  where t.token_hash = p_token_hash
  for update;

  if v_token.id is null
     or v_token.expires_at <= now()
     or v_token.use_count >= 10 then
    raise exception 'COMPLETION_LEKTA_HANDOFF_EXPIRED' using errcode = '42501';
  end if;

  select * into v_project
  from public.academic_projects p
  where p.id = v_token.academic_project_id and p.user_id = v_token.user_id;

  if v_project.id is null then
    raise exception 'COMPLETION_PROJECT_NOT_OWNED' using errcode = '42501';
  end if;
  if v_project.profile_id is not null
     and btrim(v_project.profile_id) <> ''
     and btrim(coalesce(p_profile_id, '')) <> v_project.profile_id then
    raise exception 'COMPLETION_LEKTA_PROFILE_MISMATCH' using errcode = '22023';
  end if;

  select id into v_check_id
  from public.lekta_checks
  where project_id = v_project.id and analysis_id = p_analysis_id;
  if v_check_id is not null then
    return v_check_id;
  end if;

  insert into public.lekta_checks(
    analysis_id,
    project_id,
    user_id,
    profile_id,
    ruleset_id,
    ruleset_version,
    score,
    category_scores,
    issues,
    document_fingerprint,
    coverage_tier,
    checked_at
  ) values (
    p_analysis_id,
    v_project.id,
    v_project.user_id,
    nullif(btrim(coalesce(p_profile_id, '')), ''),
    p_ruleset_id,
    nullif(btrim(coalesce(p_ruleset_version, '')), ''),
    p_score,
    coalesce(p_category_scores, '[]'::jsonb),
    coalesce(p_issues, '[]'::jsonb),
    nullif(btrim(coalesce(p_document_fingerprint, '')), ''),
    p_coverage_tier,
    coalesce(p_checked_at, now())
  ) returning id into v_check_id;

  select stage into v_stage
  from public.completion_project_state
  where academic_project_id = v_project.id
  for update;
  if v_stage is null then
    raise exception 'COMPLETION_STATE_NOT_FOUND' using errcode = '23503';
  end if;

  update public.completion_lekta_findings
     set present_in_latest = false
   where academic_project_id = v_project.id
     and present_in_latest = true;

  for v_issue in
    select value from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb))
  loop
    v_issue_key := btrim(coalesce(v_issue->>'issueKey', ''));
    if char_length(v_issue_key) = 0
       or char_length(v_issue_key) > 320
       or v_issue_key !~ '^(rule:|check:)' then
      raise exception 'COMPLETION_LEKTA_ISSUE_KEY_INVALID' using errcode = '22023';
    end if;

    v_check_key := nullif(left(btrim(coalesce(v_issue->>'checkId', '')), 160), '');
    v_rule_key := nullif(left(btrim(coalesce(v_issue->>'ruleId', '')), 200), '');
    v_label := left(btrim(regexp_replace(coalesce(v_issue->>'summary', 'Lekta nalaz'), E'[\n\r\t]+', ' ', 'g')), 160);
    if v_label = '' then v_label := 'Lekta nalaz'; end if;

    v_severity := case lower(coalesce(v_issue->>'severity', 'info'))
      when 'error' then 'CRITICAL'
      when 'critical' then 'CRITICAL'
      when 'warning' then 'WARNING'
      when 'major' then 'WARNING'
      else 'INFO'
    end;

    select lifecycle_status, task_id
      into v_previous_status, v_existing_task
    from public.completion_lekta_findings
    where academic_project_id = v_project.id and issue_key = v_issue_key
    for update;

    v_task := v_existing_task;
    if v_severity in ('CRITICAL','WARNING') then
      if v_task is null or exists (
        select 1 from public.completion_tasks t
        where t.id = v_task and t.academic_project_id = v_project.id and t.status = 'CANCELLED'
      ) then
        insert into public.completion_tasks(
          academic_project_id,
          task_type,
          title,
          status,
          priority,
          stage,
          authority_type,
          authority_source_id,
          authority_source_label,
          related_rule_ids,
          related_lekta_finding_ids
        ) values (
          v_project.id,
          'LEKTA_FINDING',
          v_label,
          'OPEN',
          case when v_severity = 'CRITICAL' then 'CRITICAL' else 'HIGH' end,
          v_stage,
          'LEKTA_VERIFIED',
          p_analysis_id,
          'Lekta check',
          case when v_rule_key is null then '{}'::text[] else array[v_rule_key] end,
          array[v_issue_key]
        ) returning id into v_task;
      else
        update public.completion_tasks
           set title = v_label,
               status = 'OPEN',
               priority = case when v_severity = 'CRITICAL' then 'CRITICAL' else 'HIGH' end,
               authority_type = 'LEKTA_VERIFIED',
               authority_source_id = p_analysis_id,
               authority_source_label = 'Lekta check',
               related_rule_ids = case when v_rule_key is null then '{}'::text[] else array[v_rule_key] end,
               related_lekta_finding_ids = array[v_issue_key]
         where id = v_task and academic_project_id = v_project.id;
      end if;
    end if;

    insert into public.completion_lekta_findings(
      academic_project_id,
      issue_key,
      check_id,
      rule_id,
      severity,
      label,
      lifecycle_status,
      present_in_latest,
      task_id,
      first_seen_analysis_id,
      last_seen_analysis_id,
      first_seen_at,
      last_seen_at
    ) values (
      v_project.id,
      v_issue_key,
      v_check_key,
      v_rule_key,
      v_severity,
      v_label,
      'OPEN',
      true,
      v_task,
      p_analysis_id,
      p_analysis_id,
      coalesce(p_checked_at, now()),
      coalesce(p_checked_at, now())
    )
    on conflict (academic_project_id, issue_key)
    do update set
      check_id = excluded.check_id,
      rule_id = excluded.rule_id,
      severity = excluded.severity,
      label = excluded.label,
      lifecycle_status = 'OPEN',
      present_in_latest = true,
      task_id = excluded.task_id,
      last_seen_analysis_id = excluded.last_seen_analysis_id,
      last_seen_at = excluded.last_seen_at,
      verified_fixed_analysis_id = null,
      verified_fixed_at = null;

    if v_previous_status = 'VERIFIED_FIXED' then
      insert into public.completion_events(
        academic_project_id,
        task_id,
        event_type,
        lekta_finding_id,
        lekta_status,
        lekta_analysis_id,
        authority_type,
        authority_source_id,
        authority_source_label
      ) values (
        v_project.id,
        v_task,
        'LEKTA_FINDING_REOPENED',
        v_issue_key,
        'OPEN',
        p_analysis_id,
        'LEKTA_VERIFIED',
        p_analysis_id,
        'Lekta re-check'
      );
    end if;
  end loop;

  for v_missing in
    select issue_key, task_id
    from public.completion_lekta_findings
    where academic_project_id = v_project.id
      and present_in_latest = false
      and lifecycle_status in ('USER_CHANGED','RECHECK_REQUIRED')
    for update
  loop
    update public.completion_lekta_findings
       set lifecycle_status = 'VERIFIED_FIXED',
           verified_fixed_analysis_id = p_analysis_id,
           verified_fixed_at = coalesce(p_checked_at, now())
     where academic_project_id = v_project.id
       and issue_key = v_missing.issue_key;

    if v_missing.task_id is not null then
      update public.completion_tasks
         set status = 'DONE',
             authority_type = 'LEKTA_VERIFIED',
             authority_source_id = p_analysis_id,
             authority_source_label = 'Lekta re-check'
       where id = v_missing.task_id
         and academic_project_id = v_project.id
         and status <> 'CANCELLED';
    end if;

    insert into public.completion_events(
      academic_project_id,
      task_id,
      event_type,
      lekta_finding_id,
      lekta_status,
      lekta_analysis_id,
      authority_type,
      authority_source_id,
      authority_source_label
    ) values (
      v_project.id,
      v_missing.task_id,
      'LEKTA_FINDING_VERIFIED_FIXED',
      v_missing.issue_key,
      'VERIFIED_FIXED',
      p_analysis_id,
      'LEKTA_VERIFIED',
      p_analysis_id,
      'Lekta re-check'
    );
  end loop;

  insert into public.completion_events(
    academic_project_id,
    event_type,
    lekta_analysis_id,
    authority_type,
    authority_source_id,
    authority_source_label
  ) values (
    v_project.id,
    'LEKTA_CHECK_IMPORTED',
    p_analysis_id,
    'LEKTA_VERIFIED',
    p_analysis_id,
    'Lekta check'
  );

  update public.completion_project_state
     set updated_at = now()
   where academic_project_id = v_project.id;

  update public.completion_lekta_handoff_tokens
     set use_count = use_count + 1,
         last_used_at = now()
   where id = v_token.id;

  return v_check_id;
end
$$;

revoke all on function public.completion_prepare_lekta_handoff(uuid, uuid, text, timestamptz, boolean)
  from public, anon, authenticated;
revoke all on function public.completion_mark_lekta_finding_changed(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.lekta_record_completion_check_with_token(text, text, text, text, text, integer, jsonb, jsonb, text, smallint, timestamptz)
  from public, anon, authenticated;

grant execute on function public.completion_prepare_lekta_handoff(uuid, uuid, text, timestamptz, boolean)
  to service_role;
grant execute on function public.completion_mark_lekta_finding_changed(uuid, uuid, text)
  to service_role;
grant execute on function public.lekta_record_completion_check_with_token(text, text, text, text, text, integer, jsonb, jsonb, text, smallint, timestamptz)
  to service_role;
