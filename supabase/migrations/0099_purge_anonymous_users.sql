-- 0099: sigurno ciscenje NAPUSTENIH anonimnih racuna (audit P1-11).
--
-- ZATECENO STANJE. `cleanup-orphan-repairs` cisti anonimne DOKUMENTE (0033), ali sam auth racun
-- ostaje zauvijek. Mjereno na produkciji 2026-08-23: 23 anonimna racuna, 13 bez ijednog repair
-- posla, od toga 3 starija od 30 dana. Svaki posjet koji dodirne popravak stvara jedan takav
-- racun, pa `auth.users` i identitetska povrsina rastu bez gornje granice, a botu je dovoljan
-- jedan poziv da doda novi.
--
-- ZASTO PREDIKAT IDE IZ KATALOGA, A NE IZ RUCNOG POPISA. Na `auth.users` visi 47 stranih kljuceva
-- iz `public`, gotovo svi `on delete cascade`. Brisanje racuna dakle tiho brise podatke kroz
-- cetrdesetak tablica. Rucno nabrojan popis ("nema repair_jobs i nema entitlements") bio bi tocan
-- na dan pisanja i pogresan cim netko doda tablicu: od tog trenutka bismo brisali racune koji
-- IMAJU podatke, i to bez traga. Zato se popis tablica cita iz `pg_constraint` pri svakom pozivu.
-- Nova tablica s FK-om na `auth.users` automatski ulazi u zastitu, bez ijedne izmjene ovdje.
--
-- KONZERVATIVNO PO DEFINICIJI: BILO KOJI redak u BILO KOJOJ tablici koja referencira korisnika
-- znaci "ima podatke" i racun se NE brise. To ukljucuje i veze s `on delete set null`
-- (`referral_signups.referred_user_id`, `faculty_requests.user_id`): i one su trag stvarne
-- aktivnosti, pa ih namjerno tretiramo jednako. Radije ostavimo prazan racun nego obrisemo pun.
--
-- Idempotentno: `create or replace`, bez DDL-a nad tablicama.

drop function if exists find_purgeable_anonymous_users(integer, integer);

create or replace function find_purgeable_anonymous_users(
  p_days integer,
  p_limit integer
) returns table (user_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_predicate text;
  v_sql text;
begin
  if p_limit is null or p_limit <= 0 then
    return;
  end if;

  -- Sastavi "nema retka nigdje" iz ZIVOG kataloga stranih kljuceva prema auth.users.
  select string_agg(
           format('not exists (select 1 from %s t where t.%I = u.id)', tbl, col),
           ' and '
         )
    into v_predicate
    from (
      select distinct
             c.conrelid::regclass::text as tbl,
             a.attname                  as col
        from pg_constraint c
        join unnest(c.conkey) with ordinality k(attnum, ord) on true
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
       where c.contype = 'f'
         and c.confrelid = 'auth.users'::regclass
         and c.connamespace = 'public'::regnamespace
    ) refs;

  -- SENTINEL. Prazan predikat znaci da katalog nije vratio nijednu tablicu, sto je ili greska u
  -- upitu ili baza koja nije Lektina. Tada bi `where true` obrisalo SVE stare anonimne racune,
  -- ukljucujuci one pune podataka. Radije ne vracamo nista.
  if v_predicate is null or v_predicate = '' then
    raise warning 'find_purgeable_anonymous_users: nijedan FK na auth.users, ne vracam kandidate';
    return;
  end if;

  v_sql := format(
    'select u.id, u.created_at
       from auth.users u
      where u.is_anonymous
        and u.created_at < now() - make_interval(days => %s)
        and %s
      order by u.created_at
      limit %s',
    greatest(coalesce(p_days, 0), 0),
    v_predicate,
    p_limit
  );

  return query execute v_sql;
end;
$$;

-- Isti obrazac kao ostale cron RPC funkcije: samo service_role iz Edgea.
revoke all on function find_purgeable_anonymous_users(integer, integer) from public, anon, authenticated;

comment on function find_purgeable_anonymous_users(integer, integer) is
  'Anonimni racuni stariji od praga BEZ ijednog retka u bilo kojoj tablici koja ih referencira (audit P1-11). Popis tablica se cita iz pg_constraint pri svakom pozivu, pa nova tablica automatski stiti racun.';
