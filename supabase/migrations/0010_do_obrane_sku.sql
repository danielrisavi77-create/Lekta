-- Lekta monetizacija: "Do obrane" window-SKU (produljeni prozor besplatnih re-provjera).
-- Cisti katalog-SKU: isti slot mehanizam, samo veci slot_window_days (120 dana), pa
-- petlja provjeri -> ispravi -> ponovno provjeri ostaje besplatna kroz cijelo dotjerivanje.
-- Bez auto-fixa i bez dodatnih obecanja; deliverable je identican standardnom slotu.
--
-- NAPOMENA (cijene): 9,99 / 16,99 EUR su inicijalni prijedlog (oko 1,7x osnovnog slota za
-- 8,5x dulji prozor); promjena cijene ide preko set_product_price (migracija 0009), bez deploya.
--
-- PREDUVJET u kodu: slot-logic mora postovati slot_window_days s entitlementa (snapshot
-- proizvoda), inace bi se slot i dalje vezao na standardnih 7/14 dana. Vidi entitlements
-- join na products(slot_window_days) u generate-report.

insert into products (id, kind, audience, work_type, slots_total, slot_window_days, purchase_window_days, price_eur, sort) values
('slot_zavrsni_do_obrane','slot','retail','zavrsni',1,120,180,9.99,21),
('slot_diplomski_do_obrane','slot','retail','diplomski',1,120,180,16.99,31)
on conflict (id) do nothing;

insert into pricing_changelog (product_id, change_type, new_value, note) values
('slot_zavrsni_do_obrane','packaging','120d prozor, 9.99','Do obrane SKU: produljeni prozor besplatnih re-provjera istog rada.'),
('slot_diplomski_do_obrane','packaging','120d prozor, 16.99','Do obrane SKU: produljeni prozor besplatnih re-provjera istog rada.');
