-- Smoke za claim_two_rate_slots (audit P1-05), po uzoru na academic-suite-*-smoke.sql.
--
-- Dokazuje ono sto je stari, dvopozivni tok radio KRIVO: da odbijanje na DRUGOM limitu ne smije
-- ostaviti potrosen PRVI. Zato svaka tvrdnja gleda stanje brojaca, ne samo povratnu vrijednost.
\set ON_ERROR_STOP on
\timing off

begin;

-- Minimalna kopija sheme iz 0022 (smoke se vrti nad praznim clusterom, ne nad produkcijom).
create table if not exists ip_rate_limits (
  scope text not null,
  ip_hash text not null,
  day date not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, ip_hash, day)
);

-- Supabase isporucuje ove role; prazan cluster ih nema, a migracija na njima radi revoke.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

\i supabase/migrations/0096_two_rate_slots.sql

create or replace function assert_eq(actual text, expected text, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : ocekivano %, dobiveno %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

create or replace function slot_count(p_scope text, p_hash text) returns integer
language sql as $$
  select coalesce((select count from ip_rate_limits
                   where scope = p_scope and ip_hash = p_hash
                     and day = (now() at time zone 'utc')::date), 0);
$$;

-- 1. Uredan slucaj: oba slota potrosena.
select assert_eq(claim_two_rate_slots('u','user-1',5,'i','ip-1',5), 'ok', 'oba slota rezervirana');
select assert_eq(slot_count('u','user-1')::text, '1', 'korisnicki brojac 1');
select assert_eq(slot_count('i','ip-1')::text, '1', 'IP brojac 1');

-- 2. KLJUCNI SLUCAJ (P1-05): IP je zasicen, korisnik nije.
--    Zahtjev mora biti odbijen, a korisnikov brojac NE SMIJE se pomaknuti.
insert into ip_rate_limits (scope, ip_hash, day, count)
values ('i','ip-pun',(now() at time zone 'utc')::date, 5)
on conflict do nothing;

select assert_eq(slot_count('u','user-2')::text, '0', 'korisnik prije: 0');
select assert_eq(claim_two_rate_slots('u','user-2',5,'i','ip-pun',5), 'denied_b', 'odbijen zbog IP-a');
select assert_eq(slot_count('u','user-2')::text, '0', 'korisnicki brojac NIJE potrosen (bio kvar P1-05)');
select assert_eq(slot_count('i','ip-pun')::text, '5', 'IP brojac ostaje na capu');

-- 2b. Kompenzacija radi i kad korisnik VEC ima potrosenih slotova (ne samo iz nule).
select claim_two_rate_slots('u','user-3',5,'i','ip-slobodan',5);
select claim_two_rate_slots('u','user-3',5,'i','ip-slobodan',5);
select assert_eq(slot_count('u','user-3')::text, '2', 'korisnik prije odbijanja: 2');
select assert_eq(claim_two_rate_slots('u','user-3',5,'i','ip-pun',5), 'denied_b', 'odbijen zbog IP-a');
select assert_eq(slot_count('u','user-3')::text, '2', 'korisnicki brojac vracen na 2, ne 3');

-- 3. Korisnik je zasicen: odbijeno na PRVOM, IP se ne smije ni taknuti.
insert into ip_rate_limits (scope, ip_hash, day, count)
values ('u','user-pun',(now() at time zone 'utc')::date, 5)
on conflict do nothing;
select assert_eq(claim_two_rate_slots('u','user-pun',5,'i','ip-netaknut',5), 'denied_a', 'odbijen zbog korisnika');
select assert_eq(slot_count('i','ip-netaknut')::text, '0', 'IP brojac netaknut kad korisnik padne');

-- 4. Degenerativan cap nikad ne dopusta i nista ne trosi.
select assert_eq(claim_two_rate_slots('u','user-4',0,'i','ip-4',5), 'denied_a', 'cap 0 na A odbija');
select assert_eq(slot_count('u','user-4')::text, '0', 'cap 0: nista potroseno na A');
select assert_eq(claim_two_rate_slots('u','user-5',5,'i','ip-5',0), 'denied_b', 'cap 0 na B odbija');
select assert_eq(slot_count('u','user-5')::text, '0', 'cap 0 na B: A nije potrosen');

-- 5. Prazan identitet: nema per-identitet kvote, ne blokira se i nista se ne trosi
--    (isti ugovor kao claim_ip_rate_slot iz 0022).
select assert_eq(claim_two_rate_slots('u','',5,'i','ip-6',5), 'ok', 'prazan A hash ne blokira');
select assert_eq(slot_count('i','ip-6')::text, '1', 'B se svejedno trosi');
select assert_eq(claim_two_rate_slots('u','user-7',5,'i',null,5), 'ok', 'null B hash ne blokira');
select assert_eq(slot_count('u','user-7')::text, '1', 'A se svejedno trosi');

-- 6. Tocno na capu jos prolazi, prvi preko pada.
select claim_two_rate_slots('u','user-8',2,'i','ip-8',9);
select assert_eq(claim_two_rate_slots('u','user-8',2,'i','ip-8',9), 'ok', 'drugi poziv jos stane u cap 2');
select assert_eq(claim_two_rate_slots('u','user-8',2,'i','ip-8',9), 'denied_a', 'treci poziv pada');
select assert_eq(slot_count('i','ip-8')::text, '2', 'IP potrosen tocno 2 puta, ne 3');

rollback;

\echo 'rate-slots-smoke: SVE TVRDNJE PROSLE'
