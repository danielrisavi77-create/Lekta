-- 0013_referral_signups.sql
-- Referral mehanika "pozovi prijatelja" (zasebna od postojeceg 0005_referrals partner/checkout
-- programa, koji ostaje netaknut). Novi tijek: landing ?ref -> signup -> prijatelj dobiva prvu
-- provjeru besplatno -> na prijateljevu placenu kupnju preporucitelj dobiva slot.
--
-- ODLUKE (potvrdene s vlasnikom):
--  1) Nagrada je INTERNI entitlement (1 slot odgovarajuceg work_typea), isti obrazac kao
--     grant_rulebook_reward (0006) / referralRewardEntitlement (webhook-mor). coupon_grants se
--     NE koristi (to je popust-kupon tablica, ne slot; generate-report je nikad ne cita).
--  2) Zasebna tablica referral_signups (NE dira postojecu referrals iz 0005 ni njen program).
-- Sve pisanje ide preko service role (Edge Functioni); klijent samo cita svoje retke.

create table if not exists referral_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists referral_signups (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references referral_codes(code),
  referred_user_id uuid references auth.users(id) on delete set null,
  referred_ip_hash text,                    -- HASHIRAN (sha256 salt|ip) u Edge Functionu, anti-fraud
  status text not null default 'pending'
    check (status in ('pending','signed_up','friend_rewarded','converted','rewarded','fraud_blocked')),
  -- Nagrade su INTERNI entitlementi (ne coupon_grants); FK na entitlements(id).
  friend_reward_entitlement_id uuid references entitlements(id),
  referrer_reward_entitlement_id uuid references entitlements(id),
  -- MoR order koji je okinuo preporuciteljevu nagradu; refund tog ordera povlaci nepotrosenu nagradu.
  converted_order_id text,
  created_at timestamptz not null default now(),
  signed_up_at timestamptz,
  friend_rewarded_at timestamptz,
  converted_at timestamptz,
  rewarded_at timestamptz
);

-- Dedupe: jedna osoba moze biti "referred" samo jednom ikad, bez obzira na kod.
create unique index if not exists referral_signups_referred_user_unique
  on referral_signups (referred_user_id)
  where referred_user_id is not null;

create index if not exists referral_signups_referrer_idx on referral_signups (referrer_user_id);
create index if not exists referral_signups_code_idx on referral_signups (code);
create index if not exists referral_signups_rewarded_idx on referral_signups (referrer_user_id, status, rewarded_at);

alter table referral_codes enable row level security;
alter table referral_signups enable row level security;

-- SAMO select za klijenta; nema insert/update policy (namjerno). Sve pisanje = trigger ili
-- service role u Edge Functionima (kao 0001/0003/0005: bez write policyja RLS odbija klijenta).
create policy referral_codes_select_own
  on referral_codes for select
  to authenticated
  using (user_id = auth.uid());

create policy referral_signups_select_own
  on referral_signups for select
  to authenticated
  using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());

-- === Generiranje koda pri PRVOJ entitlement kupnji ===

create or replace function generate_referral_code() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- bez 0/O/1/I/L, izbjegava dvosmislenost
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function ensure_referral_code_on_first_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count int;
  new_code text;
  attempts int := 0;
begin
  select count(*) into existing_count from entitlements where user_id = new.user_id;

  if existing_count = 1 then -- ovo je bas ovaj insert, dakle prva ikad kupnja
    if not exists (select 1 from referral_codes where user_id = new.user_id) then
      loop
        new_code := generate_referral_code();
        attempts := attempts + 1;
        exit when not exists (select 1 from referral_codes where code = new_code) or attempts > 10;
      end loop;
      insert into referral_codes (user_id, code)
      values (new.user_id, new_code)
      on conflict (user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_referral_code on entitlements;
create trigger trg_ensure_referral_code
  after insert on entitlements
  for each row
  execute function ensure_referral_code_on_first_entitlement();

comment on table referral_codes is
  'Generiran iskljucivo trigerom pri prvoj entitlement kupnji, nikad na klijentov zahtjev.';
comment on table referral_signups is
  'Pozovi-prijatelja tijek (zasebno od 0005_referrals). Status: pending -> signed_up -> friend_rewarded -> converted/rewarded, ili fraud_blocked. Nagrade su interni entitlementi.';
