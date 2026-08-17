-- 0088_academic_demo_usage.sql
--
-- VRACENO IZ PRODUKCIJE 2026-08-17 (audit A26-04).
--
-- Ova migracija je bila primijenjena na produkciju (verzija 20260805201955) ali NIKAD nije
-- postojala u repozitoriju, pa repozitorij nije mogao reproducirati produkcijsku shemu.
-- Tijelo je doslovno preuzeto iz supabase_migrations.schema_migrations.statements, bez
-- ijedne izmjene, da zapis odgovara onome sto je stvarno izvedeno nad bazom.
--
-- Na produkciji je vec izvedena. Ponovna primjena je bezopasna jer je zahvat pisan
-- idempotentno (`drop ... if exists` prije `create`, `if not exists` na tablicama), pa je
-- `supabase db push` smije ponovno provuci. Sluzi da staging i svaka nova baza mogu doci
-- do istog stanja.
create table if not exists public.academic_demo_usage (
  project_id uuid primary key references public.academic_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  outline_used integer not null default 0 check (outline_used >= 0),
  draft_section_used integer not null default 0 check (draft_section_used >= 0),
  revision_used integer not null default 0 check (revision_used >= 0),
  source_used integer not null default 0 check (source_used >= 0),
  audit_used integer not null default 0 check (audit_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists academic_demo_usage_user_idx
  on public.academic_demo_usage (user_id, project_id);

alter table public.academic_demo_usage enable row level security;

drop policy if exists academic_demo_usage_select_owner on public.academic_demo_usage;
create policy academic_demo_usage_select_owner
  on public.academic_demo_usage for select to authenticated
  using (user_id = auth.uid());

drop policy if exists academic_demo_usage_insert_owner on public.academic_demo_usage;
create policy academic_demo_usage_insert_owner
  on public.academic_demo_usage for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists academic_demo_usage_update_owner on public.academic_demo_usage;
create policy academic_demo_usage_update_owner
  on public.academic_demo_usage for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.consume_academic_demo_quota(
  p_project_id uuid,
  p_user_id uuid,
  p_capability text,
  p_max integer
) returns boolean
language plpgsql
security invoker
as $$
declare
  v_column text;
  v_used integer;
begin
  if auth.uid() is null or auth.uid() <> p_user_id or p_max < 1 then return false; end if;
  if not exists (
    select 1 from public.academic_projects
    where id = p_project_id and user_id = p_user_id and deleted_at is null
  ) then return false; end if;
  v_column := case p_capability
    when 'outline' then 'outline_used'
    when 'draft_section' then 'draft_section_used'
    when 'revision' then 'revision_used'
    when 'source' then 'source_used'
    when 'audit' then 'audit_used'
    else null
  end;
  if v_column is null then return false; end if;

  insert into public.academic_demo_usage (project_id, user_id)
  values (p_project_id, p_user_id)
  on conflict (project_id) do nothing;

  execute format(
    'update public.academic_demo_usage
       set %1$I = %1$I + 1, updated_at = now()
     where project_id = $1 and user_id = $2 and %1$I < $3
     returning %1$I', v_column)
    into v_used using p_project_id, p_user_id, p_max;
  return v_used is not null;
end;
$$;

create or replace function public.release_academic_demo_quota(
  p_project_id uuid,
  p_user_id uuid,
  p_capability text
) returns boolean
language plpgsql
security invoker
as $$
declare
  v_column text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then return false; end if;
  if not exists (
    select 1 from public.academic_projects
    where id = p_project_id and user_id = p_user_id and deleted_at is null
  ) then return false; end if;
  v_column := case p_capability
    when 'outline' then 'outline_used'
    when 'draft_section' then 'draft_section_used'
    when 'revision' then 'revision_used'
    when 'source' then 'source_used'
    when 'audit' then 'audit_used'
    else null
  end;
  if v_column is null then return false; end if;
  execute format(
    'update public.academic_demo_usage
       set %1$I = greatest(0, %1$I - 1), updated_at = now()
     where project_id = $1 and user_id = $2', v_column)
    using p_project_id, p_user_id;
  return found;
end;
$$;

revoke all on function public.consume_academic_demo_quota(uuid, uuid, text, integer) from public, anon;
grant execute on function public.consume_academic_demo_quota(uuid, uuid, text, integer) to authenticated;
revoke all on function public.release_academic_demo_quota(uuid, uuid, text) from public, anon;
grant execute on function public.release_academic_demo_quota(uuid, uuid, text) to authenticated;
