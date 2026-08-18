-- 0090_academic_project_commercial_stages.sql
--
-- VRACENO IZ PRODUKCIJE 2026-08-17 (audit A26-04).
--
-- Ova migracija je bila primijenjena na produkciju (verzija 20260805202458) ali NIKAD nije
-- postojala u repozitoriju, pa repozitorij nije mogao reproducirati produkcijsku shemu.
-- Tijelo je doslovno preuzeto iz supabase_migrations.schema_migrations.statements, bez
-- ijedne izmjene, da zapis odgovara onome sto je stvarno izvedeno nad bazom.
--
-- Na produkciji je vec izvedena. Ponovna primjena je bezopasna jer je zahvat pisan
-- idempotentno (`drop ... if exists` prije `create`, `if not exists` na tablicama), pa je
-- `supabase db push` smije ponovno provuci. Sluzi da staging i svaka nova baza mogu doci
-- do istog stanja.
alter table public.academic_projects
  drop constraint if exists academic_projects_stage_check;

alter table public.academic_projects
  add constraint academic_projects_stage_check
  check (stage = any (array[
    'topic', 'checkout_pending', 'paid', 'research', 'plan', 'writing',
    'mentor-review', 'katedra-review', 'lekta-preflight', 'revision',
    'submission', 'defense', 'completed'
  ]));
