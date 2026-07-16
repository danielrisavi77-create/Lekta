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

-- Fail-closed retencija (AUD-18/19 / LEKTA-SEC-02 obrazac, prosiren na cron sibling): bez pg_crona
-- purge_old_report_generations() se nikad ne bi zakazao, a migracija bi tiho prosla zeleno, pa bi
-- stari zapisi generacija (s hashiranim IP-jem) ostali zauvijek suprotno politici minimizacije.
-- Zato izostanak pg_crona RUSI migraciju (glasno) umjesto tihog preskoka. Idempotentno: re-run
-- radi unschedule pa schedule istog imenovanog joba (03:00 UTC).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron nije dostupan: purge_old_report_generations() se ne moze zakazati (fail-closed). Ukljuci pg_cron ekstenziju pa ponovno pokreni migraciju.';
  end if;
  begin
    perform cron.unschedule('purge-report-generations');
  exception when others then
    null; -- job jos ne postoji
  end;
  perform cron.schedule('purge-report-generations', '0 3 * * *', 'select purge_old_report_generations(90);');
end $$;
