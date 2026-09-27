-- 0206_opportunity_report_v3.sql
-- V3 nadogradnja funkcije iz 0205: scoped gapovi + repair no-op parity.
-- 0205 se namjerno ne prepisuje jer stacked PR moze doci nakon sto je 0205 vec primijenjen.
-- Opportunity Report v1/v2: anonimni agregati nad POSTOJECIM analytics_events.
-- Ne uvodi user/session identifikator i ne cita sadrzaj rada. "event gap" nije cohort abandonment.
--
-- opportunity_summary: jedan dijagnosticki dogadjaj po uspjesnoj analizi, samo brojaci.
-- analysis_structure_gap: agregirani skipovi poznatih strukturiranih analizatora
-- (profileId + workType + category + sigurni enum kind + count), bez izvornog razloga/teksta.
-- repair_noop_summary: jedan anonimni ukupni count po repair rezultatu, kao parity izvor.
-- repair_noop_reason: agregirani FixerNoOpReason (profileId + workType + kind + count), bez ruleId-a.
--
-- Globalni inspectionCoverage iz T64 i dalje je zasebna, jos nemjerena povrsina: ovaj izvjestaj
-- vidi samo skipove koje postojeci strukturirani analizatori vec eksplicitno biljeze.

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
      w.f,
      w.t,

      (select count(*) from public.analytics_events e
        where e.event = 'analysis_completed' and e.created_at >= w.f and e.created_at < w.t) as analysis_completed_events,
      (select count(*) from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t) as opportunity_events,
      (select count(*) from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t
          and jsonb_typeof(e.data->'manual') = 'number' and (e.data->>'manual')::numeric > 0) as manual_analyses,
      (select count(*) from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t
          and jsonb_typeof(e.data->'unknown') = 'number' and (e.data->>'unknown')::numeric > 0) as unmeasurable_analyses,
      (select count(*) from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t
          and jsonb_typeof(e.data->'structureGaps') = 'number' and (e.data->>'structureGaps')::numeric > 0) as structure_gap_analyses,
      (select coalesce(sum(
          case when jsonb_typeof(e.data->'structureGaps') = 'number'
            then greatest((e.data->>'structureGaps')::numeric, 0)
            else 0 end
        ), 0)
        from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t) as structure_gap_items,
      (select coalesce(sum(
          case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0)
            else 0 end
        ), 0)
        from public.analytics_events e
        where e.event = 'analysis_structure_gap' and e.created_at >= w.f and e.created_at < w.t) as structure_breakdown_items,

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
        where e.event = 'repair_noop_summary' and e.created_at >= w.f and e.created_at < w.t) as repair_noop_summary_events,
      (select coalesce(sum(
          case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0)
            else 0 end
        ), 0)
        from public.analytics_events e
        where e.event = 'repair_noop_summary' and e.created_at >= w.f and e.created_at < w.t) as repair_noop_summary_items,
      (select coalesce(sum(
          case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0)
            else 0 end
        ), 0)
        from public.analytics_events e
        where e.event = 'repair_noop_reason' and e.created_at >= w.f and e.created_at < w.t) as repair_noop_items,

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
        'analysisCompletedEvents', analysis_completed_events,
        'opportunityEvents', opportunity_events,
        'manualAnalyses', manual_analyses,
        'unmeasurableAnalyses', unmeasurable_analyses,
        'structureGapAnalyses', structure_gap_analyses,
        'structureGapItems', structure_gap_items,
        'structureBreakdownItems', structure_breakdown_items,
        'profileEvents', profile_events,
        'nonVerifiedProfileEvents', nonverified_profile_events,
        'repairRuns', repair_runs,
        'repairGapRuns', repair_gap_runs,
        'repairUnresolvedChecks', repair_unresolved_checks,
        'repairNoOpSummaryEvents', repair_noop_summary_events,
        'repairNoOpSummaryItems', repair_noop_summary_items,
        'repairNoOpItems', repair_noop_items,
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
            'id','structure_gap','affected',structure_gap_analyses,'denominator',opportunity_events,
            'ratePct',case when opportunity_events > 0 then round(100.0 * structure_gap_analyses / opportunity_events, 1) else null end,
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
        ),
        'structureGaps', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'profileId', x.profile_id, 'workType', x.work_type,
            'category', x.category, 'kind', x.kind, 'count', x.n
          ) order by x.n desc, x.profile_id, x.work_type, x.category, x.kind), '[]'::jsonb)
          from (
            select
              coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
              coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
              coalesce(e.data->>'category', 'other') as category,
              coalesce(e.data->>'kind', 'other') as kind,
              sum(case when jsonb_typeof(e.data->'count') = 'number'
                then greatest((e.data->>'count')::numeric, 0) else 0 end)::bigint as n
            from public.analytics_events e
            where e.event = 'analysis_structure_gap' and e.created_at >= f and e.created_at < t
            group by 1, 2, 3, 4
          ) x
        ),
        'repairNoOpReasons', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'profileId', x.profile_id, 'workType', x.work_type,
            'kind', x.kind, 'count', x.n
          ) order by x.n desc, x.profile_id, x.work_type, x.kind), '[]'::jsonb)
          from (
            select
              coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
              coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
              coalesce(e.data->>'kind', 'unclassified') as kind,
              sum(case when jsonb_typeof(e.data->'count') = 'number'
                then greatest((e.data->>'count')::numeric, 0) else 0 end)::bigint as n
            from public.analytics_events e
            where e.event = 'repair_noop_reason' and e.created_at >= f and e.created_at < t
            group by 1, 2, 3
          ) x
        )
      ) from shaped where rn = 1
    ),
    'previous', (
      select jsonb_build_object(
        'analysisCompletedEvents', analysis_completed_events,
        'opportunityEvents', opportunity_events,
        'manualAnalyses', manual_analyses,
        'unmeasurableAnalyses', unmeasurable_analyses,
        'structureGapAnalyses', structure_gap_analyses,
        'structureGapItems', structure_gap_items,
        'structureBreakdownItems', structure_breakdown_items,
        'profileEvents', profile_events,
        'nonVerifiedProfileEvents', nonverified_profile_events,
        'repairRuns', repair_runs,
        'repairGapRuns', repair_gap_runs,
        'repairUnresolvedChecks', repair_unresolved_checks,
        'repairNoOpSummaryEvents', repair_noop_summary_events,
        'repairNoOpSummaryItems', repair_noop_summary_items,
        'repairNoOpItems', repair_noop_items,
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
            'id','structure_gap','affected',structure_gap_analyses,'denominator',opportunity_events,
            'ratePct',case when opportunity_events > 0 then round(100.0 * structure_gap_analyses / opportunity_events, 1) else null end,
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
        ),
        'structureGaps', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'profileId', x.profile_id, 'workType', x.work_type,
            'category', x.category, 'kind', x.kind, 'count', x.n
          ) order by x.n desc, x.profile_id, x.work_type, x.category, x.kind), '[]'::jsonb)
          from (
            select
              coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
              coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
              coalesce(e.data->>'category', 'other') as category,
              coalesce(e.data->>'kind', 'other') as kind,
              sum(case when jsonb_typeof(e.data->'count') = 'number'
                then greatest((e.data->>'count')::numeric, 0) else 0 end)::bigint as n
            from public.analytics_events e
            where e.event = 'analysis_structure_gap' and e.created_at >= f and e.created_at < t
            group by 1, 2, 3, 4
          ) x
        ),
        'repairNoOpReasons', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'profileId', x.profile_id, 'workType', x.work_type,
            'kind', x.kind, 'count', x.n
          ) order by x.n desc, x.profile_id, x.work_type, x.kind), '[]'::jsonb)
          from (
            select
              coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
              coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
              coalesce(e.data->>'kind', 'unclassified') as kind,
              sum(case when jsonb_typeof(e.data->'count') = 'number'
                then greatest((e.data->>'count')::numeric, 0) else 0 end)::bigint as n
            from public.analytics_events e
            where e.event = 'repair_noop_reason' and e.created_at >= f and e.created_at < t
            group by 1, 2, 3
          ) x
        )
      ) from shaped where rn = 2
    ),
    'missingSignals', jsonb_build_array('inspection_coverage_global'),
    'retention', jsonb_build_array(
      jsonb_build_object(
        'table','analytics_events','retentionDays',180,
        'note','Anonimni opt-in dogadjaji; raspon stariji od ~180 dana je nepotpun, ne nula.'
      )
    )
  );
$$;

comment on function admin_opportunity_stats(timestamptz, timestamptz) is
  'Opportunity Report: anonimni agregati manual/unmeasurable/known-structure/profile/repair/funnel gapova. Event-gap je proxy, nije cohort abandonment; globalni inspectionCoverage je odvojen i jos nije mjeren.';

revoke all on function admin_opportunity_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_opportunity_stats(timestamptz, timestamptz) to service_role;
