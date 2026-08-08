-- Academic Suite shared foundation v0.1
--
-- Authority: the existing Lekta Supabase project.
-- Katedra joins this existing Auth/commerce backend; it does not create a
-- second Supabase project or a second entitlement system.
--
-- Privacy invariant: no raw DOCX, document body text, free-form issue detail /
-- location, mentor comments, or source passages are stored by this migration.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Shared project identity
-- ---------------------------------------------------------------------------

create table if not exists public.academic_projects (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  legacy_client_project_id text,
  title                    text,
  topic                    text not null default '',
  institution_id           text,
  unit_id                  text not null default '',
  program_id               text,
  profile_id               text,
  work_type                text not null check (work_type in (
    'seminar', 'final', 'graduate', 'specialist', 'doctoral', 'article', 'project'
  )),
  academic_year            text,
  mentor_name              text,
  deadline                 date,
  stage                    text not null default 'topic' check (stage in (
    'topic', 'research', 'plan', 'writing', 'mentor-review', 'katedra-review',
    'lekta-preflight', 'revision', 'submission', 'defense', 'completed'
  )),
  ruleset_id               text,
  ruleset_version          text,
  contract_version         text not null default '0.1',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists academic_projects_user_updated_idx
  on public.academic_projects (user_id, updated_at desc);
create unique index if not exists academic_projects_user_legacy_idx
  on public.academic_projects (user_id, legacy_client_project_id)
  where legacy_client_project_id is not null and legacy_client_project_id <> '';

alter table public.academic_projects enable row level security;

drop policy if exists academic_projects_select_own on public.academic_projects;
create policy academic_projects_select_own on public.academic_projects
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists academic_projects_insert_own on public.academic_projects;
create policy academic_projects_insert_own on public.academic_projects
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists academic_projects_update_own on public.academic_projects;
create policy academic_projects_update_own on public.academic_projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists academic_projects_delete_own on public.academic_projects;
create policy academic_projects_delete_own on public.academic_projects
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. Katedra-owned workflow state
-- ---------------------------------------------------------------------------

create table if not exists public.katedra_project_state (
  project_id          uuid primary key references public.academic_projects(id) on delete cascade,
  checks              jsonb not null default '{}'::jsonb,
  gen                 jsonb not null default '{}'::jsonb,
  hist                jsonb not null default '[]'::jsonb,
  log                 jsonb not null default '[]'::jsonb,
  logf                jsonb not null default '[]'::jsonb,
  lekta_score         integer check (lekta_score between 0 and 100),
  lekta_checked_at    timestamptz,
  lekta_issues        jsonb not null default '[]'::jsonb,
  lekta_fixed_total   integer not null default 0 check (lekta_fixed_total >= 0),
  latest_analysis_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.katedra_project_state enable row level security;

drop policy if exists katedra_project_state_select_own on public.katedra_project_state;
create policy katedra_project_state_select_own on public.katedra_project_state
  for select to authenticated
  using (exists (
    select 1 from public.academic_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists katedra_project_state_insert_own on public.katedra_project_state;
create policy katedra_project_state_insert_own on public.katedra_project_state
  for insert to authenticated
  with check (exists (
    select 1 from public.academic_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists katedra_project_state_update_own on public.katedra_project_state;
create policy katedra_project_state_update_own on public.katedra_project_state
  for update to authenticated
  using (exists (
    select 1 from public.academic_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.academic_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

drop policy if exists katedra_project_state_delete_own on public.katedra_project_state;
create policy katedra_project_state_delete_own on public.katedra_project_state
  for delete to authenticated
  using (exists (
    select 1 from public.academic_projects p
    where p.id = project_id and p.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- 3. Lekta-owned sanitized check history
-- ---------------------------------------------------------------------------

create table if not exists public.lekta_checks (
  id               uuid primary key default gen_random_uuid(),
  analysis_id      text not null,
  project_id       uuid not null references public.academic_projects(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  profile_id       text,
  ruleset_id       text,
  ruleset_version  text,
  score            integer check (score between 0 and 100),
  category_scores  jsonb not null default '{}'::jsonb,
  issues           jsonb not null default '[]'::jsonb,
  document_fingerprint text,
  coverage_tier    smallint,
  checked_at       timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (project_id, analysis_id)
);

create index if not exists lekta_checks_project_time_idx
  on public.lekta_checks (project_id, checked_at desc);
create index if not exists lekta_checks_user_time_idx
  on public.lekta_checks (user_id, checked_at desc);

alter table public.lekta_checks enable row level security;

drop policy if exists lekta_checks_select_own on public.lekta_checks;
create policy lekta_checks_select_own on public.lekta_checks
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- No client INSERT/UPDATE/DELETE policy. Future persistence is server-authoritative.

create or replace function public.validate_lekta_check_project_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.academic_projects p
    where p.id = new.project_id and p.user_id = new.user_id
  ) then
    raise exception 'Lekta check user does not own Academic Suite project %', new.project_id
      using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists lekta_checks_validate_project_owner on public.lekta_checks;
create trigger lekta_checks_validate_project_owner
  before insert or update of project_id, user_id on public.lekta_checks
  for each row execute function public.validate_lekta_check_project_owner();

-- ---------------------------------------------------------------------------
-- 4. Extend existing Lekta commerce instead of creating a second entitlement system
-- ---------------------------------------------------------------------------

alter table public.entitlements
  add column if not exists academic_project_id uuid references public.academic_projects(id) on delete set null;

create index if not exists entitlements_academic_project_idx
  on public.entitlements (academic_project_id)
  where academic_project_id is not null;

create or replace function public.validate_entitlement_academic_project_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.academic_project_id is not null and not exists (
    select 1 from public.academic_projects p
    where p.id = new.academic_project_id and p.user_id = new.user_id
  ) then
    raise exception 'Entitlement user does not own Academic Suite project %', new.academic_project_id
      using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists entitlements_validate_academic_project_owner on public.entitlements;
create trigger entitlements_validate_academic_project_owner
  before insert or update of academic_project_id, user_id on public.entitlements
  for each row execute function public.validate_entitlement_academic_project_owner();

alter table public.document_slots
  add column if not exists academic_project_id uuid references public.academic_projects(id) on delete set null;

create index if not exists document_slots_academic_project_idx
  on public.document_slots (academic_project_id)
  where academic_project_id is not null;

create or replace function public.validate_document_slot_academic_project_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.academic_project_id is not null and not exists (
    select 1 from public.academic_projects p
    where p.id = new.academic_project_id and p.user_id = new.user_id
  ) then
    raise exception 'Document slot user does not own Academic Suite project %', new.academic_project_id
      using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists document_slots_validate_academic_project_owner on public.document_slots;
create trigger document_slots_validate_academic_project_owner
  before insert or update of academic_project_id, user_id on public.document_slots
  for each row execute function public.validate_document_slot_academic_project_owner();

-- ---------------------------------------------------------------------------
-- 5. Katedra AI-credit accounting inside the same Lekta Supabase
-- ---------------------------------------------------------------------------

create table if not exists public.katedra_wallets (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  balance     bigint not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now()
);

create table if not exists public.katedra_topups (
  id                 bigint generated always as identity primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  stripe_session_id  text not null unique,
  tokens             bigint not null check (tokens > 0),
  amount_eur         numeric(8,2) not null,
  created_at         timestamptz not null default now()
);

create table if not exists public.katedra_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  model          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  charged        bigint not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists katedra_usage_user_time_idx
  on public.katedra_usage (user_id, created_at desc);

alter table public.katedra_wallets enable row level security;
alter table public.katedra_topups enable row level security;
alter table public.katedra_usage enable row level security;

drop policy if exists katedra_wallets_select_own on public.katedra_wallets;
create policy katedra_wallets_select_own on public.katedra_wallets
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists katedra_topups_select_own on public.katedra_topups;
create policy katedra_topups_select_own on public.katedra_topups
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists katedra_usage_select_own on public.katedra_usage;
create policy katedra_usage_select_own on public.katedra_usage
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.katedra_consume(
  p_user uuid,
  p_charged bigint,
  p_model text,
  p_in integer,
  p_out integer
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  insert into public.katedra_wallets(user_id, balance) values (p_user, 0)
    on conflict (user_id) do nothing;

  update public.katedra_wallets
     set balance = greatest(balance - p_charged, 0), updated_at = now()
   where user_id = p_user
   returning balance into v_balance;

  insert into public.katedra_usage(user_id, model, input_tokens, output_tokens, charged)
  values (p_user, p_model, p_in, p_out, p_charged);

  return coalesce(v_balance, 0);
end $$;

create or replace function public.katedra_grant(
  p_user uuid,
  p_tokens bigint,
  p_session text,
  p_amount numeric
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  insert into public.katedra_topups(user_id, stripe_session_id, tokens, amount_eur)
  values (p_user, p_session, p_tokens, p_amount)
  on conflict (stripe_session_id) do nothing;

  if not found then
    select balance into v_balance from public.katedra_wallets where user_id = p_user;
    return coalesce(v_balance, 0);
  end if;

  insert into public.katedra_wallets(user_id, balance) values (p_user, p_tokens)
  on conflict (user_id)
  do update set balance = public.katedra_wallets.balance + excluded.balance, updated_at = now()
  returning balance into v_balance;

  return v_balance;
end $$;

revoke all on function public.katedra_consume(uuid, bigint, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.katedra_grant(uuid, bigint, text, numeric)
  from public, anon, authenticated;
grant execute on function public.katedra_consume(uuid, bigint, text, integer, integer)
  to service_role;
grant execute on function public.katedra_grant(uuid, bigint, text, numeric)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Katedra v1 compatibility write-path
-- ---------------------------------------------------------------------------

create table if not exists public.katedra_projects (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  unit_id             text not null default '',
  profile_id          text not null default '',
  work_type           text not null default 'z' check (work_type in ('s','z','d')),
  work_type_canonical text not null default 'final' check (work_type_canonical in (
    'seminar', 'final', 'graduate', 'specialist', 'doctoral', 'article', 'project'
  )),
  topic               text not null default '',
  deadline            date,
  ruleset_version     text not null default '',
  lekta_score         integer check (lekta_score between 0 and 100),
  lekta_checked_at    timestamptz,
  lekta_issues        jsonb not null default '[]'::jsonb,
  lekta_fixed_total   integer not null default 0 check (lekta_fixed_total >= 0),
  guest_project_id    text not null,
  project_id          text not null,
  contract_version    text not null default '0.1',
  checks              jsonb not null default '{}'::jsonb,
  gen                 jsonb not null default '{}'::jsonb,
  hist                jsonb not null default '[]'::jsonb,
  log                 jsonb not null default '[]'::jsonb,
  logf                jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, guest_project_id)
);

create index if not exists katedra_projects_user_updated_idx
  on public.katedra_projects (user_id, updated_at desc);
create unique index if not exists katedra_projects_canonical_uuid_idx
  on public.katedra_projects (project_id)
  where project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

alter table public.katedra_projects enable row level security;

drop policy if exists katedra_projects_select_own on public.katedra_projects;
create policy katedra_projects_select_own on public.katedra_projects
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists katedra_projects_insert_own on public.katedra_projects;
create policy katedra_projects_insert_own on public.katedra_projects
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists katedra_projects_update_own on public.katedra_projects;
create policy katedra_projects_update_own on public.katedra_projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists katedra_projects_delete_own on public.katedra_projects;
create policy katedra_projects_delete_own on public.katedra_projects
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.sync_katedra_project_to_academic_suite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canonical_id uuid;
  existing_owner uuid;
begin
  new.updated_at := now();

  if new.work_type_canonical is null or new.work_type_canonical = '' then
    new.work_type_canonical := case new.work_type
      when 's' then 'seminar'
      when 'z' then 'final'
      when 'd' then 'graduate'
      else 'final'
    end;
  end if;

  canonical_id := case
    when new.project_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then new.project_id::uuid
    else new.id
  end;

  select user_id into existing_owner
  from public.academic_projects
  where id = canonical_id;

  if existing_owner is not null and existing_owner <> new.user_id then
    raise exception 'Academic Suite project ownership conflict for %', canonical_id
      using errcode = '23505';
  end if;

  insert into public.academic_projects (
    id, user_id, legacy_client_project_id, topic, unit_id, profile_id, work_type,
    deadline, ruleset_version, contract_version, created_at, updated_at
  ) values (
    canonical_id, new.user_id,
    case when new.guest_project_id = canonical_id::text then null else new.guest_project_id end,
    new.topic, new.unit_id, nullif(new.profile_id, ''), new.work_type_canonical,
    new.deadline, nullif(new.ruleset_version, ''), new.contract_version,
    new.created_at, new.updated_at
  )
  on conflict (id) do update set
    legacy_client_project_id = excluded.legacy_client_project_id,
    topic = excluded.topic,
    unit_id = excluded.unit_id,
    profile_id = excluded.profile_id,
    work_type = excluded.work_type,
    deadline = excluded.deadline,
    ruleset_version = excluded.ruleset_version,
    contract_version = excluded.contract_version,
    updated_at = excluded.updated_at
  where public.academic_projects.user_id = excluded.user_id;

  insert into public.katedra_project_state (
    project_id, checks, gen, hist, log, logf,
    lekta_score, lekta_checked_at, lekta_issues, lekta_fixed_total,
    created_at, updated_at
  ) values (
    canonical_id, new.checks, new.gen, new.hist, new.log, new.logf,
    new.lekta_score, new.lekta_checked_at, new.lekta_issues, new.lekta_fixed_total,
    new.created_at, new.updated_at
  )
  on conflict (project_id) do update set
    checks = excluded.checks,
    gen = excluded.gen,
    hist = excluded.hist,
    log = excluded.log,
    logf = excluded.logf,
    lekta_score = excluded.lekta_score,
    lekta_checked_at = excluded.lekta_checked_at,
    lekta_issues = excluded.lekta_issues,
    lekta_fixed_total = excluded.lekta_fixed_total,
    updated_at = excluded.updated_at;

  -- For old k... aliases, the database-assigned row UUID becomes the canonical
  -- ecosystem project ID returned to Katedra on the same write.
  new.project_id := canonical_id::text;
  return new;
end $$;

revoke all on function public.sync_katedra_project_to_academic_suite()
  from public, anon, authenticated;

drop trigger if exists katedra_projects_shared_sync on public.katedra_projects;
create trigger katedra_projects_shared_sync
  before insert or update on public.katedra_projects
  for each row execute function public.sync_katedra_project_to_academic_suite();

-- Shared Supabase authority summary:
-- auth.users            -> existing Lekta Auth
-- academic_projects     -> shared work identity
-- katedra_project_state -> Katedra workflow state
-- lekta_checks          -> sanitized Lekta check history
-- entitlements          -> existing Lekta purchase authority, now optionally project-bound
-- document_slots        -> existing Lekta document binding, now optionally project-bound
-- katedra_* wallet      -> Katedra AI compute accounting only
