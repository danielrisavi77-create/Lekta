# T23 katalog, cijene i prava, dokaz 2026-09-22

## Presuda

**T23 ostaje in_progress i nije spreman za zatvaranje.** Kod ima serverski autoritet za katalog, cijenu i pravo, a ciljani testovi prolaze. Staging inventar ipak pokazuje da nijedan aktivni SKU nema stvarni MoR variant ID. Checkout zato ispravno ostaje fail-closed i vraca 409 product_not_mapped. Dva para ponude imaju poslovnu kontradikciju cijene i prozora. Nove cijene ili vanjske identifikatore nisam izmisljavao.

Ovaj prolaz je read-only. Nisu mijenjani products, pricing_changelog, entitlements, Storage, Auth, payment provider ni produkcija.

## Identitet i kriterij

- Pregledani commit: a918b944, worktree agent/t20-edge-config.
- Staging projekt: bnyemcnsphlitjradrst.
- Kriterij: svaki ponudeni SKU mora imati jednoznacno objasnjenje i mapiranje, test mora potvrditi stvarnu cijenu i prava, a stara kupnja mora ostati prepoznata nakon promjene kataloga.
- T23 ne smije izmisljati poslovne cijene. Promjena cijene ide kroz serverski RPC set_product_price koji zajedno upisuje products i pricing_changelog.

## Read-only staging inventar

Javni staging anon key je 2026-09-22 procitao GET /rest/v1/products?select=*&active=eq.true&order=sort.asc. RLS je vratio 17 aktivnih retail redaka:

| Skup | Broj | MoR mapiranje |
|---|---:|---|
| Lekta retail SKU-ovi | 14 | 14/14 je mor_product_id = null |
| Katedra retail SKU-ovi | 3 | 3/3 je mor_product_id = null, zaseban vlasnicki tok |
| Lekta partner SKU-ovi | 6 u migracijama, skriveni anon RLS-om | svih 6 seedova nema vrijednost, ostaje owner-gated |

Migracijski inventar ima ukupno 23 jedinstvena aktivna ID-a: 20 Lekta i 3 Katedra. Staging REST ne vraca partner redove jer je politika products_select_active ogranicena na audience = retail; to nije gubitak podataka.

Vidljivi Lekta retail ID-i i trenutne cijene su:

| SKU | Cijena EUR | Vrsta | Slot/prozor | Kupovni prozor |
|---|---:|---|---:|---:|
| slot_seminarski | 3.99 | seminarski | 1 / 7 d | 90 d |
| slot_zavrsni | 5.99 | zavrsni | 1 / 7 d | 90 d |
| slot_zavrsni_do_obrane | 9.99 | zavrsni | 1 / 120 d | 180 d |
| pass_zavrsni | 9.99 | zavrsni | 1 / 180 d | 180 d |
| slot_diplomski | 9.99 | diplomski | 1 / 14 d | 90 d |
| slot_diplomski_do_obrane | 16.99 | diplomski | 1 / 120 d | 180 d |
| pass_diplomski | 14.99 | diplomski | 1 / 180 d | 180 d |
| slot_doktorski | 24.99 | doktorski | 1 / 14 d | 120 d |
| pass_semestralni | 14.99 | seminarski | 6 / 7 d | 180 d |
| bundle_zavrsni_5 | 24.99 | zavrsni | 5 / 7 d | 120 d |
| bundle_zavrsni_10 | 44.99 | zavrsni | 10 / 7 d | 120 d |
| bundle_diplomski_5 | 41.99 | diplomski | 5 / 14 d | 120 d |
| bundle_diplomski_10 | 74.99 | diplomski | 10 / 14 d | 120 d |
| premium_human | 49.00 | premium_human | 1 / 14 d | 90 d |

Katedra ID-i su katedra_pass_seminarski, katedra_pass_zavrsni i katedra_pass_diplomski. Partner ID-i su partner_zavrsni_10, partner_zavrsni_25, partner_zavrsni_50, partner_diplomski_10, partner_diplomski_25 i partner_diplomski_50.

## Dokaz autoriteta i starih kupnji

- src/catalog/products-catalog.ts mapira cijenu, prozore, slotove, publiku i MoR ID; neispravan ili nedostajuci ID/cijena postaje neaktivan redak.
- create-checkout cita aktivni proizvod iz products, klijent salje samo productId, a cijena i variant dolaze sa servera. Bez mor_product_id vraca 409 product_not_mapped prije poziva providera.
- webhook-mor trazi nas variant ID, gradi entitlement s tocno product_id, work_type, slots_total i purchase_expires_at. Ponovljeni order ID ne stvara drugo pravo; refund gasi entitlement.
- slot-logic trosi pravo po product_id i snapshotu slotWindowDays; promjena cijene ne mijenja vec zapisani entitlement niti njegov order ID.

## Postojeci testni dokaz

    npm run test -- --run tests/products-catalog.test.ts tests/checkout.test.ts tests/slot-logic.test.ts tests/webhook.test.ts tests/pricing-copy-sync.test.ts tests/agent-workflow-tasks-json.test.ts

Rezultat: **6 testnih datoteka proslo, 88 testova proslo**. Pokriveni su fail-closed katalog, tocno slanje samo product ID-a, serverski checkout mapping, slot prozori, entitlement prava, idempotentni webhook, refund, te uskladivanje javnih cijena s WORK_TYPE_TIERS.

## Poslovni i operativni blokatori

1. Vlasnik mora kreirati i potvrditi Lemon Squeezy proizvode/varijante te u staging, a zatim produkcijski katalog upisati stvarne mor_product_id vrijednosti. Bez toga nema pozitivnog checkouta.
2. Vlasnik mora odluciti sto s dominiranim SKU-ovima: pass_zavrsni je 9.99 EUR za 180 dana, dok je slot_zavrsni_do_obrane 9.99 EUR za 120 dana; pass_diplomski je 14.99 EUR za 180 dana, dok je slot_diplomski_do_obrane 16.99 EUR za 120 dana. Kod ne bira poslovnu odluku.
3. Katedra proizvodi i partner cijene trebaju potvrdu svojih vlasnika i ne smiju se automatski mapirati na Lekta Lemon Squeezy tok.
4. Nakon owner promjene treba ponoviti read-only inventory, potvrditi cijene, mapiranja i jednu namjensku testnu kupnju u T24. Do tada T23 ostaje otvoren, a T24 blokiran po redu zadataka.

## Vlasnik

Vlasnik akcije je Daniel Risavi za Lekta katalog i Lemon Squeezy konfiguraciju, uz zasebne vlasnike Katedra proizvoda. Ne treba Pro plan za ovaj inventar; potrebni su poslovna odluka, MoR varijante i valjane staging tajne.
