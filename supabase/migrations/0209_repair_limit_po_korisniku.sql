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
-- dnevni limit nije vidio i jedan racun ih je mogao ponavljati bez granice. Biljeze se kao zasebni
-- statusi koji NE trose besplatnu kvotu ni placeni slot, nego imaju vlastiti visi strop u Edge kodu.
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
 * p_max <= 0 iskljucuje globalni, p_max_per_user <= 0 iskljucuje limit po korisniku.
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
  if p_max <= 0 and (p_max_per_user <= 0 or p_user_id is null) then
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

  if p_max_per_user > 0 and p_user_id is not null
     and (select count(*) from public.repair_inflight where user_id = p_user_id) >= p_max_per_user then
    return query select null::uuid, 'user_busy'::text;
    return;
  end if;

  insert into public.repair_inflight (user_id) values (p_user_id) returning id into v_id;
  return query select v_id, 'ok'::text;
end;
$$;

revoke all on function public.try_acquire_repair_slot_for_user(int, int, uuid, int) from anon, authenticated, public;

-- RD-2: novi statusi ishoda bez potrosnje (popis iz 0029 + dva nova).
alter table public.report_generations drop constraint if exists report_generations_status_check;
alter table public.report_generations add constraint report_generations_status_check
  check (status in ('recheck', 'new_slot', 'denied', 'rate_limited', 'free', 'repair_failed', 'no_change', 'integrity_failed'));
