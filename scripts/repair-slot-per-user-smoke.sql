-- Smoke za try_acquire_repair_slot_for_user (T84 RD-3) i dnevnik repair_attempt_log (RD-2).
--
-- Dokazuje: (1) jedan korisnik ne moze zauzeti vise od p_max_per_user slotova, (2) drugi korisnik
-- i dalje dobiva slot dok globalni limit nije pun, (3) globalni limit i dalje vrijedi, (4) istekli
-- slotovi se oslobadjaju, (5) stara funkcija iz 0094 i dalje radi, (6) NULL korisnik se odbija,
-- (7) vlasnik definer funkcije je postgres, (8) dnevnik prima rezervaciju i dva ishoda, nije dostupan
-- klijentskim ulogama i retencija brise stare retke, (9) service_role ima izricita prava i stvarno ih
-- koristi (R4-G), (10) bez pg_crona migracija pada (R4-P), (11) retencija je zakazana, drugi prolaz ne
-- dira isti posao, a promijenjen posao vraca (R6-I). Vrti se nad praznim clusterom, nikad nad produkcijom.
--
-- Cisti PostgreSQL 16 nema pg_cron, pa smoke postavlja STUB s istim sucem koji migracija koristi
-- (cron.job, cron.schedule, cron.unschedule). Stub `schedule` uvijek dodjeljuje novi jobid, pa svaki
-- poziv u drugom prolazu mijenja jobid i smoke ga vidi.
\set ON_ERROR_STOP on
\timing off

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role bypassrls; end if; -- kao na Supabaseu
end $$;

\i supabase/migrations/0094_repair_global_concurrency.sql

-- R4-P: bez pg_crona migracija mora pasti (55000), ne tiho proci bez retencije. Izvodi se u
-- podtransakciji DO bloka, pa se njezini ucinci ponistavaju.
\set mig0209 `cat supabase/migrations/0209_repair_limit_po_korisniku.sql`
select length(set_config('smoke.mig0209', :'mig0209', true)) > 0 as migracija_ucitana;
do $$ begin
  execute current_setting('smoke.mig0209');
  raise exception 'FAIL migracija je prosla bez pg_crona';
exception when sqlstate '55000' then
  raise notice 'ok: bez pg_crona migracija pada';
end $$;

-- Stub pg_crona (vidi zaglavlje).
create schema cron;
create table cron.job (jobid bigserial primary key, schedule text not null, command text not null, jobname text unique);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  delete from cron.job where jobname = job_name;
  insert into cron.job (schedule, command, jobname) values (schedule, command, job_name) returning jobid into v;
  return v;
end;
$$;
create function cron.unschedule(job_name text) returns boolean
language plpgsql as $$
begin
  delete from cron.job where jobname = job_name;
  if not found then raise exception 'could not find valid entry for job ''%''', job_name; end if;
  return true;
end;
$$;

\i supabase/migrations/0209_repair_limit_po_korisniku.sql
create temp table cron_before as select jobid, schedule, command from cron.job where jobname = 'purge-repair-attempt-log';
-- Idempotencija: drugi prolaz iste migracije mora biti no-op bez greske i ne smije dirati posao.
\i supabase/migrations/0209_repair_limit_po_korisniku.sql

create or replace function assert_eq(actual text, expected text, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : ocekivano %, dobiveno %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

-- R4-P i R6-I: retencija je zakazana, a drugi prolaz je zadrzao isti posao.
select assert_eq((select count(*)::text from cron_before), '1', 'retencija je zakazana nakon prvog prolaza');
select assert_eq((select schedule || ' | ' || command from cron.job where jobname = 'purge-repair-attempt-log'),
  '25 3 * * * | select public.purge_repair_attempt_log(7);', 'zakazani posao ima ocekivani raspored i naredbu');
select assert_eq((select jobid::text from cron.job where jobname = 'purge-repair-attempt-log'),
  (select jobid::text from cron_before), 'drugi prolaz ne dira isti posao (jobid nepromijenjen)');
-- Promijenjen posao se vraca na ocekivani.
update cron.job set schedule = '0 0 * * *' where jobname = 'purge-repair-attempt-log';
\i supabase/migrations/0209_repair_limit_po_korisniku.sql
select assert_eq((select schedule from cron.job where jobname = 'purge-repair-attempt-log'), '25 3 * * *', 'promijenjen raspored se vraca');
select assert_eq((select count(*)::text from cron.job where jobname = 'purge-repair-attempt-log'), '1', 'posao postoji tocno jednom');

-- A i B su dva korisnika; globalni limit 3, po korisniku 1.
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000a', 1)), 'ok', 'A dobiva prvi slot');
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000a', 1)), 'user_busy', 'A ne dobiva drugi slot (limit po korisniku)');
select assert_eq((select count(*)::text from repair_inflight where user_id = '00000000-0000-0000-0000-00000000000a'), '1', 'A drzi tocno jedan slot');
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000b', 1)), 'ok', 'B dobiva slot dok globalni nije pun');
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000c', 1)), 'ok', 'C dobiva treci slot');
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000d', 1)), 'full', 'D dobiva full (globalni limit vrijedi)');

-- Istekli slot: A-ov slot se postavi u proslost, pa A opet dobiva slot.
update repair_inflight set started_at = now() - interval '1 hour' where user_id = '00000000-0000-0000-0000-00000000000a';
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000a', 1)), 'ok', 'istekli slot je oslobodjen');

-- Stara funkcija (0094) i dalje radi i broji iste retke.
select assert_eq((select (try_acquire_repair_slot(3, 300) is null)::text), 'true', 'stara funkcija vidi pun globalni limit');

-- Limit po korisniku iskljucen (0): isti korisnik dobiva vise slotova dok globalni ne stane.
delete from repair_inflight;
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000e', 0)), 'ok', 'limit po korisniku iskljucen: prvi');
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-00000000000e', 0)), 'ok', 'limit po korisniku iskljucen: drugi');

-- Grantovi: klijentske uloge ne smiju izvrsiti novu funkciju.
select assert_eq(has_function_privilege('anon', 'public.try_acquire_repair_slot_for_user(int,int,uuid,int)', 'execute')::text, 'false', 'anon nema execute');
select assert_eq(has_function_privilege('authenticated', 'public.try_acquire_repair_slot_for_user(int,int,uuid,int)', 'execute')::text, 'false', 'authenticated nema execute');

-- R8: NULL korisnik se odbija.
do $$ begin
  perform * from try_acquire_repair_slot_for_user(3, 300, null, 1);
  raise exception 'FAIL NULL p_user_id je prosao';
exception when null_value_not_allowed then
  raise notice 'ok: NULL p_user_id se odbija';
end $$;

-- R5: vlasnik definer funkcije je izricito postgres.
select assert_eq((select pg_get_userbyid(proowner) from pg_proc where proname = 'try_acquire_repair_slot_for_user'), 'postgres', 'vlasnik funkcije je postgres');
select assert_eq((select prosecdef::text from pg_proc where proname = 'try_acquire_repair_slot_for_user'), 'true', 'funkcija je security definer');

-- R4-G: servisna uloga ima izricita prava i stvarno ih koristi (put koji repair-docx izvodi).
select assert_eq(has_function_privilege('service_role', 'public.try_acquire_repair_slot_for_user(int,int,uuid,int)', 'execute')::text, 'true', 'service_role ima execute');
delete from repair_inflight;
set local role service_role;
select assert_eq((select reason from try_acquire_repair_slot_for_user(3, 300, '00000000-0000-0000-0000-0000000000f0', 1)), 'ok', 'service_role dobiva slot');
insert into repair_attempt_log (user_id) values ('00000000-0000-0000-0000-0000000000f0');
select assert_eq((select outcome from repair_attempt_log where user_id = '00000000-0000-0000-0000-0000000000f0'), 'pending', 'rezervacija je pending');
update repair_attempt_log set outcome = 'no_change' where user_id = '00000000-0000-0000-0000-0000000000f0';
select assert_eq((select count(*)::text from repair_attempt_log where user_id = '00000000-0000-0000-0000-0000000000f0' and outcome = 'no_change'), '1', 'service_role dopisuje ishod');
delete from repair_attempt_log where user_id = '00000000-0000-0000-0000-0000000000f0';
select assert_eq((select count(*)::text from repair_attempt_log), '0', 'service_role brise rezervaciju');
reset role;
delete from repair_inflight;

-- RD-2: dnevnik pokusaja.
insert into repair_attempt_log (user_id, outcome) values
  ('00000000-0000-0000-0000-00000000000a', 'no_change'),
  ('00000000-0000-0000-0000-00000000000a', 'integrity_failed');
select assert_eq((select count(*)::text from repair_attempt_log), '2', 'dnevnik prima no_change i integrity_failed');
do $$ begin
  insert into repair_attempt_log (user_id, outcome) values ('00000000-0000-0000-0000-00000000000a', 'free');
  raise exception 'FAIL nepoznat ishod je prosao CHECK';
exception when check_violation then
  raise notice 'ok: nepoznat ishod pada na CHECK';
end $$;
do $$ begin
  insert into repair_attempt_log (user_id, outcome) values (null, 'no_change');
  raise exception 'FAIL dnevnik bez korisnika je prosao';
exception when not_null_violation then
  raise notice 'ok: dnevnik bez korisnika pada';
end $$;
select assert_eq(has_table_privilege('anon', 'public.repair_attempt_log', 'select')::text, 'false', 'anon ne cita dnevnik');
select assert_eq(has_table_privilege('authenticated', 'public.repair_attempt_log', 'insert')::text, 'false', 'authenticated ne pise dnevnik');
select assert_eq((select relrowsecurity::text from pg_class where relname = 'repair_attempt_log'), 'true', 'dnevnik ima RLS');
update repair_attempt_log set created_at = now() - interval '8 days' where outcome = 'no_change';
select assert_eq(purge_repair_attempt_log(7)::text, '1', 'retencija brise retke starije od 7 dana');
select assert_eq((select count(*)::text from repair_attempt_log), '1', 'svjezi redak ostaje');

rollback;
