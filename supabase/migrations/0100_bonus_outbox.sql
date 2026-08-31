-- 0100: obveze nakon kupnje dobivaju TRAJAN zapis, pa se ne mogu izgubiti (audit P1-07).
--
-- ZATECENO STANJE, i zasto je bilo namjerno. `webhook-mor` nakon entitlementa radi tri bonusa:
-- nagradu preporucitelju, pass kupon i referral atribuciju. Svaki od njih lovi svoju gresku i
-- nastavlja, da tranzijentni pad NE srusi handler u 500. To je ispravno rezoniranje (AUD-28): da
-- padne u 500, Lemon Squeezy bi retryjao, pogodio `23505` na entitlementu i vratio
-- `duplicate_ignored`, pa bi bonus svejedno ostao nekreiran.
--
-- RUPA KOJU TO OSTAVLJA. Uhvacena greska se SAMO LOGIRA. Nigdje ne ostaje zapis da obveza postoji,
-- pa je nitko nikad ne ponovi. Iduci webhook za isti order izlazi na `duplicate_ignored` PRIJE
-- bonusa. Rezultat: korisnik je platio, entitlement ima, a obecani kupon ili referral nagrada ne
-- stignu NIKAD, i jedini trag je redak u logu koji istekne.
--
-- ZAHVAT. Obveza se zapisuje PRIJE nego se pokusa izvrsiti. Pokusaj i dalje ide odmah (korisnik
-- najcesce dobije bonus u istoj sekundi), ali ako padne, redak ostaje `pending` i radnik ga
-- ponovi. Klasican outbox.
--
-- KLJUCNA ODLUKA: obveze se upisuju I NA PUTU `duplicate_ignored`. Time upravo onaj retry koji je
-- dosad bio slijepa ulica postaje tocka oporavka: webhook koji ponovno stigne za vec obradjen
-- order jos jednom osigura da obveze postoje. Bez toga bi outbox pomogao samo ako prvi pokusaj
-- uopce stigne do upisa.
--
-- Idempotentno: `create table if not exists`, `create or replace`, uz unique (order_id, kind).

create table if not exists bonus_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Order iz kojeg obveza proizlazi. NIJE strani kljuc: entitlement se vodi po (provider, order_id),
  -- a outbox mora prezivjeti i slucaj u kojem se entitlement naknadno makne (refund), da se vidi
  -- sto je bilo obecano.
  order_id text not null,
  kind text not null check (kind in ('referrer_reward', 'pass_coupon', 'referral_attribution')),
  -- Sve sto treba za ponovni pokusaj, da radnik ne mora rekonstruirati dogadjaj iz webhooka.
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  -- Kad je obveza sljedeci put na redu. Odgoda raste s brojem pokusaja (backoff u radniku).
  next_attempt_at timestamptz not null default now(),
  done_at timestamptz
);

-- IDEMPOTENCIJA. Isti order ne moze dobiti dvije iste obveze, koliko god puta webhook stigao.
create unique index if not exists bonus_outbox_order_kind
  on bonus_outbox (order_id, kind);

-- Radnik cita samo ono sto je dospjelo; u zdravom radu je taj skup prazan.
create index if not exists bonus_outbox_due
  on bonus_outbox (next_attempt_at) where status = 'pending';

create index if not exists bonus_outbox_user
  on bonus_outbox (user_id, created_at desc);

comment on table bonus_outbox is
  'Obveze nakon kupnje (kupon, referral nagrada, atribucija) zapisane PRIJE izvrsenja, da tranzijentni pad ne izgubi obecano (audit P1-07).';
comment on column bonus_outbox.status is
  'pending = ceka ili se ponavlja; done = izvrseno; failed = odustalo nakon max pokusaja, trazi covjeka.';

-- RLS: korisnik smije VIDJETI sto mu je obecano, ali nista mijenjati. Pisanje ide service roleom
-- iz Edgea. Bez ovoga bi tablica bila nevidljiva korisniku, a upravo je njemu obecano.
alter table bonus_outbox enable row level security;
drop policy if exists bonus_outbox_select_own on bonus_outbox;
create policy bonus_outbox_select_own on bonus_outbox
  for select using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Dospjele obveze za radnika. Prag i limit su parametri, kao kod ostalih cron RPC-ova.
-- ---------------------------------------------------------------------------
drop function if exists claim_due_bonus_outbox(integer, integer);

create or replace function claim_due_bonus_outbox(
  p_max_attempts integer,
  p_limit integer
) returns table (id uuid, user_id uuid, order_id text, kind text, payload jsonb, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_limit is null or p_limit <= 0 then
    return;
  end if;

  -- `for update skip locked`: dva paralelna radnika ne smiju uzeti istu obvezu i izvrsiti je
  -- dvaput. Broj pokusaja se uvecava VEC PRI PREUZIMANJU, pa obveza koja rusi radnika (npr.
  -- pukne prije nego stigne javiti gresku) ne moze se vrtjeti u beskonacnoj petlji.
  return query
  with dospjelo as (
    select o.id
      from bonus_outbox o
     where o.status = 'pending'
       and o.next_attempt_at <= now()
       and o.attempts < greatest(coalesce(p_max_attempts, 5), 1)
     order by o.next_attempt_at
     limit p_limit
     for update skip locked
  )
  update bonus_outbox b
     set attempts = b.attempts + 1,
         -- Eksponencijalni odmak: 2, 4, 8, 16 ... minuta. Ako pokusaj uspije, redak ionako ide u
         -- 'done' i ovo vise nije vazno.
         next_attempt_at = now() + make_interval(mins => power(2, least(b.attempts + 1, 8))::int)
    from dospjelo d
   where b.id = d.id
  returning b.id, b.user_id, b.order_id, b.kind, b.payload, b.attempts;
end;
$$;

revoke all on function claim_due_bonus_outbox(integer, integer) from public, anon, authenticated;

comment on function claim_due_bonus_outbox(integer, integer) is
  'Atomski preuzme dospjele bonus obveze (for update skip locked) i uveca broj pokusaja (audit P1-07).';
