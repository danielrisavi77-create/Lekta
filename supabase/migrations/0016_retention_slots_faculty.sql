-- 0016_retention_slots_faculty.sql
-- Lekta: retencija/anonimizacija za document_slots i faculty_requests (audit data-flow-04, P0-04-2).
-- Dopunjava postojecu retenciju: 0009 (report_generations, DELETE >90d) i 0011
-- (faculty_requests.ip_hash, nuliranje >30d). Nacelo minimizacije pohrane (GDPR cl. 5(1)(e)):
-- PII se ANONIMIZIRA, a red OSTAJE radi agregata (v_tier_share, faculty_request_counts) i FK
-- integriteta. Obrazac je identican 0009/0011: `language sql` BEZ security definer (cron radi kao
-- postgres/superuser pa svejedno smije UPDATE i zaobilazi RLS), `set search_path = public`,
-- pg_extension guard oko pg_cron, te revoke execute from public (0015, least privilege).
-- Sve idempotentno (create or replace + unschedule-u-try/schedule).
--
-- Ovisnosti i prozori (mapirano workflowom p0-04-retention-design):
--  - document_slots: NE brisi red (report_generations.slot_id i guarantee_claims.slot_id su
--    ON DELETE SET NULL pa bi DELETE samo unistio kontekst za rucnu rezoluciju); anonimiziraj PII.
--  - Uvjet kljuci na STUPAC slot_expires_at, NIKAD na fiksni broj dana od bound_at/kupnje, jer
--    'Do obrane' SKU nosi slot_window_days = 120 (buduci) uz trenutne 7/14.
--  - report_generations (0009 90d) i faculty_requests.ip_hash (0011 30d) se NE diraju ovdje;
--    90d je i gornja granica referral anti-fraud usporedbe ip_hash i ne smije se skratiti.

-- ---------------------------------------------------------------------------
-- 1) document_slots: anonimiziraj otisak (ime autora + naslov + poglavlja) i label TEK nakon
--    isteka slota + margina. Zadrzava sectionCount, bound_at, coverage_tier, work_type i FK.
--
--    Prozori koje uvjet NE SMIJE razbiti:
--      - re-check: generate-report chita .gt('slot_expires_at', now), zavrsava na slot_expires_at.
--      - garancija (podnosenje): bound_at + 30d (GUARANTEE_WINDOW_DAYS, src/report/guarantee.ts).
--    Kako je slot_window_days >= 7 (slot_expires_at >= bound_at + 7), vrijedi
--    bound_at + 30 < slot_expires_at + 30, pa `slot_expires_at < now() - 30d` jamci da su i
--    re-check i garancijski rok istekli. Dodatno: preskoci slot s nerijesenim (pending)
--    garancijskim zahtjevom, da admin zadrzi otisak/label/tier za rucnu prosudbu povrata.
create or replace function purge_document_slots(retention_days int default 30)
returns integer
language sql
set search_path = public
as $$
  with upd as (
    update document_slots ds
       set fingerprint = ds.fingerprint - 'authorNorm' - 'titleNorm' - 'headings',
           label = null
     where ds.slot_expires_at < now() - make_interval(days => retention_days)
       and (ds.fingerprint ?| array['authorNorm', 'titleNorm', 'headings'] or ds.label is not null)
       and not exists (
         select 1
           from guarantee_claims gc
          where gc.slot_id = ds.id
            and gc.status = 'pending'
       )
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke execute on function purge_document_slots(int) from public;

-- ---------------------------------------------------------------------------
-- 2) faculty_requests: anonimiziraj e-mail (jedini PII kontakt) kad vise nije funkcionalno
--    potreban. Red se NE brise (isto nacelo kao 0011 ip_hash): agregat (faculty_id, program_id,
--    work_type, created_at) je signal potraznje za discovery i mora prezivjeti. E-mail sluzi za
--    JEDNU obavijest o pokrivenosti (notify-covered.mjs). Dva okidaca:
--      (a) obavijest poslana (notified_at) prije vise od notified_grace_days: posao gotov;
--      (b) red stariji od retention_days a nikad obavijesten: gornji rok cuvanja kontakta.
--    Napomena (tradeoff): faculty_request_counts.unique_requesters/with_email racunaju se iz
--    email stupca pa se nuliranjem degradiraju; total_requests i celije ostaju tocni. Vjernost
--    tih dviju metrika je zaseban discovery-owner zadatak (requester_hash), ne blokira privatnost.
create or replace function purge_faculty_request_email(
  retention_days int default 90,
  notified_grace_days int default 7
)
returns integer
language sql
set search_path = public
as $$
  with upd as (
    update faculty_requests
       set email = null
     where email is not null
       and (
         (notified_at is not null and notified_at < now() - make_interval(days => notified_grace_days))
         or created_at < now() - make_interval(days => retention_days)
       )
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke execute on function purge_faculty_request_email(int, int) from public;

-- ---------------------------------------------------------------------------
-- pg_cron: zakazi dnevno, stagger POSLIJE postojecih jobova (0009 '0 3', 0011 '15 3') da se ne
-- pregaze. Guard oko pg_extension: migracija NE pada bez pg_cron (lokalni Supabase/CI).
-- unschedule-u-try + schedule cini re-run idempotentnim (zamijeni job, ne dupliraj). Ako pg_cron
-- nije ukljucen na produkciji, ukljuci ga pa ponovno primijeni ovaj blok (kao za 0009/0011).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('purge-document-slots');
    exception when others then
      null; -- job jos ne postoji
    end;
    perform cron.schedule('purge-document-slots', '30 3 * * *', 'select purge_document_slots(30);');

    begin
      perform cron.unschedule('purge-faculty-request-email');
    exception when others then
      null; -- job jos ne postoji
    end;
    perform cron.schedule('purge-faculty-request-email', '45 3 * * *', 'select purge_faculty_request_email(90, 7);');
  end if;
end $$;
