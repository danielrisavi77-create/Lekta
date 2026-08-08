-- Šihta — initial schema
-- Apply: supabase db push / MCP apply_migration / SQL editor

create extension if not exists pgcrypto;

-- ============ JOBS ============
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,            -- SCZG slug = external id + naš URL
  source text not null default 'sczg',  -- 'sczg' | 'direct' (buduće direktne objave)
  url text not null,                    -- deep link na izvorni oglas (prijava!)
  title text not null,
  company text,
  raw_text text,                        -- puni originalni tekst oglasa
  content_hash text,                    -- md5(raw_text) za change detection

  -- enriched (Haiku) polja
  category text not null default 'ostalo',
  times text[] not null default '{fleksibilno}',
  rate_eur numeric,                     -- parsirana satnica; null ako nepoznata
  rate_label text,                      -- "7,50 €/h", "po dogovoru"
  hours_label text,                     -- "Pon–Pet 7–15h"
  address text,
  neighborhood text not null default 'nepoznato', -- slug kvarta ili cijeli-grad/vise-lokacija/nepoznato
  lat double precision,
  lng double precision,
  duties text[] not null default '{}',
  reqs text[] not null default '{}',
  red_flags text[] not null default '{}',
  enriched_at timestamptz,

  -- lifecycle
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  removed_at timestamptz,               -- postavlja se kad oglas nestane sa SCZG (grace 48h)

  -- metrika (SAMO stvarni brojevi — nikad fake)
  view_count integer not null default 0
);

create index jobs_active_idx on public.jobs (first_seen_at desc) where removed_at is null;
create index jobs_category_idx on public.jobs (category) where removed_at is null;
create index jobs_neighborhood_idx on public.jobs (neighborhood) where removed_at is null;
create index jobs_rate_idx on public.jobs (rate_eur) where removed_at is null;
create index jobs_times_idx on public.jobs using gin (times);

-- ============ SCRAPE RUNS ============
create table public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running | ok | parse_failed | error
  jobs_seen int not null default 0,
  jobs_new int not null default 0,
  jobs_removed int not null default 0,
  jobs_enriched int not null default 0,
  error text
);

-- ============ ALERTS (saved search, bez accounta) ============
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token uuid not null default gen_random_uuid(), -- confirm/unsubscribe link
  filters jsonb not null default '{}',           -- {category?, neighborhood?, minRate?, time?, q?}
  confirmed_at timestamptz,                      -- GDPR double opt-in
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create unique index alerts_email_filters_idx on public.alerts (email, filters);
create index alerts_active_idx on public.alerts (confirmed_at) where unsubscribed_at is null;

-- ============ RLS ============
alter table public.jobs enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.alerts enable row level security;

-- javno čitanje samo aktivnih oglasa; pisanje isključivo service role
create policy jobs_public_read on public.jobs
  for select using (removed_at is null);

-- scrape_runs i alerts: nema javnog pristupa (service role zaobilazi RLS)

-- ============ RPC ============
-- pravi view count, poziva se s klijenta preko API rute
create or replace function public.increment_job_view(p_job_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.jobs set view_count = view_count + 1 where id = p_job_id;
$$;
revoke all on function public.increment_job_view(uuid) from public;
grant execute on function public.increment_job_view(uuid) to anon, authenticated, service_role;
;
