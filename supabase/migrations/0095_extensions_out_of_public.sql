-- 0095_extensions_out_of_public.sql
--
-- Advisor `extension_in_public` (audit A26-10, zadnja dva WARN-a od njih 66).
--
-- Ekstenzija u `public` je problem jer joj objekti dijele imenski prostor s aplikacijskim
-- tablicama i funkcijama: nadogradnja ekstenzije moze pregaziti ime na koje se aplikacija oslanja,
-- a `public` je i shema koju klijentske uloge vide.
--
-- MJERENO NAD PRODUKCIJOM 18.8.2026., jer se ova dva slucaja NE rjesavaju isto:
--
--   vector 0.8.2   -> `public`, 0 ovisnih objekata, 0 stupaca tipa `vector` u cijeloj bazi.
--                     Instalirana je i nekoristena, pa je premjestanje bez rizika.
--   pg_net 0.20.3  -> `public` po `extnamespace`, ALI svih 15 njezinih objekata zivi u shemi
--                     `net`. U `public` od nje nema NICEGA.
--
-- ZATO OVA MIGRACIJA NE DIRA `pg_net`, i to je odluka, ne propust. `ALTER EXTENSION ... SET SCHEMA`
-- premjesta CLANOVE ekstenzije, pa bi `net.http_post` i `net.http_get` prestali postojati pod tim
-- imenom. Dva cron posla ih zovu upravo tako (mjereno: `select count(*) from cron.job where command
-- ilike '%net.http%'` = 2), a zovu ih i Supabaseovi interni webhookovi. Zahvat bi dakle zamijenio
-- upozorenje koje ne opisuje stvarnu izlozenost za tiho pokvaren cron.
--
-- `pg_net` ostaje SVJESNO PRIHVACENO odstupanje, zapisano u `docs/AUDIT_MASTER.md`. Advisor ce ga
-- i dalje javljati; to je tocno, ali mjeri deklarirani `extnamespace`, a ne gdje su objekti.
--
-- `search_path` na razini baze je vec `"$user", public, extensions`, pa nekvalificirane reference
-- na `vector` nastavljaju raditi bez ijedne izmjene koda.

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    create schema extensions;
  end if;

  -- Idempotentno: ako je vec premjestena (ili nije instalirana), ne radi nista.
  if exists (
    select 1
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
     where e.extname = 'vector' and n.nspname = 'public'
  ) then
    -- Tvrdo osiguranje: premjesti SAMO dok je doista nekoristena. Ako je netko u medjuvremenu
    -- dodao stupac tipa `vector`, migracija radije ne radi nista nego da ga premjesti ispod nogu.
    if not exists (
      select 1
        from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_type t on t.oid = a.atttypid
       where t.typname = 'vector' and c.relkind = 'r' and not a.attisdropped
    ) then
      execute 'alter extension vector set schema extensions';
    else
      raise notice '0095: vector se NE premjesta, postoje stupci tog tipa; rijesi rucno.';
    end if;
  end if;
end
$$;
