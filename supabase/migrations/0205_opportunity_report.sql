-- 0205_opportunity_report.sql
-- Opportunity Report v1: anonimni agregati nad POSTOJECIM analytics_events.
-- Ne uvodi user/session identifikator i ne cita sadrzaj rada. "event gap" nije cohort abandonment.
--
-- Novi opportunity_summary dogadjaj nosi iskljucivo brojace auto/assisted/manual/unmeasurable
-- i postojece interne dimenzije profila/vrste rada, uz istu opt-in privolu kao ostatak telemetrije.

create or replace function admin_opportunity_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with win as (
    select 1 as rn, p_from as f, p_to as t
    union all
    select 2, p_from - (p_to - p_from), p_from
  ),
  m as (
    select
      w.rn,
      (select count(*) from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t) as opportunity_events,
      (select count(*) from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t
          and jsonb_typeof(e.data->'manual') = 'number' and (e.data->>'manual')::numeric > 0) as manual_analyses,
      (select count(*) from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t
          and jsonb_typeof(e.data->'unknown') = 'number' and (e.data->>'unknown')::numeric > 0) as unmeasurable_analyses,

      (select count(*) from public.analytics_events e
        where e.event = 'profile_completed' and e.created_at >= w.f and e.created_at < w.t) as profile_events,
      (select count(*) from public.analytics_events e
        where e.event = 'profile_completed' and e.created_at >= w.f and e.created_at < w.t
          and coalesce(e.data->>'profileStatus','') <> 'verified') as nonverified_profile_events,

      (select count(*) from public.analytics_events e
        where e.event = 'repair_completed' and e.created_at >= w.f and e.created_at < w.t) as repair_runs,
      (select count(*) from public.analytics_events e
        where e.event = 'repair_completed' and e.created_at >= w.f and e.created_at < w.t
          and (
            e.data->>'kind' = 'demoted'
            or (
              jsonb_typeof(e.data->'total') = 'number'
              and jsonb_typeof(e.data->'count') = 'number'
              and (e.data->>'total')::numeric > (e.data->>'count')::numeric
            )
          )) as repair_gap_runs,
      (select coalesce(sum(greatest(
          case when jsonb_typeof(e.data->'total') = 'number' then (e.data->>'total')::numeric else 0 end
          -
          case when jsonb_typeof(e.data->'count') = 'number' then (e.data->>'count')::numeric else 0 end
        , 0)), 0)
        from public.analytics_events e
        where e.event = 'repair_completed' and e.created_at >= w.f and e.created_at < w.t) as repair_unresolved_checks,

      (select count(*) from public.analytics_events e
        where e.event = 'paywall_viewed' and e.created_at >= w.f and e.created_at < w.t) as paywall_events,
      (select count(*) from public.analytics_events e
        where e.event = 'checkout_started' and e.created_at >= w.f and e.created_at < w.t) as checkout_events,
      (select count(*) from public.analytics_events e
        where e.event = 'purchase_completed' and e.created_at >= w.f and e.created_at < w.t) as purchase_events
    from win w
  ),
  shaped as (
    select m.*,
      greatest(paywall_events - checkout_events, 0) as paywall_checkout_gap,
      greatest(checkout_events - purchase_events, 0) as checkout_purchase_gap
    from m
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'basis', 'mixed_anonymous_event_count',
    'range', jsonb_build_object(
      'from', p_from, 'to', p_to,
      'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from
    ),
    'current', (
      select jsonb_build_object(
        'opportunityEvents', opportunity_events,
        'manualAnalyses', manual_analyses,
        'unmeasurableAnalyses', unmeasurable_analyses,
        'profileEvents', profile_events,
        'nonVerifiedProfileEvents', nonverified_profile_events,
        'repairRuns', repair_runs,
        'repairGapRuns', repair_gap_runs,
        'repairUnresolvedChecks', repair_unresolved_checks,
        'paywallEvents', paywall_events,
        'checkoutEvents', checkout_events,
        'purchaseEvents', purchase_events,
        'opportunities', jsonb_build_array(
          jsonb_build_object(
            'id','manual_gap','affected',manual_analyses,'denominator',opportunity_events,
            'ratePct',case when opportunity_events > 0 then round(100.0 * manual_analyses / opportunity_events, 1) else null end,
            'basis','analysis_event'
          ),
          jsonb_build_object(
            'id','unmeasurable_gap','affected',unmeasurable_analyses,'denominator',opportunity_events,
            'ratePct',case when opportunity_events > 0 then round(100.0 * unmeasurable_analyses / opportunity_events, 1) else null end,
            'basis','analysis_event'
          ),
          jsonb_build_object(
            'id','profile_not_verified','affected',nonverified_profile_events,'denominator',profile_events,
            'ratePct',case when profile_events > 0 then round(100.0 * nonverified_profile_events / profile_events, 1) else null end,
            'basis','profile_event'
          ),
          jsonb_build_object(
            'id','repair_gap','affected',repair_gap_runs,'denominator',repair_runs,
            'ratePct',case when repair_runs > 0 then round(100.0 * repair_gap_runs / repair_runs, 1) else null end,
            'basis','repair_event'
          ),
          jsonb_build_object(
            'id','paywall_checkout_gap_proxy','affected',paywall_checkout_gap,'denominator',paywall_events,
            'ratePct',case when paywall_events > 0 then round(100.0 * paywall_checkout_gap / paywall_events, 1) else null end,
            'basis','event_count_proxy'
          ),
          jsonb_build_object(
            'id','checkout_purchase_gap_proxy','affected',checkout_purchase_gap,'denominator',checkout_events,
            'ratePct',case when checkout_events > 0 then round(100.0 * checkout_purchase_gap / checkout_events, 1) else null end,
            'basis','event_count_proxy'
          )
        )
      ) from shaped where rn = 1
    ),
    'previous', (
      select jsonb_build_object(
        'opportunityEvents', opportunity_events,
        'manualAnalyses', manual_analyses,
        'unmeasurableAnalyses', unmeasurable_analyses,
        'profileEvents', profile_events,
        'nonVerifiedProfileEvents', nonverified_profile_events,
        'repairRuns', repair_runs,
        'repairGapRuns', repair_gap_runs,
        'repairUnresolvedChecks', repair_unresolved_checks,
        'paywallEvents', paywall_events,
        'checkoutEvents', checkout_events,
        'purchaseEvents', purchase_events,
        'opportunities', jsonb_build_array(
          jsonb_build_object(
            'id','manual_gap','affected',manual_analyses,'denominator',opportunity_events,
            'ratePct',case when opportunity_events > 0 then round(100.0 * manual_analyses / opportunity_events, 1) else null end,
            'basis','analysis_event'
          ),
          jsonb_build_object(
            'id','unmeasurable_gap','affected',unmeasurable_analyses,'denominator',opportunity_events,
            'ratePct',case when opportunity_events > 0 then round(100.0 * unmeasurable_analyses / opportunity_events, 1) else null end,
            'basis','analysis_event'
          ),
          jsonb_build_object(
            'id','profile_not_verified','affected',nonverified_profile_events,'denominator',profile_events,
            'ratePct',case when profile_events > 0 then round(100.0 * nonverified_profile_events / profile_events, 1) else null end,
            'basis','profile_event'
          ),
          jsonb_build_object(
            'id','repair_gap','affected',repair_gap_runs,'denominator',repair_runs,
            'ratePct',case when repair_runs > 0 then round(100.0 * repair_gap_runs / repair_runs, 1) else null end,
            'basis','repair_event'
          ),
          jsonb_build_object(
            'id','paywall_checkout_gap_proxy','affected',paywall_checkout_gap,'denominator',paywall_events,
            'ratePct',case when paywall_events > 0 then round(100.0 * paywall_checkout_gap / paywall_events, 1) else null end,
            'basis','event_count_proxy'
          ),
          jsonb_build_object(
            'id','checkout_purchase_gap_proxy','affected',checkout_purchase_gap,'denominator',checkout_events,
            'ratePct',case when checkout_events > 0 then round(100.0 * checkout_purchase_gap / checkout_events, 1) else null end,
            'basis','event_count_proxy'
          )
        )
      ) from shaped where rn = 2
    ),
    'missingSignals', jsonb_build_array('unsupported_structure', 'fixer_noop_reason'),
    'retention', jsonb_build_array(
      jsonb_build_object(
        'table','analytics_events','retentionDays',180,
        'note','Anonimni opt-in dogadjaji; raspon stariji od ~180 dana je nepotpun, ne nula.'
      )
    )
  );
$$;

comment on function admin_opportunity_stats(timestamptz, timestamptz) is
  'Opportunity Report: anonimni agregati manual/unmeasurable/profile/repair/funnel gapova. Event-gap je proxy, nije cohort abandonment.';

revoke all on function admin_opportunity_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_opportunity_stats(timestamptz, timestamptz) to service_role;
