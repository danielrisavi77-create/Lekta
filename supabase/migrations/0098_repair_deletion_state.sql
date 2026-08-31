-- 0098: brisanje popravka dobiva STANJE, pa prekid ne ostavlja mrtav redak (audit P1-10).
--
-- ZATECENO STANJE. `delete-repair-job` uklanja Storage blobove PA tek onda redak, i redak brise
-- samo ako je uklanjanje uspjelo. Taj poredak je namjeran i dobar: dok redak postoji, postoje i
-- putanje, pa je ponovni pokusaj moguc. Obrnut poredak bi posao maknuo iz "Mojih popravaka" a
-- dokument ostavio pohranjen, bez ikakvog traga po kojem bi ga se poslije naslo.
--
-- Ono sto taj poredak NE pokriva je prekid IZMEDJU dva koraka: blobovi su otisli, redak je ostao.
-- Korisnik tada u "Mojim popravcima" vidi posao koji se vise ne da preuzeti, i to trajno, jer nista
-- taj raskorak ne primjecuje. Postojeci `cleanup-orphan-repairs` cisti suprotan smjer (blob bez
-- retka), pa ovaj slucaj nema vlasnika.
--
-- ZAHVAT. Namjera brisanja se zapisuje PRIJE nego se isnta dira, pa je svako medjustanje vidljivo
-- i dovrsivo:
--
--     deleting_at = now()  ->  ukloni blobove  ->  obrisi redak
--
-- Prekid nakon prvog koraka ostavlja redak koji je OZNACEN kao "u brisanju": sucelje ga vise ne
-- nudi za preuzimanje, a `cleanup-orphan-repairs` ga dovrsi. Uklanjanje bloba je idempotentno
-- (Storage remove nad nepostojecim objektom nije greska), pa ponavljanje ne skodi.
--
-- Idempotentno: `add column if not exists`, `create index if not exists`, `create or replace`.

alter table repair_jobs
  add column if not exists deleting_at timestamptz;

comment on column repair_jobs.deleting_at is
  'Zabiljezena NAMJERA brisanja (audit P1-10). Nije null = blobovi se uklanjaju ili su uklonjeni, a redak jos nije obrisan. Sucelje takav posao ne nudi za preuzimanje.';

-- Parcijalni indeks: zanimaju nas iskljucivo zaglavljeni redci, kojih je u zdravom radu nula.
create index if not exists repair_jobs_deleting
  on repair_jobs (deleting_at) where deleting_at is not null;

-- Zaglavljena brisanja za cron. Prag postoji da se ne dira brisanje koje upravo traje (Edge
-- funkcija je jos u letu), isti razlog zbog kojeg find_orphan_repair_objects ima grace period.
drop function if exists find_stuck_repair_deletions(integer, integer);

create or replace function find_stuck_repair_deletions(
  p_grace_minutes integer,
  p_limit integer
) returns table (job_id uuid, original_path text, result_path text)
language sql
security definer
set search_path = public
as $$
  select id, original_path, result_path
    from repair_jobs
   where deleting_at is not null
     and deleting_at < now() - make_interval(mins => greatest(p_grace_minutes, 0))
   order by deleting_at
   limit greatest(p_limit, 0);
$$;

-- Isti obrazac kao ostale cron/RPC funkcije: dostupno samo service_roleu iz Edgea.
revoke all on function find_stuck_repair_deletions(integer, integer) from public, anon, authenticated;

comment on function find_stuck_repair_deletions(integer, integer) is
  'Redci ciji je deleting_at stariji od praga: brisanje je zapoceto pa prekinuto (audit P1-10).';
