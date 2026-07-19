-- 0027_repair_orphan_sweep.sql
-- WS-7 GDPR higijena (zatvara TODO iz 0026): uklanjanje SIROCIH Storage BLOB-ova iz bucketa 'repair'.
-- Kad se obrise RACUN, repair_jobs redak nestane (user_id `on delete cascade`), ali storage.objects
-- (original.docx + fixed.docx) prezive jer nisu FK-cascade vezani (owner je ON DELETE SET NULL), pa
-- ostaju kao siroce s osobnim podatkom (cijeli studentski rad). Ova migracija daje DETEKCIJSKU funkciju;
-- samo BRISANJE radi Edge funkcija cleanup-orphan-repairs (Storage API), okinuta pg_cronom (template dolje).
-- SQL sam ne smije brisati storage.objects redak jer to NE uklanja fizicki objekt iz Storagea.

-- find_orphan_repair_objects: imena objekata u bucketu 'repair' koja NEMAJU pripadni repair_jobs redak
-- (ni kao original_path ni result_path) I starija su od grace perioda. Grace period stiti RACE: storeRepairJob
-- uploada BLOB pa TEK onda insertira redak, pa upravo uploadan (jos "bez retka") BLOB ne smije biti pometen.
-- security definer (cita storage.objects) + set search_path='' (anti-injection) pa je sve puno-kvalificirano.
create or replace function find_orphan_repair_objects(p_grace_minutes int default 60, p_limit int default 500)
returns table(object_name text)
language sql
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'repair'
    and o.created_at < now() - make_interval(mins => p_grace_minutes)
    and not exists (
      select 1 from public.repair_jobs r
      where r.original_path = o.name or r.result_path = o.name
    )
  order by o.created_at
  limit p_limit
$$;

-- Samo service role (Edge cleanup-orphan-repairs) smije zvati; anon/authenticated ne.
revoke all on function find_orphan_repair_objects(int, int) from public;
grant execute on function find_orphan_repair_objects(int, int) to service_role;

-- pg_cron okidac (NIJE u migraciji: treba stvarni PROJECT_REF + REPAIR_CLEANUP_CRON_SECRET). Nakon deploya
-- cleanup-orphan-repairs Edge Functiona i postavljanja tajne (ista vrijednost u Edge secrets i u headeru),
-- pokreni RUCNO u SQL editoru. NE koristi service role kljuc u headeru (dedicirana cron tajna, kao 0012):
--
-- select cron.schedule(
--   'cleanup-orphan-repairs',
--   '20 4 * * *', -- svaki dan u 04:20 UTC
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-orphan-repairs',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <REPAIR_CLEANUP_CRON_SECRET>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
