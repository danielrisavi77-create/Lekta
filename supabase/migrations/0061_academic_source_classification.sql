-- Apply through the Lekta repository only.
-- Katedra can run with KATEDRA_SOURCE_CLASSIFICATION_ENABLED=0 until this
-- migration is present in the shared Supabase project.

alter table public.academic_sources
  add column if not exists source_type text,
  add column if not exists full_text_available boolean not null default false,
  add column if not exists classification_confidence text not null default 'needs_review';

update public.academic_sources
set source_type = case
  when kind in ('crossref', 'openalex', 'hrcak') and processing_status = 'ready' then 'metadata_only'
  else 'other'
end
where source_type is null;

update public.academic_sources as sources
set full_text_available = exists (
  select 1
  from public.academic_source_chunks as chunks
  where chunks.source_id = sources.id
);

alter table public.academic_sources
  alter column source_type set default 'other',
  alter column source_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'academic_sources_source_type_check'
      and conrelid = 'public.academic_sources'::regclass
  ) then
    alter table public.academic_sources
      add constraint academic_sources_source_type_check
      check (source_type in ('book', 'journal_article', 'official_document', 'web', 'metadata_only', 'other'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'academic_sources_classification_confidence_check'
      and conrelid = 'public.academic_sources'::regclass
  ) then
    alter table public.academic_sources
      add constraint academic_sources_classification_confidence_check
      check (classification_confidence in ('automatic', 'manual', 'needs_review'));
  end if;
end $$;

create index if not exists academic_sources_project_type_idx
  on public.academic_sources (project_id, source_type)
  where deleted_at is null;

-- Existing rows remain owner-protected by the academic_sources RLS policies.
