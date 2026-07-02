-- Lekta monetizacija: referral program (MONETIZATION_PLAN.md sekcije 8, 13, korak 15.5).
-- Referrer dobiva 1 besplatni seminarski slot NAKON prve placene kupnje referala (interni
-- entitlement provider='internal', order_id='reward:referral:{id}'). Anti-gaming: self-referral,
-- kod samo za korisnika bez prethodnog entitlementa, cap 5/semestru, refund povlaci nepotrosenu
-- nagradu. Atribucija se radi u webhooku; ovdje su tablica i RLS.

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid references auth.users(id),
  code text not null,
  status text not null default 'pending' check (status in ('pending','converted','credited','rejected')),
  converted_order_id text,
  created_at timestamptz not null default now(),
  credited_at timestamptz
);
create index if not exists referrals_referrer on referrals (referrer_user_id, created_at);
create index if not exists referrals_converted_order on referrals (converted_order_id);

-- RLS (sekcija 13): referrer cita SVOJE referale; pisanje iskljucivo server (service role).
alter table referrals enable row level security;
drop policy if exists referrals_select_own on referrals;
create policy referrals_select_own on referrals
  for select using (referrer_user_id = auth.uid());
