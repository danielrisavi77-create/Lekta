-- Smoke za outbox bonus obveza (audit P1-07).
--
-- Najvaznije tvrdnje nisu "radi", nego: obveza se NE MOZE duplicirati koliko god puta webhook
-- stigao, i NE MOZE se izgubiti kad pokusaj padne. Oboje se mjeri kroz stanje tablice, ne kroz
-- povratnu vrijednost.
\set ON_ERROR_STOP on
\timing off

begin;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111');

\i supabase/migrations/0100_bonus_outbox.sql

create or replace function assert_eq(actual text, expected text, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : ocekivano %, dobiveno %', what, expected, actual;
  end if;
  raise notice 'ok: %', what;
end;
$$;

-- Kako Edge upisuje obvezu: upsert s ON CONFLICT DO NOTHING po (order_id, kind).
create or replace function enqueue(p_order text, p_kind text) returns void
language sql as $$
  insert into bonus_outbox (user_id, order_id, kind, payload)
  values ('11111111-1111-4111-8111-111111111111', p_order, p_kind, '{}'::jsonb)
  on conflict (order_id, kind) do nothing;
$$;

-- 1. KLJUCNI SLUCAJ (P1-07): isti webhook stigne PET puta, obveza ostaje JEDNA.
--    Bas to je put `duplicate_ignored` na kojem se bonus dosad gubio.
select enqueue('ord-1', 'pass_coupon');
select enqueue('ord-1', 'pass_coupon');
select enqueue('ord-1', 'pass_coupon');
select enqueue('ord-1', 'pass_coupon');
select enqueue('ord-1', 'pass_coupon');
select assert_eq((select count(*)::text from bonus_outbox where order_id = 'ord-1'), '1',
                 'pet webhooka daje TOCNO jednu obvezu');

-- 2. Razlicite vrste obveza za isti order su odvojene.
select enqueue('ord-1', 'referrer_reward');
select enqueue('ord-1', 'referral_attribution');
select assert_eq((select count(*)::text from bonus_outbox where order_id = 'ord-1'), '3',
                 'tri razlicite obveze za isti order koegzistiraju');

-- 3. Radnik preuzima dospjelo i UVECAVA broj pokusaja vec pri preuzimanju.
select assert_eq((select count(*)::text from claim_due_bonus_outbox(5, 10)), '3', 'radnik preuzme sve tri');
select assert_eq((select min(attempts)::text from bonus_outbox where order_id = 'ord-1'), '1',
                 'broj pokusaja narastao pri preuzimanju');

-- 4. Preuzeto se NE vraca odmah (backoff je pomaknuo next_attempt_at u buducnost).
--    Bez toga bi radnik u petlji vrtio istu obvezu.
select assert_eq((select count(*)::text from claim_due_bonus_outbox(5, 10)), '0',
                 'odmah nakon preuzimanja nista nije dospjelo');

-- 5. Obveza koja je USPJELA vise nikad ne ulazi u sweep.
update bonus_outbox set status = 'done', done_at = now() where kind = 'pass_coupon';
update bonus_outbox set next_attempt_at = now() - interval '1 hour' where order_id = 'ord-1';
select assert_eq(
  (select count(*)::text from claim_due_bonus_outbox(5, 10) where kind = 'pass_coupon'),
  '0', 'dovrsena obveza nije vise kandidat');

-- 6. Gornja granica pokusaja stvarno zaustavlja. Obveza koja stalno pada ne vrti se zauvijek.
update bonus_outbox set attempts = 5, next_attempt_at = now() - interval '1 hour'
 where kind = 'referrer_reward';
select assert_eq((select count(*)::text from claim_due_bonus_outbox(5, 10) where kind = 'referrer_reward'),
                 '0', 'obveza na granici pokusaja se vise ne preuzima');

-- 7. Degenerativni ulazi ne rusi i ne sire zahvat.
select assert_eq((select count(*)::text from claim_due_bonus_outbox(5, 0)), '0', 'limit 0 ne vraca nista');
select assert_eq((select count(*)::text from claim_due_bonus_outbox(5, -3)), '0', 'negativan limit ne vraca nista');

-- 8. Nepoznata vrsta obveze ne moze uci (tipfeler u Edgeu ne smije proci tiho).
do $$
begin
  begin
    insert into bonus_outbox (user_id, order_id, kind)
    values ('11111111-1111-4111-8111-111111111111', 'ord-9', 'nepoznato');
  exception when check_violation then
    raise notice 'ok: nepoznata vrsta obveze je odbijena';
    return;
  end;
  raise exception 'FAIL: nepoznata vrsta obveze je PROSLA';
end $$;

rollback;

\echo 'bonus-outbox-smoke: SVE TVRDNJE PROSLE'
