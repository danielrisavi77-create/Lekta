-- 0087_academic_audit_insert_policies.sql
--
-- VRACENO IZ PRODUKCIJE 2026-08-17 (audit A26-04).
--
-- Ova migracija je bila primijenjena na produkciju (verzija 20260805184408) ali NIKAD nije
-- postojala u repozitoriju, pa repozitorij nije mogao reproducirati produkcijsku shemu.
-- Tijelo je doslovno preuzeto iz supabase_migrations.schema_migrations.statements, bez
-- ijedne izmjene, da zapis odgovara onome sto je stvarno izvedeno nad bazom.
--
-- Na produkciji je vec izvedena. Ponovna primjena je bezopasna jer je zahvat pisan
-- idempotentno (`drop ... if exists` prije `create`, `if not exists` na tablicama), pa je
-- `supabase db push` smije ponovno provuci. Sluzi da staging i svaka nova baza mogu doci
-- do istog stanja.
drop policy if exists academic_audit_runs_insert_own on public.academic_audit_runs;
create policy academic_audit_runs_insert_own on public.academic_audit_runs for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists academic_audit_findings_insert_own on public.academic_audit_findings;
create policy academic_audit_findings_insert_own on public.academic_audit_findings for insert to authenticated with check ((select auth.uid()) = user_id);
