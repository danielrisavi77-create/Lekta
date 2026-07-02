-- Lekta tjedni KPI (MONETIZATION_PLAN.md sekcija 12). Pokreni kao service role (psql ili
-- Supabase SQL editor). Checkout->purchase konverzija dolazi iz MoR (Lemon Squeezy) dashboarda;
-- ovdje su DB-izvedivi KPI-jevi. Sve je agregatno, bez osobnih podataka.

-- 1) Bruto EUR / tjedan po SKU (+ kupnje/refundi). Interne nagrade su vec iskljucene u viewu.
select tjedan, product_id, work_type, audience, kupnji, refundi, bruto_eur
from v_weekly_revenue
order by tjedan desc, bruto_eur desc;

-- 2) Refund rate po tjednu (guardrail: >8% zamrzava cjenovne testove, sekcija 11).
select tjedan,
       sum(kupnji) as kupnji,
       sum(refundi) as refundi,
       round(sum(refundi)::numeric / nullif(sum(kupnji) + sum(refundi), 0) * 100, 1) as refund_rate_pct
from v_weekly_revenue
group by tjedan
order by tjedan desc;

-- 3) Median re-checkova po slotu (>=2 znaci da petlja radi, sekcija 12).
select percentile_cont(0.5) within group (order by rechecks) as median_recheckova_po_slotu
from (
  select slot_id, count(*) filter (where status = 'recheck') as rechecks
  from report_generations
  where slot_id is not null
  group by slot_id
) s;

-- 4) Udio kupnji na T2/T3 vs T0/T1 (isplati li se verifikacija).
select tjedan,
       sum(novih_slotova) filter (where tier >= 2) as t2_t3,
       sum(novih_slotova) filter (where tier < 2)  as t0_t1
from v_tier_share
group by tjedan
order by tjedan desc;

-- 5) Partner udio u prihodu.
select tjedan,
       coalesce(sum(bruto_eur) filter (where audience = 'partner'), 0) as partner_eur,
       coalesce(sum(bruto_eur) filter (where audience = 'retail'), 0)  as retail_eur
from v_weekly_revenue
group by tjedan
order by tjedan desc;

-- 6) Rulebook prijave po tjednu (i koliko verificirano).
select date_trunc('week', created_at)::date as tjedan,
       count(*) as prijava,
       count(*) filter (where status = 'verified') as verificirano
from rulebook_submissions
group by 1
order by 1 desc;

-- 7) Referral konverzija (koliko referala je kreditirano).
select date_trunc('week', created_at)::date as tjedan,
       count(*) as referala,
       count(*) filter (where status = 'credited') as kreditirano
from referrals
group by 1
order by 1 desc;
