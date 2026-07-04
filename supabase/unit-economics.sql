-- Lekta: jedinicna ekonomija po passu (pre-launch checklist P1 8-4).
-- Netto po passu = bruto - MoR naknada - procijenjeni compute trosak generacije izvjestaja.
-- Pokreni kao service role. Parametre (MoR fee) uskladi sa stvarnim uvjetima Lemon Squeezyja.

-- Pretpostavke (uredi prema stvarnom ugovoru):
--   MoR fee: 5% + 0,50 EUR po transakciji (Lemon Squeezy tipicno; provjeri svoj plan).
--   Compute: generate-report je jedan Edge Function poziv + par SQL upita; procjena ~0,002 EUR
--   po uspjesnoj generaciji (Supabase compute + invokacije). Broj generacija po passu iz
--   report_generations (status in ('new_slot','recheck')) vezanih na slotove tog entitlementa.

with params as (
  select 0.05::numeric as mor_pct, 0.50::numeric as mor_fixed_eur, 0.002::numeric as compute_per_gen_eur
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
  round(avg(pd.gross_eur * pr.mor_pct + pr.mor_fixed_eur), 2) as avg_mor_fee_eur,
  round(avg(coalesce(g.gen_count, 0) * pr.compute_per_gen_eur), 4) as avg_compute_eur,
  round(avg(
    pd.gross_eur
    - (pd.gross_eur * pr.mor_pct + pr.mor_fixed_eur)
    - coalesce(g.gen_count, 0) * pr.compute_per_gen_eur
  ), 2)                                                 as avg_net_eur
from paid pd
cross join params pr
left join gens g on g.entitlement_id = pd.entitlement_id;

-- Po vrsti rada (gdje su marze razlicite):
with params as (
  select 0.05::numeric as mor_pct, 0.50::numeric as mor_fixed_eur, 0.002::numeric as compute_per_gen_eur
)
select e.work_type,
       count(*) as passes,
       round(avg(p.price_eur), 2) as avg_gross_eur,
       round(avg(p.price_eur - (p.price_eur * pr.mor_pct + pr.mor_fixed_eur)), 2) as avg_net_before_compute_eur
from entitlements e
join products p on p.id = e.product_id
cross join params pr
where e.status = 'active'
group by e.work_type
order by e.work_type;
