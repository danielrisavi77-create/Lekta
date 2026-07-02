# Lekta server (Supabase)

Serverski dio monetizacije (MONETIZATION_AND_ANTI_ABUSE.md). Pravo pristupa je uvijek
serverska odluka; klijent nikad nije izvor istine.

## Sadrzaj

- `migrations/0001_monetization.sql` - tablice `entitlements`, `document_slots`,
  `report_generations`, RLS politike (korisnik cita samo svoje, pisanje samo server) i
  `consume_slot_and_bind` (atomsko trosenje slota, zastita od racea).
- `functions/generate-report/` - Edge Function za placeni izvjestaj (tijek iz sekcije 5).
- `functions/webhook-mor/` - webhook Merchant of Record providera (idempotentno kreira
  entitlement; refund postavlja status).
- `functions/create-checkout/` - kreira Lemon Squeezy checkout iz `productId` (MONETIZATION_PLAN.md
  sekcija 5); cijena je serverska (cita `products`), auth JWT obavezan. Core: `src/report/checkout.ts`.
- `migrations/0002_products_catalog.sql` - katalog `products` (jedina istina o cijenama),
  `pricing_changelog`, delte na `entitlements`/`document_slots`, RLS (MONETIZATION_PLAN.md).
- `migrations/0003_coupons_manual_orders.sql` - `coupon_grants` (pass bonus) + `manual_orders`
  (premium_human) + RLS.
- `migrations/0004_partner_accounts.sql` - `partner_accounts` (rucno odobrenje, daily_cap);
  aktivan partner dobiva podignut cap u generate-report (`src/report/partner.ts`).
- `migrations/0005_referrals.sql` - `referrals` + RLS; atribucija i povlacenje nagrade na refund
  su u webhook-mor, odluke u `src/report/referral.ts`.

## Odnos prema testiranom jezgru

Edge Functions su TANKI omotaci. Sva odluka i otisak su ciste, framework-agnosticne TS
funkcije u `src/` koje pokriva `npm run check`:

- otisak: `src/fingerprint/fingerprint.ts` (`computeFingerprint`, `fingerprintMatch`),
- odluka o pristupu: `src/report/slot-logic.ts` (`decideReportAccess`, `ingestPurchase`,
  `applyRefund`),
- granica teaser/full: `src/report/report.ts`,
- cjenovni tierovi i prozori: `src/report/pricing.ts`.

Edge Functions ih UVOZE (relativni `../../../src/...`) pa nema duplikata ni drifta.
Testovi koji dokazuju kriterije iz sekcije 11: `tests/fingerprint.test.ts`,
`tests/slot-logic.test.ts`, `tests/report-boundary.test.ts`.

Ovi serverski fileovi se izvode u Supabase Deno runtimeu i NE ulaze u klijentski
`npm run check` (nema baze ni Deno runtimea u clientu). Verifikacija jezgra je u vitestu;
integracija (DB, RLS, webhook potpis) provjerava se u Supabase okruzenju.

## Deploy (sazeto)

```
supabase db push                              # migracije
supabase functions deploy generate-report
supabase functions deploy webhook-mor
```

Env varijable: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `DAILY_CAP`,
`MOR_WEBHOOK_SECRET`, te za create-checkout `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`,
`CHECKOUT_REDIRECT_URL`. Webhook potpis (`verifySignature`) zamijeni stvarnom HMAC provjerom
providera prije produkcije. Nakon `db push` popuni `products.mor_product_id` stvarnim Lemon
Squeezy variant id-jevima (checkout vraca 409 `product_not_mapped` dok je `null`).

Klijentski paywall cita katalog iz `products` preko PostgREST-a (`src/catalog/products-catalog.ts`,
`fetchRetailCatalog`) pa promjena `price_eur` u bazi mijenja prikaz bez deploya. Za to klijentu
trebaju `supabaseUrl` i anon kljuc u konfiguraciji (jos nije spojeno na DOM paywall, vidi nize).
