-- Katalog retci za Katedrin bundlani "Project Pass" (seminarski/zavrsni/
-- diplomski) - dosad nisu postojali u products, pa se Katedrine kupnje nisu
-- mogle povezati s katalogom (entitlements.product_id ostajao je null).
--
-- Ne koriste mor_product_id (ta kolona sluzi za Lemon Squeezy/Paddle variant
-- matching u webhook-mor); Katedra placanje ide kroz Stripe, s vlastitim
-- webhookom (katedra repo app/api/webhook/route.js) koji product_id postavlja
-- izravno po poznatom SKU-u, ne po MoR varijanti.
--
-- Cijene i purchase_window_days namjerno odgovaraju onome sto Katedrin
-- webhook vec neovisno racuna (danas hardkodirano tamo) - ako se ovdje
-- promijene, uskladiti i s katedra repo app/api/webhook/route.js
-- PURCHASE_WINDOW_DAYS. slot_window_days prati konvenciju postojecih
-- proizvoda istog work_type (0002_products_catalog.sql: zavrsni/seminarski 7
-- dana, diplomski 14 dana).
--
-- Nakon sto ova migracija sleti, Katedra webhook treba promijeniti
-- product_id: null -> odgovarajuci 'katedra_pass_*' SKU (zaseban, kasniji
-- Katedra PR - namjerno NE u istom koraku da izbjegne FK gresku prema retku
-- koji jos ne postoji dok ova migracija nije spojena).

insert into products (id, kind, audience, work_type, slots_total, slot_window_days, purchase_window_days, price_eur, sort) values
('katedra_pass_seminarski', 'pass', 'retail', 'seminarski', 1, 7, 120, 29.90, 100),
('katedra_pass_zavrsni', 'pass', 'retail', 'zavrsni', 1, 7, 240, 79.90, 101),
('katedra_pass_diplomski', 'pass', 'retail', 'diplomski', 1, 14, 365, 129.90, 102)
on conflict (id) do nothing;
