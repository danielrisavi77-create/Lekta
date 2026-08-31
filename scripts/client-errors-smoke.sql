-- Smoke za sabirnicu klijentskih gresaka (audit P1-28).
--
-- Mjeri dvije stvari koje se lako pokvare tiho: da retencija brise SAMO staro, i da poziv s
-- degenerativnim pragom ne obrise sve.
\set ON_ERROR_STOP on
\timing off

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

\i supabase/migrations/0101_client_errors.sql

create or replace function assert_eq(actual text, expected text, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : ocekivano %, dobiveno %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

insert into client_errors (incident_id, kind, message, created_at) values
  ('LEK-SVJEZ001', 'error', 'svjeza greska', now() - interval '1 day'),
  ('LEK-STARA001', 'error', 'stara greska',  now() - interval '200 days'),
  ('LEK-STARA002', 'error', 'jos starija',   now() - interval '400 days');

-- 1. Retencija brise SAMO staro.
select assert_eq(purge_client_errors(90)::text, '2', 'obrisane tocno dvije stare');
select assert_eq((select count(*)::text from client_errors), '1', 'svjeza greska prezivjela');

-- 2. KLJUCNO: degenerativan prag ne smije obrisati sve. `greatest(..., 1)` ga svodi na 1 dan.
select assert_eq(purge_client_errors(0)::text, '0', 'prag 0 ne brise svjeze');
select assert_eq(purge_client_errors(-5)::text, '0', 'negativan prag ne brise svjeze');
select assert_eq((select count(*)::text from client_errors), '1', 'redak je i dalje tu');

-- 3. RLS je upaljen i nema SELECT politike: kroz Data API se ne cita nista.
select assert_eq((select relrowsecurity::text from pg_class where relname = 'client_errors'),
                 'true', 'RLS je upaljen');
select assert_eq((select count(*)::text from pg_policies
                   where tablename = 'client_errors' and cmd = 'SELECT'),
                 '0', 'nema SELECT politike, dakle javnog citanja nema');

rollback;

\echo 'client-errors-smoke: SVE TVRDNJE PROSLE'
