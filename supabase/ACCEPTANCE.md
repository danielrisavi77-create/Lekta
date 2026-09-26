# Kriteriji prihvacanja (MONETIZATION_PLAN.md sekcija 14)

Gdje je svaki kriterij pokriven. "Unit" = `npm run check` (vitest, ciste funkcije). "Integracija"
= trazi zivu Supabase bazu (`supabase db push` + DB test); nije izvedivo u klijentskom checku.

| # | Kriterij | Pokrivenost |
|---|---|---|
| 1 | Klijent salje samo productId (bez cijene/popusta) | Unit: `tests/checkout.test.ts` (`checkoutRequestPayload`) |
| 2 | Promjena price_eur mijenja paywall bez deploya | Unit (dio): `tests/products-catalog.test.ts` (`fetchRetailCatalog` cita iz baze). Integracija: promijeni `price_eur` -> paywall render |
| 3 | Webhook: poznat `metadata[product_id]` (= `products.id`) kreira ispravan entitlement; nepoznat -> log bez entitlementa; duplikat ne duplicira | Unit: `tests/webhook.test.ts` (`parseStripeEvent`, `buildEntitlementInsert`), `tests/webhook-mor-handler.test.ts` (izvrsen handler: duplikat 23505, prolazna greska kataloga -> 500 umjesto 200, uplata nakon vec zabiljezenog punog povrata istog PaymentIntenta ne daje pravo). Integracija: unique(provider,order_id), nepoznat -> 200 |
| 4 | Pass: 6 seminarskih slotova + jednokratni -20% kupon; kupon ne vrijedi na seminarski ni partner | Unit: `buildEntitlementInsert` (6 slotova), `isPassProduct`/`makePassCouponCode`. Integracija/MoR config: ogranicenje kupona |
| 5 | Partner pending ne kupuje (403); active moze; cap 100 vs retail 30 | Unit: `tests/checkout.test.ts` (`resolveCheckout`), `tests/partner.test.ts` (`resolveDailyCap`) |
| 5a | Lektin checkout ne prodaje tudje proizvode iz iste tablice (`katedra_pass_*`, 0071): create-checkout 404 bez PaymentIntenta, paywall ih ne nudi, webhook uplatu i povrat za njih preskace (200 ignored) | Unit: `tests/checkout-product-scope.test.ts` (baseline nad katalogom parsiranim iz migracija), `tests/create-checkout-handler.test.ts`, `tests/webhook-mor-handler.test.ts`; mutacija `naplata/katedra-pass-kroz-lektin-checkout` u `tests/gate-mutations.test.ts`. Integracija: dijeli li Katedra isti Stripe racun i webhook, nije provjerljivo iz ovog repozitorija |
| 6 | Retail kupon odbijen na partner checkoutu | Integracija: Stripe kupon konfiguracija |
| 7 | Referral: nagrada tek na placenu prvu kupnju; self-referral; kod za korisnika s entitlementom; 6. kredit; refund povlaci nagradu | Unit: `tests/referral.test.ts` (`validateReferral`, `rewardIsPullable`) |
| 8 | Rulebook: nagrada tek na 'verified'; 'duplicate'/'rejected' bez; druga nagrada odbijena | Unit: `tests/rulebook.test.ts` (`canGrantRulebookReward`). Integracija: `grant_rulebook_reward` |
| 9 | Garancija: tier<2 odbijen na ulazu; nakon 30 dana odbijen; approved -> manual_orders | Unit: `tests/guarantee.test.ts` (`canFileGuaranteeClaim`). Integracija: approved tok |
| 10 | Izvjestaj sadrzi coverage tier (+ verzija/datum pravila, per-rule confidence; T0/T1 "nepotvrdeno") | Unit (dio): `tests/report-boundary.test.ts` (`coverageTier`). Ostatak (per-rule confidence, oznake) je buduci rad na sadrzaju izvjestaja |
| 11 | document_slots pri vezivanju snima profile_ref + coverage_tier; v_tier_share tocan | Integracija: `consume_slot_and_bind` (0007) + `v_tier_share` (0008) na fixture setu |
| 12 | Promjena cijene upisuje products + pricing_changelog u istoj transakciji | `set_product_price` (0020), atomski. Integracija: pozovi i provjeri oba retka |
| 13 | RLS: korisnik A ne vidi retke korisnika B ni u jednoj novoj tablici | Integracija: RLS politike u migracijama 0002-0007 |
| 14 | Sva tri viewa vracaju ocekivane vrijednosti na fixture setu | Integracija: `v_weekly_revenue`/`v_weekly_slot_activity`/`v_tier_share` (0008) |

## Napomena
Ciste odluke (cijena, pravo pristupa, anti-gaming, tier, garancija) su u `src/report/*` i
`src/catalog/*` i pokriva ih `npm run check`. Edge Functions i SQL funkcije su tanki izvrsni
omotaci; njihova integracija (DB, RLS, webhook potpis, MoR) provjerava se u Supabase okruzenju.
Preostali "buduci rad" izvan spec koraka 1-9: per-rule confidence i "nepotvrdeno" oznake u
sadrzaju izvjestaja (kriterij 10, prosireni dio) i DOM paywall + Supabase auth sesija.
