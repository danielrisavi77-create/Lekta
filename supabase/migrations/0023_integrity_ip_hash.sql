-- 0023_integrity_ip_hash.sql
-- AUD-22 (SEC-01): integrity-check 'full' nema per-IP kvotu. Dodaje se per-IP identitet na
-- integrity_checks + potporni indeks za per-IP analizu po danu. Sama ENFORCEMENT (atomicni
-- per-IP dnevni cap) ide kroz claim_ip_rate_slot('integrity_full', ip_hash, cap) iz 0022;
-- ovaj stupac dodatno daje trajnu per-IP atribuciju svakog reda (forenzika / rucni pregled
-- zlouporabe) i omogucuje ad-hoc COUNT po IP-ju i danu preko indeksa nize.
--
-- ip_hash je SOLJEN sha (hashClientIpSalted u Edge), pseudonim, ne sirovi IP. Isto GDPR nacelo
-- kao preflight_checks.ip_hash (0019) i report_generations.ip_hash (0001).
--
-- Idempotentno: add column if not exists + create index if not exists. Postojeci redovi dobiju
-- null (nepoznat IP za povijesne provjere), sto je ispravno.

alter table integrity_checks add column if not exists ip_hash text;

-- Per-IP COUNT po danu (ad-hoc analiza zlouporabe; enforcement je atomican u 0022).
create index if not exists integrity_checks_ip_idx
  on integrity_checks (ip_hash, created_at desc);

comment on column integrity_checks.ip_hash is
  'SOLJEN sha klijentskog IP-ja (ne sirovi IP). Per-IP atribucija reda; atomicni per-IP dnevni cap radi claim_ip_rate_slot (0022, scope=integrity_full).';
