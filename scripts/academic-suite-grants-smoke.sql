\set ON_ERROR_STOP on

\i supabase/migrations/0037_academic_suite_api_grants.sql
\i supabase/migrations/0038_academic_suite_least_privilege_grants.sql

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

  if not has_table_privilege('authenticated', 'public.lekta_checks', 'SELECT')
     or not has_table_privilege('authenticated', 'public.katedra_wallets', 'SELECT')
     or not has_table_privilege('authenticated', 'public.katedra_topups', 'SELECT')
     or not has_table_privilege('authenticated', 'public.katedra_usage', 'SELECT')
     or not has_table_privilege('authenticated', 'public.entitlements', 'SELECT')
     or not has_table_privilege('authenticated', 'public.document_slots', 'SELECT') then
    raise exception 'authenticated lacks required read-only grants';
  end if;

  if has_table_privilege('authenticated', 'public.lekta_checks', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.katedra_wallets', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.katedra_topups', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.katedra_usage', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.entitlements', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.document_slots', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'authenticated received forbidden write/admin grants';
  end if;

  if has_table_privilege('authenticated', 'public.academic_projects', 'TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.katedra_projects', 'TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('authenticated', 'public.katedra_project_state', 'TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'authenticated CRUD tables retained admin-style grants';
  end if;

  if has_table_privilege('anon', 'public.academic_projects', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.katedra_project_state', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.katedra_projects', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.lekta_checks', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.katedra_wallets', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.katedra_topups', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.katedra_usage', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.entitlements', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon', 'public.document_slots', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'anon retained private Academic Suite/account table privileges';
  end if;
end $$;

select 'ACADEMIC_SUITE_LEAST_PRIVILEGE_GRANTS_SMOKE_PASS' as result;
