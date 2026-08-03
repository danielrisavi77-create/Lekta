-- Academic Suite least-privilege Data API hardening.
--
-- Supabase grants broad table privileges to API roles by default in some
-- projects. RLS still blocks row DML, but privileges such as TRUNCATE are not
-- a row-level operation. Revoke everything first, then grant only what each
-- browser role actually needs.

-- Private Academic Suite / account tables: anonymous users get no table rights.
revoke all on table public.academic_projects from anon;
revoke all on table public.katedra_project_state from anon;
revoke all on table public.katedra_projects from anon;
revoke all on table public.lekta_checks from anon;
revoke all on table public.katedra_wallets from anon;
revoke all on table public.katedra_topups from anon;
revoke all on table public.katedra_usage from anon;
revoke all on table public.entitlements from anon;
revoke all on table public.document_slots from anon;

-- Reset authenticated rights as well, so no implicit/default TRUNCATE,
-- REFERENCES or TRIGGER privileges survive.
revoke all on table public.academic_projects from authenticated;
revoke all on table public.katedra_project_state from authenticated;
revoke all on table public.katedra_projects from authenticated;
revoke all on table public.lekta_checks from authenticated;
revoke all on table public.katedra_wallets from authenticated;
revoke all on table public.katedra_topups from authenticated;
revoke all on table public.katedra_usage from authenticated;
revoke all on table public.entitlements from authenticated;
revoke all on table public.document_slots from authenticated;

-- Katedra project persistence: authenticated owner CRUD, with RLS as the
-- ownership boundary.
grant select, insert, update, delete on table public.academic_projects to authenticated;
grant select, insert, update, delete on table public.katedra_project_state to authenticated;
grant select, insert, update, delete on table public.katedra_projects to authenticated;

-- Deterministic history, billing metadata and AI accounting are browser read-only.
grant select on table public.lekta_checks to authenticated;
grant select on table public.katedra_wallets to authenticated;
grant select on table public.katedra_topups to authenticated;
grant select on table public.katedra_usage to authenticated;
grant select on table public.entitlements to authenticated;
grant select on table public.document_slots to authenticated;

-- Trusted backend retains full access. Explicit grants make this migration
-- robust even if default privileges change later.
grant all privileges on table public.academic_projects to service_role;
grant all privileges on table public.katedra_project_state to service_role;
grant all privileges on table public.katedra_projects to service_role;
grant all privileges on table public.lekta_checks to service_role;
grant all privileges on table public.katedra_wallets to service_role;
grant all privileges on table public.katedra_topups to service_role;
grant all privileges on table public.katedra_usage to service_role;
grant all privileges on table public.entitlements to service_role;
grant all privileges on table public.document_slots to service_role;
