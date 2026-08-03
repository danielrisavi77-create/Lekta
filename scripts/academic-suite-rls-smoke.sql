\set ON_ERROR_STOP on

\i supabase/migrations/0036_academic_suite_rls_hardening.sql
\i supabase/migrations/0039_academic_suite_permanent_account_gate.sql

do $$
declare
  ent_roles name[];
  slot_roles name[];
  restrictive_count integer;
begin
  select roles into ent_roles
  from pg_policies
  where schemaname = 'public' and tablename = 'entitlements' and policyname = 'entitlements_select_own';

  select roles into slot_roles
  from pg_policies
  where schemaname = 'public' and tablename = 'document_slots' and policyname = 'document_slots_select_own';

  if ent_roles is distinct from array['authenticated']::name[] then
    raise exception 'Entitlements policy is not restricted to authenticated: %', ent_roles;
  end if;
  if slot_roles is distinct from array['authenticated']::name[] then
    raise exception 'Document slots policy is not restricted to authenticated: %', slot_roles;
  end if;

  select count(*) into restrictive_count
  from pg_policies
  where schemaname='public'
    and policyname in (
      'academic_projects_permanent_account',
      'katedra_project_state_permanent_account',
      'katedra_projects_permanent_account',
      'lekta_checks_permanent_account',
      'katedra_wallets_permanent_account',
      'katedra_topups_permanent_account',
      'katedra_usage_permanent_account'
    )
    and permissive='RESTRICTIVE'
    and roles = array['authenticated']::name[];

  if restrictive_count <> 7 then
    raise exception 'Expected 7 restrictive permanent-account policies, found %', restrictive_count;
  end if;

  if has_function_privilege('anon','public.academic_suite_is_permanent_user()','EXECUTE') then
    raise exception 'anon can execute permanent-account helper';
  end if;
  if not has_function_privilege('authenticated','public.academic_suite_is_permanent_user()','EXECUTE') then
    raise exception 'authenticated cannot execute permanent-account helper';
  end if;
end $$;

set local request.jwt.claims = '{"is_anonymous":true}';
do $$
begin
  if public.academic_suite_is_permanent_user() then
    raise exception 'anonymous JWT incorrectly treated as permanent';
  end if;
end $$;

set local request.jwt.claims = '{"is_anonymous":false}';
do $$
begin
  if not public.academic_suite_is_permanent_user() then
    raise exception 'permanent JWT incorrectly rejected';
  end if;
end $$;

select 'ACADEMIC_SUITE_PERMANENT_ACCOUNT_RLS_SMOKE_PASS' as result;
