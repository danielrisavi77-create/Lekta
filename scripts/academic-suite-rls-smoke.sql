\set ON_ERROR_STOP on

\i supabase/migrations/0036_academic_suite_rls_hardening.sql

do $$
declare
  ent_roles name[];
  slot_roles name[];
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
end $$;

select 'ACADEMIC_SUITE_RLS_SMOKE_PASS' as result;
