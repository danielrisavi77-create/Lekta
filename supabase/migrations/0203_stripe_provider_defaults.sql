-- 0203_stripe_provider_defaults.sql
--
-- Naplata je 2026-09-23 presla s Merchant of Record providera na Stripe (odluka vlasnika,
-- F18 u docs/agents/orchestrator-backlog.md). Stripe NIJE Merchant of Record, pa obracun i
-- prijavu PDV-a za prodaju potrosacima u EU radi vlasnik, ne provider.
--
-- Ova migracija NE dira podatke ni strukturu stupaca. Mijenja samo zadanu vrijednost stupca
-- `provider` u inboxu webhookova i dokumentira da je `products.mor_product_id` naslijedjen.
-- Postojeci redci ostaju kakvi jesu: oni su povijesni zapis onoga sto je stvarno stiglo i
-- prepisivanje bi unistilo dokaz o porijeklu.

alter table public.webhook_events alter column provider set default 'stripe';

comment on column public.webhook_events.provider is
  'Pruzatelj naplate koji je poslao dogadjaj. Od 2026-09-23 zadano ''stripe''; stariji redci '
  'nose vrijednost naslijedjenog Merchant of Record providera i namjerno se ne prepisuju.';

comment on column public.products.mor_product_id is
  'NASLIJEDJENO: mapiranje na variant id nekadasnjeg Merchant of Record providera. Od '
  '2026-09-23 vise NIJE uvjet za checkout i nijedan zivi put naplate ga ne cita: '
  'create-checkout iznos racuna iz price_eur, a webhook-mor proizvod trazi po products.id iz '
  'Stripe metadata[product_id]. Stupac ostaje radi povijesnih zapisa.';
