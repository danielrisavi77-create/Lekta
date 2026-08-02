-- 0036_deadline_reminder_tiers.sql
-- Prosiruje deadline_subscriptions (0012) s 2 na 5 razina podsjetnika (marketinski plan,
-- tocka 24/25): 30 dana, 14 dana, 7 dana, 72h, dan predaje. Postojece dvije kolone se NE
-- preimenuju (manji diff, manji rizik): reminder_7d_sent_at i reminder_1d_sent_at ostaju,
-- samo im send-reminders/index.ts mijenja prozor (7d uzi na <=7&&>3, 1d postaje "dan
-- predaje" <=0). Ostaje FUNKCIONALNO INERTNO dok Resend/domena nisu zivi (docs/GO_LIVE_ROKOVI.md)
-- - ovo je samo priprema sheme, isti obrazac kao WS3 (paywall copy) prosli krug.

alter table deadline_subscriptions
  add column if not exists reminder_30d_sent_at timestamptz,
  add column if not exists reminder_14d_sent_at timestamptz,
  add column if not exists reminder_72h_sent_at timestamptz;

-- Ista logika kao originalna insert policy (0012), prosirena na sve 5 sent_at kolona: klijent
-- ne moze pri insertu lazirati da je bilo koji podsjetnik vec poslan.
drop policy if exists deadline_subscriptions_insert_own on deadline_subscriptions;

create policy deadline_subscriptions_insert_own
  on deadline_subscriptions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and reminder_30d_sent_at is null
    and reminder_14d_sent_at is null
    and reminder_7d_sent_at is null
    and reminder_72h_sent_at is null
    and reminder_1d_sent_at is null
    and unsubscribed_at is null
  );

comment on column deadline_subscriptions.reminder_1d_sent_at is
  'Semanticki "dan predaje" marker (daysLeft<=0) otkad su dodane 30d/14d/72h razine u 0036 - naziv kolone ostaje zbog manjeg diffa, ne mijenja se znacenje datuma koji sadrzi.';
