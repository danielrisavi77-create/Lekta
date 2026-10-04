-- 0209_repair_limit_po_korisniku.sql
--
-- T84 RD-3 i RD-2 (sigurnosni podskup T21 za zive endpointe).
--
-- RD-3: globalna brana 0094 broji samo ukupno (4), pa jedan racun s cetiri paralelna teska popravka
-- drzi sve ostale korisnike na 503 do isteka leasea. Ovdje slot pamti korisnika, a nova funkcija uz
-- globalni limit provjerava i limit po korisniku. Stara funkcija ostaje (Edge pada na nju dok kod i
-- migracija nisu isporuceni zajedno).
--
-- RD-2: ishod bez izmjena i odbijena isporuka (vrata integriteta) dosad se nisu biljezili, pa ih
-- dnevni limit nije vidio i jedan racun ih je mogao ponavljati bez granice. Biljeze se u ZASEBAN
-- dnevnik `repair_attempt_log`, ne u report_generations: tako ih ne vide ni placeni strop
-- generate-reporta ni ostali potrosaci te tablice (Codex R4 na #294), a CHECK na report_generations se
-- ne dira (R6). Korisnik za te ishode ne placa; dnevnik sluzi samo stropu u Edge kodu.
--
-- Idempotentno: if not exists, drop ... if exists, create or replace.

alter table public.repair_inflight add column if not exists user_id uuid;
create index if not exists repair_inflight_user on public.repair_inflight (user_id);

comment on column public.repair_inflight.user_id is
  'Vlasnik slota (T84 RD-3); null za slotove iz stare funkcije try_acquire_repair_slot (0094).';

/**
 * Preuzmi slot uz globalni limit i limit po korisniku. Vraca jedan redak:
 *   (slot_id, 'ok')        slot dobiven;
 *   (null, 'full')         globalni limit dosegnut;
 *   (null, 'user_busy')    korisnik vec drzi p_max_per_user slotova.
 * Isti advisory lock kao 0094, pa obje funkcije brojanje i umetanje rade serijski.
 * p_max <= 0 iskljucuje globalni, p_max_per_user <= 0 iskljucuje limit po korisniku. NULL p_user_id
 * se odbija (22004): slot bez vlasnika bi zaobisao limit po korisniku (Codex R8 na #294).
 */
create or replace function public.try_acquire_repair_slot_for_user(
  p_max int,
  p_lease_seconds int,
  p_user_id uuid,
  p_max_per_user int
)
returns table (slot_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'try_acquire_repair_slot_for_user: p_user_id je obavezan' using errcode = '22004';
  end if;

  if p_max <= 0 and p_max_per_user <= 0 then
    return query select gen_random_uuid(), 'ok'::text; -- oba limita iskljucena: nista se ne biljezi
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('lekta.repair_inflight'));

  delete from public.repair_inflight
   where started_at < now() - make_interval(secs => greatest(p_lease_seconds, 1));

  if p_max > 0 and (select count(*) from public.repair_inflight) >= p_max then
    return query select null::uuid, 'full'::text;
    return;
  end if;

  if p_max_per_user > 0
     and (select count(*) from public.repair_inflight where user_id = p_user_id) >= p_max_per_user then
    return query select null::uuid, 'user_busy'::text;
    return;
  end if;

  insert into public.repair_inflight (user_id) values (p_user_id) returning id into v_id;
  return query select v_id, 'ok'::text;
end;
$$;

-- Vlasnik je izricit (Codex R5 na #294): SECURITY DEFINER izvrsava se s pravima vlasnika, pa vlasnik
-- ne smije ovisiti o tome tko je pokrenuo migraciju.
alter function public.try_acquire_repair_slot_for_user(int, int, uuid, int) owner to postgres;
revoke all on function public.try_acquire_repair_slot_for_user(int, int, uuid, int) from anon, authenticated, public;

-- RD-2: dnevnik ishoda koji ne trose kvotu ni slot. Servisna tablica: pise je iskljucivo repair-docx
-- preko service role kljuca; deny-all za javne uloge je izricit (RLS bez politika i revoke).
create table if not exists public.repair_attempt_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  outcome text not null check (outcome in ('no_change', 'integrity_failed')),
  created_at timestamptz not null default now()
);
create index if not exists repair_attempt_log_user_created on public.repair_attempt_log (user_id, created_at);
alter table public.repair_attempt_log enable row level security;
revoke all on table public.repair_attempt_log from anon, authenticated;

comment on table public.repair_attempt_log is
  'Popravci bez izmjena i odbijene isporuke (T84 RD-2): ne trose kvotu ni slot, ali imaju vlastiti dnevni strop u repair-docx.';

-- Retencija (GDPR minimizacija): strop gleda samo zadnja 24 sata, pa se stariji redci brisu nakon 7 dana.
create or replace function public.purge_repair_attempt_log(retention_days int default 7)
returns integer
language sql
set search_path = public
as $$
  with del as (
    delete from public.repair_attempt_log
     where created_at < now() - make_interval(days => retention_days)
    returning 1
  )
  select count(*)::int from del;
$$;
revoke all on function public.purge_repair_attempt_log(int) from anon, authenticated, public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('purge-repair-attempt-log');
    exception when others then
      null; -- job jos ne postoji
    end;
    perform cron.schedule('purge-repair-attempt-log', '25 3 * * *', 'select public.purge_repair_attempt_log(7);');
  end if;
end $$;
