-- 0103: `health_ping()`, najjeftiniji dokaz da BAZA odgovara, za javnu health provjeru.
--
-- ZASTO POSTOJI: health je do 2026-09-07 zivost baze mjerio pozivom na korijen PostgREST-a
-- (`GET /rest/v1/`). Taj endpoint od tada prima iskljucivo `service_role` kljuc i na anon kljuc
-- vraca 401 ("Only the `service_role` API key can be used for this endpoint"), pa je health
-- javljao `degraded` i HTTP 503 iako je baza bila posve zdrava. Zakazani `post-deploy-smoke` je
-- zbog toga bio crven 40 uzastopnih puta, od 2026-08-28.
--
-- ZASTO FUNKCIJA, A NE TABLICA: health je javan (`verify_jwt = false`), pa ne smije postati
-- besplatan upit nad podacima. Ova funkcija ne cita nijednu tablicu, ne prima argumente i uvijek
-- vraca `true`; jedino sto dokazuje jest da je Postgres izvrsio upit i da PostgREST do njega dolazi.
-- Vezanje na aplikacijsku tablicu bi uz to znacilo da preimenovanje tablice obara monitoring.
--
-- `stable` (ne `immutable`): immutable bi PostgREST smio odgovoriti iz plana bez izvrsavanja, cime
-- bi provjera prestala mjeriti bazu. `security invoker` je namjeran, prava ostaju anonova.
--
-- Idempotentno: `create or replace` + `revoke`/`grant` se smiju ponoviti (vidi CLAUDE.md).

create or replace function public.health_ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

comment on function public.health_ping() is
  'Zivost baze za javni health endpoint. Ne cita podatke; vidi supabase/functions/health/index.ts.';

revoke all on function public.health_ping() from public;
grant execute on function public.health_ping() to anon, authenticated, service_role;
