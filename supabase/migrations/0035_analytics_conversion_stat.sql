-- 0035_analytics_conversion_stat.sql
-- Dodaje "broj koji bih svaki dan gledao" (marketinski plan, tocka 32): omjer placenih
-- kupnji na 100 zavrsenih besplatnih analiza, u zadnjih 7 dana. Prosiruje POSTOJECU
-- admin_beta_stats() (isti obrazac kao 0034, koja je prosirila 0031) umjesto nove
-- paralelne funkcije/endpointa - admin-panel.ts vec renderira sto god ova funkcija vrati.
--
-- Izvor dogadjaja: analytics_events.event = 'analysis_completed' / 'purchase_completed'
-- (trackEvent u src/ui/app.ts). ratePct je null (ne 0) kad nema nijedne analize u prozoru,
-- da se prazno stanje ne cita kao "0% konverzija".

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
        ),
        'conversion7d', (
          select jsonb_build_object(
            'analysisCompleted', coalesce(count(*) filter (where event = 'analysis_completed'), 0),
            'purchaseCompleted', coalesce(count(*) filter (where event = 'purchase_completed'), 0),
            'ratePct', case when count(*) filter (where event = 'analysis_completed') = 0 then null
              else round(
                100.0 * count(*) filter (where event = 'purchase_completed')
                / count(*) filter (where event = 'analysis_completed'), 1
              )
            end
          )
          from public.analytics_events
          where created_at > now() - interval '7 days'
            and event in ('analysis_completed', 'purchase_completed')
        )
      )
    )
  );
$$;

comment on function admin_beta_stats() is
  'Read-only agregati bete za admin-stats Edge funkciju. Vraca SAMO brojeve, nikad sadrzaj ni PII. analytics.conversion7d = placene kupnje na zavrsene analize, zadnjih 7 dana.';

revoke all on function admin_beta_stats() from public, anon, authenticated;
grant execute on function admin_beta_stats() to service_role;
