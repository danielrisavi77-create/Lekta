-- 0029_repair_gen_status_free.sql
-- Prosiruje report_generations.status za repair-docx tok:
--  * 'free'         -> besplatna beta (REPAIR_FREE_MODE): posao bez slota, redak sluzi rate-limit brojanju.
--  * 'repair_failed'-> applyFixers je pao (repair-docx to vec logira, ali stari CHECK ga nije dopustao -> tihi fail).
-- Postojeci CHECK je dopustao samo recheck/new_slot/denied/rate_limited (0001_monetization).
alter table report_generations drop constraint if exists report_generations_status_check;
alter table report_generations add constraint report_generations_status_check
  check (status in ('recheck', 'new_slot', 'denied', 'rate_limited', 'free', 'repair_failed'));
