-- Katedra Project Pass catalog entries.
--
-- Katedra owns the checkout presentation, while Lekta remains the canonical
-- product/entitlement authority. These stable ids let the webhook and the
-- server capability resolver distinguish Seminarski, Zavrsni and Diplomski
-- scope without trusting client metadata or a wallet balance.

insert into public.products (
  id, kind, audience, work_type, slots_total, slot_window_days,
  purchase_window_days, price_eur, sort
) values
  ('katedra_pass_seminarski', 'pass', 'retail', 'seminarski', 1, 7, 120, 29.90, 200),
  ('katedra_pass_zavrsni', 'pass', 'retail', 'zavrsni', 1, 7, 240, 79.90, 201),
  ('katedra_pass_diplomski', 'pass', 'retail', 'diplomski', 1, 14, 365, 129.90, 202)
on conflict (id) do nothing;
