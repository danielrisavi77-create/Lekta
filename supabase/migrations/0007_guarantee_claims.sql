-- Lekta monetizacija: garancija povrata + tier snapshot (MONETIZATION_PLAN.md sekcije 10, 13, korak 15.7).
-- Garancija vrijedi samo za T2/T3 (coverage_tier>=2 u trenutku vezivanja slota), claim unutar
-- 30 dana od bound_at, uz dokaz i sporni rule_key. Odluka je rucna; approved -> MoR refund +
-- manual_orders (rucni popravak). Ulazni gate je src/report/guarantee.ts (testirano).

create table if not exists guarantee_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid references document_slots(id) on delete set null,
  rule_key text,
  evidence_path text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  resolution text check (resolution in ('refund','manual_fix','both')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists guarantee_claims_user on guarantee_claims (user_id, created_at);

-- RLS (sekcija 13): korisnik cita svoje zahtjeve; status/resolution postavlja server (admin).
alter table guarantee_claims enable row level security;
drop policy if exists guarantee_claims_select_own on guarantee_claims;
create policy guarantee_claims_select_own on guarantee_claims
  for select using (user_id = auth.uid());

-- Tier snapshot na slotu (kriterij 14.11): consume_slot_and_bind sada prima i sprema
-- profile_ref + coverage_tier (delte iz 0002). Zamjena stare 6-arg verzije iz 0001.
drop function if exists consume_slot_and_bind(uuid, uuid, text, jsonb, text, timestamptz);

create or replace function consume_slot_and_bind(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_work_type text,
  p_fingerprint jsonb,
  p_label text,
  p_slot_expires_at timestamptz,
  p_profile_ref text default null,
  p_coverage_tier smallint default null
) returns document_slots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
  v_slot document_slots;
begin
  update entitlements
     set slots_used = slots_used + 1
   where id = p_entitlement_id
     and user_id = p_user_id
     and status = 'active'
     and purchase_expires_at > now()
     and slots_used < slots_total;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'no_slot_available' using errcode = 'check_violation';
  end if;

  insert into document_slots
    (entitlement_id, user_id, work_type, fingerprint, label, slot_expires_at, profile_ref, coverage_tier)
  values
    (p_entitlement_id, p_user_id, p_work_type, p_fingerprint, p_label, p_slot_expires_at, p_profile_ref, p_coverage_tier)
  returning * into v_slot;

  return v_slot;
end;
$$;

revoke all on function consume_slot_and_bind(uuid, uuid, text, jsonb, text, timestamptz, text, smallint)
  from public, anon, authenticated;
