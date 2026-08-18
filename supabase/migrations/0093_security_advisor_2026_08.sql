-- 0093_security_advisor_2026_08.sql
--
-- Nalazi Supabase security advisora, pregled 17.8.2026. (audit A26-10 / DB-10, DB-11, DB-12).
--
-- Tri klase problema, sve s istim korijenom: pravo pristupa se oslanjalo na ODSUTNOST necega
-- (nema politike, nema granta) umjesto na izricitu zabranu. Odsutnost je krhka: dovoljan je
-- jedan `grant all on all tables` ili nova politika pa da se tiho otvori.

-- ---------------------------------------------------------------------------------------
-- 1. SECURITY DEFINER funkcija izvrsiva od anon (DB-12)
-- ---------------------------------------------------------------------------------------
-- `increment_job_view(uuid)` je SECURITY DEFINER i bila je izvrsiva REST rutom
-- /rest/v1/rpc/increment_job_view od strane `anon` i `authenticated`, za PROIZVOLJAN job id.
-- Brojac pregleda nije osjetljiv podatak, ali jest zapis koji neprijavljeni korisnik nije smio
-- moci mijenjati za tudji posao, i to u petlji.
--
-- Funkcija se ne brise (poziva je serverski kod preko service role kljuca, koji grantove
-- zaobilazi), nego joj se oduzima pravo izvrsavanja javnim ulogama.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_job_view'
  ) then
    revoke all on function public.increment_job_view(uuid) from anon, authenticated, public;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------
-- 2. Servisne tablice s RLS-om ali BEZ ijedne politike (DB-10)
-- ---------------------------------------------------------------------------------------
-- Advisor ih prijavljuje jer je stanje dvosmisleno: RLS ukljucen bez politike znaci deny-all
-- za anon/authenticated, ali samo dok netko ne doda prvu politiku. Tada bi tablica tiho postala
-- citljiva, a nigdje ne bi pisalo da to nije bila namjera.
--
-- Ove tablice pise ISKLJUCIVO serverski kod preko service role kljuca (koji RLS zaobilazi),
-- pa im se izricito oduzimaju sva prava za javne uloge. Time zabrana prestaje ovisiti o
-- odsutnosti politike i postaje zapisana odluka.
do $$
declare
  t text;
  service_tables text[] := array[
    'admin_users', 'alerts', 'analytics_events', 'completion_ai_usage',
    'completion_lekta_handoff_tokens', 'corpus_meta', 'corpus_works', 'faculty_requests',
    'ip_rate_limits', 'preflight_kpi', 'preflight_results_full', 'pricing_changelog',
    'scrape_runs'
  ];
begin
  foreach t in array service_tables loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

comment on table public.ip_rate_limits is
  'Servisna tablica: pise samo service role. Deny-all za anon/authenticated je IZRICIT (grantovi povuceni), ne posljedica izostanka politike.';

-- ---------------------------------------------------------------------------------------
-- 3. pg_net u public shemi (DB-11)
-- ---------------------------------------------------------------------------------------
-- pg_net izlaze funkcije za odlazne HTTP pozive. U `public` shemi povecava povrsinu javno
-- izlozene sheme (PostgREST izlaze public), pa se premjesta u zasebnu shemu.
--
-- NAMJERNO NIJE AUTOMATIZIRANO OVDJE. `alter extension pg_net set schema` prekida sve postojece
-- pozive koji ga zovu nekvalificirano, ukljucujuci pg_cron poslove (podsjetnici, cleanup), a oni
-- se ne vide iz ove migracije. Premjestanje zato mora ici uz istovremenu provjeru cron poslova,
-- sto je operativni zahvat, ne slijepa migracija.
--
-- Do tada se barem oduzima pravo izvrsavanja javnim ulogama, sto zatvara glavni rizik (da anon
-- ili authenticated pozove odlazni HTTP iz baze).
do $$
declare
  f record;
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    for f in
      select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_depend d on d.objid = p.oid and d.deptype = 'e'
      join pg_extension e on e.oid = d.refobjid
      where e.extname = 'pg_net' and n.nspname = 'public'
    loop
      execute format('revoke all on function %s from anon, authenticated, public', f.sig);
    end loop;
  end if;
end $$;
