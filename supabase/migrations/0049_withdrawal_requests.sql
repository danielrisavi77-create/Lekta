-- Consumer withdrawal requests (Zakon o zastiti potrosaca, NN 59/2026, cl. 81.a,
-- na snazi od 19.6.2026). Trgovac koji sklapa ugovore na daljinu mora omoguciti
-- jednostrani raskid kroz vidljivu funkciju u aplikaciji ("Jednostrani raskid
-- ugovora"), s automatskom potvrdom na trajnom mediju (e-mail) koja bilježi
-- datum/vrijeme primitka zahtjeva. Obicni e-mail kontakt sam po sebi ne
-- zadovoljava zahtjev za vidljivu, uvijek-dostupnu funkciju.
--
-- Shared table (app razlikuje katedra/lekta) tako da oba proizvoda mogu
-- koristiti isti mehanizam bez zasebne kopije sheme svaki. reference_id je
-- namjerno opaque text, ne FK — moze upucivati na entitlements.id (Lekta) ili
-- Katedra academic_project_id, ovisno o app-u, bez potrebe za cross-table FK-om.

create table if not exists public.withdrawal_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  app             text not null check (app in ('katedra', 'lekta')),
  reference_id    text,
  reason          text,
  contact_email   text not null,
  requested_at    timestamptz not null default now(),
  confirmed_at    timestamptz,
  status          text not null default 'received' check (status in (
    'received', 'confirmed', 'processed', 'rejected'
  )),
  created_at      timestamptz not null default now()
);

create index if not exists withdrawal_requests_user_idx
  on public.withdrawal_requests (user_id, requested_at desc);

alter table public.withdrawal_requests enable row level security;

drop policy if exists withdrawal_requests_select_own on public.withdrawal_requests;
create policy withdrawal_requests_select_own on public.withdrawal_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists withdrawal_requests_insert_own on public.withdrawal_requests;
create policy withdrawal_requests_insert_own on public.withdrawal_requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Nema klijentski UPDATE/DELETE policy — status prijelazi (confirmed/processed/
-- rejected) su iskljucivo serverski (service role zaobilazi RLS), isti obrazac
-- kao lekta_checks (0035): korisnik smije procitati i kreirati svoj zahtjev,
-- ali ne i sam sebi promijeniti status obrade.
