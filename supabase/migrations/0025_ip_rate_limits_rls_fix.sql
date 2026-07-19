-- 0025_ip_rate_limits_rls_fix.sql
-- Fix (post-deploy security advisor): 0022_ip_rate_limits.sql je stvorio ip_rate_limits BEZ
-- ukljucenog RLS-a (previd, obrazac svih ostalih tablica u repou je enable + bez policyja =
-- default deny za anon/authenticated, service role zaobilazi RLS). Bez ovoga bi PostgREST
-- dopustio anon/authenticated izravan SELECT/INSERT/UPDATE/DELETE na tablicu koja smije biti
-- dostupna iskljucivo preko claim_ip_rate_slot RPC-a (security definer, vec revoked iz 0022).

alter table ip_rate_limits enable row level security;

-- Namjerno bez ijedne policy: citanje/pisanje ide iskljucivo preko claim_ip_rate_slot ili
-- service role, isti obrazac kao pricing_changelog (0002) i preflight_results_full (0019).

-- Dodatna higijena (isti advisor sken): 0013 nije revoke-ao execute na trigger funkciji.
-- Postgres i onako odbija RETURNS TRIGGER funkcije izvan trigger konteksta (anon poziv preko
-- RPC-a bi pao na "can only be called as trigger"), ali revoke uskladjuje s obrascem svih
-- ostalih SECURITY DEFINER funkcija u repou i gasi linter WARN.
revoke all on function ensure_referral_code_on_first_entitlement() from public, anon, authenticated;
