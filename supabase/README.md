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
- `migrations/0006_rulebook_submissions.sql` - `rulebook_submissions` + RLS + `grant_rulebook_reward`
  (atomska dodjela, mirrors `src/report/rulebook.ts`). Admin verifikacija je CLI/SQL:
  `update rulebook_submissions set status='verified', reviewed_at=now() where id='...';`
  pa `select grant_rulebook_reward('...');` (vraca true ako je nagrada dodijeljena).
- `migrations/0007_guarantee_claims.sql` - `guarantee_claims` + RLS; azuriran `consume_slot_and_bind`
  (sada snima `profile_ref` + `coverage_tier` na slot). Ulazni gate: `src/report/guarantee.ts`.
- `functions/file-guarantee-claim/` - ulazni gate garancijskog zahtjeva (tier>=2, <=30 dana, dokaz,
  rule_key); odluka o povratu je poslije, rucna (admin: status='approved' + manual_orders).
- `migrations/0008_analytics_views.sql` - viewovi `v_weekly_revenue`, `v_weekly_slot_activity`,
  `v_tier_share` (samo service role; interne nagrade iskljucene iz prihoda).
- `kpi-weekly.sql` - tjedni KPI upiti (pokreni kao service role). Checkout->purchase konverzija
  dolazi iz Lemon Squeezy dashboarda, ostalo je DB-izvedivo.
- `migrations/0009_set_product_price.sql` - `set_product_price` (atomski products + pricing_changelog,
  kriterij 14.12). Rucni UPDATE cijene bez changeloga je prekrsaj procesa.
- `ACCEPTANCE.md` - mapiranje svih 14 kriterija (sekcija 14) na unit testove vs integraciju.

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
`CHECKOUT_REDIRECT_URL`. Webhook HMAC provjera potpisa je već implementirana
(`verifyLemonSignature`, timing-safe); dovoljno je postaviti `MOR_WEBHOOK_SECRET`. Nakon
`db push` popuni `products.mor_product_id` stvarnim Lemon
Squeezy variant id-jevima (checkout vraca 409 `product_not_mapped` dok je `null`).

Klijentski paywall cita katalog iz `products` preko PostgREST-a (`src/catalog/products-catalog.ts`,
`fetchRetailCatalog`) pa promjena `price_eur` u bazi mijenja prikaz bez deploya. Za to klijentu
trebaju `supabaseUrl` i anon kljuc u konfiguraciji (jos nije spojeno na DOM paywall, vidi nize).
