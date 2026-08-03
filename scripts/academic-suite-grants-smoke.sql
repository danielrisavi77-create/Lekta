\set ON_ERROR_STOP on

\i supabase/migrations/0037_academic_suite_api_grants.sql

do $$
begin
  if not has_table_privilege('authenticated', 'public.katedra_projects', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'authenticated lacks Katedra compatibility CRUD';
  end if;
  if not has_table_privilege('authenticated', 'public.academic_projects', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'authenticated lacks academic_projects CRUD';
  end if;
  if not has_table_privilege('authenticated', 'public.katedra_project_state', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'authenticated lacks Katedra state CRUD';
  end if;
  if not has_table_privilege('authenticated', 'public.lekta_checks', 'SELECT') then
    raise exception 'authenticated lacks owner-readable Lekta checks';
  end if;
  if has_table_privilege('authenticated', 'public.lekta_checks', 'INSERT')
     or has_table_privilege('authenticated', 'public.katedra_wallets', 'UPDATE')
     or has_table_privilege('authenticated', 'public.katedra_topups', 'INSERT')
     or has_table_privilege('authenticated', 'public.katedra_usage', 'DELETE') then
    raise exception 'authenticated received a forbidden server-authoritative write grant';
  end if;
  if has_table_privilege('anon', 'public.academic_projects', 'SELECT')
     or has_table_privilege('anon', 'public.katedra_projects', 'SELECT')
     or has_table_privilege('anon', 'public.lekta_checks', 'SELECT') then
    raise exception 'anon received access to private Academic Suite tables';
  end if;
end $$;

select 'ACADEMIC_SUITE_GRANTS_SMOKE_PASS' as result;
