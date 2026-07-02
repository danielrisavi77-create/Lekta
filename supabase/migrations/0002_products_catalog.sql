-- Lekta monetizacija: katalog proizvoda kao JEDINA istina o cijenama.
-- Spec: docs/MONETIZATION_PLAN.md sekcije 2 (katalog), 4 (shema), 13 (RLS), 15 korak 1.
-- Nula hardkodiranih cijena u klijentu; cijena je uvijek serverska odluka. Klijent salje
-- samo productId. Promjena cijene = UPDATE products (+ redak u pricing_changelog), bez deploya.
-- Nadovezuje se na 0001_monetization.sql (entitlements, document_slots, report_generations).

-- katalog: jedina istina o cijenama i packagingu
create table if not exists products (
  id text primary key,
  kind text not null check (kind in ('slot','pass','bundle','premium_human')),
  audience text not null default 'retail' check (audience in ('retail','partner')),
  work_type text check (work_type in ('seminarski','zavrsni','diplomski','doktorski')),
  slots_total int not null default 1 check (slots_total >= 1),
  slot_window_days int not null default 7,
  purchase_window_days int not null default 90,
  price_eur numeric(6,2) not null check (price_eur >= 0),
  mor_product_id text,                 -- id proizvoda kod MoR providera (Lemon Squeezy), popuni pri setupu
  manual_fulfillment boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists products_mor_uidx on products (mor_product_id) where mor_product_id is not null;

-- delte na postojecim tablicama (0001): povezivanje s katalogom + snapshot tiera na slotu
alter table entitlements add column if not exists product_id text references products(id);
alter table document_slots
  add column if not exists profile_ref text,
  add column if not exists coverage_tier smallint check (coverage_tier between 0 and 3);

-- log svake promjene cijene, kupona ili packaginga (bez ovoga nema atribucije testova, sekcija 11)
create table if not exists pricing_changelog (
  id uuid primary key default gen_random_uuid(),
  product_id text references products(id),
  change_type text not null check (change_type in ('price','coupon_start','coupon_end','packaging')),
  old_value text,
  new_value text,
  note text,
  effective_at timestamptz not null default now()
);

-- Seed kataloga. Cijene iz MONETIZATION_PLAN.md sekcije 2 (retail + partner).
-- Idempotentno (on conflict do nothing) da migracija ostane sigurna pri ponovnom pokretanju.
insert into products (id, kind, audience, work_type, slots_total, slot_window_days, purchase_window_days, price_eur, sort) values
('slot_seminarski','slot','retail','seminarski',1,7,90,3.99,10),
('slot_zavrsni','slot','retail','zavrsni',1,7,90,5.99,20),
('slot_diplomski','slot','retail','diplomski',1,14,90,9.99,30),
('slot_doktorski','slot','retail','doktorski',1,14,120,24.99,40),
('pass_semestralni','pass','retail','seminarski',6,7,180,14.99,50),
('bundle_zavrsni_5','bundle','retail','zavrsni',5,7,120,24.99,60),
('bundle_zavrsni_10','bundle','retail','zavrsni',10,7,120,44.99,61),
('bundle_diplomski_5','bundle','retail','diplomski',5,14,120,41.99,62),
('bundle_diplomski_10','bundle','retail','diplomski',10,14,120,74.99,63),
('partner_zavrsni_10','bundle','partner','zavrsni',10,14,180,38.90,70),
('partner_zavrsni_25','bundle','partner','zavrsni',25,14,180,82.25,71),
('partner_zavrsni_50','bundle','partner','zavrsni',50,14,180,150.00,72),
('partner_diplomski_10','bundle','partner','diplomski',10,14,180,64.90,73),
('partner_diplomski_25','bundle','partner','diplomski',25,14,180,137.25,74),
('partner_diplomski_50','bundle','partner','diplomski',50,14,180,249.50,75)
on conflict (id) do nothing;

insert into products (id, kind, audience, work_type, slots_total, slot_window_days, purchase_window_days, price_eur, manual_fulfillment, sort) values
('premium_human','premium_human','retail',null,1,14,90,49.00,true,90)
on conflict (id) do nothing;

-- RLS (sekcija 13).
-- products: SELECT za sve (anon ukljucivo, treba za paywall i SEO) uz active=true;
-- INSERT/UPDATE/DELETE samo service role (bez policyja = default deny).
alter table products enable row level security;
drop policy if exists products_select_active on products;
create policy products_select_active on products
  for select using (active = true);

-- pricing_changelog: samo service role, bez klijentskog citanja (default deny).
alter table pricing_changelog enable row level security;
