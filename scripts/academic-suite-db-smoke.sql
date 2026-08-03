\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

-- Minimal Supabase primitives needed by the existing Lekta monetization migration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text
);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select null::uuid $$;

-- Existing Lekta commerce baseline + new shared migration.
\i supabase/migrations/0001_monetization.sql
\i supabase/migrations/0035_academic_suite_foundation.sql

insert into auth.users(id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'one@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'two@example.test');

-- UUID-first Katedra project keeps the exact same ecosystem project ID.
insert into public.katedra_projects (
  user_id, guest_project_id, project_id, work_type, work_type_canonical,
  topic, unit_id, profile_id
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111',
  'd', 'graduate', 'Test diplomski', 'fpzg', 'fpzg-politologija-diplomski'
);

do $$
begin
  if not exists (
    select 1 from public.academic_projects
    where id = '11111111-1111-4111-8111-111111111111'
      and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and work_type = 'graduate'
  ) then
    raise exception 'UUID-first project did not mirror into academic_projects';
  end if;
  if not exists (
    select 1 from public.katedra_project_state
    where project_id = '11111111-1111-4111-8111-111111111111'
  ) then
    raise exception 'Katedra state did not mirror';
  end if;
end $$;

-- Legacy k... alias gets the row UUID as canonical project_id and keeps the alias.
insert into public.katedra_projects (
  user_id, guest_project_id, project_id, work_type, work_type_canonical, topic
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'klegacy-e2e', 'klegacy-e2e', 'z', 'final', 'Legacy project'
);

do $$
declare
  v_row public.katedra_projects%rowtype;
begin
  select * into v_row from public.katedra_projects where guest_project_id = 'klegacy-e2e';
  if v_row.project_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Legacy project was not promoted to UUID';
  end if;
  if not exists (
    select 1 from public.academic_projects
    where id = v_row.project_id::uuid
      and legacy_client_project_id = 'klegacy-e2e'
      and user_id = v_row.user_id
  ) then
    raise exception 'Legacy alias/canonical project mapping missing';
  end if;
end $$;

-- Existing Lekta entitlement model is extended, not replaced.
insert into public.entitlements (
  user_id, work_type, slots_total, order_id, provider, purchase_expires_at, academic_project_id
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'diplomski', 1, 'order-ok', 'test', now() + interval '90 days',
  '11111111-1111-4111-8111-111111111111'
);

do $$
begin
  begin
    insert into public.entitlements (
      user_id, work_type, slots_total, order_id, provider, purchase_expires_at, academic_project_id
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'diplomski', 1, 'order-bad', 'test', now() + interval '90 days',
      '11111111-1111-4111-8111-111111111111'
    );
    raise exception 'Cross-user entitlement binding unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Sanitized Lekta history is project-bound and owner-safe.
insert into public.lekta_checks (
  analysis_id, project_id, user_id, score, issues
) values (
  'analysis-ok', '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 84,
  '[{"issueKey":"check:margins","severity":"error"}]'::jsonb
);

do $$
begin
  begin
    insert into public.lekta_checks (analysis_id, project_id, user_id, score)
    values (
      'analysis-bad', '11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 84
    );
    raise exception 'Cross-user Lekta check binding unexpectedly succeeded';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Compatibility write cannot take over another owner's project UUID.
do $$
begin
  begin
    insert into public.katedra_projects (
      user_id, guest_project_id, project_id, work_type, work_type_canonical
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
      'd', 'graduate'
    );
    raise exception 'Cross-user Academic Suite project takeover unexpectedly succeeded';
  exception when unique_violation then null;
  end;
end $$;

-- New exposed tables must have RLS.
do $$
begin
  if exists (
    select 1
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'academic_projects','katedra_project_state','lekta_checks',
        'katedra_wallets','katedra_topups','katedra_usage','katedra_projects'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'A shared Academic Suite table is missing RLS';
  end if;
end $$;

-- Privacy: no raw/document-derived content columns may enter the shared foundation.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name in ('academic_projects','katedra_project_state','lekta_checks')
      and column_name in (
        'docx','document','document_text','document_content','raw_document',
        'issue_detail','issue_location','mentor_comments','source_passages'
      )
  ) then
    raise exception 'Privacy invariant violated by shared schema';
  end if;
end $$;

-- Katedra privileged RPCs must not be callable by client roles.
do $$
begin
  if has_function_privilege('anon', 'public.katedra_consume(uuid,bigint,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.katedra_consume(uuid,bigint,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.katedra_grant(uuid,bigint,text,numeric)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.katedra_grant(uuid,bigint,text,numeric)', 'EXECUTE') then
    raise exception 'Katedra privileged RPC is executable by a client role';
  end if;
  if not has_function_privilege('service_role', 'public.katedra_consume(uuid,bigint,text,integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.katedra_grant(uuid,bigint,text,numeric)', 'EXECUTE') then
    raise exception 'Katedra privileged RPC is not executable by service_role';
  end if;
end $$;

select 'ACADEMIC_SUITE_DB_SMOKE_PASS' as result;
