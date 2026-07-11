-- 0014_slot_reminder_marker.sql
-- Per-slot marker za podsjetnik na istek slota (P0-02a / security-01).
--
-- Prije ovoga slot grana send-reminders funkcije nije biljezila da je podsjetnik
-- poslan, pa je ponovljeni cron poziv slao iste e-mailove opet. Marker se upisuje
-- nakon uspjesnog slanja; upit u funkciji filtrira `slot_expiry_reminder_sent_at
-- is null` pa je slanje idempotentno.
--
-- Pisanje ide iskljucivo preko service role (send-reminders). RLS na
-- document_slots (0001) i dalje dopusta klijentu samo SELECT vlastitih redaka;
-- nema update politike za anon/authenticated pa klijent ne moze dirati marker.

alter table document_slots
  add column if not exists slot_expiry_reminder_sent_at timestamptz;

comment on column document_slots.slot_expiry_reminder_sent_at is
  'Kad je poslan podsjetnik na istek slota (idempotencija cron poziva). Pise samo service role u send-reminders.';
