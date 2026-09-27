-- 0208_opportunity_report_v3.sql
-- V3 nadogradnja funkcije iz 0205: scoped gapovi + repair no-op parity.
-- 0205 se namjerno ne prepisuje jer stacked PR moze doci nakon sto je 0205 vec primijenjen.
-- Broj 0208 (ne 0206): 0206 koriste druge grane istog izvjestaja, 0207 je rezerviran za M2 (T77).
-- Opportunity Report v1/v2: anonimni agregati nad POSTOJECIM analytics_events.
-- Ne uvodi user/session identifikator i ne cita sadrzaj rada. "event gap" nije cohort abandonment.
--
-- opportunity_summary: jedan dijagnosticki dogadjaj po uspjesnoj analizi, samo brojaci.
-- analysis_structure_gap: agregirani skipovi poznatih strukturiranih analizatora
-- (profileId + workType + category + sigurni enum kind + count), bez izvornog razloga/teksta.
-- repair_result_ok: neovisni brojac uspjesnih repair rezultata; emitira ga pozivatelj, ne emitter.
-- repair_noop_summary: jedan anonimni ukupni count po repair rezultatu, kao parity izvor.
-- repair_noop_reason: agregirani FixerNoOpReason (profileId + workType + kind + count), bez ruleId-a.
--
-- Parity se provjerava ukupno I po (profileId, workType): isti ukupni zbroj s krivo pripisanim
-- profilom nije zdravo mjerenje (Codex V3-01 na #163).
--
-- V3 epoha je GLOBALNA: prvi repair_result_ok ili repair_noop_summary ikad. Od nje nadalje svaki
-- repair_result_ok mora imati svoj summary. Epoha po prozoru bi prozor bez ijednog summaryja
-- proglasila zdravim bas kad je summary utihnuo (Codex V3-02). repair_completed nije usporediv
-- brojac: salje se tek nakon provjere ponovnom analizom, a summary vec na uspjesan rezultat.
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
  v3 as (
    select min(e.created_at) as epoch
    from public.analytics_events e
    where e.event in ('repair_result_ok', 'repair_noop_summary')
  ),
  win_v3 as (
    select
      w.*,
      case
        when v.epoch is null then w.t
        else least(greatest(w.f, v.epoch), w.t)
      end as repair_v3_from
    from win w
    cross join v3 v
  ),
  scoped as (
    select w.rn, 'structure'::text as surface, x.profile_id, x.work_type, x.summary, x.breakdown
    from win_v3 w
    cross join lateral (
      select
        coalesce(s.profile_id, b.profile_id) as profile_id,
        coalesce(s.work_type, b.work_type) as work_type,
        coalesce(s.n, 0) as summary,
        coalesce(b.n, 0) as breakdown
      from (
        select
          coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
          coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
          sum(case when jsonb_typeof(e.data->'structureGaps') = 'number'
            then greatest((e.data->>'structureGaps')::numeric, 0) else 0 end) as n
        from public.analytics_events e
        where e.event = 'opportunity_summary' and e.created_at >= w.f and e.created_at < w.t
        group by 1, 2
      ) s
      full join (
        select
          coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
          coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
          sum(case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0) else 0 end) as n
        from public.analytics_events e
        where e.event = 'analysis_structure_gap' and e.created_at >= w.f and e.created_at < w.t
        group by 1, 2
      ) b on b.profile_id = s.profile_id and b.work_type = s.work_type
    ) x
    union all
    select w.rn, 'repair_noop_items'::text, x.profile_id, x.work_type, x.summary, x.breakdown
    from win_v3 w
    cross join lateral (
      select
        coalesce(s.profile_id, b.profile_id) as profile_id,
        coalesce(s.work_type, b.work_type) as work_type,
        coalesce(s.n, 0) as summary,
        coalesce(b.n, 0) as breakdown
      from (
        select
          coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
          coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
          sum(case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0) else 0 end) as n
        from public.analytics_events e
        where e.event = 'repair_noop_summary' and e.created_at >= w.repair_v3_from and e.created_at < w.t
        group by 1, 2
      ) s
      full join (
        select
          coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
          coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
          sum(case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0) else 0 end) as n
        from public.analytics_events e
        where e.event = 'repair_noop_reason' and e.created_at >= w.repair_v3_from and e.created_at < w.t
        group by 1, 2
      ) b on b.profile_id = s.profile_id and b.work_type = s.work_type
    ) x
    union all
    select w.rn, 'repair_attempts'::text, x.profile_id, x.work_type, x.summary, x.breakdown
    from win_v3 w
    cross join lateral (
      select
        coalesce(s.profile_id, b.profile_id) as profile_id,
        coalesce(s.work_type, b.work_type) as work_type,
        coalesce(s.n, 0) as summary,
        coalesce(b.n, 0) as breakdown
      from (
        select
          coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
          coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
          count(*)::numeric as n
        from public.analytics_events e
        where e.event = 'repair_noop_summary' and e.created_at >= w.repair_v3_from and e.created_at < w.t
        group by 1, 2
      ) s
      full join (
        select
          coalesce(nullif(e.data->>'profileId',''), 'unknown') as profile_id,
          coalesce(nullif(e.data->>'workType',''), 'unknown') as work_type,
          count(*)::numeric as n
        from public.analytics_events e
        where e.event = 'repair_result_ok' and e.created_at >= w.repair_v3_from and e.created_at < w.t
        group by 1, 2
      ) b on b.profile_id = s.profile_id and b.work_type = s.work_type
    ) x
  ),
  m as (
    select
      w.rn,
      w.f,
      w.t,
      w.repair_v3_from,

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
        where e.event = 'repair_result_ok'
          and e.created_at >= w.repair_v3_from
          and e.created_at < w.t) as repair_attempt_events,
      (select count(*) from public.analytics_events e
        where e.event = 'repair_noop_summary'
          and e.created_at >= w.repair_v3_from
          and e.created_at < w.t) as repair_noop_summary_events,
      (select coalesce(sum(
          case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0)
            else 0 end
        ), 0)
        from public.analytics_events e
        where e.event = 'repair_noop_summary'
          and e.created_at >= w.repair_v3_from
          and e.created_at < w.t) as repair_noop_summary_items,
      (select coalesce(sum(
          case when jsonb_typeof(e.data->'count') = 'number'
            then greatest((e.data->>'count')::numeric, 0)
            else 0 end
        ), 0)
        from public.analytics_events e
        where e.event = 'repair_noop_reason'
          and e.created_at >= w.repair_v3_from
          and e.created_at < w.t) as repair_noop_items,

      (select count(*) from public.analytics_events e
        where e.event = 'paywall_viewed' and e.created_at >= w.f and e.created_at < w.t) as paywall_events,
      (select count(*) from public.analytics_events e
        where e.event = 'checkout_started' and e.created_at >= w.f and e.created_at < w.t) as checkout_events,
      (select count(*) from public.analytics_events e
        where e.event = 'purchase_completed' and e.created_at >= w.f and e.created_at < w.t) as purchase_events
    from win_v3 w
  ),
  shaped as (
    select m.*,
      greatest(paywall_events - checkout_events, 0) as paywall_checkout_gap,
      greatest(checkout_events - purchase_events, 0) as checkout_purchase_gap
    from m
  ),
  bucket as (
    select sh.rn, jsonb_build_object(
      'analysisCompletedEvents', sh.analysis_completed_events,
      'opportunityEvents', sh.opportunity_events,
      'manualAnalyses', sh.manual_analyses,
      'unmeasurableAnalyses', sh.unmeasurable_analyses,
      'structureGapAnalyses', sh.structure_gap_analyses,
      'structureGapItems', sh.structure_gap_items,
      'structureBreakdownItems', sh.structure_breakdown_items,
      'profileEvents', sh.profile_events,
      'nonVerifiedProfileEvents', sh.nonverified_profile_events,
      'repairRuns', sh.repair_runs,
      'repairGapRuns', sh.repair_gap_runs,
      'repairUnresolvedChecks', sh.repair_unresolved_checks,
      'repairAttemptEvents', sh.repair_attempt_events,
      'repairNoOpSummaryEvents', sh.repair_noop_summary_events,
      'repairNoOpSummaryItems', sh.repair_noop_summary_items,
      'repairNoOpItems', sh.repair_noop_items,
      'paywallEvents', sh.paywall_events,
      'checkoutEvents', sh.checkout_events,
      'purchaseEvents', sh.purchase_events,
      'opportunities', jsonb_build_array(
        jsonb_build_object(
          'id','manual_gap','affected',sh.manual_analyses,'denominator',sh.opportunity_events,
          'ratePct',case when sh.opportunity_events > 0 then round(100.0 * sh.manual_analyses / sh.opportunity_events, 1) else null end,
          'basis','analysis_event'
        ),
        jsonb_build_object(
          'id','unmeasurable_gap','affected',sh.unmeasurable_analyses,'denominator',sh.opportunity_events,
          'ratePct',case when sh.opportunity_events > 0 then round(100.0 * sh.unmeasurable_analyses / sh.opportunity_events, 1) else null end,
          'basis','analysis_event'
        ),
        jsonb_build_object(
          'id','structure_gap','affected',sh.structure_gap_analyses,'denominator',sh.opportunity_events,
          'ratePct',case when sh.opportunity_events > 0 then round(100.0 * sh.structure_gap_analyses / sh.opportunity_events, 1) else null end,
          'basis','analysis_event'
        ),
        jsonb_build_object(
          'id','profile_not_verified','affected',sh.nonverified_profile_events,'denominator',sh.profile_events,
          'ratePct',case when sh.profile_events > 0 then round(100.0 * sh.nonverified_profile_events / sh.profile_events, 1) else null end,
          'basis','profile_event'
        ),
        jsonb_build_object(
          'id','repair_gap','affected',sh.repair_gap_runs,'denominator',sh.repair_runs,
          'ratePct',case when sh.repair_runs > 0 then round(100.0 * sh.repair_gap_runs / sh.repair_runs, 1) else null end,
          'basis','repair_event'
        ),
        jsonb_build_object(
          'id','paywall_checkout_gap_proxy','affected',sh.paywall_checkout_gap,'denominator',sh.paywall_events,
          'ratePct',case when sh.paywall_events > 0 then round(100.0 * sh.paywall_checkout_gap / sh.paywall_events, 1) else null end,
          'basis','event_count_proxy'
        ),
        jsonb_build_object(
          'id','checkout_purchase_gap_proxy','affected',sh.checkout_purchase_gap,'denominator',sh.checkout_events,
          'ratePct',case when sh.checkout_events > 0 then round(100.0 * sh.checkout_purchase_gap / sh.checkout_events, 1) else null end,
          'basis','event_count_proxy'
        )
      ),
      'scopeParityMismatches', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'surface', sc.surface, 'profileId', sc.profile_id, 'workType', sc.work_type,
          'summary', sc.summary, 'breakdown', sc.breakdown
        ) order by sc.surface, sc.profile_id, sc.work_type), '[]'::jsonb)
        from scoped sc
        where sc.rn = sh.rn and sc.summary <> sc.breakdown
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
          where e.event = 'analysis_structure_gap' and e.created_at >= sh.f and e.created_at < sh.t
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
          where e.event = 'repair_noop_reason'
            and e.created_at >= sh.repair_v3_from
            and e.created_at < sh.t
          group by 1, 2, 3
        ) x
      )
    ) as j
    from shaped sh
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'basis', 'mixed_anonymous_event_count',
    'range', jsonb_build_object(
      'from', p_from, 'to', p_to,
      'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from
    ),
    'current', (select b.j from bucket b where b.rn = 1),
    'previous', (select b.j from bucket b where b.rn = 2),
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
  'Opportunity Report: anonimni agregati manual/unmeasurable/known-structure/profile/repair/funnel gapova uz parity ukupno i po profilu/vrsti rada. Event-gap je proxy, nije cohort abandonment; globalni inspectionCoverage je odvojen i jos nije mjeren.';

revoke all on function admin_opportunity_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_opportunity_stats(timestamptz, timestamptz) to service_role;
