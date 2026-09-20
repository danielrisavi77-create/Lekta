-- 0059_secure_reminder_cron.sql
--
-- Zakazuje dnevni poziv Edge funkcije `send-reminders` (podsjetnici na rokove).
--
-- ZASTO JE OVA MIGRACIJA PREPISANA (2026-09-20, vidi docs/deploy/MIGRATION_IDENTITY.md):
-- prvobitna inacica bila je jedan redak koji je BEZUVJETNO zvao
-- `cron.unschedule('send-deadline-reminders')` i zatim zakazivao posao s TVRDO UPISANIM
-- produkcijskim URL-om i produkcijskim Bearer kljucem. Oba su bila kvar:
--   1. na okolini gdje taj posao ne postoji (staging, svaka nova baza) unschedule baca
--      "could not find valid entry for job send-deadline-reminders" (SQLSTATE XX000) i rusi
--      cijeli `db push` lanac. Migracija time nije bila idempotentna, sto krsi tvrdo pravilo
--      repozitorija.
--   2. tvrdo upisan produkcijski endpoint znaci da bi SVAKA baza na koju se migracija primijeni
--      (staging, dev, lokalna) svaki dan u 8 h zvala PRODUKCIJSKU funkciju i slala podsjetnike
--      stvarnim korisnicima. Kljuc u repozitoriju je uz to tajna u javnoj povijesti.
--
-- Zato se URL i tajna citaju iz vaulta, a naredba se slaze kroz `format(... %L ...)`. Navodnjavanje
-- je nuzno, ne kozmetika: `cron.schedule` prima naredbu KAO TEKST koji se kasnije izvodi, pa je
-- %L jedina obrana od injekcije i od pucanja na apostrofu u vrijednosti tajne.
--
-- NAMJERNA RAZLIKA PREMA SUSJEDNIM CRON MIGRACIJAMA (0009, 0011, 0016, 0018, 0019, 0022, 0034):
-- one su FAIL-CLOSED i ruse migraciju kad pg_cron nije dostupan, jer je ondje rijec o retenciji
-- osobnih podataka: izostanak posla je tiha povreda politike minimizacije. Ovdje je obrnuto.
-- Izostanak vault tajni je OCEKIVANO stanje na stagingu i u razvoju (tajne su po okolini), a
-- posljedica nezakazanog posla je samo da podsjetnici ne idu. Zato je ova migracija FAIL-QUIET:
-- javi `notice` i ne napravi nista. Ne "popravljaj" je natrag na fail-closed: time se vraca
-- blokator koji je 2026-09-20 srusio staging push.
--
-- Tajne se na produkciji postavljaju RUCNO (vlasnik), vidi docs/deploy/MIGRATION_IDENTITY.md:
--   lekta_functions_base_url  = https://<PROJECT_REF>.supabase.co
--   lekta_cron_bearer         = ISTA vrijednost kao Edge tajna REMINDER_CRON_SECRET
-- Ako se te dvije vrijednosti raziduju, cron dobiva 401 od `_shared/cron-auth.ts` (fail-closed,
-- konstantno-vremenska usporedba), i to tiho, jer cron nema kome prijaviti gresku.

do $$
declare
  v_base_url text;
  v_bearer   text;
  v_command  text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'send-deadline-reminders nije zakazan: pg_cron nije dostupan';
    return;
  end if;

  -- REDOSLIJED JE UGOVOR: tajne se citaju PRIJE nego se dira zatecen posao.
  -- Obrnuti redoslijed (prvo unschedule, pa izlaz zbog tajni koje fale) na produkciji bi UGASIO
  -- posao koji radi i ne bi ga zamijenio nicim, pa bi podsjetnici tiho prestali ici. Ovako
  -- odsutnost tajni ne dira nista: zatecen posao ostaje tocno kakav je bio.
  -- Nalaz iz adversarijalnog pregleda (codex, 2026-09-20).
  --
  -- Vault ne mora postojati (lokalni Postgres bez supabase_vault), pa je i citanje zasticeno.
  -- `select ... into` bez `strict` vraca null kad retka nema, a kod duplog imena uzima prvi;
  -- `order by ... limit 1` cini taj izbor odredjenim i ponovljivim umjesto proizvoljnog.
  begin
    select decrypted_secret into v_base_url
      from vault.decrypted_secrets
     where name = 'lekta_functions_base_url'
     order by created_at desc
     limit 1;

    select decrypted_secret into v_bearer
      from vault.decrypted_secrets
     where name = 'lekta_cron_bearer'
     order by created_at desc
     limit 1;
  exception when others then
    v_base_url := null;
    v_bearer := null;
  end;

  if coalesce(v_base_url, '') = '' or coalesce(v_bearer, '') = '' then
    raise notice 'send-deadline-reminders nije zakazan i zatecen posao nije dirnut: nema vault tajni (lekta_functions_base_url / lekta_cron_bearer)';
    return;
  end if;

  -- Idempotencija: zatecen posao se gasi, ali njegovo NEPOSTOJANJE nije greska.
  -- Isti idiom kao 0009/0011/0016/0018/0019/0022/0034/0054.
  -- `exception when others` je namjerno sirok jer `cron.unschedule` nepostojanje posla javlja kao
  -- XX000 (internal_error), a ne kao razred koji se moze uze uhvatiti. Cijena je prihvatljiva:
  -- `cron.schedule` je upsert po imenu posla, pa progutan neuspjeh gasenja ne moze proizvesti
  -- dvostruk posao, nego najgore ostavi stari raspored koji sljedeci redak ionako prepise.
  begin
    perform cron.unschedule('send-deadline-reminders');
  exception when others then
    null; -- job jos ne postoji
  end;

  v_command := format(
    'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb);',
    rtrim(v_base_url, '/') || '/functions/v1/send-reminders',
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_bearer,
    '{}'
  );

  perform cron.schedule('send-deadline-reminders', '0 8 * * *', v_command);
  raise notice 'send-deadline-reminders zakazan (0 8 * * *) prema vault tajnama';
end $$;
