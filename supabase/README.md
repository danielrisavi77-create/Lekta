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

Env varijable: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DAILY_CAP`,
`MOR_WEBHOOK_SECRET`. Webhook potpis (`verifySignature`) zamijeni stvarnom HMAC provjerom
providera prije produkcije.
