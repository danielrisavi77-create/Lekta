-- 0022_ip_rate_limits.sql
-- Atomski per-IP dnevni rate limit (AUD-27 preflight-start, AUD-22 integrity-check full).
--
-- PROBLEM: postojeci per-IP capovi u Edge funkcijama su COUNT-pa-INSERT (TOCTOU). Vise
-- paralelnih zahtjeva s istog IP-ja procita isti (stari) COUNT ispod capa pa svi produ,
-- jer se INSERT dogodi tek poslije. Per-user cap u preflightu je slucajno backstopan
-- partial-unique indeksom (preflight_checks_one_active_per_user serijalizira aktivne
-- jobove korisnika), ali per-IP nema takav backstop, a integrity-check nema per-IP cap
-- uopce.
--
-- RJESENJE: jedan generalizirani atomski brojac. Redak (scope, ip_hash, dan) drzi broj
-- potrosenih slotova za taj UTC dan. Funkcija claim_ip_rate_slot radi INSERT ... ON CONFLICT
-- DO UPDATE ... WHERE count < cap RETURNING: konfliktni redak se zakljucava pa su paralelni
-- zahtjevi s istog IP-ja serijalizirani (nema TOCTOU). Vraca dopusteno/odbijeno (boolean),
-- pa Edge samo pozove RPC i na false vrati 429.
--
-- scope je logicki bucket ('preflight', 'integrity_full', ...) da isti brojac posluzi vise
-- funkcija bez mijesanja kvota. Prozor je FIKSNI UTC dan (reset u ponoc UTC), ne rolling 24 h;
-- to je namjerna, jednostavnija semantika za counter-model (per-user rolling COUNT ostaje
-- nepromijenjen u Edge funkcijama).
--
-- ip_hash je vec SOLJEN sha (hashClientIpSalted u Edge), pseudonim, ne sirovi IP. Cuva se
-- kratko (purge_ip_rate_limits) jer sluzi samo anti-abuse prozoru.

create table if not exists ip_rate_limits (
  scope text not null,                 -- logicki bucket kvote ('preflight', 'integrity_full', ...)
  ip_hash text not null,               -- SOLJEN sha klijentskog IP-ja (nikad sirovi IP)
  day date not null,                   -- UTC kalendarski dan prozora
  count integer not null default 0,    -- potroseno slotova u tom danu
  updated_at timestamptz not null default now(),
  primary key (scope, ip_hash, day)
);

-- Atomska rezervacija jednog per-IP slota za (scope, danas). Vraca true ako je slot
-- rezerviran (dopusteno), false ako je dnevni cap dosegnut (odbijeno). Bez ip_hash-a nema
-- per-IP identiteta pa se dopusta (per-user/entitlement gate u Edge i dalje vrijedi).
--
-- Atomicnost: prvi zahtjev dana radi INSERT (count=1, RETURNING vraca redak -> true).
-- Svaki sljedeci pogodi ON CONFLICT: DO UPDATE uvecava count SAMO ako je count < cap; ako
-- je cap dosegnut, WHERE ne prode, nijedan redak nije azuriran, RETURNING ne vraca nista ->
-- v_ok ostaje null -> false. Konfliktni redak je pod row lockom pa su paralelni pozivi s
-- istog IP-ja serijalizirani (COUNT i uvecanje su u istoj atomskoj naredbi, ne TOCTOU).
create or replace function claim_ip_rate_slot(
  p_scope text,
  p_ip_hash text,
  p_daily_cap integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
  v_day date := (now() at time zone 'utc')::date;
begin
  if p_daily_cap <= 0 then
    return false;   -- degenerativni cap: nikad ne dopusti
  end if;
  if p_ip_hash is null or p_ip_hash = '' then
    return true;    -- nema per-IP identiteta: ne blokiraj (drugi gateovi vrijede)
  end if;

  insert into ip_rate_limits (scope, ip_hash, day, count, updated_at)
  values (p_scope, p_ip_hash, v_day, 1, now())
  on conflict (scope, ip_hash, day) do update
     set count = ip_rate_limits.count + 1,
         updated_at = now()
   where ip_rate_limits.count < p_daily_cap
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

-- Least privilege (obrazac 0011 submit_faculty_request / 0015): klijent ne smije zvati;
-- poziva iskljucivo Edge preko service role (service_role zadrzava default-privilege execute,
-- revoke dira samo public/anon/authenticated).
revoke all on function claim_ip_rate_slot(text, text, integer) from public, anon, authenticated;

-- Retencija: brojaci starijih dana su mrtvi cim dan produ. Cuvamo kratki rep (danas +
-- prethodna 2 dana) radi eventualnih rubnih slucajeva oko UTC ponoci, ostalo brisemo.
create or replace function purge_ip_rate_limits(retention_days int default 2)
returns integer
language sql
set search_path = public
as $$
  with del as (
    delete from ip_rate_limits
     where day < (now() at time zone 'utc')::date - make_interval(days => retention_days)
    returning 1
  )
  select count(*)::int from del;
$$;

revoke execute on function purge_ip_rate_limits(int) from public;

-- Fail-closed (AUD-18/19 / LEKTA-SEC-02 obrazac): bez pg_crona purge se ne bi zakazao, pa bi
-- brojac tablica rasla neograniceno (svaki distinct IP x dan x scope). Zato izostanak pg_crona
-- RUSI migraciju (glasno) umjesto tihog zelenog prolaza. Konzistentno s 0018/0019 koji vec
-- tvrdo traze pg_cron i primjenjuju se prije ove migracije, pa ovo ne uvodi nov blocker.
-- Idempotentno: re-run radi unschedule pa schedule istog imenovanog joba. Stagger 05:00 UTC,
-- clear od postojecih jobova (0009 0:03, 0011 15:03, 0016 30/45:03, 0018 0:04, 0019 30:04 + 15:*).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron nije dostupan: purge_ip_rate_limits() se ne moze zakazati (fail-closed). Ukljuci pg_cron ekstenziju pa ponovno pokreni migraciju.';
  end if;
  begin
    perform cron.unschedule('purge-ip-rate-limits');
  exception when others then
    null; -- job jos ne postoji
  end;
  perform cron.schedule('purge-ip-rate-limits', '0 5 * * *', 'select purge_ip_rate_limits(2);');
end $$;

comment on table ip_rate_limits is
  'Atomski per-IP dnevni rate brojac (scope, ip_hash, UTC dan). Puni ga claim_ip_rate_slot (ON CONFLICT increment, bez TOCTOU); koriste ga preflight-start i integrity-check. ip_hash je soljen sha, ne sirovi IP; purge_ip_rate_limits brise stare dane.';
