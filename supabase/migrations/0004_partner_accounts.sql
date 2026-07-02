-- Lekta monetizacija: partner racuni (MONETIZATION_PLAN.md sekcije 7, 13, korak 15.4).
-- Partner (lektor/tehnicki urednik) kupuje partner bundleove i trosi slotove kroz
-- POSTOJECU slot mehaniku (nula novog anti-abuse koda). Odobrenje je rucno (status
-- 'active'); do tada nema partner cijena (create-checkout vraca 403) ni podignutog capa.

create table if not exists partner_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  oib text not null,
  website text,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  daily_cap int not null default 100,           -- generate-report cap za aktivnog partnera (retail = 30)
  cobrand_name text,
  cobrand_logo_path text,
  referral_code text unique,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS (sekcija 13): partner cita samo svoj red; status i cap postavlja iskljucivo server
-- (rucno odobrenje preko service role). Bez insert/update policyja = default deny za klijenta.
alter table partner_accounts enable row level security;
drop policy if exists partner_accounts_select_own on partner_accounts;
create policy partner_accounts_select_own on partner_accounts
  for select using (user_id = auth.uid());
