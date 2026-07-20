-- 0032_corpus_search.sql
-- K3: dohvat kandidata iz corpus_works za provjeru postojanja domacih izvora
-- (plan: docs/PLAN_KORPUS_PROVJERA_IZVORA.md, odjeljak 8).
--
-- Zasto RPC, a ne obican PostgREST upit: dohvat mora koristiti trigramski operator `%`, a on ovisi
-- o GUC-u pg_trgm.similarity_threshold. Kroz PostgREST se taj GUC ne moze postaviti po zahtjevu, a
-- Postgresov default je 0.30 sto je IZMJERENO sest puta sporije (877 ms prema 143 ms). Ovako je
-- prag ugradjen u funkciju i ne moze se zaboraviti.
--
-- Prag 0.40 je prag DOHVATA (filtar recalla), NIJE prag odluke. Presudu donosi bigram-Dice u
-- TypeScriptu (src/citations/corpus-verify.ts, 0.60 vjerojatno / 0.80 pronadjeno). Namjerno je nizi
-- od 0.55 iz pipelinea jer pipeline taj broj primjenjuje na svoju mjeru (FTS5 + Dice), a ovdje je
-- rijec o pg_trgm slicnosti, drugoj skali: naslov kracen na tri rijeci ima trgm 0.422, pa bi ga
-- 0.55 odbacio prije nego ga Dice uopce vidi.
--
-- Jedan poziv obradjuje SVE reference rada (LATERAL po elementima niza), pa je to jedan odlazak na
-- bazu umjesto N njih.

create or replace function public.corpus_search_many(
  qs text[],
  min_sim real default 0.40,
  top_n int default 5
)
returns table (q_index int, title text, year int, institution text, repo text, url text, sim real)
language plpgsql
volatile
security definer
-- Pinan search_path je obavezan uz security definer (inace ga pozivatelj moze presloziti).
-- `extensions` je unutra jer ondje zive pg_trgm operator % i funkcija similarity().
set search_path = public, extensions, pg_temp
-- Tvrda gornja granica rada u bazi: i patoloski upit ne smije drzati Edge funkciju.
-- Edge uz ovo ima i vlastiti timeout (fail-open), pa je ovo drugi sloj obrane.
set statement_timeout = '8s'
as $$
begin
  if qs is null or array_length(qs, 1) is null then
    return;
  end if;
  if array_length(qs, 1) > 200 then
    raise exception 'corpus_search_many: previse upita (max 200)';
  end if;

  -- Prag vrijedi SAMO za ovu transakciju (is_local = true).
  perform set_config('pg_trgm.similarity_threshold', min_sim::text, true);

  return query
  select i::int, c.title, c.year, c.institution, c.repo, c.url, c.sim
    from generate_subscripts(qs, 1) as i
    cross join lateral (
      select w.title, w.year, w.institution, w.repo, w.url,
             similarity(w.title_norm, qs[i]) as sim
        from corpus_works w
       where qs[i] is not null
         and length(qs[i]) >= 8            -- prekratak niz daje sum, ne pogodak
         and w.title_norm % qs[i]
       order by similarity(w.title_norm, qs[i]) desc
       limit top_n
    ) c;
end
$$;

-- Prava: korpus je PLACENA znacajka. Nitko osim servera ne smije pozvati ovu funkciju, inace bi
-- security definer zaobisao deny-all RLS koji 0030 namjerno postavlja na corpus_works.
revoke all on function public.corpus_search_many(text[], real, int) from public;
revoke all on function public.corpus_search_many(text[], real, int) from anon;
revoke all on function public.corpus_search_many(text[], real, int) from authenticated;
grant execute on function public.corpus_search_many(text[], real, int) to service_role;
