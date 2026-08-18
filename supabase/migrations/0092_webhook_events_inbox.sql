-- 0092_webhook_events_inbox.sql
--
-- TRAJNI ZAPIS WEBHOOK DOGADJAJA prije obrade (audit PAY-06, PAY-07, PAY-08, PAY-14).
--
-- Do sada je webhook-mor bio jedan sinkroni handler bez ikakvog traga: ako bi obrada pala
-- izmedju potpisa i entitlementa, ili bi proizvod bio nemapiran, dogadjaj bi nestao. Za
-- nemapiran proizvod se uz to vracao 200, pa ga provider vise nikad ne bi poslao: korisnik
-- je platio, entitlement ne postoji, a jedini trag je redak u logu koji istekne.
--
-- Lemon Squeezy retry prozor je ogranicen, pa se na njega nije smjelo oslanjati kao na
-- mehanizam oporavka. Ova tablica je inbox: dogadjaj se zapise ODMAH po provjeri potpisa,
-- a ishod obrade se upisuje naknadno. Time replay, forenzika i oporavak nakon djelomicnog
-- pada prestaju ovisiti o providerovoj dobroj volji.
--
-- NIJE zamjena za idempotentnost: unique (provider, order_id) na entitlements i dalje je ono
-- sto sprjecava dvostruko pravo pristupa. Inbox je zapis, ne brava.

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'lemonsqueezy',
  -- Identitet dogadjaja kod providera. Nije unique jer isti order moze imati vise dogadjaja
  -- (created, refunded), a provider legitimno ponavlja isporuku istog dogadjaja.
  event_name text,
  order_id text,
  store_id text,
  test_mode boolean,
  -- Sirovi payload, doslovno kako je stigao. Sluzi za replay i za usporedbu s onim sto smo
  -- procitali; bez njega se ne moze dokazati sto je provider zapravo poslao.
  raw_payload jsonb not null,
  signature_valid boolean not null,
  -- Ishod obrade: null dok traje, pa 'processed' / 'refused' / 'unknown_product' / 'failed'.
  outcome text,
  outcome_detail text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists webhook_events_received on public.webhook_events (received_at desc);
create index if not exists webhook_events_order on public.webhook_events (provider, order_id);
-- Djelomican indeks: dohvat neobradjenih i neuspjelih je jedini cesti upit nad ovom tablicom.
create index if not exists webhook_events_unresolved on public.webhook_events (received_at)
  where outcome is null or outcome in ('failed', 'unknown_product');

-- Servisna tablica: pise je iskljucivo Edge funkcija preko service role kljuca, koji RLS
-- zaobilazi. Nijedna korisnicka uloga nema posla s njom, pa je ukljucen RLS BEZ ijedne
-- politike, sto znaci deny-all za anon i authenticated. Grantovi se povlace izricito da
-- tablica ne bi ovisila samo o odsutnosti politika (audit DB-10).
alter table public.webhook_events enable row level security;
revoke all on table public.webhook_events from anon, authenticated;

comment on table public.webhook_events is
  'Inbox webhook dogadjaja: zapis PRIJE obrade, radi replaya i forenzike. Deny-all za anon/authenticated; pise samo service role.';
