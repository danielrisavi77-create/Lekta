-- 0101: sabirnica klijentskih gresaka (audit P1-28).
--
-- ZATECENO STANJE. `errorEndpoint` je u `DEFAULT_PRODUCTION_CONFIG` bio PRAZAN niz, pa je
-- `installErrorTracking` u app.ts skupljao greske i nikamo ih nije slao. Greska koja se dogodi
-- SAMO korisniku (odredjeni preglednik, odredjen dokument, spora mreza) ostajala je u njegovoj
-- konzoli i tim za nju nikad nije saznao.
--
-- STO SE OVDJE NE SPREMA, i zasto je to vaznije od onoga sto se sprema:
--   - NEMA ip adrese ni njezinog hasha. IP se koristi SAMO prolazno za rate limit
--     (claim_ip_rate_slot, 0022), isti obrazac kao analytics-event.
--   - NEMA user_id. Korelacija ide preko `incident_id` koji korisnik sam procita podrsci.
--   - NEMA sadrzaja rada. Poruka i stack prolaze kroz `src/report/error-redaction.ts` i na
--     klijentu i ovdje na posluzitelju (obrana u dubinu: izravan POST prolazi istu redakciju).
--
-- Redak je time tehnicki zapis bez osobnog identifikatora, pa ne trazi privolu na razini
-- kolacica ni vezu s ispitanikom.

create table if not exists client_errors (
  id uuid primary key default gen_random_uuid(),
  -- Sto korisnik procita podrsci ("greska LEK-7K2M4XQP"). Jedina spona s prijavom, i namjerno je
  -- jednosmjerna: iz njega se ne da doci do korisnika.
  incident_id text not null,
  kind text not null,
  message text not null,
  stack text,
  version text,
  path text,
  feature text,
  -- Obitelj preglednika, ne puni user agent: puni UA je otisak uredjaja.
  browser text,
  created_at timestamptz not null default now()
);

create index if not exists client_errors_recent on client_errors (created_at desc);
create index if not exists client_errors_incident on client_errors (incident_id);
-- Grupiranje po ucestalosti: jedna greska u 400 pojava je vaznija od 400 razlicitih.
create index if not exists client_errors_grouping on client_errors (version, kind, feature, created_at desc);

comment on table client_errors is
  'Redaktirane klijentske greske (audit P1-28). BEZ ip-a, BEZ user_id-a, BEZ sadrzaja rada; korelacija ide preko incident_id.';

-- RLS: nitko ne cita kroz Data API. Ovo je interna dijagnostika; upis ide service roleom iz Edgea,
-- citanje kroz admin alat. Bez politike SELECT je zabranjen svima, sto je i namjera.
alter table client_errors enable row level security;
drop policy if exists client_errors_no_public_read on client_errors;

-- Retencija: dijagnostika stara vise od 90 dana ne pomaze nikome, a gomilanje je samo rizik.
drop function if exists purge_client_errors(integer);

create or replace function purge_client_errors(p_days integer) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obrisano integer;
begin
  delete from client_errors
   where created_at < now() - make_interval(days => greatest(coalesce(p_days, 90), 1));
  get diagnostics v_obrisano = row_count;
  return v_obrisano;
end;
$$;

revoke all on function purge_client_errors(integer) from public, anon, authenticated;

comment on function purge_client_errors(integer) is
  'Brise klijentske greske starije od praga (audit P1-28). Zadano 90 dana; minimum 1, da poziv s 0 ne obrise sve.';
