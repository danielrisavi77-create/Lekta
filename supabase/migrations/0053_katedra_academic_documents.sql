-- Migration 0053: Katedra Academic Skills Platform, cloud documents and source workspace.
--
-- Authority: Lekta Supabase migration history.
-- Raw final DOCX files are not stored here. Katedra stores structured document
-- revisions and private user-provided source files. Deletion is recoverable for
-- 30 days, after which a trusted purge worker removes Storage objects and rows.

create extension if not exists pgcrypto;

alter table public.academic_projects
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_after timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'academic_projects_purge_after_check'
      and conrelid = 'public.academic_projects'::regclass
  ) then
    alter table public.academic_projects
      add constraint academic_projects_purge_after_check
      check (purge_after is null or (deleted_at is not null and purge_after >= deleted_at));
  end if;
end $$;

create index if not exists academic_projects_purge_after_idx
  on public.academic_projects (purge_after)
  where purge_after is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'academic-project-files',
  'academic-project-files',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.academic_ruleset_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ruleset_id text not null,
  ruleset_version text not null,
  profile_id text not null,
  profile_status text not null check (profile_status in ('verified', 'partial', 'generic')),
  fingerprint text not null,
  bundle jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, fingerprint)
);

create table if not exists public.academic_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'deleted')),
  body_schema_version text not null default '1.0',
  current_version integer not null default 0 check (current_version >= 0),
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id, user_id),
  check (purge_after is null or (deleted_at is not null and purge_after >= deleted_at))
);

create table if not exists public.academic_document_sections (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  section_key text not null,
  position integer not null check (position >= 0),
  title text not null,
  current_revision_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, section_key),
  unique (id, document_id, project_id, user_id),
  foreign key (document_id, project_id, user_id)
    references public.academic_documents(id, project_id, user_id) on delete cascade
);

create table if not exists public.academic_generation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.academic_projects(id) on delete cascade,
  document_id uuid references public.academic_documents(id) on delete set null,
  section_id uuid references public.academic_document_sections(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (operation in (
    'chat', 'plan', 'draft_section', 'revise_section', 'coherence_audit', 'semantic_audit'
  )),
  provider text not null,
  model text not null,
  prompt_version text not null,
  ruleset_snapshot_id uuid references public.academic_ruleset_snapshots(id) on delete set null,
  source_ids uuid[] not null default '{}',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  policy_override boolean not null default false,
  user_reviewed boolean not null default false,
  user_approved boolean,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.academic_section_revisions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  document_id uuid not null,
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  body jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  text_content text not null default '',
  author_type text not null check (author_type in ('user', 'ai', 'import')),
  generation_run_id uuid references public.academic_generation_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (section_id, revision_number),
  unique (id, section_id, document_id, project_id, user_id),
  foreign key (section_id, document_id, project_id, user_id)
    references public.academic_document_sections(id, document_id, project_id, user_id) on delete cascade
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'academic_document_sections_current_revision_id_fkey'
      and conrelid = 'public.academic_document_sections'::regclass
  ) then
    alter table public.academic_document_sections
      add constraint academic_document_sections_current_revision_id_fkey
      foreign key (current_revision_id, id, document_id, project_id, user_id)
      references public.academic_section_revisions(id, section_id, document_id, project_id, user_id)
      on delete set null (current_revision_id);
  end if;
end $$;

create table if not exists public.academic_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('upload', 'crossref', 'openalex', 'hrcak')),
  title text not null,
  authors jsonb not null default '[]'::jsonb,
  publication_year integer check (publication_year is null or publication_year between 1000 and 2200),
  doi text,
  url text,
  storage_path text,
  mime_type text,
  license text,
  page_count integer check (page_count is null or page_count > 0),
  processing_status text not null default 'ready' check (processing_status in ('pending', 'ready', 'failed')),
  content_sha256 text,
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id, user_id),
  check (purge_after is null or (deleted_at is not null and purge_after >= deleted_at))
);

create table if not exists public.academic_source_chunks (
  id bigint generated always as identity primary key,
  source_id uuid not null,
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end > 0),
  content text not null,
  search_vector tsvector generated always as (to_tsvector('simple', content)) stored,
  created_at timestamptz not null default now(),
  unique (source_id, position),
  unique (id, source_id, project_id, user_id),
  foreign key (source_id, project_id, user_id)
    references public.academic_sources(id, project_id, user_id) on delete cascade,
  check (page_end is null or page_start is null or page_end >= page_start)
);

create table if not exists public.academic_section_sources (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null,
  source_id uuid not null,
  source_chunk_id bigint,
  project_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  claim_label text,
  locator text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (section_id, source_id, source_chunk_id),
  foreign key (source_id, project_id, user_id)
    references public.academic_sources(id, project_id, user_id) on delete cascade,
  foreign key (source_chunk_id, source_id, project_id, user_id)
    references public.academic_source_chunks(id, source_id, project_id, user_id) on delete cascade
);

create table if not exists public.academic_audit_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.academic_projects(id) on delete cascade,
  document_id uuid references public.academic_documents(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_type text not null check (audit_type in ('semantic', 'coherence', 'source-integrity', 'lekta-formal')),
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  provider text,
  model text,
  ruleset_snapshot_id uuid references public.academic_ruleset_snapshots(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.academic_audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_run_id uuid not null references public.academic_audit_runs(id) on delete cascade,
  project_id uuid not null references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id uuid references public.academic_document_sections(id) on delete set null,
  severity text not null check (severity in ('critical', 'major', 'warning', 'info')),
  category text not null,
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  suggested_fix text,
  status text not null default 'open' check (status in ('open', 'resolved', 'accepted')),
  created_at timestamptz not null default now()
);

create table if not exists public.academic_policy_attestations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null,
  fact_id text not null,
  policy_stance text not null check (policy_stance in ('allowed', 'conditional', 'banned', 'unspecified')),
  statement_version text not null,
  compliance_claim_allowed boolean not null default false,
  accepted_at timestamptz not null default now(),
  unique (project_id, capability, fact_id, statement_version)
);

create table if not exists public.academic_deletion_queue (
  project_id uuid primary key references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  purge_after timestamptz not null,
  status text not null default 'recoverable' check (status in ('recoverable', 'purging', 'failed')),
  last_error text,
  updated_at timestamptz not null default now(),
  check (purge_after >= requested_at)
);

create index if not exists academic_ruleset_snapshots_project_idx on public.academic_ruleset_snapshots (project_id, created_at desc);
create index if not exists academic_ruleset_snapshots_user_idx on public.academic_ruleset_snapshots (user_id);
create index if not exists academic_documents_user_idx on public.academic_documents (user_id, updated_at desc);
create index if not exists academic_document_sections_document_idx on public.academic_document_sections (document_id, position);
create index if not exists academic_document_sections_project_idx on public.academic_document_sections (project_id);
create index if not exists academic_document_sections_user_idx on public.academic_document_sections (user_id);
create index if not exists academic_section_revisions_section_idx on public.academic_section_revisions (section_id, revision_number desc);
create index if not exists academic_section_revisions_document_idx on public.academic_section_revisions (document_id);
create index if not exists academic_section_revisions_project_idx on public.academic_section_revisions (project_id);
create index if not exists academic_section_revisions_user_idx on public.academic_section_revisions (user_id);
create index if not exists academic_generation_runs_project_idx on public.academic_generation_runs (project_id, created_at desc);
create index if not exists academic_generation_runs_document_idx on public.academic_generation_runs (document_id);
create index if not exists academic_generation_runs_section_idx on public.academic_generation_runs (section_id);
create index if not exists academic_generation_runs_user_idx on public.academic_generation_runs (user_id, created_at desc);
create index if not exists academic_generation_runs_snapshot_idx on public.academic_generation_runs (ruleset_snapshot_id);
create index if not exists academic_sources_project_idx on public.academic_sources (project_id, created_at desc);
create index if not exists academic_sources_user_idx on public.academic_sources (user_id);
create unique index if not exists academic_sources_project_doi_idx on public.academic_sources (project_id, lower(doi)) where doi is not null;
create index if not exists academic_source_chunks_source_idx on public.academic_source_chunks (source_id, position);
create index if not exists academic_source_chunks_project_idx on public.academic_source_chunks (project_id);
create index if not exists academic_source_chunks_user_idx on public.academic_source_chunks (user_id);
create index if not exists academic_source_chunks_search_idx on public.academic_source_chunks using gin (search_vector);
create index if not exists academic_section_sources_source_idx on public.academic_section_sources (source_id);
create index if not exists academic_section_sources_chunk_idx on public.academic_section_sources (source_chunk_id);
create index if not exists academic_section_sources_project_idx on public.academic_section_sources (project_id);
create index if not exists academic_section_sources_user_idx on public.academic_section_sources (user_id);
create index if not exists academic_audit_runs_project_idx on public.academic_audit_runs (project_id, created_at desc);
create index if not exists academic_audit_runs_document_idx on public.academic_audit_runs (document_id);
create index if not exists academic_audit_runs_user_idx on public.academic_audit_runs (user_id);
create index if not exists academic_audit_runs_snapshot_idx on public.academic_audit_runs (ruleset_snapshot_id);
create index if not exists academic_audit_findings_run_idx on public.academic_audit_findings (audit_run_id);
create index if not exists academic_audit_findings_project_idx on public.academic_audit_findings (project_id);
create index if not exists academic_audit_findings_user_idx on public.academic_audit_findings (user_id);
create index if not exists academic_audit_findings_section_idx on public.academic_audit_findings (section_id);
create index if not exists academic_policy_attestations_project_idx on public.academic_policy_attestations (project_id, accepted_at desc);
create index if not exists academic_policy_attestations_user_idx on public.academic_policy_attestations (user_id);
create index if not exists academic_deletion_queue_due_idx on public.academic_deletion_queue (purge_after) where status in ('recoverable', 'failed');
create index if not exists academic_deletion_queue_user_idx on public.academic_deletion_queue (user_id);

create or replace function public.academic_content_validate_project_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.academic_projects p
    where p.id = new.project_id and p.user_id = new.user_id
  ) then
    raise exception 'Academic content user does not own project %', new.project_id
      using errcode = '23503';
  end if;
  return new;
end $$;

revoke all on function public.academic_content_validate_project_owner() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'academic_ruleset_snapshots', 'academic_documents', 'academic_document_sections',
    'academic_generation_runs', 'academic_section_revisions', 'academic_sources',
    'academic_source_chunks', 'academic_section_sources', 'academic_audit_runs',
    'academic_audit_findings', 'academic_policy_attestations', 'academic_deletion_queue'
  ] loop
    execute format('drop trigger if exists %I_validate_project_owner on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_validate_project_owner before insert or update of project_id, user_id on public.%I for each row execute function public.academic_content_validate_project_owner()',
      table_name, table_name
    );
  end loop;
end $$;

-- A soft-deleted project becomes unreadable immediately, even through a
-- direct Supabase client. The deletion queue is intentionally excluded so
-- the owner can still invoke the 30-day restore flow.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'academic_ruleset_snapshots', 'academic_documents', 'academic_document_sections',
    'academic_generation_runs', 'academic_section_revisions', 'academic_sources',
    'academic_source_chunks', 'academic_section_sources', 'academic_audit_runs',
    'academic_audit_findings', 'academic_policy_attestations'
  ] loop
    execute format('drop policy if exists %I_active_project on public.%I', table_name, table_name);
    execute format(
      'create policy %I_active_project on public.%I as restrictive for all to authenticated using (exists (select 1 from public.academic_projects p where p.id = project_id and p.user_id = (select auth.uid()) and p.deleted_at is null)) with check (exists (select 1 from public.academic_projects p where p.id = project_id and p.user_id = (select auth.uid()) and p.deleted_at is null))',
      table_name, table_name
    );
  end loop;
end $$;

create or replace function public.academic_content_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.academic_content_touch_updated_at() from public, anon, authenticated;

drop trigger if exists academic_documents_touch_updated_at on public.academic_documents;
create trigger academic_documents_touch_updated_at before update on public.academic_documents
  for each row execute function public.academic_content_touch_updated_at();
drop trigger if exists academic_document_sections_touch_updated_at on public.academic_document_sections;
create trigger academic_document_sections_touch_updated_at before update on public.academic_document_sections
  for each row execute function public.academic_content_touch_updated_at();
drop trigger if exists academic_sources_touch_updated_at on public.academic_sources;
create trigger academic_sources_touch_updated_at before update on public.academic_sources
  for each row execute function public.academic_content_touch_updated_at();
drop trigger if exists academic_deletion_queue_touch_updated_at on public.academic_deletion_queue;
create trigger academic_deletion_queue_touch_updated_at before update on public.academic_deletion_queue
  for each row execute function public.academic_content_touch_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'academic_ruleset_snapshots', 'academic_documents', 'academic_document_sections',
    'academic_generation_runs', 'academic_section_revisions', 'academic_sources',
    'academic_source_chunks', 'academic_section_sources', 'academic_audit_runs',
    'academic_audit_findings', 'academic_policy_attestations', 'academic_deletion_queue'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I_select_own on public.%I', table_name, table_name);
    execute format(
      'create policy %I_select_own on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name, table_name
    );
    execute format('drop policy if exists %I_permanent_account on public.%I', table_name, table_name);
    execute format(
      'create policy %I_permanent_account on public.%I as restrictive for all to authenticated using ((select public.academic_suite_is_permanent_user())) with check ((select public.academic_suite_is_permanent_user()))',
      table_name, table_name
    );
  end loop;
end $$;

drop policy if exists academic_documents_insert_own on public.academic_documents;
create policy academic_documents_insert_own on public.academic_documents for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists academic_documents_update_own on public.academic_documents;
create policy academic_documents_update_own on public.academic_documents for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists academic_document_sections_insert_own on public.academic_document_sections;
create policy academic_document_sections_insert_own on public.academic_document_sections for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists academic_document_sections_update_own on public.academic_document_sections;
create policy academic_document_sections_update_own on public.academic_document_sections for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists academic_document_sections_delete_own on public.academic_document_sections;
create policy academic_document_sections_delete_own on public.academic_document_sections for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists academic_section_revisions_insert_own on public.academic_section_revisions;
create policy academic_section_revisions_insert_own on public.academic_section_revisions for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists academic_section_sources_insert_own on public.academic_section_sources;
create policy academic_section_sources_insert_own on public.academic_section_sources for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists academic_section_sources_delete_own on public.academic_section_sources;
create policy academic_section_sources_delete_own on public.academic_section_sources for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists academic_ruleset_snapshots_insert_own on public.academic_ruleset_snapshots;
create policy academic_ruleset_snapshots_insert_own on public.academic_ruleset_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists academic_sources_insert_own on public.academic_sources;
create policy academic_sources_insert_own on public.academic_sources for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists academic_sources_update_own on public.academic_sources;
create policy academic_sources_update_own on public.academic_sources for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists academic_policy_attestations_insert_own on public.academic_policy_attestations;
create policy academic_policy_attestations_insert_own on public.academic_policy_attestations for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists academic_deletion_queue_insert_own on public.academic_deletion_queue;
create policy academic_deletion_queue_insert_own on public.academic_deletion_queue for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists academic_deletion_queue_update_own on public.academic_deletion_queue;
create policy academic_deletion_queue_update_own on public.academic_deletion_queue for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists academic_deletion_queue_delete_own on public.academic_deletion_queue;
create policy academic_deletion_queue_delete_own on public.academic_deletion_queue for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists academic_project_files_select_own on storage.objects;
create policy academic_project_files_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'academic-project-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.academic_projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
);

drop policy if exists academic_project_files_insert_own on storage.objects;
create policy academic_project_files_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'academic-project-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.academic_projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
);

drop policy if exists academic_project_files_update_own on storage.objects;
create policy academic_project_files_update_own on storage.objects for update to authenticated
using (
  bucket_id = 'academic-project-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'academic-project-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.academic_projects p
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id = (select auth.uid())
      and p.deleted_at is null
  )
);

drop policy if exists academic_project_files_delete_own on storage.objects;
create policy academic_project_files_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'academic-project-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'academic_ruleset_snapshots', 'academic_documents', 'academic_document_sections',
    'academic_generation_runs', 'academic_section_revisions', 'academic_sources',
    'academic_source_chunks', 'academic_section_sources', 'academic_audit_runs',
    'academic_audit_findings', 'academic_policy_attestations', 'academic_deletion_queue'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format('grant all privileges on table public.%I to service_role', table_name);
  end loop;
end $$;

grant insert on table public.academic_ruleset_snapshots to authenticated;
grant insert, update on table public.academic_documents to authenticated;
grant insert, update, delete on table public.academic_document_sections to authenticated;
grant insert on table public.academic_section_revisions to authenticated;
grant insert, delete on table public.academic_section_sources to authenticated;
grant insert, update on table public.academic_sources to authenticated;
grant insert on table public.academic_policy_attestations to authenticated;
grant insert, update, delete on table public.academic_deletion_queue to authenticated;
grant usage, select on sequence public.academic_source_chunks_id_seq to service_role;

create or replace function public.initialize_academic_document(
  p_project_id uuid,
  p_title text,
  p_sections jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_document uuid;
  v_section jsonb;
  v_position integer := 0;
begin
  if v_user is null or not exists (
    select 1 from public.academic_projects
    where id = p_project_id and user_id = v_user and deleted_at is null
  ) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) > 50 then
    raise exception 'Invalid sections' using errcode = '22023';
  end if;

  insert into public.academic_documents(project_id, user_id, title)
  values (p_project_id, v_user, left(coalesce(p_title, ''), 500))
  on conflict (project_id) do update set
    title = case when public.academic_documents.title = '' then excluded.title else public.academic_documents.title end
  returning id into v_document;

  for v_section in select value from jsonb_array_elements(p_sections)
  loop
    if nullif(btrim(v_section ->> 'title'), '') is null then
      continue;
    end if;
    insert into public.academic_document_sections(
      document_id, project_id, user_id, section_key, position, title
    ) values (
      v_document,
      p_project_id,
      v_user,
      left(coalesce(nullif(v_section ->> 'sectionKey', ''), 'section-' || v_position::text), 160),
      v_position,
      left(v_section ->> 'title', 500)
    ) on conflict (document_id, section_key) do nothing;
    v_position := v_position + 1;
  end loop;

  return v_document;
end $$;

create or replace function public.save_academic_section_revision(
  p_section_id uuid,
  p_body jsonb,
  p_text_content text,
  p_author_type text default 'user',
  p_generation_run_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_section public.academic_document_sections%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
begin
  if p_author_type not in ('user', 'ai', 'import') then
    raise exception 'Invalid author type' using errcode = '22023';
  end if;
  if length(coalesce(p_text_content, '')) > 500000 then
    raise exception 'Section is too large' using errcode = '22001';
  end if;

  select * into v_section
  from public.academic_document_sections
  where id = p_section_id and user_id = v_user
  for update;
  if not found then
    raise exception 'Section not found' using errcode = 'P0002';
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_revision_number
  from public.academic_section_revisions
  where section_id = p_section_id;

  insert into public.academic_section_revisions(
    section_id, document_id, project_id, user_id, revision_number,
    body, text_content, author_type, generation_run_id
  ) values (
    v_section.id, v_section.document_id, v_section.project_id, v_section.user_id,
    v_revision_number, coalesce(p_body, '{"type":"doc","content":[]}'::jsonb),
    coalesce(p_text_content, ''), p_author_type, p_generation_run_id
  ) returning id into v_revision_id;

  update public.academic_document_sections
  set current_revision_id = v_revision_id
  where id = v_section.id;
  update public.academic_documents
  set current_version = current_version + 1
  where id = v_section.document_id;

  return v_revision_id;
end $$;

revoke all on function public.initialize_academic_document(uuid, text, jsonb) from public, anon;
revoke all on function public.save_academic_section_revision(uuid, jsonb, text, text, uuid) from public, anon;
grant execute on function public.initialize_academic_document(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.save_academic_section_revision(uuid, jsonb, text, text, uuid) to authenticated, service_role;

create or replace function public.request_academic_project_deletion(p_project_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_purge_after timestamptz := now() + interval '30 days';
begin
  if v_user is null or not exists (
    select 1 from public.academic_projects
    where id = p_project_id and user_id = v_user and deleted_at is null
  ) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  update public.academic_documents
  set status = 'deleted', deleted_at = now(), purge_after = v_purge_after
  where project_id = p_project_id and user_id = v_user;

  update public.academic_sources
  set deleted_at = now(), purge_after = v_purge_after
  where project_id = p_project_id and user_id = v_user;

  insert into public.academic_deletion_queue(project_id, user_id, requested_at, purge_after, status)
  values (p_project_id, v_user, now(), v_purge_after, 'recoverable')
  on conflict (project_id) do update set
    requested_at = excluded.requested_at,
    purge_after = excluded.purge_after,
    status = 'recoverable',
    last_error = null;

  -- Parent is marked last. Restrictive child RLS still permits the updates
  -- above, and becomes fail-closed immediately after this statement.
  update public.academic_projects
  set deleted_at = now(), purge_after = v_purge_after, updated_at = now()
  where id = p_project_id and user_id = v_user;

  return v_purge_after;
end $$;

create or replace function public.restore_academic_project(p_project_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or not exists (
    select 1 from public.academic_deletion_queue
    where project_id = p_project_id and user_id = v_user
      and status = 'recoverable' and purge_after > now()
  ) then
    return false;
  end if;

  update public.academic_projects set deleted_at = null, purge_after = null, updated_at = now()
    where id = p_project_id and user_id = v_user;
  update public.academic_documents set status = 'draft', deleted_at = null, purge_after = null
    where project_id = p_project_id and user_id = v_user;
  update public.academic_sources set deleted_at = null, purge_after = null
    where project_id = p_project_id and user_id = v_user;
  delete from public.academic_deletion_queue where project_id = p_project_id and user_id = v_user;
  return true;
end $$;

revoke all on function public.request_academic_project_deletion(uuid) from public, anon;
revoke all on function public.restore_academic_project(uuid) from public, anon;
grant execute on function public.request_academic_project_deletion(uuid) to authenticated, service_role;
grant execute on function public.restore_academic_project(uuid) to authenticated, service_role;
