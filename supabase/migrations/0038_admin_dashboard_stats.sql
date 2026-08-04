-- 0038_admin_dashboard_stats.sql
-- Lekta Control Center (admin.html): 6 novih parametriziranih admin agregata.
--
-- admin_beta_stats() (0031, prosiren 0034/0035) se NE dira - stari ?admin=1 modal ga i dalje
-- zove nepromijenjeno dok traje prijelaz na admin.html. Ovih 6 funkcija je zaseban, svjesno
-- projektiran v1 (jedna migracija, ne sest odvojenih dodataka kroz vrijeme kao 0031->0034->0035),
-- jer sve dijele isti oblik odgovora i sigurnosni obrazac.
--
-- OBRAZAC (identican kroz svih 6): language sql, security definer, set search_path = '',
-- svaka referenca na tablicu shema-kvalificirana (public./auth.), revoke all from
-- public/anon/authenticated, grant execute samo service_role - identicno admin_beta_stats().
-- Svaka prima (p_from timestamptz, p_to timestamptz, ...) i vraca:
--   { generatedAt, range:{from,to,previousFrom,previousTo}, current:{...}, previous:{...},
--     retention:[{table,retentionDays,note}] }
-- "previous" dolazi iz ISTOG poziva (prethodni prozor se trivijalno izvodi iz p_from/p_to),
-- ne dodatnim round-tripom. "retention" je ugradjen kao doslovan podatak u odgovoru (ne samo
-- komentar) da 90-dnevni rez na report_generations ne moze biti tiho progutan u UI-ju.
--
-- VAZNO ZA ODRZAVANJE: kad brojis kroz "win LEFT JOIN tablica", koristi count(<pk_kolona>)
-- ili count(*) FILTER (WHERE <predikat na desnoj strani joina>), NIKAD goli count(*) bez
-- filtera - obican LEFT JOIN + count(*) vraca 1 umjesto 0 za prazan prozor jer join svejedno
-- emitira jedan all-NULL redak. Primijenjeno dosljedno u svih 6 funkcija ispod.

-- ============================================================================================
-- admin_overview_stats: KPI red + headline funnel (4 fiksna koraka) + revenue snapshot
-- ============================================================================================

create or replace function admin_overview_stats(p_from timestamptz, p_to timestamptz)
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
  agg as (
    select
      r.rn,
      (select count(*) from auth.users u where u.created_at >= r.f and u.created_at < r.t) as new_users,
      (select count(*) from public.analytics_events e where e.event = 'analysis_completed' and e.created_at >= r.f and e.created_at < r.t) as analyses_completed,
      (select count(*) from public.analytics_events e where e.event = 'purchase_completed' and e.created_at >= r.f and e.created_at < r.t) as purchases_completed,
      (select coalesce(sum(p.price_eur), 0) from public.entitlements e join public.products p on p.id = e.product_id
        where e.status = 'active' and e.provider <> 'internal' and e.created_at >= r.f and e.created_at < r.t) as gross_revenue_eur,
      (select count(*) from public.entitlements e where e.status = 'refunded' and e.provider <> 'internal' and e.created_at >= r.f and e.created_at < r.t) as refunds,
      (select count(*) from public.document_slots ds where ds.bound_at >= r.f and ds.bound_at < r.t) as new_document_slots,
      (select count(*) from public.repair_jobs rj where rj.status = 'done' and rj.created_at >= r.f and rj.created_at < r.t) as repair_jobs_done,
      (select count(*) from public.faculty_requests fr where fr.created_at >= r.f and fr.created_at < r.t) as faculty_requests_new,
      (select coalesce(jsonb_agg(jsonb_build_object('event', s.ev, 'count', coalesce(c.n, 0)) order by s.ord), '[]'::jsonb)
         from unnest(array['analyzer_engaged','analysis_completed','checkout_started','purchase_completed']) with ordinality as s(ev, ord)
         left join (
           select event, count(*) as n from public.analytics_events
           where event = any(array['analyzer_engaged','analysis_completed','checkout_started','purchase_completed'])
             and created_at >= r.f and created_at < r.t
           group by event
         ) c on c.event = s.ev
      ) as headline_funnel
    from win r
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from),
    'current', (select jsonb_build_object(
        'newUsers', new_users, 'analysesCompleted', analyses_completed, 'purchasesCompleted', purchases_completed,
        'grossRevenueEur', gross_revenue_eur, 'refunds', refunds, 'newDocumentSlots', new_document_slots,
        'repairJobsDone', repair_jobs_done, 'facultyRequestsNew', faculty_requests_new, 'headlineFunnel', headline_funnel
      ) from agg where rn = 1),
    'previous', (select jsonb_build_object(
        'newUsers', new_users, 'analysesCompleted', analyses_completed, 'purchasesCompleted', purchases_completed,
        'grossRevenueEur', gross_revenue_eur, 'refunds', refunds, 'newDocumentSlots', new_document_slots,
        'repairJobsDone', repair_jobs_done, 'facultyRequestsNew', faculty_requests_new, 'headlineFunnel', headline_funnel
      ) from agg where rn = 2),
    'retention', jsonb_build_array(
      jsonb_build_object('table','analytics_events','retentionDays',180,'note','purge_analytics_events, nocni cron'),
      jsonb_build_object('table','entitlements','retentionDays',null,'note','puna povijest, nikad se ne brise'),
      jsonb_build_object('table','document_slots','retentionDays',null,'note','puna povijest; fingerprint/label nulirani 30d nakon slot_expires_at, redak+tier prezivi'),
      jsonb_build_object('table','repair_jobs','retentionDays',null,'note','mjesovito: anonimni poslovi brisani 30d nakon zadnjeg pisanja, registrirani ostaju do brisanja racuna'),
      jsonb_build_object('table','faculty_requests','retentionDays',null,'note','redak ostaje zauvijek; ip_hash nuliran 30d, email ~90d')
    )
  );
$$;

comment on function admin_overview_stats(timestamptz, timestamptz) is
  'Control Center Overview: top KPI red + headline funnel + revenue snapshot za [p_from,p_to). current+previous u ISTOM pozivu.';
revoke all on function admin_overview_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_overview_stats(timestamptz, timestamptz) to service_role;

-- ============================================================================================
-- admin_funnel_stats: brojanje analytics_events po zadanom nizu koraka
-- ============================================================================================

create or replace function admin_funnel_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_events text[] default array['landing_view','analyzer_engaged','file_selected','analysis_started','analysis_completed','paywall_viewed','checkout_started','purchase_completed']
)
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
  steps as (
    select s.ev, s.ord from unnest(p_events) with ordinality as s(ev, ord)
  ),
  counted as (
    select w.rn, st.ev, st.ord, count(e.id) as n
    from win w
    cross join steps st
    left join public.analytics_events e
      on e.event = st.ev and e.created_at >= w.f and e.created_at < w.t
    group by w.rn, st.ev, st.ord
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'basis', 'event_count',
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from),
    'current', (select coalesce(jsonb_agg(jsonb_build_object('event', ev, 'count', n) order by ord), '[]'::jsonb) from counted where rn = 1),
    'previous', (select coalesce(jsonb_agg(jsonb_build_object('event', ev, 'count', n) order by ord), '[]'::jsonb) from counted where rn = 2),
    'retention', jsonb_build_array(
      jsonb_build_object('table','analytics_events','retentionDays',180,'note','purge_analytics_events, nocni cron; raspon stariji od ~180 dana je nepotpun, ne nula')
    )
  );
$$;

comment on function admin_funnel_stats(timestamptz, timestamptz, text[]) is
  'Control Center Funnel: brojanje analytics_events po zadanom nizu koraka. basis="event_count" - NIJE cohort-deduplicirano (analytics_events nema session/user identifikator), namjerno eksplicitno u odgovoru da UI ne prikaze kao deduplicirani funnel.';
revoke all on function admin_funnel_stats(timestamptz, timestamptz, text[]) from public, anon, authenticated;
grant execute on function admin_funnel_stats(timestamptz, timestamptz, text[]) to service_role;

-- ============================================================================================
-- admin_revenue_stats: prihod iz entitlements/products izravno (NE v_weekly_revenue - taj view
-- grupira preko cijele povijesti pa se raspon ne moze gurnuti pod agregaciju)
-- ============================================================================================

create or replace function admin_revenue_stats(p_from timestamptz, p_to timestamptz)
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
  base as (
    select w.rn, e.id as ent_id, e.status, e.work_type, e.product_id, p.audience, p.price_eur
    from win w
    left join public.entitlements e
      on e.created_at >= w.f and e.created_at < w.t and e.provider <> 'internal'
    left join public.products p on p.id = e.product_id
  ),
  totals as (
    select rn,
      coalesce(sum(price_eur) filter (where status = 'active'), 0) as gross_eur,
      coalesce(sum(price_eur) filter (where status = 'refunded'), 0) as refunds_eur,
      count(ent_id) filter (where status = 'active') as purchase_count,
      count(ent_id) filter (where status = 'refunded') as refund_count
    from base group by rn
  ),
  by_work_type as (
    select rn, jsonb_agg(jsonb_build_object('workType', work_type, 'grossEur', g, 'purchaseCount', n) order by g desc) as j
    from (select rn, work_type, coalesce(sum(price_eur) filter (where status='active'),0) as g, count(ent_id) filter (where status='active') as n
          from base where ent_id is not null group by rn, work_type) x
    group by rn
  ),
  by_product as (
    select rn, jsonb_agg(jsonb_build_object('productId', product_id, 'grossEur', g, 'purchaseCount', n) order by g desc) as j
    from (select rn, product_id, coalesce(sum(price_eur) filter (where status='active'),0) as g, count(ent_id) filter (where status='active') as n
          from base where ent_id is not null group by rn, product_id) x
    group by rn
  ),
  by_audience as (
    select rn, jsonb_agg(jsonb_build_object('audience', audience, 'grossEur', g) order by audience) as j
    from (select rn, audience, coalesce(sum(price_eur) filter (where status='active'),0) as g
          from base where ent_id is not null group by rn, audience) x
    group by rn
  ),
  -- Dnevni raspis SAMO za tekuci prozor (graf treba stvaran time-series, ne samo current/previous
  -- zbroj) - generate_series pa LEFT JOIN, da dan bez kupnje bude 0 u grafu, ne rupa u nizu.
  day_series as (
    select generate_series(date_trunc('day', p_from), date_trunc('day', p_to - interval '1 second'), interval '1 day') as day
  ),
  daily as (
    select ds.day,
      coalesce(sum(p.price_eur) filter (where e.status = 'active'), 0) as gross_eur,
      count(e.id) filter (where e.status = 'active') as purchase_count
    from day_series ds
    left join public.entitlements e
      on date_trunc('day', e.created_at) = ds.day and e.provider <> 'internal' and e.created_at >= p_from and e.created_at < p_to
    left join public.products p on p.id = e.product_id
    group by ds.day
  ),
  -- Promjene cijene unutar prozora (0002/0020 pricing_changelog) - oznake na grafu, vidi Revenue
  -- trend u planu implementacije. change_type='price' filtrira samo stvarne promjene cijene,
  -- ne coupon_start/coupon_end/packaging zapise iz iste tablice.
  price_changes as (
    select jsonb_agg(jsonb_build_object(
        'date', to_char(pc.effective_at, 'YYYY-MM-DD'), 'productId', pc.product_id,
        'oldValue', pc.old_value, 'newValue', pc.new_value, 'note', pc.note
      ) order by pc.effective_at) as j
    from public.pricing_changelog pc
    where pc.change_type = 'price' and pc.effective_at >= p_from and pc.effective_at < p_to
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from),
    'feeAssumptions', jsonb_build_object(
      'morFeePct', 0.05, 'morFeeFixedEur', 0.50, 'verified', false,
      'source', 'supabase/unit-economics.sql - hardkodirane pretpostavke, nije stvaran ugovor/racun',
      'note', 'computeCost namjerno izostavljen: report_generations se brise nakon 90 dana pa bi tiho podcijenio trosak starijih kupnji - puna metoda (uklj. compute) ostaje supabase/unit-economics.sql'
    ),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('date', to_char(day,'YYYY-MM-DD'), 'grossEur', gross_eur, 'purchaseCount', purchase_count) order by day), '[]'::jsonb) from daily),
    'priceChanges', (select coalesce(j, '[]'::jsonb) from price_changes),
    'current', (
      select jsonb_build_object(
        'grossEur', t.gross_eur, 'refundsEur', t.refunds_eur, 'netEur', t.gross_eur - t.refunds_eur,
        'estimatedNetAfterMorFeeEur', round(t.gross_eur - (t.gross_eur * 0.05 + t.purchase_count * 0.50), 2),
        'purchaseCount', t.purchase_count, 'refundCount', t.refund_count,
        'byWorkType', coalesce(bwt.j, '[]'::jsonb), 'byProduct', coalesce(bp.j, '[]'::jsonb), 'byAudience', coalesce(ba.j, '[]'::jsonb)
      )
      from totals t left join by_work_type bwt on bwt.rn=t.rn left join by_product bp on bp.rn=t.rn left join by_audience ba on ba.rn=t.rn
      where t.rn = 1
    ),
    'previous', (
      select jsonb_build_object(
        'grossEur', t.gross_eur, 'refundsEur', t.refunds_eur, 'netEur', t.gross_eur - t.refunds_eur,
        'estimatedNetAfterMorFeeEur', round(t.gross_eur - (t.gross_eur * 0.05 + t.purchase_count * 0.50), 2),
        'purchaseCount', t.purchase_count, 'refundCount', t.refund_count,
        'byWorkType', coalesce(bwt.j, '[]'::jsonb), 'byProduct', coalesce(bp.j, '[]'::jsonb), 'byAudience', coalesce(ba.j, '[]'::jsonb)
      )
      from totals t left join by_work_type bwt on bwt.rn=t.rn left join by_product bp on bp.rn=t.rn left join by_audience ba on ba.rn=t.rn
      where t.rn = 2
    ),
    'retention', jsonb_build_array(
      jsonb_build_object('table','entitlements','retentionDays',null,'note','puna povijest, nikad se ne brise; refundi se broje po created_at kupnje (nema refunded_at kolone)'),
      jsonb_build_object('table','products','retentionDays',null,'note','katalog, nije vremenski omedjen')
    )
  );
$$;

comment on function admin_revenue_stats(timestamptz, timestamptz) is
  'Control Center Revenue: entitlements+products izravno, s vremenskim rasponom. feeAssumptions.verified=false - MoR postotak/fiksni iznos su procjena iz unit-economics.sql, ne potvrdjen ugovor. trend = dnevni raspis SAMO tekuceg prozora (generate_series, 0 popunjeno) za trend graf; priceChanges = promjene cijene (pricing_changelog) unutar prozora za oznake na grafu.';
revoke all on function admin_revenue_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_revenue_stats(timestamptz, timestamptz) to service_role;

-- ============================================================================================
-- admin_operations_stats: repair_jobs + report_generations (90d tvrdi purge!) + preflight_kpi
-- ============================================================================================

create or replace function admin_operations_stats(p_from timestamptz, p_to timestamptz)
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
  repair as (
    select w.rn, count(rj.id) as total,
      count(*) filter (where rj.status = 'done') as done,
      count(*) filter (where rj.status = 'failed') as failed,
      round(coalesce(avg(rj.changes_count), 0)::numeric, 1) as avg_changes,
      count(distinct rj.user_id) as distinct_users
    from win w left join public.repair_jobs rj on rj.created_at >= w.f and rj.created_at < w.t
    group by w.rn
  ),
  gens_total as (
    select w.rn, count(rg.id) as n
    from win w left join public.report_generations rg on rg.created_at >= w.f and rg.created_at < w.t
    group by w.rn
  ),
  gens_by_status as (
    select rn, jsonb_agg(jsonb_build_object('status', status, 'count', n) order by n desc) as j
    from (select w.rn, rg.status, count(*) as n from win w
          join public.report_generations rg on rg.created_at >= w.f and rg.created_at < w.t
          group by w.rn, rg.status) x
    group by rn
  ),
  preflight as (
    select w.rn, count(pk.check_id) as total, round(avg(pk.duration_ms)::numeric, 0) as avg_duration_ms
    from win w left join public.preflight_kpi pk on pk.created_at >= w.f and pk.created_at < w.t
    group by w.rn
  ),
  -- preflight_kpi ima trajanje/nalaze, ali NE status pipelinea (je li sam preflight uspio) - to
  -- zivi na preflight_checks.status (job red). Oboje trajno zadrzano (0019: "consent + KPI ostaju
  -- trajno"), pa nema mismatch retencije izmedju ova dva izvora unutar iste funkcije.
  preflight_pipeline as (
    select w.rn,
      count(*) filter (where pc.status = 'done') as done,
      count(*) filter (where pc.status = 'error') as error
    from win w left join public.preflight_checks pc on pc.created_at >= w.f and pc.created_at < w.t
    group by w.rn
  ),
  preflight_severity as (
    select rn, jsonb_agg(jsonb_build_object('severity', severity, 'count', n) order by n desc) as j
    from (select w.rn, kv.key as severity, sum(kv.value::int) as n from win w
          join public.preflight_kpi pk on pk.created_at >= w.f and pk.created_at < w.t
          cross join lateral jsonb_each_text(pk.severity_counts) as kv(key, value)
          group by w.rn, kv.key) x
    group by rn
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from),
    'current', jsonb_build_object(
      'repair', (select jsonb_build_object('total', total, 'done', done, 'failed', failed, 'avgChangesCount', avg_changes, 'distinctUsers', distinct_users) from repair where rn=1),
      'generations', (select jsonb_build_object('total', gt.n, 'byStatus', coalesce(gs.j,'[]'::jsonb)) from gens_total gt left join gens_by_status gs on gs.rn=gt.rn where gt.rn=1),
      'preflight', (
        select jsonb_build_object(
          'total', pf.total, 'avgDurationMs', pf.avg_duration_ms, 'bySeverity', coalesce(ps.j,'[]'::jsonb),
          'done', coalesce(pp.done, 0), 'error', coalesce(pp.error, 0)
        )
        from preflight pf left join preflight_severity ps on ps.rn=pf.rn left join preflight_pipeline pp on pp.rn=pf.rn
        where pf.rn=1
      )
    ),
    'previous', jsonb_build_object(
      'repair', (select jsonb_build_object('total', total, 'done', done, 'failed', failed, 'avgChangesCount', avg_changes, 'distinctUsers', distinct_users) from repair where rn=2),
      'generations', (select jsonb_build_object('total', gt.n, 'byStatus', coalesce(gs.j,'[]'::jsonb)) from gens_total gt left join gens_by_status gs on gs.rn=gt.rn where gt.rn=2),
      'preflight', (
        select jsonb_build_object(
          'total', pf.total, 'avgDurationMs', pf.avg_duration_ms, 'bySeverity', coalesce(ps.j,'[]'::jsonb),
          'done', coalesce(pp.done, 0), 'error', coalesce(pp.error, 0)
        )
        from preflight pf left join preflight_severity ps on ps.rn=pf.rn left join preflight_pipeline pp on pp.rn=pf.rn
        where pf.rn=2
      )
    ),
    'retention', jsonb_build_array(
      jsonb_build_object('table','repair_jobs','retentionDays',null,'note','mjesovito: anonimni poslovi brisani 30d nakon zadnjeg pisanja, registrirani ostaju do brisanja racuna'),
      jsonb_build_object('table','report_generations','retentionDays',90,'note','TVRDO brisano nakon 90 dana (purge_old_report_generations) - prozori stariji od ~90 dana su NEPOTPUNI za generations podblok, ne nula'),
      jsonb_build_object('table','preflight_kpi','retentionDays',null,'note','trajno zadrzano, sadrzaj nikad'),
      jsonb_build_object('table','preflight_checks','retentionDays',null,'note','job/status red trajno zadrzan (0019: "consent + KPI ostaju trajno"); samo preflight_results_full (nalazi) se brise nakon 7 dana')
    )
  );
$$;

comment on function admin_operations_stats(timestamptz, timestamptz) is
  'Control Center Operations: repair_jobs + report_generations (90d tvrdi purge, vidi retention) + preflight zdravlje (preflight_kpi trajanje/nalazi + preflight_checks.status done/error za sam pipeline).';
revoke all on function admin_operations_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_operations_stats(timestamptz, timestamptz) to service_role;

-- ============================================================================================
-- admin_usage_stats: document_slots (tier x work_type) + repair_jobs po work_type
-- ============================================================================================

create or replace function admin_usage_stats(p_from timestamptz, p_to timestamptz)
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
  slots as (
    select rn, jsonb_agg(jsonb_build_object('tier', tier, 'workType', work_type, 'count', n) order by work_type, tier) as j
    from (select w.rn, coalesce(ds.coverage_tier,0) as tier, ds.work_type, count(*) as n from win w
          join public.document_slots ds on ds.bound_at >= w.f and ds.bound_at < w.t
          group by w.rn, coalesce(ds.coverage_tier,0), ds.work_type) x
    group by rn
  ),
  repairs as (
    select rn, jsonb_agg(jsonb_build_object('workType', work_type, 'count', n) order by n desc) as j
    from (select w.rn, rj.work_type, count(*) as n from win w
          join public.repair_jobs rj on rj.created_at >= w.f and rj.created_at < w.t
          group by w.rn, rj.work_type) x
    group by rn
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from),
    'current', jsonb_build_object(
      'slotsByTierAndWorkType', coalesce((select j from slots where rn=1), '[]'::jsonb),
      'repairJobsByWorkType', coalesce((select j from repairs where rn=1), '[]'::jsonb)
    ),
    'previous', jsonb_build_object(
      'slotsByTierAndWorkType', coalesce((select j from slots where rn=2), '[]'::jsonb),
      'repairJobsByWorkType', coalesce((select j from repairs where rn=2), '[]'::jsonb)
    ),
    'retention', jsonb_build_array(
      jsonb_build_object('table','document_slots','retentionDays',null,'note','puna povijest zauvijek; coverage_tier/work_type/bound_at prezive PII purge (0016)'),
      jsonb_build_object('table','repair_jobs','retentionDays',null,'note','mjesovita retencija, vidi admin_operations_stats')
    )
  );
$$;

comment on function admin_usage_stats(timestamptz, timestamptz) is
  'Control Center Usage: document_slots tier x work_type cross-tab + repair_jobs po work_type. Klijent pivotira, funkcija ne predracunava vise varijanti istog.';
revoke all on function admin_usage_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function admin_usage_stats(timestamptz, timestamptz) to service_role;

-- ============================================================================================
-- admin_coverage_stats: faculty_requests, top-N celija po potraznji
-- ============================================================================================

create or replace function admin_coverage_stats(p_from timestamptz, p_to timestamptz, p_limit int default 50)
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
  headline as (
    select w.rn, count(fr.id) as total_requests,
      count(*) filter (where fr.email is not null) as with_email,
      count(distinct coalesce(fr.faculty_id, fr.faculty_name_raw)) as distinct_faculties
    from win w left join public.faculty_requests fr on fr.created_at >= w.f and fr.created_at < w.t
    group by w.rn
  ),
  top_cells as (
    select fr.faculty_id, fr.faculty_name_raw, fr.program_id, fr.work_type,
      count(*) as total_requests,
      count(distinct coalesce(fr.email, fr.user_id::text)) as unique_requesters,
      count(*) filter (where fr.email is not null) as with_email,
      min(fr.created_at) as first_seen, max(fr.created_at) as last_seen
    from public.faculty_requests fr
    where fr.created_at >= p_from and fr.created_at < p_to
    group by fr.faculty_id, fr.faculty_name_raw, fr.program_id, fr.work_type
    order by total_requests desc
    limit greatest(least(coalesce(p_limit, 50), 200), 1)
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'previousFrom', p_from - (p_to - p_from), 'previousTo', p_from),
    'current', (
      select jsonb_build_object(
        'totalRequests', h.total_requests, 'withEmail', h.with_email, 'distinctFaculties', h.distinct_faculties,
        'topCells', (select coalesce(jsonb_agg(jsonb_build_object(
            'facultyId', faculty_id, 'facultyNameRaw', faculty_name_raw, 'programId', program_id, 'workType', work_type,
            'totalRequests', total_requests, 'uniqueRequesters', unique_requesters, 'withEmail', with_email,
            'firstSeen', first_seen, 'lastSeen', last_seen
          )), '[]'::jsonb) from top_cells)
      ) from headline h where h.rn = 1
    ),
    'previous', (
      select jsonb_build_object('totalRequests', total_requests, 'withEmail', with_email, 'distinctFaculties', distinct_faculties)
      from headline where rn = 2
    ),
    'retention', jsonb_build_array(
      jsonb_build_object('table','faculty_requests','retentionDays',null,'note','redak ostaje zauvijek; ip_hash nuliran 30d, email ~90d (purge_faculty_request_email) - uniqueRequesters/withEmail podcjenjuju stare prozore nakon nuliranja emaila, totalRequests ostaje tocan')
    )
  );
$$;

comment on function admin_coverage_stats(timestamptz, timestamptz, int) is
  'Control Center Coverage & Demand: top-N celija (fakultet/program/vrsta rada) po potraznji. previous namjerno bez topCells (usporedba dvije rangirane liste nije "delta%"-tipa).';
revoke all on function admin_coverage_stats(timestamptz, timestamptz, int) from public, anon, authenticated;
grant execute on function admin_coverage_stats(timestamptz, timestamptz, int) to service_role;
