-- Lekta monetizacija: coupon_grants + manual_orders (MONETIZATION_PLAN.md sekcije 4, 6, 13).
-- Webhook (korak 3) na pass kupnju izdaje jednokratni -20% kupon (coupon_grants), a na
-- manual_fulfillment proizvod (premium_human) otvara manual_orders red. Pisanje iskljucivo
-- server (service role); korisnik cita samo svoje retke.

-- izdani kuponi (pass bonus, referral welcome)
create table if not exists coupon_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  reason text not null check (reason in ('pass_bonus','referral_welcome')),
  source_order_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists coupon_grants_user on coupon_grants (user_id, created_at);

-- rucni fulfillment (premium_human i odobreni garancijski popravci)
create table if not exists manual_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text references products(id),
  order_id text not null,
  provider text not null,
  status text not null default 'pending' check (status in ('pending','in_progress','done','refunded')),
  created_at timestamptz not null default now(),
  unique (provider, order_id)                    -- idempotencija webhooka
);

-- RLS (sekcija 13): korisnik cita samo svoje; pisanje samo server (bez insert/update policyja)
alter table coupon_grants enable row level security;
drop policy if exists coupon_grants_select_own on coupon_grants;
create policy coupon_grants_select_own on coupon_grants
  for select using (user_id = auth.uid());

alter table manual_orders enable row level security;
drop policy if exists manual_orders_select_own on manual_orders;
create policy manual_orders_select_own on manual_orders
  for select using (user_id = auth.uid());
