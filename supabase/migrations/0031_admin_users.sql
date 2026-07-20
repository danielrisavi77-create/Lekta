-- 0031_admin_users.sql
-- Admin popis za read-only statistiku bete (Edge funkcija `admin-stats`).
--
-- NACELO (isto kao 0001_monetization / 0026_repair_jobs): tko je admin je iskljucivo SERVERSKA
-- odluka. Klijentska zastavica (localStorage `lekta.admin`) otvara SAMO UI; svaki podatak dolazi
-- iz Edge funkcije koja clanstvo provjerava OVDJE preko service rolea. Bez retka u ovoj tablici
-- funkcija vraca 403, pa podesavanje localStoragea ne daje nikakav pristup podacima.
--
-- RLS: enable BEZ ijedne policy => default deny za anon i authenticated (ni citanje ni pisanje).
-- Samo service_role (koji zaobilazi RLS) vidi tablicu. Namjerno nema select-own policy: korisnik
-- ne treba znati ni je li sam admin, to mu funkcija ionako kaze.
--
-- PRIVATNOST: ova tablica NE daje pristup dokumentima. `admin-stats` vraca iskljucivo AGREGATE
-- (brojeve), nikad label/fingerprint/putanje/e-mail. Pregled tudjih radova bi bio zaseban,
-- svjestan zahvat koji trazi i izmjenu politike privatnosti; ovdje se namjerno ne uvodi.

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,                                      -- cemu sluzi racun (npr. "vlasnik"), bez PII
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

comment on table admin_users is
  'Popis admin racuna za admin-stats (read-only agregati). RLS bez policy = samo service_role.';

-- Ne dopusti da anon/authenticated ikad dobiju prava kroz ALTER DEFAULT PRIVILEGES (isti propust
-- koji je 0028 popravljao za find_orphan_repair_objects: `revoke from public` nije dovoljan).
revoke all on table admin_users from public, anon, authenticated;
grant select on table admin_users to service_role;

-- Agregati u JEDNOM upitu: baza racuna brojeve, Edge funkcija ne povlaci retke. Time nijedan
-- redak (pa ni label/fingerprint) nikad ne napusti bazu, a odgovor je konstantne velicine
-- bez obzira na broj poslova. Cijeli SQL je ovdje, pa je vidljivo sto se tocno izlaze.
create or replace function admin_beta_stats()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'repair', (
      select jsonb_build_object(
        'total',            count(*),
        'last24h',          count(*) filter (where created_at > now() - interval '24 hours'),
        'last7d',           count(*) filter (where created_at > now() - interval '7 days'),
        'distinctUsers',    count(distinct user_id),
        'failed',           count(*) filter (where status = 'failed'),
        'resultBytes',      coalesce(sum(result_bytes), 0),
        'originalBytes',    coalesce(sum(original_bytes), 0),
        'avgChanges',       round(coalesce(avg(changes_count), 0)::numeric, 1)
      ) from public.repair_jobs
    ),
    'generations24h', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n
        from public.report_generations
        where created_at > now() - interval '24 hours'
        group by status
      ) g
    ),
    'byWorkType', (
      select coalesce(jsonb_object_agg(work_type, n), '{}'::jsonb) from (
        select work_type, count(*) as n from public.repair_jobs group by work_type
      ) w
    ),
    'users', jsonb_build_object(
      'total',     (select count(*) from auth.users),
      'last7d',    (select count(*) from auth.users where created_at > now() - interval '7 days')
    ),
    'storage', (
      select jsonb_build_object(
        'objects', count(*),
        'bytes',   coalesce(sum((metadata->>'size')::bigint), 0)
      ) from storage.objects where bucket_id = 'repair'
    )
  );
$$;

comment on function admin_beta_stats() is
  'Read-only agregati bete za admin-stats Edge funkciju. Vraca SAMO brojeve, nikad sadrzaj ni PII.';

revoke all on function admin_beta_stats() from public, anon, authenticated;
grant execute on function admin_beta_stats() to service_role;
