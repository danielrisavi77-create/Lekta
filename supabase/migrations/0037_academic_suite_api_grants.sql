-- Explicit Data API grants for Academic Suite tables.
-- RLS remains the row-level authorization boundary; these grants only define
-- which operations PostgREST may attempt for each role.

revoke all on table public.academic_projects from anon;
revoke all on table public.katedra_project_state from anon;
revoke all on table public.katedra_projects from anon;
revoke all on table public.lekta_checks from anon;
revoke all on table public.katedra_wallets from anon;
revoke all on table public.katedra_topups from anon;
revoke all on table public.katedra_usage from anon;

grant select, insert, update, delete on table public.academic_projects to authenticated;
grant select, insert, update, delete on table public.katedra_project_state to authenticated;
grant select, insert, update, delete on table public.katedra_projects to authenticated;

grant select on table public.lekta_checks to authenticated;
grant select on table public.katedra_wallets to authenticated;
grant select on table public.katedra_topups to authenticated;
grant select on table public.katedra_usage to authenticated;

-- No authenticated writes to deterministic check history or Katedra billing
-- accounting. Those mutations remain trusted server/service-role operations.
revoke insert, update, delete on table public.lekta_checks from authenticated;
revoke insert, update, delete on table public.katedra_wallets from authenticated;
revoke insert, update, delete on table public.katedra_topups from authenticated;
revoke insert, update, delete on table public.katedra_usage from authenticated;
