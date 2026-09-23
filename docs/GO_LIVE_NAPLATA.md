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
4. **Pretplati TOČNO ova dva događaja** (u LS sučelju, kod postavljanja webhooka):

   | Događaj | Zašto je obavezan |
   |---|---|
   | `order_created` | jedini ulaz za kupnju; bez njega nijedan `entitlement` ne nastaje |
   | `order_refunded` | **jedini ulaz za povrat**; bez njega kupac kojem je novac vraćen zadržava plaćeni pristup i referral nagradu |

   Skup pretplaćenih događaja je od 22.9.2026. **nosiv za ispravnost naplate**, jer handler od tada
   obrađuje točno dva slučaja (`classifyLemonEvent`), a sve ostalo namjerno ignorira. Tko pretplati
   samo `order_created` (najmanji skup koji je dovoljan za prodaju) dobije naplatu koja radi i
   povrate koji se **nikad ne obrade**: `entitlements.status` ostaje `paid`, `pullReferralReward` se
   ne izvede, i to bez ijedne greške.

   Ostale događaje (`subscription_*`, `license_*`) **nemoj** pretplaćivati: nisu naši proizvodi,
   handler ih odbija s `ignored`, i samo zatrpavaju inbox i log. Ako ipak stignu, vidjet ćeš ih kao
   `ignored_foreign_event` u logu (vidi sekciju 5.1).

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

`LEMONSQUEEZY_STORE_ID` citaju OBJE funkcije naplate: `create-checkout` (na koju trgovinu ide
kupnja) i `webhook-mor` (iz koje trgovine dogadjaj SMIJE doci, audit PAY-04). Do 2026-09-22 je
webhook trazio zasebno ime `LS_STORE_ID`, koje nije stajalo ni u jednom runbooku; tko je slijedio
ovaj dokument imao je checkout koji radi i webhook koji svaku kupnju odbija s `store_unverifiable`
i vraca 200, pa ga ni provider ne ponavlja. Ime je sada jedno.

- `LS_ALLOW_TEST_MODE` = `1` SAMO dok traje testna kupnja (korak 7). U produkciji ostaje PRAZNO.
  Prazna vrijednost znaci da dogadjaj iz testnog nacina rada ne daje pravo pristupa (audit PAY-05):
  bez toga bi svatko tko zna LS test mode dobio placeni proizvod bez naplate. Kad zavrsi provjera
  integracije, obrisi vrijednost i ponovi `supabase functions deploy webhook-mor`.

Prije `supabase functions deploy` pokreni preflight. On čita **Supabase Edge secrets projekta**
(`supabase secrets list`), dakle okolinu u kojoj funkcija stvarno radi, a ne tvoju ljusku:

```
npm run verify-naplata-secrets
npm run verify-naplata-secrets -- --project-ref <ref>   # kad projekt nije povezan preko `supabase link`
```

Izlazni kod 1 i imenovana varijabla kad tajna nedostaje ili je postavljena na prazno. Ako se popis
uopće ne može pročitati (CLI nije instaliran, projekt nije povezan), preflight **također pada** i to
kaže: nepoznato se ne tumači kao zeleno.

Prazna vrijednost nije neutralna: `acceptEvent` je fail-closed, pa prazan `LEMONSQUEEZY_STORE_ID`
odbija SVAKU kupnju, a odbijanje je tiho (200, bez retryja).

`-- --env` mjeri **lokalnu ljusku** umjesto projekta. To je druga os i slabija tvrdnja (zeleno ondje
ne dokazuje ništa o projektu iz kojeg `webhook-mor` radi), pa se koristi samo u CI koraku koji tajne
sam prosljeđuje; skripta to i ispiše kao upozorenje.

Preflight **nije** dio `npm run check` jer traži živi Supabase CLI i povezan projekt. To znači da ga
netko mora pokrenuti: korak je ovdje, neposredno prije `supabase functions deploy`.

### 5.1 Ishodi u `webhook_events` (tko ih gleda i kako)

Svaki potpisan događaj upisuje se u `webhook_events` PRIJE obrade, a ishod se upiše u `outcome`.
Djelomični indeks `webhook_events_unresolved` (migracija 0092) pokriva samo
`outcome is null or outcome in ('failed','unknown_product')`, pa **dva nova ishoda u njega ne
ulaze**. Njih se traži izravnim upitom po stupcu `outcome` (kao service role):

| `outcome` | Što znači | Što napraviti |
|---|---|---|
| `needs_manual_link` | **plaćena** narudžba bez `meta.custom_data.user_id` (kupnja izvan našeg checkouta ili izgubljen custom_data). Novac je naplaćen, prava pristupa nema. | ručno veži na račun, vidi postupak niže |
| `ignored` uz `outcome_detail` koji počinje s `order_status:` | narudžba nije plaćena (`pending`, `failed`, prazan status) | provjeri u LS sučelju; ako je naplaćena, radi se o promjeni statusa kod providera i to je kvar koda, ne podatka |
| `ignored` uz `outcome_detail` koji počinje s `nepodrzan_dogadjaj:` | pretplaćen je događaj koji nam ne treba | makni ga iz pretplate u LS (korak 4.4) |
| `refused` | tuđa trgovina ili testni način rada (`store_mismatch`, `store_unverifiable`, `test_mode_refused`) | provjeri `LEMONSQUEEZY_STORE_ID` i `LS_ALLOW_TEST_MODE` |
| `unknown_product` | `variant_id` nije u `products.mor_product_id` | popuni mapiranje pa replayaj |
| `processed` | događaj je obrađen do kraja (kupnja, povrat, djelomični povrat ili ručno vezan redak) | ništa |

```sql
-- Neriješeni događaji koje indeks NE pokriva (pokreni barem jednom dnevno u tjednu lansiranja).
select id, created_at, event_name, order_id, outcome, outcome_detail
from webhook_events
where outcome in ('needs_manual_link', 'ignored', 'refused')
order by created_at desc
limit 100;

-- Samo plaćene narudžbe koje čekaju ručno vezivanje.
select id, created_at, order_id, raw_payload -> 'data' -> 'attributes' ->> 'user_email' as email
from webhook_events
where outcome = 'needs_manual_link'
order by created_at asc;
```

**Ručno vezivanje (`needs_manual_link`)**, kao service role:

1. Iz `raw_payload` pročitaj `order_id`, `user_email` i `variant_id` (`data.attributes.first_order_item.variant_id`).
2. Nađi ili otvori Supabase korisnika za taj e-mail i zabilježi njegov `user_id`.
3. Nađi proizvod: `select id, work_type, slots_total, purchase_window_days from products where mor_product_id = '<variant_id>'`.
4. Upiši `entitlements` redak s tim `user_id`, `order_id`, `provider = 'lemonsqueezy'`,
   `work_type`, `slots_total` i `purchase_expires_at = now() + purchase_window_days`.
   Jedinstvenost `(provider, order_id)` iz migracije 0001 sprječava dvostruki upis.
5. Zatvori trag: `update webhook_events set outcome = 'processed', outcome_detail = 'rucno_vezano'
   where id = '<id>'`, pa taj redak više ne ispada u upitu iznad.

U logu Edge funkcije isti slučajevi imaju imenovane retke: `webhook-mor needs_manual_link`,
`webhook-mor ignored_unpaid_order` (ERROR, tiče se novca) i `webhook-mor ignored_foreign_event`
(WARN, konfiguracijski šum). Log ističe, baza ne, pa je upit iznad mjerodavan.

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
   Uz `LS_ALLOW_TEST_MODE = 1`; kad smoke završi, obriši tu vrijednost i ponovi deploy webhooka.
4b. **Isprobaj i povrat**: u LS sučelju napravi refund te testne narudžbe → `entitlements.status`
   mora postati `refunded`, a redak u `webhook_events` dobiti `outcome = 'processed'` uz
   `outcome_detail = 'refunded'`. Ako se ništa ne dogodi, `order_refunded` nije pretplaćen (korak 4.4);
   to je jedini ulaz za povrat i propust se inače vidi tek kad kupac zadrži plaćeni pristup.
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
