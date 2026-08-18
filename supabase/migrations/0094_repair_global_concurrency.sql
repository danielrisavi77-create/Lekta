-- 0094_repair_global_concurrency.sql
--
-- GLOBALNA brana za istodobne popravke (audit DOCX-06).
--
-- Postojeci `ConcurrencyGate` je brojac U MEMORIJI JEDNOG IZOLATA. Supabase Edge funkcije se
-- autoskaliraju, pa svaka instanca ima vlastiti brojac: uz limit 4 i pet toplih instanci u letu
-- moze biti 20 popravaka. Brana koja se mnozi s brojem instanci nije brana, nego dojam brane, a
-- popravak je najskuplja operacija u sustavu (do 2 x 20 MB kroz Storage, plus raspakiravanje).
--
-- Ovdje je brojac u BAZI, dakle jedan za sve instance.
--
-- ZASTO TABLICA S REDCIMA, A NE JEDAN INTEGER: proces koji umre usred popravka ne moze dekrementirati
-- brojac, pa bi jedan integer trajno curio dok ga netko rucno ne resetira. Redak ima `started_at`, pa
-- istekli zapisi nestaju sami (lease). Curenje se tako lijeci vremenom umjesto intervencijom.

create table if not exists public.repair_inflight (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now()
);

create index if not exists repair_inflight_started on public.repair_inflight (started_at);

-- Servisna tablica: pise je iskljucivo Edge funkcija preko service role kljuca. Deny-all za javne
-- uloge je IZRICIT (grantovi povuceni), ne posljedica izostanka politike (isto pravilo kao 0093).
alter table public.repair_inflight enable row level security;
revoke all on table public.repair_inflight from anon, authenticated;

comment on table public.repair_inflight is
  'Jedan redak po popravku koji je U TIJEKU. Globalna zamjena za per-instance ConcurrencyGate (DOCX-06). Istekli redci se ciste pri sljedecem preuzimanju, pa pad procesa ne ostavlja trajno zauzet slot.';

/**
 * Preuzmi slot ako ih je slobodnih. Vraca id slota ili NULL kad je popunjeno.
 *
 * `pg_advisory_xact_lock` serijalizira brojanje i umetanje: bez njega bi dvije usporedne
 * transakcije obje procitale "ima mjesta" i obje umetnule (klasican TOCTOU), pa bi limit bio
 * preporuka a ne granica. Lock se otpusta zavrsetkom transakcije, dakle sam po sebi.
 */
create or replace function public.try_acquire_repair_slot(p_max int, p_lease_seconds int)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_max <= 0 then
    return gen_random_uuid(); -- limit iskljucen: vrati sintetican id, nista se ne biljezi
  end if;

  perform pg_advisory_xact_lock(hashtext('lekta.repair_inflight'));

  -- Istekli slotovi (proces umro, runtime presjekao) oslobadjaju se ovdje, a ne posebnim ciscenjem:
  -- jedini trenutak kad je njihovo postojanje vazno jest kad netko trazi novi slot.
  delete from public.repair_inflight
   where started_at < now() - make_interval(secs => greatest(p_lease_seconds, 1));

  if (select count(*) from public.repair_inflight) >= p_max then
    return null;
  end if;

  insert into public.repair_inflight default values returning id into v_id;
  return v_id;
end;
$$;

/** Oslobodi slot. Nepostojeci id je no-op, pa dvostruko oslobadjanje ne moze osloboditi tudji slot. */
create or replace function public.release_repair_slot(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.repair_inflight where id = p_id;
$$;

-- SECURITY DEFINER funkcije NE SMIJU biti javno izvrsive (pouka iz 0093: increment_job_view je bio
-- pozivljiv od anon). Zove ih iskljucivo Edge funkcija preko service role kljuca, koji grantove
-- zaobilazi, pa javnim ulogama ovdje nema sto trebati.
revoke all on function public.try_acquire_repair_slot(int, int) from anon, authenticated, public;
revoke all on function public.release_repair_slot(uuid) from anon, authenticated, public;
