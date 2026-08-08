-- 0039_security_advisor_hardening.sql
-- SECURITY DEFINER/cron helperi moraju imati deterministican search_path.
-- Ovo je eksplicitna re-verifikacija production nalaza iz Security Advisora.

alter function public.generate_referral_code()
  set search_path = public;

alter function public.purge_old_report_generations(integer)
  set search_path = public;

revoke execute on function public.purge_old_report_generations(integer)
  from public, anon, authenticated;
