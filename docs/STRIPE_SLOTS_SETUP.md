# Lekta: server-side entitlement za pune izvjestaje

Stripe Checkout + Supabase slotovi + potpisani unlock tokeni. Zamjenjuje staticni token iz klijenta.

## Arhitektura

```
[klijent, lokalna analiza]
   |  POST /api/create-checkout (Bearer Supabase JWT)
   v
[Stripe Checkout] --webhook--> /api/stripe-webhook --> report_slots (Supabase, service role)
   |
   v  redirect ?checkout=success&work=...&tier=...
[klijent] --POST /api/unlock-report--> provjera slota --> potpisani JWT (24 h)
   |
   v
puni izvjestaj otkljucan + token se prilaze uz zahtjev za jamstvo (T2/T3)
```

Model slotova: 1 slot = 1 rad, neogranicene ponovne provjere istog rada.
Slot vise razine moze pokriti rad nize razine, a kod vezanja se uvijek
trosi najnizi dovoljan tier.

## 1. Supabase

Pokreni `supabase/migrations/20260709_report_slots.sql` u SQL editoru.
Kreira `report_slots` (RLS: korisnik cita samo svoje) i `stripe_events` (dedup).

## 2. Stripe

1. Products: kreiraj 4 proizvoda s one-time cijenama u EUR
   (seminarski 3,99 / zavrsni 5,99 / diplomski 9,99 / doktorski 24,99)
   i kopiraj `price_...` ID-eve.
2. Developers -> Webhooks -> Add endpoint:
   `https://TVOJA-DOMENA/api/stripe-webhook`
   Eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `charge.refunded`, `charge.dispute.created`
3. Kopiraj Signing secret (`whsec_...`).

## 3. Netlify env varijable

| Varijabla | Vrijednost |
|---|---|
| STRIPE_SECRET_KEY | sk_live_... (za test sk_test_...) |
| STRIPE_WEBHOOK_SECRET | whsec_... |
| STRIPE_PRICE_SEMINARSKI | price_... |
| STRIPE_PRICE_ZAVRSNI | price_... |
| STRIPE_PRICE_DIPLOMSKI | price_... |
| STRIPE_PRICE_DOKTORSKI | price_... |
| SUPABASE_URL | https://xxxx.supabase.co |
| SUPABASE_SERVICE_ROLE_KEY | service role kljuc (NIKAD u klijent) |
| REPORT_TOKEN_SECRET | `openssl rand -base64 32` |
| SITE_URL | https://lekta.hr (opcionalno, fallback je Netlify URL) |
| SLOT_VALIDITY_DAYS | opcionalno, npr. 180; prazno = bez isteka |
| STRIPE_AUTOMATIC_TAX | `true` tek kad ukljucis Stripe Tax |

## 4. Deploy

1. Kopiraj `netlify/` u root repozitorija i spoji `netlify.toml`.
2. `npm i stripe @supabase/supabase-js jose` (runtime ovisnosti funkcija).
3. Deploy. Provjeri da postoje rute `/api/create-checkout`, `/api/stripe-webhook`, `/api/unlock-report`.

## 5. Klijent

1. Zalijepi `client/lekta-payments.js` u HTML i spoji tri hooka
   (`supabaseClient`, `openLoginModal`, `revealFullReport`).
2. Gumb "Otkljucaj puni izvjestaj" zove `startCheckout(tier, workId)`,
   a prije toga pokusaj `unlockReport(tier, workId)`: ako korisnik vec ima
   slobodan slot, otkljucava se bez placanja.
3. `work_id`: `crypto.randomUUID()` jednom po radu, spremljen u zapis povijesti.
   Ponovna analiza uredene verzije istog rada koristi ISTI work_id.
4. U `DEFAULT_PRODUCTION_CONFIG`: postavi endpoint na `/api/unlock-report`
   i POTPUNO ukloni polje statickog tokena izvjestaja.

## 6. Jamstvo (T2/T3) vezano uz kupnju

U postojecoj `file-guarantee-claim` funkciji:

```ts
import { verifyUnlockToken } from '../lib/unlock-token.mts'

const payload = await verifyUnlockToken(tokenIzZahtjeva) // throwa ako je nevaljan
// payload.sub = user_id, payload.work_id, payload.slot_id, payload.tier
```

Time je svaki zahtjev za jamstvo dokazivo vezan uz placeni slot.

## 7. Testiranje

```bash
netlify dev
stripe listen --forward-to localhost:8888/api/stripe-webhook
stripe trigger checkout.session.completed
```

Test kartica: 4242 4242 4242 4242. Provjeri i refund flow
(`stripe trigger charge.refunded` pa unlock mora vratiti 402).

## Sto ovaj model rjesava, a sto svjesno ne

Rjesava: dijeljivi staticni token je mrtav (token je per-user, per-rad, 24 h),
refund automatski gasi pristup, jamstveni zahtjevi zahtijevaju dokaz kupnje,
svaka kupnja i vezanje su auditabilni u bazi.

Ne rjesava: pojedinac s DevToolsima moze zaobici UI gate na vlastitom uredaju,
jer analiza radi lokalno (to je cijena privacy-first obecanja i ispravan
trade-off za ovu cijenu). Mitigacija: PDF export punog izvjestaja vodeni zig
sa slot ID-em, pa dijeljeni PDF-ovi imaju trag porijekla.
