# Go-live naplate (checklist)

Precizni koraci da naplata proradi. Klijentska strana (auth sesija, paywall poziv, checkout
redirect) je gotova i testirana; ovdje su koraci koje moraš odraditi TI, jer traže tvoju
Supabase bazu, Lemon Squeezy račun i deploy. Ništa od ovoga ne mogu odraditi ni testirati
protiv prave baze umjesto tebe.

Kontekst: `docs/MONETIZATION_AND_ANTI_ABUSE.md`, `supabase/README.md`, `supabase/ACCEPTANCE.md`.
Pravilo: pravo pristupa je uvijek serverska odluka; klijent samo nosi identitet (Supabase JWT).

## 1. Supabase projekt

1. Kreiraj projekt (ili koristi postojeći). Zabilježi **Project URL** i **anon (public) key**.
2. **Auth → Providers → Email**: uključi Email. Za tijek s kodom (bez klika na link) u
   **Email Templates → Magic Link** koristi `{{ .Token }}` (šalje 6-znamenkasti OTP kod).
   Ako želiš klik-link umjesto koda, ostavi `{{ .ConfirmationURL }}` i podesi redirect; klijent
   trenutačno očekuje unos koda, pa je OTP kod preporučen.
3. (Anti-abuse) po želji podigni rate limit pragove za OTP u Auth postavkama.

## 2. Baza (migracije)

```
supabase db push
```

Time se kreiraju: `products`, `entitlements`, `document_slots`, `report_generations`,
`coupon_grants`, `manual_orders`, `partner_accounts`, `referrals`, `rulebook_submissions`,
`guarantee_claims`, analytics viewovi, RLS politike i SQL funkcije
(`consume_slot_and_bind`, `set_product_price`, `grant_rulebook_reward`).

## 3. Katalog proizvoda i cijene

Cijene su ISKLJUČIVO u tablici `products` (jedina istina, kriterij 14.2). Nakon `db push`:

1. Provjeri/ubaci retail proizvode (slot po vrsti rada, pass, premium_human). Seed je u
   `migrations/0002_products_catalog.sql`.
2. Za promjenu cijene koristi atomski `set_product_price` (upisuje `products` + `pricing_changelog`
   u istoj transakciji). Ručni `UPDATE price_eur` bez changeloga je prekršaj procesa (kriterij 14.12).
3. **`products.mor_product_id`** popuni STVARNIM Lemon Squeezy variant id-jevima (vidi korak 5).
   Dok je `null`, create-checkout vraća `409 product_not_mapped`.

   Stanje 17.8.2026.: **svih 20 aktivnih proizvoda ima `mor_product_id = null`**, dakle checkout
   je u produkciji neupotrebljiv (audit A26-02). Kod radi ispravno; nedostaje ovaj korak.

### 3.1 Cjenik koji sam sebi proturječi (audit A26-03, blokira launch)

Provjera žive baze 17.8.2026. pokazala je dva para u kojima je skuplji proizvod **strogo lošiji**,
pa za njih ne postoji racionalan kupac:

| Proizvod | Cijena | Prozor korištenja | Odnos |
|---|---|---|---|
| `slot_zavrsni_do_obrane` | 9,99 € | 120 dana | ista cijena, **kraće** |
| `pass_zavrsni` | 9,99 € | 180 dana | dominira gornji |
| `slot_diplomski_do_obrane` | 16,99 € | 120 dana | skuplje, **kraće** |
| `pass_diplomski` | 14,99 € | 180 dana | dominira gornji |

Oba `*_do_obrane` proizvoda nose 1 slot, jednako kao pass, pa razlika nije u opsegu nego samo u
trajanju i cijeni. Dok je ovako, ponuda kažnjava korisnika koji odabere "do obrane", a upravo je
to naziv koji zvuči izdašnije.

Odluka je poslovna, ne tehnička, pa je ovdje ne propisujemo. Tri smislena izlaza:

1. **Ugasi `*_do_obrane`** (`active = false`) i zadrži pass kao jedini dugi prozor. Najjednostavnije.
2. **Produlji ih preko passa** (npr. do obrane = 240 dana) pa viša cijena ima pokriće.
3. **Spusti im cijenu ispod passa** i skrati prozor, da budu jeftin kratki ulaz.

Što god odabereš, promjena ide **isključivo** kroz `set_product_price` (atomski upis u `products`
i `pricing_changelog`); ručni `UPDATE price_eur` je prekršaj procesa (kriterij 14.12). Deaktivacija
proizvoda nije promjena cijene pa ide običnim `UPDATE products SET active = false`, uz bilješku.

## 4. Lemon Squeezy (Merchant of Record)

1. Otvori LS račun/trgovinu. Zabilježi **Store ID** i kreiraj **API key**.
2. Za svaki naplatni proizvod kreiraj LS **product/variant**; njegov **variant id** upiši u
   `products.mor_product_id` odgovarajućeg retka.
3. **Webhook**: u LS postavi webhook na `…/functions/v1/webhook-mor`, zabilježi **signing secret**.
   HMAC provjera potpisa je već implementirana (`verifyLemonSignature` u `src/report/webhook.ts`,
   timing-safe, spojena u `functions/webhook-mor`); dovoljno je postaviti env `MOR_WEBHOOK_SECRET`
   na taj signing secret. Ne treba mijenjati kod.

## 5. Deploy Edge Functiona

```
supabase functions deploy create-checkout
supabase functions deploy generate-report
supabase functions deploy webhook-mor
supabase functions deploy file-guarantee-claim
```

**Lanac nabave (dependencies-01):** svi Edge importi `@supabase/supabase-js` su sada EKSAKTNO
pinani (`@2.110.2`), ne više goli `@2`, pa deploy ne drift-a na novu 2.x verziju. Guard test
`tests/supabase-edge-imports.test.ts` pada ako se goli major vrati. Za PUNI integritet (kriptografski
lock transitivnih ovisnosti dohvacenih s esm.sh) generiraj lockfile prije deploya:

```
cd supabase/functions
deno cache --lock=deno.lock --lock-write --allow-import send-reminders/index.ts create-checkout/index.ts webhook-mor/index.ts generate-report/index.ts file-guarantee-claim/index.ts faculty-request/index.ts unsubscribe-reminder/index.ts redeem-referral-signup/index.ts
```

Zatim commitaj `deno.lock`; Supabase deploy ga postuje. Ovaj korak trazi Deno CLI pa se radi uz
ostatak deploya (ne moze se odraditi iz Node build okoline).

Env varijable (Supabase → Edge Functions → Secrets):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `DAILY_CAP` (npr. 30 retail; partner cap se diže po računu)
- `MOR_WEBHOOK_SECRET` (LS signing secret)
- `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `CHECKOUT_REDIRECT_URL`

## 6. Klijentska konfiguracija (bez rebuilda)

Dvije opcije, iste vrijednosti:

- **Brzo/test:** otvori aplikaciju s `?setup=1`, u „Produkcijskoj konfiguraciji" popuni:
  `Endpoint punog izvještaja` = `…/functions/v1/generate-report`,
  `Endpoint checkouta` = `…/functions/v1/create-checkout`,
  `Supabase URL` = Project URL, `Supabase anon ključ` = anon key. Spremi.
  (Vrijednosti žive samo u tom pregledniku — za javnu objavu vidi dolje.)
- **Produkcija:** iste vrijednosti upiši u `DEFAULT_PRODUCTION_CONFIG` u `src/ui/app.ts`
  (`reportEndpoint`, `checkoutEndpoint`, `supabaseUrl`, `supabaseAnonKey`) i rebuildaj/deploy.

Kad su `supabaseUrl` + `supabaseAnonKey` postavljeni, klijent traži prijavu e-mailom (OTP)
prije checkouta i punog izvještaja te šalje pravi JWT. Bez njih se ponaša kao dosad (bez naplate).

## 7. Provjera prije objave (smoke)

1. `?setup=1` → popuni endpointe + Supabase → Spremi.
2. Analiziraj rad → „Otključaj puni izvještaj" → otvori se prijava e-mailom → upiši e-mail →
   stigne kod → potvrdi → poziv ide na generate-report s JWT-om.
3. Ako server vrati 402 → prikaže se „Kupi paket" → checkout otvara Lemon Squeezy stranicu.
4. Plati (LS test mode) → webhook kreira `entitlement` → ponovni „Otključaj" vraća puni izvještaj.
5. Provjeri KPI upite (`supabase/kpi-weekly.sql`) i analytics viewove kao service role.

## 8. Što je već pokriveno (ne treba dirati)

- Čiste odluke (cijena, pravo pristupa, anti-gaming, tier, garancija, referral, rulebook):
  `src/report/*`, `src/catalog/*` — pokriva `npm run check` (vidi `supabase/ACCEPTANCE.md`).
- Klijentski auth (`src/auth/session.ts`), checkout (`src/report/checkout.ts`) i report
  (`src/report/report-client.ts`) — testirani uz mockani `fetch`.

## 9. Preostalo (opcionalno, nakon launcha)

- Paywall cijene čitati iz `products` preko `fetchRetailCatalog` (sad su hardkodirane u
  `PRICING_TIERS`; točne su, ali „promjena cijene bez deploya" na klijentu još nije spojena).
- Per-rule confidence i „nepotvrđeno" oznake u sadržaju punog izvještaja (kriterij 10, prošireni dio).
- Nadogradnja anonimne u trajnu prijavu / računi i potvrde e-mailom.
