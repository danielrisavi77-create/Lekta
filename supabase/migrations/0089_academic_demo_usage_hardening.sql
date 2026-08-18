-- 0089_academic_demo_usage_hardening.sql
--
-- VRACENO IZ PRODUKCIJE 2026-08-17 (audit A26-04).
--
-- Ova migracija je bila primijenjena na produkciju (verzija 20260805202104) ali NIKAD nije
-- postojala u repozitoriju, pa repozitorij nije mogao reproducirati produkcijsku shemu.
-- Tijelo je doslovno preuzeto iz supabase_migrations.schema_migrations.statements, bez
-- ijedne izmjene, da zapis odgovara onome sto je stvarno izvedeno nad bazom.
--
-- Na produkciji je vec izvedena. Ponovna primjena je bezopasna jer je zahvat pisan
-- idempotentno (`drop ... if exists` prije `create`, `if not exists` na tablicama), pa je
-- `supabase db push` smije ponovno provuci. Sluzi da staging i svaka nova baza mogu doci
-- do istog stanja.
alter function public.consume_academic_demo_quota(uuid, uuid, text, integer)
  set search_path = public;

alter function public.release_academic_demo_quota(uuid, uuid, text)
  set search_path = public;
