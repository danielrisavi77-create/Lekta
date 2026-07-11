-- Lekta monetizacija: "Thesis Pass" flagship (strateska odluka C, CO_PILOT_STRATEGY.md).
-- Jedno placanje pokriva provjeru istog zavrsnog/diplomskog rada kroz cijeli proces pisanja
-- do obrane. Mehanizam je isti slot model: jedan slot s dugim prozorom (180 dana) daje
-- neogranicene BESPLATNE re-provjere istog otiska, pa petlja provjeri -> ispravi -> ponovno
-- provjeri traje cijeli semestar bez dodatne naplate. Deliverable je identican standardnom
-- slotu; Thesis Pass je packaging i pozicioniranje, ne novi engine.
--
-- Odnos prema postojecim SKU-ovima:
--   * slot_zavrsni / slot_diplomski (0002): jednokratni panic-check (7 do 14 dana). OSTAJU
--     (odluka C: zadrzavamo naplatu po dokumentu).
--   * slot_*_do_obrane (0010): produljeni slot (120 dana), funkcionalno preteca Thesis Passa,
--     ali oznacen kao slot i skromno uokviren. Thesis Pass ga nasljeduje kao `pass` kind s
--     jasnim brandingom i punim semestralnim prozorom. Do obrane SKU ostaje aktivan; vlasnik
--     ga po zelji moze povuci (active=false) da katalog bude ciscii.
--
-- Cijene (9,99 zavrsni / 14,99 diplomski) su PRIJEDLOG unutar plana (pass ~15 do 25 EUR),
-- pozicioniran iznad panic-slota a ispod ljudske lekture. Promjena ide preko set_product_price
-- (migracija 0009), bez deploya.
--
-- PREDUVJET u kodu (vec zadovoljen): slot-logic postuje slot_window_days s entitlementa
-- (products.slot_window_days preko product_id joina u generate-report). Vidi
-- src/report/slot-logic.ts (windowOf) i migraciju 0010. Nema promjene koda za ovaj SKU.

insert into products (id, kind, audience, work_type, slots_total, slot_window_days, purchase_window_days, price_eur, sort) values
('pass_zavrsni','pass','retail','zavrsni',1,180,180,9.99,22),
('pass_diplomski','pass','retail','diplomski',1,180,180,14.99,32)
on conflict (id) do nothing;

insert into pricing_changelog (product_id, change_type, new_value, note) values
('pass_zavrsni','packaging','pass, 180d prozor, 9.99','Thesis Pass zavrsni: jedno placanje, neogranicene re-provjere istog rada do obrane.'),
('pass_diplomski','packaging','pass, 180d prozor, 14.99','Thesis Pass diplomski: jedno placanje, neogranicene re-provjere istog rada do obrane.');
