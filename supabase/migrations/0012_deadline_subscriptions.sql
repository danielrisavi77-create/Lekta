-- 0012_deadline_subscriptions.sql
-- Rokovi i podsjetnici. Vidi docs/ROKOVI_PODSJETNICI.md.

-- === Akademski rok, opt-in pretplata ===

create table if not exists deadline_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  faculty_id text not null,
  work_type text not null,
  academic_year text not null,
  deadline_date date not null,
  deadline_source text not null,
  consent_at timestamptz not null default now(),
  reminder_7d_sent_at timestamptz,
  reminder_1d_sent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists deadline_subscriptions_due_idx
  on deadline_subscriptions (deadline_date)
  where unsubscribed_at is null;

create index if not exists deadline_subscriptions_user_idx
  on deadline_subscriptions (user_id);

alter table deadline_subscriptions enable row level security;

-- Korisnik vidi samo svoje pretplate (za "vec pretplacen" stanje u UI-u).
create policy deadline_subscriptions_select_own
  on deadline_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

-- Korisnik moze kreirati SAMO svoju pretplatu, i SAMO u "svjezem" stanju
-- (bez vec postavljenih sent_at/unsubscribed_at polja). Sprijecava klijenta
-- da lazira da je podsjetnik vec poslan ili odjavljen pri samom insertu.
create policy deadline_subscriptions_insert_own
  on deadline_subscriptions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and reminder_7d_sent_at is null
    and reminder_1d_sent_at is null
    and unsubscribed_at is null
  );

-- NEMA update policy za authenticated/anon. Odjava ide iskljucivo preko
-- RPC funkcije ispod (security definer) ili preko service role (email link).
-- Ovo sprjecava klijenta da sam sebi postavi reminder_*_sent_at.

create or replace function unsubscribe_own_deadline_subscription(subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update deadline_subscriptions
  set unsubscribed_at = now()
  where id = subscription_id
    and user_id = auth.uid()
    and unsubscribed_at is null;
end;
$$;

grant execute on function unsubscribe_own_deadline_subscription(uuid) to authenticated;

-- === Istek slota, transakcijski podsjetnik, default ukljuceno ===

create table if not exists user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slot_expiry_reminders_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table user_notification_preferences enable row level security;

create policy notification_prefs_select_own
  on user_notification_preferences for select
  to authenticated
  using (user_id = auth.uid());

create policy notification_prefs_upsert_own
  on user_notification_preferences for insert
  to authenticated
  with check (user_id = auth.uid());

create policy notification_prefs_update_own
  on user_notification_preferences for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table deadline_subscriptions is
  'Opt-in podsjetnici na stvaran akademski rok, izvor: data/submission/academic-deadlines.json. Vidi ROKOVI_PODSJETNICI.md.';
comment on table user_notification_preferences is
  'Preferenca za transakcijske (istek slota) podsjetnike, default ukljuceno, opt-out preko potpisanog linka u e-mailu.';

-- === Napomena o pg_cron (rucni korak, vidi RUNBOOK_OPS.md obrazac) ===
--
-- Ovo NIJE dio migracije jer treba stvarne vrijednosti projekta (URL, service role
-- kljuc u Vault-u ili anon kljuc s posebnom zastitom). Pokreni RUCNO u SQL editoru
-- nakon deploya `send-reminders` Edge Functiona:
--
-- select cron.schedule(
--   'send-deadline-reminders',
--   '0 8 * * *', -- svaki dan u 08:00 UTC
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY_ILI_CRON_SECRET>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
