-- Renumerirano 0008 -> 0021 (AUD-17): prefiks 0008 je dijelio s 0008_analytics_views pa bi
-- ga db push tiho preskocio. Tablica nema apply-time ovisnost (create-checkout je puni runtime)
-- pa je pomaknuta na kraj umjesto kaskadnog pomaka 0010-0019.
-- Lekta: trajni zapis pristanka na trenutnu isporuku digitalnog sadrzaja i odricanja od
-- 14-dnevnog prava na odustanak (Zakon o zastiti potrosaca cl. 86; EU Direktiva 2011/83).
-- Pre-launch checklist P0 1-1: "pristanak (tekst plus timestamp) zabiljezen uz narudzbu".
-- Zapisuje ga create-checkout Edge Function (service role) PRIJE redirecta na Merchant of Record.
-- Pravo pristupa je serverska odluka: klijent NE pise u ovu tablicu (RLS dolje).

create table if not exists checkout_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  immediate_delivery boolean not null,          -- pristanak na trenutni pocetak isporuke
  withdrawal_waived boolean not null,           -- odricanje od prava na odustanak
  consent_text text not null,                   -- tocan tekst koji je korisnik vidio i oznacio
  terms_version text,                           -- verzija Uvjeta na snazi
  consented_at timestamptz not null,            -- trenutak pristanka (klijentski timestamp)
  created_at timestamptz not null default now() -- trenutak zapisa na serveru
);
create index if not exists checkout_consents_user_time
  on checkout_consents (user_id, created_at);

alter table checkout_consents enable row level security;

-- korisnik smije CITATI samo svoj pristanak; upis radi iskljucivo server (service role)
drop policy if exists checkout_consents_select_own on checkout_consents;
create policy checkout_consents_select_own on checkout_consents
  for select using (user_id = auth.uid());
