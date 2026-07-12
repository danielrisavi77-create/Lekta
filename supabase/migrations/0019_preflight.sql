-- 0019_preflight.sql
-- Provjera prije predaje (preflight forenzika): job tablica + puni nalaz +
-- KPI. Obrazac 0018 (integrity): privola trajna, sadrzaj s rokom, purge kroz
-- pg_cron, RLS select-own samo za metapodatke joba.
--
-- KLJUCNA GRANICA (dual-use odluka vlasnika): puni forenzicki nalaz
-- (result_full: RSID, TotalTime, jednosesijski tragovi) NE SMIJE biti citljiv
-- studentu. RLS je row-level, ne column-level, pa nalaz zivi u ZASEBNOJ
-- tablici preflight_results_full BEZ IJEDNE policy za authenticated: jedini
-- put do nalaza je Edge funkcija preflight-result koja primjenjuje tier
-- filter (src/preflight/tier-filter.ts). Isto vrijedi za preflight_kpi.
--
-- Retencija: datoteka se NIKAD ne pohranjuje (Python servis: tmp + unlink);
-- result_full (sadrzi kratke isjecke rada) zivi 7 dana pa se BRISE
-- (purge_preflight_results); consent + KPI (bez sadrzaja) ostaju trajno.

create table if not exists preflight_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending','running','done','error')),
  -- Trajni zapis privole (tekst, timestamp, verzija uvjeta, izjava o pravu
  -- slanja). Nikad se ne brise (pravni dokaz, kao integrity_checks.consent).
  consent jsonb not null,
  ip_hash text,
  work_type text,
  lang text,
  file_sha256 text,
  file_size_bytes integer,
  pipeline_version text,
  error_code text,
  retention_expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists preflight_checks_user_idx
  on preflight_checks (user_id, created_at desc);
create index if not exists preflight_checks_ip_idx
  on preflight_checks (ip_hash, created_at desc);
create index if not exists preflight_checks_sha_idx
  on preflight_checks (user_id, file_sha256);
-- Atomski cap konkurentnosti: najvise JEDAN aktivan (pending/running) job po
-- korisniku, na razini baze (COUNT-pa-INSERT je TOCTOU; ovo nije).
create unique index if not exists preflight_checks_one_active_per_user
  on preflight_checks (user_id)
  where status in ('pending','running');

-- Puni forenzicki nalaz: SAMO service role (nijedna policy). Sadrzi isjecke
-- teksta rada u evidence poljima, pa nosi rok (retencija roditeljskog reda).
create table if not exists preflight_results_full (
  check_id uuid primary key references preflight_checks(id) on delete cascade,
  created_at timestamptz not null default now(),
  result_full jsonb not null
);

-- KPI bez sadrzaja rada (kodovi nalaza + brojevi): SAMO service role, trajno.
-- Puni severity brojevi (ukljucivo forenzicke) smiju ovdje jer student ovu
-- tablicu ne moze citati.
create table if not exists preflight_kpi (
  check_id uuid primary key references preflight_checks(id) on delete cascade,
  created_at timestamptz not null default now(),
  codes jsonb not null,
  severity_counts jsonb not null,
  duration_ms integer
);

alter table preflight_checks enable row level security;
alter table preflight_results_full enable row level security;
alter table preflight_kpi enable row level security;

-- Korisnik vidi SAMO svoje jobove (status za polling UI); nalaze NE cita
-- odavde nego kroz Edge filter. results_full i kpi: NULA policyja.
create policy preflight_checks_select_own
  on preflight_checks for select
  to authenticated
  using (user_id = auth.uid());

-- NEMA insert/update/delete za authenticated/anon: redove kreira preflight-start
-- (service role, uz zabiljezenu privolu), flipa i puni Python servis (service
-- role). Klijent nikad ne pise (inace bi lazirao privolu ili zaobisao gate).

-- ---------------------------------------------------------------------------
-- Retencija nalaza: DELETE result_full redaka kojima je rok istekao. Obrazac
-- identican 0018 (language sql, set search_path, revoke, pg_cron guard).
create or replace function purge_preflight_results()
returns integer
language sql
set search_path = public
as $$
  with del as (
    delete from preflight_results_full r
     using preflight_checks c
     where c.id = r.check_id
       and c.retention_expires_at < now()
    returning 1
  )
  select count(*)::int from del;
$$;

revoke execute on function purge_preflight_results() from public;

-- Zombiji: pending/running stariji od 1 h (upload nikad nije dosao ili je
-- servis pao) postaju error, cime se oslobadja partial-unique slot korisnika.
create or replace function expire_stale_preflight_jobs()
returns integer
language sql
set search_path = public
as $$
  with upd as (
    update preflight_checks
       set status = 'error',
           error_code = coalesce(error_code, 'upload_expired')
     where status in ('pending','running')
       and created_at < now() - interval '1 hour'
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke execute on function expire_stale_preflight_jobs() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('purge-preflight-results');
    exception when others then
      null; -- job jos ne postoji
    end;
    perform cron.schedule('purge-preflight-results', '30 4 * * *',
                          'select purge_preflight_results();');
    begin
      perform cron.unschedule('expire-stale-preflight-jobs');
    exception when others then
      null;
    end;
    perform cron.schedule('expire-stale-preflight-jobs', '15 * * * *',
                          'select expire_stale_preflight_jobs();');
  end if;
end $$;

comment on table preflight_checks is
  'Provjera prije predaje: job + privola (trajno) + status za polling. Nalazi su u preflight_results_full (service-role-only, 7d retencija, purge_preflight_results).';
comment on table preflight_results_full is
  'Puni forenzicki nalaz (service-role-only). Studentu ga filtrira Edge preflight-result kroz src/preflight/tier-filter.ts. Sadrzi isjecke rada pa se brise nakon retencije.';
comment on table preflight_kpi is
  'Trajna statistika bez sadrzaja rada (kodovi, severity brojevi, trajanje).';
