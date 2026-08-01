-- 0034_analytics_events.sql
-- Prvostrani (first-party) klijentski analytics dogadjaji (marketing/growth-loop mjerenje).
--
-- Klijent (trackEvent u src/ui/app.ts) je oduvijek slao dogadjaje na `productionConfig.analyticsEndpoint`,
-- ali taj endpoint je do sada bio prazan string pa nijedan zahtjev nikad nije otisao (i consent banner se
-- zato nikad nije prikazivao, isti gate). Ova migracija dodaje SINK za te dogadjaje.
--
-- PRIVATNOST: `sanitizeEventData` u app.ts vec je allowlist (ne blocklist) - samo unaprijed poznati
-- primitivni kljucevi (string/broj/bool) prezive prije slanja. Redak u ovoj tablici NEMA ip_hash, user_id
-- ni ikakav osobni identifikator: cisto anonimno mjerenje ponasanja (koji dogadjaj, koja putanja, koje
-- neosobne dimenzije poput profileId/workType/score). ip_hash se koristi SAMO prolazno u Edge funkciji za
-- rate limit (claim_ip_rate_slot, 0022) i nikad se ne upisuje uz dogadjaj.
--
-- Zato ovoj tablici NE treba fail-closed pg_cron retencija kao ip_hash/PII tablicama (0009/0011/0016/0022):
-- nema sto minimizirati u smislu GDPR osobnih podataka. Ipak dodajemo VELIKODUSNU (180 dana) povijesnu
-- ciscenje radi rasta tablice, istim cron obrascem kao ostatak baze radi dosljednosti.

create table if not exists analytics_events (
  id bigint generated always as identity primary key,
  event text not null,
  path text,
  app_version text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_time on analytics_events (event, created_at);
create index if not exists analytics_events_created on analytics_events (created_at);

-- RLS bez ijedne policy => default deny za anon i authenticated (isti obrazac kao 0011/0031).
-- Upis i citanje idu iskljucivo preko service role (Edge Function `analytics-event` za upis,
-- `admin_beta_stats()` za agregirano citanje).
alter table analytics_events enable row level security;
revoke all on table analytics_events from public, anon, authenticated;
grant select, insert on table analytics_events to service_role;

comment on table analytics_events is
  'Anonimni prvostrani analytics dogadjaji (marketing funnel). Bez ip_hash/user_id/PII; RLS default deny, samo service_role. Upisuje Edge funkcija analytics-event, cita admin_beta_stats().';

-- Prosiri postojecu admin agregatnu funkciju (0031) umjesto nove paralelne: admin panel vec ima
-- jedan endpoint/jedan JWT+admin_users gate, pa dodavanje 'analytics' kljuca ovdje znaci da postojeci
-- admin-stats Edge Function i admin-panel.ts odmah dobiju nove brojke bez novog endpointa.
create or replace function admin_beta_stats()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'repair', (
      select jsonb_build_object(
        'total',            count(*),
        'last24h',          count(*) filter (where created_at > now() - interval '24 hours'),
        'last7d',           count(*) filter (where created_at > now() - interval '7 days'),
        'distinctUsers',    count(distinct user_id),
        'failed',           count(*) filter (where status = 'failed'),
        'resultBytes',      coalesce(sum(result_bytes), 0),
        'originalBytes',    coalesce(sum(original_bytes), 0),
        'avgChanges',       round(coalesce(avg(changes_count), 0)::numeric, 1)
      ) from public.repair_jobs
    ),
    'generations24h', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
        select status, count(*) as n
        from public.report_generations
        where created_at > now() - interval '24 hours'
        group by status
      ) g
    ),
    'byWorkType', (
      select coalesce(jsonb_object_agg(work_type, n), '{}'::jsonb) from (
        select work_type, count(*) as n from public.repair_jobs group by work_type
      ) w
    ),
    'users', jsonb_build_object(
      'total',     (select count(*) from auth.users),
      'last7d',    (select count(*) from auth.users where created_at > now() - interval '7 days')
    ),
    'storage', (
      select jsonb_build_object(
        'objects', count(*),
        'bytes',   coalesce(sum((metadata->>'size')::bigint), 0)
      ) from storage.objects where bucket_id = 'repair'
    ),
    'analytics', (
      select jsonb_build_object(
        'last24h', (select count(*) from public.analytics_events where created_at > now() - interval '24 hours'),
        'last7d',  (select count(*) from public.analytics_events where created_at > now() - interval '7 days'),
        'byEvent7d', (
          select coalesce(jsonb_object_agg(event, n), '{}'::jsonb) from (
            select event, count(*) as n
            from public.analytics_events
            where created_at > now() - interval '7 days'
            group by event
            order by count(*) desc
            limit 20
          ) e
        )
      )
    )
  );
$$;

comment on function admin_beta_stats() is
  'Read-only agregati bete za admin-stats Edge funkciju. Vraca SAMO brojeve, nikad sadrzaj ni PII.';

revoke all on function admin_beta_stats() from public, anon, authenticated;
grant execute on function admin_beta_stats() to service_role;

-- Storage-higijena (ne GDPR-obavezna, vidi komentar na vrhu): drzi 180 dana, dovoljno za
-- mjesecne/kvartalne trendove u admin panelu.
create or replace function purge_analytics_events(retention_days int default 180)
returns integer
language sql
set search_path = public
as $$
  with del as (
    delete from analytics_events
     where created_at < now() - make_interval(days => retention_days)
    returning 1
  )
  select count(*)::int from del;
$$;

revoke all on function purge_analytics_events(int) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron nije dostupan: purge_analytics_events() se ne moze zakazati. Ukljuci pg_cron ekstenziju pa ponovno pokreni migraciju.';
  end if;
  begin
    perform cron.unschedule('purge-analytics-events');
  exception when others then
    null; -- job jos ne postoji
  end;
  perform cron.schedule('purge-analytics-events', '20 5 * * *', 'select purge_analytics_events(180);');
end $$;
