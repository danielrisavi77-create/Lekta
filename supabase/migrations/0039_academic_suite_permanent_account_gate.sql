-- Academic Suite permanent-account gate.
--
-- Lekta intentionally uses Supabase anonymous Auth for local-first repair flows.
-- Anonymous Auth users carry the `authenticated` Postgres role, so `TO
-- authenticated` alone does not distinguish them from permanent Katedra/
-- Academic Suite accounts. Keep existing Lekta commerce semantics unchanged,
-- but require a permanent account for the new cross-product project/state data.
--
-- These restrictive policies compose with the existing permissive owner
-- policies: both ownership AND is_anonymous=false must pass.

create or replace function public.academic_suite_is_permanent_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false;
$$;

revoke all on function public.academic_suite_is_permanent_user() from public, anon;
grant execute on function public.academic_suite_is_permanent_user() to authenticated, service_role;

-- Shared project identity.
drop policy if exists academic_projects_permanent_account on public.academic_projects;
create policy academic_projects_permanent_account
  on public.academic_projects
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

-- Katedra workflow/state compatibility surfaces.
drop policy if exists katedra_project_state_permanent_account on public.katedra_project_state;
create policy katedra_project_state_permanent_account
  on public.katedra_project_state
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

drop policy if exists katedra_projects_permanent_account on public.katedra_projects;
create policy katedra_projects_permanent_account
  on public.katedra_projects
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

-- Cross-product deterministic history.
drop policy if exists lekta_checks_permanent_account on public.lekta_checks;
create policy lekta_checks_permanent_account
  on public.lekta_checks
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

-- Katedra AI accounting is account data, not anonymous Lekta session data.
drop policy if exists katedra_wallets_permanent_account on public.katedra_wallets;
create policy katedra_wallets_permanent_account
  on public.katedra_wallets
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

drop policy if exists katedra_topups_permanent_account on public.katedra_topups;
create policy katedra_topups_permanent_account
  on public.katedra_topups
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));

drop policy if exists katedra_usage_permanent_account on public.katedra_usage;
create policy katedra_usage_permanent_account
  on public.katedra_usage
  as restrictive
  for all
  to authenticated
  using ((select public.academic_suite_is_permanent_user()))
  with check ((select public.academic_suite_is_permanent_user()));
