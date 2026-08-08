-- 0037_admin_dashboard_indexes.sql
-- Lekta Control Center (admin.html): indeksi za date-range agregate preko svih korisnika.
--
-- Postojeci indeksi na ovim tablicama vode s user_id (korisnicki upiti - "moji popravci",
-- "moji slotovi"), ne s created_at/bound_at. Admin agregati u 0038 filtriraju SAMO po
-- vremenskom rasponu preko SVIH korisnika ("zadnjih 30 dana"), pa bi bez ovoga svaki upit
-- radio seq scan cijele tablice. Cisto aditivno (IF NOT EXISTS), ne dira shemu ni RLS.
--
-- analytics_events (0034: analytics_events_event_time, analytics_events_created) i
-- faculty_requests (0011: faculty_requests_created) vec imaju usable indekse na created_at -
-- namjerno se ovdje ne diraju.
--
-- document_slots dobiva "include" (coverage_tier, work_type) jer je jedina tablica u ovom
-- skupu s NEOGRANICENOM, nikad obrisanom poviješcu (0016 anonimizira PII, ne brise redak) -
-- najveci dugorocni kandidat za index-only scan na Usage/Coverage agregatima.

create index if not exists entitlements_created_idx on entitlements (created_at);

create index if not exists document_slots_bound_idx
  on document_slots (bound_at) include (coverage_tier, work_type);

create index if not exists report_generations_created_idx
  on report_generations (created_at) include (status);

create index if not exists repair_jobs_created_idx
  on repair_jobs (created_at) include (status, work_type);

create index if not exists preflight_kpi_created_idx on preflight_kpi (created_at);
