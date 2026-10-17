-- Count storage-failed repairs toward the bounded uncounted-attempt cap while keeping the
-- committed billing/report record intact for same-request recovery.
alter table public.repair_attempt_log
  drop constraint if exists repair_attempt_log_outcome_check;
alter table public.repair_attempt_log
  add constraint repair_attempt_log_outcome_check
  check (outcome in ('pending', 'no_change', 'integrity_failed', 'delivery_failed'));
