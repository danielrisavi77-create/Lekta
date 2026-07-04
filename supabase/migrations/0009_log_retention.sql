-- Lekta: retencija logova generacija (pre-launch checklist P1 2.6).
-- report_generations vec sprema HASHIRAN IP (ne sirovi); ovdje se dodaje automatsko
-- brisanje zapisa starijih od zadanog prozora (zadano 90 dana). IP je hashiran, pa je
-- brisanje starih redaka dodatni sloj minimizacije podataka.

-- Cista, pozivljiva funkcija (moze se pokrenuti i rucno / iz drugog schedulera).
create or replace function purge_old_report_generations(retention_days int default 90)
returns integer
language sql
as $$
  with del as (
    delete from report_generations
    where created_at < now() - make_interval(days => retention_days)
    returning 1
  )
  select count(*)::int from del;
$$;

-- Ako je pg_cron dostupan (Supabase: ukljuci ekstenziju u Dashboard -> Database -> Extensions),
-- zakazi dnevno brisanje u 03:00 UTC. Ako nije, migracija ne pada; brisanje pozovi rucno ili
-- ukljuci pg_cron pa ponovno primijeni ovaj blok.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('purge-report-generations');
    exception when others then
      null; -- job jos ne postoji
    end;
    perform cron.schedule('purge-report-generations', '0 3 * * *', 'select purge_old_report_generations(90);');
  end if;
end $$;
