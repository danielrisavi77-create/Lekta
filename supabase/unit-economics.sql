-- Lekta: jedinicna ekonomija po passu (pre-launch checklist P1 8-4).
-- Netto po passu = bruto - naknada pruzatelja naplate - procijenjeni compute trosak generacije.
-- Pokreni kao service role. Parametre naknade uskladi sa stvarnim uvjetima Stripea.
--
-- VAZNO od 2026-09-23: Stripe NIJE Merchant of Record, pa se iz bruto iznosa jos odvaja PDV koji
-- obracunava i prijavljuje vlasnik. Ovaj izracun daje netto PRIJE PDV-a.

-- Pretpostavke (uredi prema stvarnom ugovoru):
--   Naknada: 1,5% + 0,25 EUR po EU kartici (Stripe standardni cjenik; provjeri svoj plan). To su
--   `fee_pct` 0.015 i `fee_fixed_eur` 0.25 u OBA upita ispod; do 2026-09-26 su ondje ostali
--   parametri ukinutog Merchant of Record pruzatelja (5% + 0,50 EUR), suprotno ovom komentaru.
--   Naplata je iskljucena tijekom bete (odluka vlasnika 2026-09-26): dok beta traje, ovdje nema
--   Stripe uplata, pa naknada vrijedi tek za kupnje nakon ukljucenja naplate.
--   Compute: generate-report je jedan Edge Function poziv + par SQL upita; procjena ~0,002 EUR
--   po uspjesnoj generaciji (Supabase compute + invokacije). Broj generacija po passu iz
--   report_generations (status in ('new_slot','recheck')) vezanih na slotove tog entitlementa.

with params as (
  select 0.015::numeric as fee_pct, 0.25::numeric as fee_fixed_eur, 0.002::numeric as compute_per_gen_eur
),
paid as (
  -- jedan red po placenom entitlementu; bruto = cijena proizvoda u trenutku kupnje
  select e.id as entitlement_id, e.user_id, e.work_type, e.created_at,
         p.price_eur as gross_eur
  from entitlements e
  join products p on p.id = e.product_id
  where e.status = 'active'
),
gens as (
  -- broj stvarnih generacija (nova vezivanja + ponovne provjere) po entitlementu
  select ds.entitlement_id, count(rg.id) as gen_count
  from document_slots ds
  left join report_generations rg
    on rg.slot_id = ds.id and rg.status in ('new_slot','recheck')
  group by ds.entitlement_id
)
select
  count(*)                                              as passes,
  round(avg(pd.gross_eur), 2)                           as avg_gross_eur,
  round(avg(pd.gross_eur * pr.fee_pct + pr.fee_fixed_eur), 2) as avg_fee_eur,
  round(avg(coalesce(g.gen_count, 0) * pr.compute_per_gen_eur), 4) as avg_compute_eur,
  round(avg(
    pd.gross_eur
    - (pd.gross_eur * pr.fee_pct + pr.fee_fixed_eur)
    - coalesce(g.gen_count, 0) * pr.compute_per_gen_eur
  ), 2)                                                 as avg_net_eur
from paid pd
cross join params pr
left join gens g on g.entitlement_id = pd.entitlement_id;

-- Po vrsti rada (gdje su marze razlicite):
with params as (
  select 0.015::numeric as fee_pct, 0.25::numeric as fee_fixed_eur, 0.002::numeric as compute_per_gen_eur
)
select e.work_type,
       count(*) as passes,
       round(avg(p.price_eur), 2) as avg_gross_eur,
       round(avg(p.price_eur - (p.price_eur * pr.fee_pct + pr.fee_fixed_eur)), 2) as avg_net_before_compute_eur
from entitlements e
join products p on p.id = e.product_id
cross join params pr
where e.status = 'active'
group by e.work_type
order by e.work_type;
