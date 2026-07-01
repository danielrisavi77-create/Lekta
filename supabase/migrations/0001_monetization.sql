-- Lekta monetizacija: entitlements, document_slots, report_generations + RLS.
-- Spec: docs/MONETIZATION_AND_ANTI_ABUSE.md sekcije 6, 7, 13.
-- Pravo pristupa je uvijek serverska odluka: klijent NE pise u ove tablice (RLS dolje).
-- Otisak je jsonb { titleNorm, authorNorm, headings[], sectionCount }, nikad hash datoteke.

-- kupnja: daje N slotova jednog work_type
create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_type text not null check (work_type in ('seminarski','zavrsni','diplomski','doktorski')),
  slots_total int not null check (slots_total >= 1),
  slots_used int not null default 0 check (slots_used >= 0),
  status text not null default 'active' check (status in ('active','refunded','void')),
  order_id text not null,                       -- id iz Merchant of Record providera
  provider text not null,                       -- 'paddle' | 'lemonsqueezy'
  created_at timestamptz not null default now(),
  purchase_expires_at timestamptz not null,     -- rok za POTROSITI slotove (npr. +90 dana)
  constraint slots_used_le_total check (slots_used <= slots_total),
  unique (provider, order_id)                   -- idempotencija webhooka (sekcija 7)
);

-- slot vezan na konkretan rad (otisak)
create table if not exists document_slots (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references entitlements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  work_type text not null,
  fingerprint jsonb not null,                   -- { titleNorm, authorNorm, headings[], sectionCount }
  label text,                                   -- npr. "Moj diplomski"
  bound_at timestamptz not null default now(),
  slot_expires_at timestamptz not null
);
create index if not exists document_slots_lookup
  on document_slots (user_id, work_type, slot_expires_at);

-- log generacija: rate limit + detekcija anomalija
create table if not exists report_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id uuid references document_slots(id) on delete set null,
  doc_fingerprint jsonb not null,
  ip_hash text,                                 -- HASHIRAN, ne sirovi IP (GDPR, sekcija 13)
  status text not null check (status in ('recheck','new_slot','denied','rate_limited')),
  created_at timestamptz not null default now()
);
create index if not exists report_generations_user_time
  on report_generations (user_id, created_at);

-- RLS: korisnik smije CITATI samo svoje retke; pisanje radi iskljucivo server
-- (service role zaobilazi RLS, ili security definer funkcije nize). Sekcija 6.
alter table entitlements enable row level security;
alter table document_slots enable row level security;
alter table report_generations enable row level security;

drop policy if exists entitlements_select_own on entitlements;
create policy entitlements_select_own on entitlements
  for select using (user_id = auth.uid());

drop policy if exists document_slots_select_own on document_slots;
create policy document_slots_select_own on document_slots
  for select using (user_id = auth.uid());

drop policy if exists report_generations_select_own on report_generations;
create policy report_generations_select_own on report_generations
  for select using (user_id = auth.uid());

-- Namjerno NEMA insert/update/delete politika za anon ni authenticated role:
-- bez njih RLS odbija svako klijentsko pisanje. Server pise preko service role.

-- Atomsko trosenje slota (sekcija 5, korak 5: slots_used += 1 uz zastitu od racea).
-- Security definer: vlasnik funkcije (postgres) izvodi update bez obzira na RLS, ali
-- funkcija sama provjerava user_id i kapacitet. Vraca kreirani slot.
create or replace function consume_slot_and_bind(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_work_type text,
  p_fingerprint jsonb,
  p_label text,
  p_slot_expires_at timestamptz
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

  insert into document_slots (entitlement_id, user_id, work_type, fingerprint, label, slot_expires_at)
  values (p_entitlement_id, p_user_id, p_work_type, p_fingerprint, p_label, p_slot_expires_at)
  returning * into v_slot;

  return v_slot;
end;
$$;

revoke all on function consume_slot_and_bind(uuid, uuid, text, jsonb, text, timestamptz) from public, anon, authenticated;
