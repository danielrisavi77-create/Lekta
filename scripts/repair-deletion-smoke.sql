-- Smoke za stanje brisanja popravka (audit P1-10), po uzoru na academic-suite-*-smoke.sql.
--
-- Dokazuje da `find_stuck_repair_deletions` vidi TOCNO ono sto treba dovrsiti: brisanje koje je
-- zapoceto pa prekinuto. Zdrav posao i brisanje koje je jos u letu ne smiju biti dirnuti, jer bi
-- cron inace uklonio datoteke ispod Edge funkcije koja ih upravo obradjuje.
\set ON_ERROR_STOP on
\timing off

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

-- Minimalna kopija 0026 sheme (bez FK-a na auth.users).
create table if not exists repair_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  original_path text not null,
  result_path text not null,
  created_at timestamptz not null default now()
);

\i supabase/migrations/0098_repair_deletion_state.sql

create or replace function assert_eq(actual text, expected text, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : ocekivano %, dobiveno %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

insert into repair_jobs (user_id, original_path, result_path, deleting_at) values
  ('11111111-1111-4111-8111-111111111111', 'zaglavljen/o.docx', 'zaglavljen/f.docx', now() - interval '2 hours'),
  -- "U letu": zapoceto maloprije. NE `now()` doslovno, jer je unutar transakcije to ISTI trenutak
  -- kao usporedba, pa bi ga strogi `<` ionako promasio i test bi prolazio iz krivog razloga.
  ('11111111-1111-4111-8111-111111111111', 'uletu/o.docx',      'uletu/f.docx',      now() - interval '1 second'),
  ('11111111-1111-4111-8111-111111111111', 'zdrav/o.docx',      'zdrav/f.docx',      null);

-- 1. KLJUCNI SLUCAJ (P1-10): vidi se samo prekinuto brisanje.
select assert_eq((select count(*)::text from find_stuck_repair_deletions(15, 100)), '1',
                 'nadjen tocno jedan zaglavljen posao');
select assert_eq((select original_path from find_stuck_repair_deletions(15, 100)), 'zaglavljen/o.docx',
                 'nadjen je BAS zaglavljeni posao');

-- 2. Brisanje koje je jos u letu se NE DIRA. Bez ovoga bi cron uklonio datoteke ispod Edge
--    funkcije koja ih upravo obradjuje.
select assert_eq(
  (select count(*)::text from find_stuck_repair_deletions(15, 100) where original_path = 'uletu/o.docx'),
  '0', 'brisanje u letu nije dirnuto');

-- 3. Zdrav posao (bez namjere brisanja) nikad ne ulazi u sweep.
select assert_eq(
  (select count(*)::text from find_stuck_repair_deletions(0, 100) where original_path = 'zdrav/o.docx'),
  '0', 'zdrav posao nikad nije kandidat');

-- 4. Prag stvarno djeluje: uz prag 0 i posao "u letu" postaje kandidat.
select assert_eq((select count(*)::text from find_stuck_repair_deletions(0, 100)), '2',
                 'prag 0 hvata i posao u letu');

-- 5. Limit se postuje (cron radi u serijama).
select assert_eq((select count(*)::text from find_stuck_repair_deletions(0, 1)), '1', 'limit se postuje');

-- 6. Najstarije prvo: zaglavljeni posao ima prednost pred novijim.
select assert_eq((select original_path from find_stuck_repair_deletions(0, 1)), 'zaglavljen/o.docx',
                 'poredak je najstarije prvo');

-- 7. Degenerativni ulazi ne rusi i ne siri zahvat.
select assert_eq((select count(*)::text from find_stuck_repair_deletions(-5, 100)), '2', 'negativan prag se svodi na 0');
select assert_eq((select count(*)::text from find_stuck_repair_deletions(0, -1)), '0', 'negativan limit ne vraca nista');

rollback;

\echo 'repair-deletion-smoke: SVE TVRDNJE PROSLE'
