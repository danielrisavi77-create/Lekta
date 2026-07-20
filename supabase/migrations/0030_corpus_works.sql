-- 0030_corpus_works.sql
-- Placena provjera POSTOJANJA domacih izvora (plan: docs/PLAN_KORPUS_PROVJERA_IZVORA.md, K1).
--
-- Sto je ovo: bibliografski indeks hrvatskih repozitorija (Dabar + Hrcak, 526k radova) izvucen iz
-- lekta-pipeline/korpus.db, tablica `works`. Sluzi da referenca koju CrossRef ne indeksira dobije
-- stvarni verdikt umjesto vjecnog "provjeri rucno". Signal POSTOJANJA izvora, NE presuda o tocnosti
-- navoda i NE provjera plagijata.
--
-- Zasto samo metapodaci: cijela korpus.db je 1354 MB, ali 1,2 GB su `fingerprints` + FTS za slicnost
-- PUNOG TEKSTA (forenzika), sto ovoj znacajki ne treba. Metapodaci (`works`) su ~122 MB i staju ovdje
-- bez ikakvog novog posluzitelja.
--
-- Obrazac prava je stroza inacica 0026_repair_jobs.sql: RLS enable + NAMJERNO NIJEDNA POLITIKA
-- -> anon i authenticated su default-deny, cita iskljucivo server (service role zaobilazi RLS) iz
-- repair-docx Edge funkcije. Sadrzaj je javan (OAI-PMH metapodaci), ali je znacajka PLACENA, pa
-- klijent nikad ne pretrazuje korpus izravno.

-- 1) Trigramski indeks za DOHVAT KANDIDATA (ekvivalent FTS5 MATCH + bm25 iz corpus/index.py).
--    Konacni verdikt NE donosi Postgres: kandidati se boduju bigram-Dice funkcijom u TypeScriptu
--    (titleSimilarity iz src/citations/verify-existence.ts), isto kao sto m2_references.py nakon
--    FTS-a racuna _best_match. Postgres je ovdje samo brzi filtar recalla.
-- Shema `extensions` je Supabase konvencija (ondje vec zive pgcrypto, uuid-ossp, pg_stat_statements).
-- Bez `with schema` proSirenje zavrsi u `public` (kao sto je pg_net na ovom projektu), sto zagadjuje
-- korisnicku shemu. Operatorski razred se zato navodi kvalificirano (extensions.gin_trgm_ops), da
-- indeks ne ovisi o search_pathu role koja pokrece migraciju.
create extension if not exists pg_trgm with schema extensions;

create table if not exists corpus_works (
  doc_id bigint primary key,
  source_id text not null unique,               -- npr. 'oai:dabar.srce.hr:mef_1'
  title text not null,
  -- Normaliziran naslov: NFD, bez dijakritike, lowercase, samo [a-z0-9] (bez razmaka).
  -- Racuna ga uvozna skripta ISTOM logikom kao normalize() iz src/utils/helpers.ts, pa je
  -- podudaranje na serveru identicno onome u pregledniku. Indeksira se ovaj stupac, ne `title`.
  title_norm text not null,
  authors text,
  year int,
  institution text,
  url text,
  repo text,                                     -- 'dabar' | 'hrcak'
  kind text                                      -- 'master' | 'bachelor' | 'article' | ...
);

create index if not exists corpus_works_title_norm_trgm
  on corpus_works using gin (title_norm extensions.gin_trgm_ops);
create index if not exists corpus_works_year
  on corpus_works (year);

-- 2) Provenijencija snimke (svjezina korpusa). Korpus je SNIMKA, ne zivi izvor: ovdje stoji kada je
--    zetva radjena i koliko je zapisa, da se u sucelju moze posteno reci "stanje na dan X".
create table if not exists corpus_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- 3) RLS: enable BEZ ijedne politike = default deny za anon/authenticated (isti mehanizam kojim
--    0026 zabranjuje klijentsko pisanje, ovdje prosiren i na citanje). Service role zaobilazi RLS.
alter table corpus_works enable row level security;
alter table corpus_meta enable row level security;

-- NAMJERNO NEMA create policy: svaki klijentski select je odbijen. Ako se ikad odluci da korpus
-- postane besplatan, tek se tada dodaje select politika i to je svjesna proizvodna odluka, a ne
-- posljedica zaboravljenog defaulta.
