-- Lekta rast: "Donesi pravilnik" (MONETIZATION_PLAN.md sekcije 9, 13, korak 15.6).
-- Korisnik uploada sluzbeni pravilnik svog fakulteta; nakon LJUDSKE verifikacije (AI nikad
-- sam ne objavljuje pravila) profil se moze verificirati, a podnositelj dobiva 1 besplatni
-- slot odgovarajuceg work_typea (interni entitlement, max 1 nagrada po korisniku IKAD).
-- Admin verifikacija je CLI/SQL (bez UI-a): postavi status='verified' pa pozovi grant funkciju.

create table if not exists rulebook_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_name text not null,
  program text,
  work_type text,
  source_url text,
  file_path text,
  status text not null default 'pending' check (status in ('pending','verified','duplicate','rejected')),
  reward_granted boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rulebook_submissions_user on rulebook_submissions (user_id, created_at);

-- RLS (sekcija 13): korisnik cita svoje prijave; status i nagradu postavlja iskljucivo server.
alter table rulebook_submissions enable row level security;
drop policy if exists rulebook_submissions_select_own on rulebook_submissions;
create policy rulebook_submissions_select_own on rulebook_submissions
  for select using (user_id = auth.uid());

-- Atomska dodjela nagrade (mirrors consume_slot_and_bind iz 0001). Security definer: izvodi
-- se kao vlasnik, ali funkcija sama provjerava uvjete. Vraca true ako je nagrada dodijeljena.
-- Uvjeti (sekcija 9): status='verified', jos nije dodijeljeno, korisnik NEMA raniju rulebook
-- nagradu, work_type mapira na postojeci slot proizvod. Idempotentno preko unique(provider,order_id).
create or replace function grant_rulebook_reward(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub rulebook_submissions;
  v_product text;
begin
  select * into v_sub from rulebook_submissions where id = p_submission_id for update;
  if not found then raise exception 'submission_not_found'; end if;
  if v_sub.status <> 'verified' then return false; end if;
  if v_sub.reward_granted then return false; end if;

  -- max 1 rulebook nagrada po korisniku ikad
  if exists (
    select 1 from entitlements
     where user_id = v_sub.user_id and provider = 'internal' and order_id like 'reward:rulebook:%'
  ) then
    return false;
  end if;

  v_product := 'slot_' || coalesce(v_sub.work_type, '');
  if not exists (select 1 from products where id = v_product and kind = 'slot') then
    return false; -- nepoznat/nevaljan work_type
  end if;

  insert into entitlements (user_id, work_type, slots_total, product_id, order_id, provider, purchase_expires_at)
  values (v_sub.user_id, v_sub.work_type, 1, v_product, 'reward:rulebook:' || v_sub.id, 'internal', now() + interval '90 days');

  update rulebook_submissions set reward_granted = true where id = p_submission_id;
  return true;
end;
$$;

revoke all on function grant_rulebook_reward(uuid) from public, anon, authenticated;
