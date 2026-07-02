-- Lekta monetizacija: analiticki views (MONETIZATION_PLAN.md sekcije 12, 13, korak 15.8).
-- Server-side lijevak: purchase -> slot vezivanje -> re-checkovi -> refund. Teaser je lokalan
-- pa vrh lijevka server ne vidi (svjesna privacy odluka). Viewovi agregiraju bez osobnih
-- podataka. Pristup je samo service role (revoke ispod): prihodovni agregati nisu za klijenta.

-- Tjedni prihod po SKU. Interne nagrade (provider='internal', reward:*) se ISKLJUCUJU: to su
-- besplatni slotovi (referral/rulebook) i ne smiju napuhati bruto prihod.
drop view if exists v_weekly_revenue;
create view v_weekly_revenue as
select date_trunc('week', e.created_at)::date as tjedan,
       e.product_id, p.work_type, p.audience,
       count(*) filter (where e.status = 'active')   as kupnji,
       count(*) filter (where e.status = 'refunded') as refundi,
       coalesce(sum(p.price_eur) filter (where e.status = 'active'), 0) as bruto_eur
from entitlements e
join products p on p.id = e.product_id
where e.provider <> 'internal'
group by 1, 2, 3, 4;

-- Tjedna aktivnost generacija (re-check vs novi slot vs denied vs rate_limited): zdravlje petlje.
drop view if exists v_weekly_slot_activity;
create view v_weekly_slot_activity as
select date_trunc('week', created_at)::date as tjedan, status, count(*) as n
from report_generations
group by 1, 2;

-- Udio novih slotova po coverage tieru i vrsti rada (mjeri isplati li se tier sustav).
drop view if exists v_tier_share;
create view v_tier_share as
select date_trunc('week', bound_at)::date as tjedan,
       coalesce(coverage_tier, 0) as tier, work_type,
       count(*) as novih_slotova
from document_slots
group by 1, 2, 3;

-- Sigurnost (sekcija 13): viewovi nose agregatni prihod i grade se nad RLS tablicama; drzi ih
-- iskljucivo za service role. Bez granta anon/authenticated ne mogu citati.
revoke all on v_weekly_revenue from anon, authenticated;
revoke all on v_weekly_slot_activity from anon, authenticated;
revoke all on v_tier_share from anon, authenticated;
