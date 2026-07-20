-- 0033_anonymous_repair_retention.sql
-- Anonimne prijave (besplatna beta): korisnik dobiva pravi user_id bez e-maila, pa RLS, mapa u
-- Storageu, "Moji popravci" i pravo na brisanje rade nepromijenjeno. Ali takav racun zivi SAMO u
-- pregledniku: tko ocisti podatke, vise ne moze doci do svojih datoteka ni obrisati ih.
--
-- Bez ovoga bismo trajno drzali dokumente koje NITKO ne moze ukloniti, sto se izravno kosi s
-- objavljenom politikom ("cuvamo dok ih korisnik sam ne obrise"). Zato anonimni poslovi imaju rok:
-- brisu se 30 dana nakon zadnjeg upisa. Prijavljeni e-mailom zadrzavaju "dok ih sam ne obrise",
-- jer se njima pristup moze vratiti prijavom s bilo kojeg uredjaja.

alter table repair_jobs
  add column if not exists anonymous boolean not null default false;

comment on column repair_jobs.anonymous is
  'Posao anonimnog racuna (bez e-maila). Takvi se brisu automatski nakon 30 dana (0033), jer korisnik ciscenjem preglednika trajno gubi mogucnost da ih sam obrise.';

-- Cesto se filtrira upravo po (anonymous, created_at) u sweepu.
create index if not exists repair_jobs_anonymous_created_idx
  on repair_jobs (created_at) where anonymous;

-- Kandidati za brisanje. Vraca i putanje jer Storage BLOB mora ici kroz Storage API (ne SQL),
-- pa Edge funkcija prvo mice objekte, tek onda retke. security definer + prazan search_path,
-- isti obrazac kao find_orphan_repair_objects (0027) i zakljucavanje prava kao 0028.
create or replace function find_expired_anonymous_repairs(
  p_days int default 30,
  p_limit int default 500
)
returns table (job_id uuid, original_path text, result_path text)
language sql
security definer
set search_path = ''
as $$
  select id, original_path, result_path
  from public.repair_jobs
  where anonymous
    and created_at < now() - make_interval(days => greatest(p_days, 1))
  order by created_at
  limit greatest(p_limit, 1);
$$;

comment on function find_expired_anonymous_repairs(int, int) is
  'Anonimni popravci stariji od p_days dana, za automatsko brisanje (cleanup-orphan-repairs, faza 2).';

revoke all on function find_expired_anonymous_repairs(int, int) from public, anon, authenticated;
grant execute on function find_expired_anonymous_repairs(int, int) to service_role;
