-- Smoke za try_acquire_repair_slot_for_user (T84 RD-3) i nove statuse report_generations (RD-2).
--
-- Dokazuje: (1) jedan korisnik ne moze zauzeti vise od p_max_per_user slotova, (2) drugi korisnik
-- i dalje dobiva slot dok globalni limit nije pun, (3) globalni limit i dalje vrijedi, (4) istekli
-- slotovi se oslobadjaju, (5) stara funkcija iz 0094 i dalje radi, (6) no_change i integrity_failed
-- prolaze CHECK, a nepoznat status pada. Vrti se nad praznim clusterom, nikad nad produkcijom.
\set ON_ERROR_STOP on
\timing off

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

-- Minimalna kopija report_generations iz 0001 (smoke ne treba auth.users ni ostale stupce).
create table if not exists public.report_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  status text not null
);

\i supabase/migrations/0094_repair_global_concurrency.sql
\i supabase/migrations/0209_repair_limit_po_korisniku.sql
-- Idempotencija: drugi prolaz iste migracije mora biti no-op bez greske.
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

-- RD-2 statusi.
insert into report_generations (status) values ('no_change'), ('integrity_failed'), ('free');
select assert_eq((select count(*)::text from report_generations where status in ('no_change', 'integrity_failed')), '2', 'novi statusi prolaze CHECK');
do $$ begin
  insert into report_generations (status) values ('izmisljen');
  raise exception 'FAIL nepoznat status je prosao CHECK';
exception when check_violation then
  raise notice 'ok: nepoznat status pada na CHECK';
end $$;

rollback;
