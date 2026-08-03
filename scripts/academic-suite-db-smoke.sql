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
create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

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
  'd', 'graduate', 'UUID-first project', 'fpzg', 'fpzg-graduate'
);

-- Legacy client ID is promoted to the compatibility row UUID.
insert into public.katedra_projects (
  user_id, guest_project_id, project_id, work_type, work_type_canonical,
  topic, unit_id, profile_id
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'klegacy-smoke', 'klegacy-smoke', 'z', 'final',
  'Legacy project', 'fpzg', 'fpzg-final'
);

do $$
declare
  legacy_row uuid;
begin
  if not exists (
    select 1 from public.academic_projects
    where id = '11111111-1111-4111-8111-111111111111'
      and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ) then raise exception 'UUID-first project did not mirror to Academic Suite Core'; end if;

  select id into legacy_row from public.katedra_projects
  where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and guest_project_id='klegacy-smoke';

  if not exists (
    select 1 from public.academic_projects
    where id=legacy_row and legacy_client_project_id='klegacy-smoke'
  ) then raise exception 'legacy Katedra project did not get canonical row UUID'; end if;

  if not exists (
    select 1 from public.katedra_project_state
    where project_id='11111111-1111-4111-8111-111111111111'
  ) then raise exception 'Katedra state mirror missing'; end if;
end $$;

-- Mirror updates into canonical state.
update public.katedra_projects
set topic='Updated topic', lekta_score=91, checks='{"a":true}'::jsonb
where project_id='11111111-1111-4111-8111-111111111111';

do $$
begin
  if not exists (
    select 1
    from public.academic_projects p
    join public.katedra_project_state s on s.project_id=p.id
    where p.id='11111111-1111-4111-8111-111111111111'
      and p.topic='Updated topic' and s.lekta_score=91 and s.checks @> '{"a":true}'::jsonb
  ) then raise exception 'compatibility update did not mirror'; end if;
end $$;

-- Same-owner Lekta history is accepted.
insert into public.lekta_checks(analysis_id, project_id, user_id, profile_id, score, issues)
values ('smoke-analysis','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fpzg-graduate',91,'[{"issueKey":"check:margins"}]'::jsonb);

-- Cross-user check is rejected.
do $$
begin
  begin
    insert into public.lekta_checks(analysis_id, project_id, user_id)
    values ('bad-analysis','11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'cross-user Lekta check unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Existing Lekta entitlement model is extended, not replaced.
insert into public.entitlements(user_id,work_type,slots_total,order_id,provider,purchase_expires_at,academic_project_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','diplomski',1,'smoke-order','test',now()+interval '30 days','11111111-1111-4111-8111-111111111111');

do $$
begin
  begin
    insert into public.entitlements(user_id,work_type,slots_total,order_id,provider,purchase_expires_at,academic_project_id)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','diplomski',1,'bad-order','test',now()+interval '30 days','11111111-1111-4111-8111-111111111111');
    raise exception 'cross-user entitlement unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Katedra RPCs must not be callable by public browser roles.
do $$
begin
  if has_function_privilege('anon','public.katedra_consume(uuid,bigint,text,integer,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.katedra_consume(uuid,bigint,text,integer,integer)','EXECUTE')
     or has_function_privilege('anon','public.katedra_grant(uuid,bigint,text,numeric)','EXECUTE')
     or has_function_privilege('authenticated','public.katedra_grant(uuid,bigint,text,numeric)','EXECUTE') then
    raise exception 'Katedra billing RPC exposed to browser role';
  end if;
  if not has_function_privilege('service_role','public.katedra_consume(uuid,bigint,text,integer,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.katedra_grant(uuid,bigint,text,numeric)','EXECUTE') then
    raise exception 'service_role lacks Katedra billing RPC';
  end if;
end $$;

-- Privacy schema invariant.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name in ('academic_projects','katedra_project_state','lekta_checks','katedra_projects')
      and column_name in ('docx','document','document_text','document_content','raw_document','issue_detail','issue_location','mentor_comments','source_passages')
  ) then raise exception 'forbidden document-content column introduced'; end if;
end $$;

select 'ACADEMIC_SUITE_DB_SMOKE_PASS' as result;
