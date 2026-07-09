-- Lekta: slotovi za pune izvjestaje (entitlementi) + dedup Stripe eventova
-- Pokreni u Supabase SQL editoru ili kroz supabase db push

create table if not exists public.report_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('seminarski', 'zavrsni', 'diplomski', 'doktorski')),
  status text not null default 'active' check (status in ('active', 'revoked')),

  -- vezanje slota na konkretan rad (null = kupljen, jos nevezan slot)
  work_id text,
  work_bound_at timestamptz,

  -- Stripe trag
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  amount_total integer,
  currency text,

  expires_at timestamptz, -- null = bez isteka
  created_at timestamptz not null default now()
);

create index if not exists report_slots_user_idx
  on public.report_slots (user_id, status);

create index if not exists report_slots_pi_idx
  on public.report_slots (stripe_payment_intent);

-- jedan aktivan slot po radu (revoked slotovi ne blokiraju ponovnu kupnju)
create unique index if not exists report_slots_active_work_unique
  on public.report_slots (work_id)
  where work_id is not null and status = 'active';

alter table public.report_slots enable row level security;

-- korisnik smije samo citati vlastite slotove; pisanje ide iskljucivo
-- kroz service role u Netlify funkcijama (zaobilazi RLS)
create policy "users read own slots"
  on public.report_slots
  for select
  to authenticated
  using (auth.uid() = user_id);

-- dedup tablica: svaki Stripe event obradimo tocno jednom
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- namjerno bez policyja: dostupno samo service roleu
