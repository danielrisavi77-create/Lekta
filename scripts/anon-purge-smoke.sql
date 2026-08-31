-- Smoke za ciscenje napustenih anonimnih racuna (audit P1-11).
--
-- Najvazniji test nije "brise stare", nego "NE brise racun koji ima podatke", i to ukljucujuci
-- tablicu koja je dodana POSLIJE migracije. Upravo to je razlog zbog kojeg predikat ide iz
-- kataloga: rucni popis bi ovdje pao.
\set ON_ERROR_STOP on
\timing off

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

-- Minimalna kopija auth.users (prazan cluster nema Supabase auth shemu).
create schema if not exists auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  is_anonymous boolean not null default false,
  email text,
  created_at timestamptz not null default now()
);

-- Dvije tablice koje referenciraju korisnika, kao u produkciji.
create table repair_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade
);
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade
);

\i supabase/migrations/0099_purge_anonymous_users.sql

create or replace function assert_eq(actual text, expected text, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : ocekivano %, dobiveno %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

-- Kandidati.
insert into auth.users (id, is_anonymous, email, created_at) values
  ('00000000-0000-4000-8000-000000000001', true,  null,      now() - interval '90 days'),  -- prazan i star -> brisiv
  ('00000000-0000-4000-8000-000000000002', true,  null,      now() - interval '90 days'),  -- ima repair -> NE
  ('00000000-0000-4000-8000-000000000003', true,  null,      now() - interval '90 days'),  -- ima entitlement -> NE
  ('00000000-0000-4000-8000-000000000004', true,  null,      now() - interval '1 day'),    -- prazan ali svjez -> NE
  ('00000000-0000-4000-8000-000000000005', false, 'a@b.hr',  now() - interval '90 days');  -- nije anoniman -> NE

insert into repair_jobs (user_id)  values ('00000000-0000-4000-8000-000000000002');
insert into entitlements (user_id) values ('00000000-0000-4000-8000-000000000003');

-- 1. Tocno jedan kandidat, i to onaj pravi.
select assert_eq((select count(*)::text from find_purgeable_anonymous_users(30, 100)), '1',
                 'tocno jedan brisiv racun');
select assert_eq((select user_id::text from find_purgeable_anonymous_users(30, 100)),
                 '00000000-0000-4000-8000-000000000001', 'brisiv je BAS prazan i star racun');

-- 2. Racun s podacima se NIKAD ne vraca, ni uz prag 0.
select assert_eq(
  (select count(*)::text from find_purgeable_anonymous_users(0, 100)
    where user_id in ('00000000-0000-4000-8000-000000000002',
                      '00000000-0000-4000-8000-000000000003')),
  '0', 'racun s podacima nije kandidat ni uz prag 0');

-- 3. Prijavljen (neanoniman) racun nikad nije kandidat.
select assert_eq(
  (select count(*)::text from find_purgeable_anonymous_users(0, 100)
    where user_id = '00000000-0000-4000-8000-000000000005'),
  '0', 'neanoniman racun nikad nije kandidat');

-- 4. Prag djeluje: svjez prazan racun ulazi tek uz prag 0.
select assert_eq((select count(*)::text from find_purgeable_anonymous_users(0, 100)), '2',
                 'uz prag 0 ulazi i svjez prazan racun');

-- 5. KLJUCNI TEST (P1-11): tablica dodana POSLIJE migracije mora odmah stititi racun.
--    Rucno nabrojan popis tablica pao bi tocno ovdje, i to tiho.
create table nova_tablica_poslije_migracije (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade
);
insert into nova_tablica_poslije_migracije (user_id)
values ('00000000-0000-4000-8000-000000000001');

select assert_eq((select count(*)::text from find_purgeable_anonymous_users(30, 100)), '0',
                 'nova tablica automatski stiti racun, bez izmjene migracije');

-- 6. Limit i degenerativni ulazi.
delete from nova_tablica_poslije_migracije;
select assert_eq((select count(*)::text from find_purgeable_anonymous_users(0, 1)), '1', 'limit se postuje');
select assert_eq((select count(*)::text from find_purgeable_anonymous_users(0, 0)), '0', 'limit 0 ne vraca nista');
select assert_eq((select count(*)::text from find_purgeable_anonymous_users(0, -5)), '0', 'negativan limit ne vraca nista');
select assert_eq((select count(*)::text from find_purgeable_anonymous_users(-5, 100)), '2', 'negativan prag se svodi na 0');

rollback;

\echo 'anon-purge-smoke: SVE TVRDNJE PROSLE'
