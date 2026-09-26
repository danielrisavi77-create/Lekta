# Go-live naplate (checklist)

Precizni koraci da naplata proradi. Klijentska strana (auth sesija, paywall poziv, checkout
redirect) je gotova i testirana; ovdje su koraci koje moraš odraditi TI, jer traže tvoju
Supabase bazu, Stripe račun i deploy. Ništa od ovoga ne mogu odraditi ni testirati
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
3. **`products.mor_product_id` je NASLIJEĐEN i ne popunjava se.** Do 23.9.2026. je nosio variant
   id Merchant of Record providera i bio uvjet za checkout (`409 product_not_mapped`); prelaskom
   na Stripe taj uvjet je uklonjen. Iznos se računa iz `products.price_eur`, a webhook proizvod
   traži po `products.id` iz Stripe `metadata[product_id]`. Stupac ostaje radi povijesnih zapisa,
   audit A26-02 time prestaje biti blokada.

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

## 4. Stripe (naplata)

Odluka vlasnika 23.9.2026.: naplata ide preko Stripea. **Stripe nije Merchant of Record**, pa PDV
na prodaju potrošačima u EU (HR 25 %, izvan HR po OSS-u) obračunava i prijavljuje vlasnik, ne
provider. Stripe Tax može izračunati iznos, ali ga ne prijavljuje. Cijene 4,99 do 24,99 tretiraju
se kao bruto (s PDV-om) dok vlasnik ne odluči drukčije.

**Tijekom bete je naplata isključena (odluka vlasnika 26.9.2026.).** Dok beta traje, Stripe tajne
ostaju prazne i koraci iz ovog odjeljka i odjeljka 5 se NE izvode; `npm run deploy:naplata` tada
namjerno odbija deploy jer obavezne tajne nedostaju.

1. Otvori Stripe račun i dovrši aktivaciju (poslovni podaci, bankovni račun).
2. Iz **Developers → API keys** uzmi **Secret key** (`sk_…`) i **Publishable key** (`pk_…`).
   Publishable ključ nije tajna, ali se ipak drži kao Edge secret: klijent ga dobiva u odgovoru
   `create-checkout`, pa se zamjena test/live vidi odmah, bez novog builda.
3. **Ne kreiraj Stripe proizvode.** Iznos dolazi iz `products.price_eur` pri svakom pozivu, pa
   dvostruki cjenik (naš i Stripeov) ne postoji i ne može se razići. Proizvod se u webhooku traži
   po `metadata[product_id]` (`products.id`), ne po naslijeđenom stupcu `mor_product_id`.
4. **Webhook**: u **Developers → Webhooks** dodaj endpoint `…/functions/v1/webhook-mor` (ime
   funkcije je naslijeđeno, URL se namjerno ne mijenja) i **pretplati TOČNO ova dva događaja**.
   Endpoint sluša događaje **vlastitog računa** („Your account”), ne povezanih računa: događaj
   povezanog računa nosi polje `account` i webhook ga odbija (`account_mismatch`).

   | Događaj | Zašto je obavezan |
   |---|---|
   | `payment_intent.succeeded` | jedini ulaz za kupnju; bez njega nijedan `entitlement` ne nastaje |
   | `charge.refunded` | **jedini ulaz za povrat**; bez njega kupac kojem je novac vraćen zadržava plaćeni pristup i referral nagradu |

   Skup pretplaćenih događaja je **nosiv za ispravnost naplate**, jer handler knjiži točno ta
   dva (`STRIPE_HANDLED_EVENTS` i `classifyStripeEvent` u `src/report/webhook.ts`), a sve ostalo
   namjerno ignorira. Tko pretplati samo `payment_intent.succeeded` (najmanji skup koji je dovoljan
   za prodaju) dobije naplatu koja radi i povrate koji se **nikad ne obrade**: `entitlements.status`
   ostaje `paid`, `pullReferralReward` se ne izvede, i to bez ijedne greške.

   Uplata se knjiži tek kad objekt sam potvrdi naplatu: `status` je `succeeded` i `amount_received`
   je veći od nule. Povrat se prepoznaje **isključivo po imenu** `charge.refunded`, ne po polju
   `refunded` u objektu. Ostale događaje **nemoj** pretplaćivati: handler ih ignorira s `ignored`,
   i samo zatrpavaju inbox i log. Ako ipak stignu, vidjet ćeš ih kao `webhook-mor ignored_foreign_event`
   (WARN) u logu (vidi 5.1). Iznimka su događaji koji **nose vraćen novac** pod drugim imenom
   (`refund.created`, `refund.updated`, `charge.refund.updated`): njih handler ne knjiži, ali ih
   piše kao `webhook-mor ignored_needs_attention` (ERROR), jer znače povrat koji nitko nije proveo.
   Povrat sa statusom `failed` ili `canceled` nije vraćen novac, a `charge.updated` povrat ne javlja
   (trag starog povrata ostaje na Chargeu zauvijek), pa oba ostaju običan WARN. Naplate koje nisu nastale kroz `create-checkout` (ručni
   Payment Link, naplata iz dashboarda) dobivaju 200, a ne 4xx, da Stripe ne ponavlja dostavu
   danima i ne isključi endpoint zbog trajnih neuspjeha: potvrđena naplata bez `metadata[user_id]`
   dobiva ishod `needs_manual_link` (ERROR, veže se ručno), a povrat bez PaymentIntenta `ignored`.
5. Zabilježi **Signing secret** (`whsec_…`) i postavi ga kao `STRIPE_WEBHOOK_SECRET`. Provjera
   `Stripe-Signature` je već implementirana (`verifyStripeSignature` u `src/report/webhook.ts`,
   timing-safe, tolerancija 300 s protiv replaya); ne treba mijenjati kod.
6. **Test vs live**: u testnom načinu događaji imaju `livemode = false` i webhook ih ODBIJA dok
   se izričito ne postavi `STRIPE_ALLOW_TEST_MODE=1`. To je namjerno: testna kupnja ne smije
   stvoriti pravo pristupa u produkciji. Nakon smoke testa obriši tu varijablu.

## 5. Deploy Edge Functiona

Obje funkcije naplate deployaj JEDNOM naredbom, koja preflight tajni nosi u sebi:

```
npm run deploy:naplata
npm run deploy:naplata -- --project-ref <ref>   # kad projekt nije povezan preko `supabase link`
```

`deploy:naplata` prvo pročita Supabase Edge secrets projekta i odbije deploy ako ijedna obavezna
tajna naplate nedostaje ili je postavljena na prazno, pa tek onda deploya `create-checkout` i
`webhook-mor`, tim redom. Zastavice za preskakanje preflighta NEMA: to je i razlog zašto deploy
naplate više nije goli CLI poziv za te dvije funkcije. Ostale funkcije nisu dio naplate i idu zasebno:

```
supabase functions deploy generate-report
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
- `STRIPE_WEBHOOK_SECRET` (Stripe signing secret, `whsec_…`), OBAVEZNO: bez njega `webhook-mor`
  odbija SVAKI događaj s razlogom `missing_secret` (401)
- `STRIPE_SECRET_KEY` (`sk_…`) i `STRIPE_PUBLISHABLE_KEY` (`pk_…`), OBAVEZNO: bez ijednog od njih
  `create-checkout` vraća `stripe_not_configured`
- `STRIPE_ACCOUNT_ID` se **NE postavlja**. Lekta ne koristi Stripe Connect: `create-checkout`
  PaymentIntent stvara na računu ključa `STRIPE_SECRET_KEY`, a `webhook-mor` odbija svaki događaj
  povezanog računa (polje `account`) s razlogom `account_mismatch`. Nijedna funkcija tu tajnu ne
  čita; ako u projektu ima vrijednost (i kad joj se vrijednost ne vidi), preflight deploy ODBIJA
  i imenuje je (ukloni je s `supabase secrets unset STRIPE_ACCOUNT_ID`). Postavljena na prazno ne
  smeta jer je nitko ne čita.
- `STRIPE_ALLOW_TEST_MODE` = `1` SAMO dok traje testna kupnja (korak 7). U produkciji ostaje PRAZNO.
  Prazna vrijednost znači da događaj iz testnog načina rada ne daje pravo pristupa (audit PAY-05).
  Preflight deploy s tom zastavicom uključenom ODBIJA, osim uz izričit `-- --dopusti-testni-nacin`
  (staging). Kad završi provjera integracije, obriši vrijednost i ponovi `npm run deploy:naplata`.

Preflight čita **Supabase Edge secrets projekta** (`supabase secrets list`), dakle okolinu u kojoj
funkcija stvarno radi, a ne tvoju ljusku. `npm run deploy:naplata` ga pokreće sam; zasebno se
pokreće samo kad hoćeš provjeriti stanje bez deploya:

```
npm run verify-naplata-secrets
npm run verify-naplata-secrets -- --project-ref <ref>   # kad projekt nije povezan preko `supabase link`
```

Izlazni kod 1 i imenovana varijabla kad tajna nedostaje (`nema`), je postavljena na prazno
(`prazna`) ili u popisu nema prepoznatljiv digest pa se ne vidi je li prazna (`nepoznata`). Isto
vrijedi za `STRIPE_ACCOUNT_ID` s vrijednošću (zabranjena tajna) i za `STRIPE_ALLOW_TEST_MODE` koji je
`1` ili mu se vrijednost ne vidi. Ako se popis uopće ne može pročitati (CLI nije
instaliran, projekt nije povezan), preflight **također pada** i to kaže: nepoznato se ne tumači kao
zeleno.

Prazna vrijednost nije neutralna: `verifyStripeSignature` je fail-closed, pa prazan
`STRIPE_WEBHOOK_SECRET` odbija SVAKI događaj, a Stripe nakon ponavljanja odustaje i kupnja ostaje
bez prava pristupa.

`-- --env` mjeri **lokalnu ljusku** umjesto projekta. To je druga os i slabija tvrdnja (zeleno ondje
ne dokazuje ništa o projektu iz kojeg `webhook-mor` radi), pa se koristi samo u CI koraku koji tajne
sam prosljeđuje; skripta to i ispiše kao upozorenje. I ta grana pada na postavljen `STRIPE_ACCOUNT_ID`
i na `STRIPE_ALLOW_TEST_MODE=1` (osim uz `--dopusti-testni-nacin`).

Granica preflighta: iz popisa tajni vidi se samo digest, pa preflight **ne može** provjeriti da
`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` i `STRIPE_WEBHOOK_SECRET` pripadaju istom Stripe računu
i istom načinu rada (live ili test). To se provjerava ručno pri postavljanju (korak 4) i testnom
kupnjom (korak 7).

Preflight **nije** dio `npm run check`: `check` se vrti bez živog Supabase CLI-ja i bez povezanog
projekta, pa produkcijske tajne uopće ne vidi. Zato ga ne čuva zeleni `check` nego **put kojim se
deploy naplate ide**: `npm run deploy:naplata` je jedina dokumentirana naredba za te dvije funkcije
i preflight joj je prvi korak, bez zastavice koja ga preskače. Tko naplatu deploya golom CLI
naredbom zaobilazi provjeru; taj put runbook više ne nudi.

Skripta zove Supabase CLI iz `node_modules/.bin` (repo ga isporučuje kao devDependency), pa ne ovisi
o globalnoj instalaciji. Ako se popis ipak ne može pročitati, ispiše se **i putanja CLI-ja koji je
pokušan i doslovna poruka providera**, da se "nisam prijavljen" ne pomiješa s "tajna je prazna".

### 5.1 Ishodi u `webhook_events` (tko ih gleda i kako)

Svaki potpisan događaj upisuje se u `webhook_events` PRIJE obrade, a ishod se upiše u `outcome`.
Djelomični indeks `webhook_events_unresolved` (migracija 0092) pokriva samo
`outcome is null or outcome in ('failed','unknown_product')`, pa **ishodi `ignored`, `refused` i
`needs_manual_link` u njega ne ulaze**. Njih se traži izravnim upitom po stupcu `outcome` (kao
service role):

| `outcome` | Što znači | Što napraviti |
|---|---|---|
| `ignored` uz `outcome_detail` koji počinje s `payment_status:` | stigao je `payment_intent.succeeded`, ali objekt nema `status` `succeeded` (ili ga uopće nema) | provjeri PaymentIntent u Stripe sučelju; ako je naplaćen, Stripe je promijenio oblik događaja i to je kvar koda, ne podatka. Nakon ispravka koda replayaj događaj |
| `ignored` uz `outcome_detail` koji počinje s `amount_received:` | `payment_intent.succeeded` bez pozitivnog `amount_received` (nula ili nedostaje), dakle nije potvrđen naplaćen iznos | provjeri PaymentIntent u Stripe sučelju; pravo pristupa se ne dodjeljuje dok naplata nije potvrđena |
| `ignored` uz `outcome_detail` koji počinje s `povrat_bez_charge_refunded:` | stigao je događaj koji **nosi vraćen novac**, a ne zove se `charge.refunded` | provjeri u Stripe sučelju o kojoj se uplati radi i povrat obradi ručno; handler namjerno **ne** piše po tom događaju. Ako ovo stiže redovito, provjeri pretplatu (korak 4.4) |
| `ignored` uz `outcome_detail` koji počinje s `nepodrzan_dogadjaj:` | pretplaćen je događaj koji nam ne treba i ne nosi novac (ime događaja je iza dvotočke) | makni ga iz pretplate (korak 4.4) |
| `needs_manual_link` uz `outcome_detail` `missing_user_metadata` | `payment_intent.succeeded` s **potvrđenom naplatom** (`status` `succeeded`, `amount_received` > 0), ali bez `metadata[user_id]`: novac je naplaćen, a pravo nema kome pripasti (ručni Payment Link za Lektin proizvod ili izgubljena metadata) | veži ručno (postupak niže), isti dan; ERROR redak `webhook-mor needs_manual_link` je signal |
| `ignored` uz `outcome_detail` `missing_payment_intent` | naplata ili povrat bez PaymentIntenta (naslijeđena izravna naplata iz dashboarda) | provjeri u Stripe sučelju; ako je to ipak kupnja Lektinog proizvoda, veži je ručno |
| `ignored` uz `outcome_detail` koji počinje s `foreign_product:` | proizvod koji Lekta ne prodaje (npr. Katedra pass na istom računu) | ništa; Katedra ga knjiži sama |
| `refused` | testni način rada ili događaj povezanog računa (`test_mode_refused`, `livemode_unverifiable`, `account_mismatch`) | provjeri `STRIPE_ALLOW_TEST_MODE`; kod `account_mismatch` provjeri da endpoint sluša vlastiti račun, ne povezane račune (korak 4.4) |
| `unknown_product` | `metadata[product_id]` nije u `products` | popravi katalog pa replayaj |
| `failed` | upis u bazu je pao (`manual_order_insert`, `product_without_work_type`, `entitlement_insert`, `refund_pending`); događaj je potpisan i platio je, ali entitlement, manualna narudžba ili povrat nisu provedeni | provjeri `outcome_detail` za razlog i bazu, popravi pa replayaj |
| `processed` | događaj je obrađen do kraja (kupnja, povrat, djelomični povrat ili ručno vezan redak) | ništa |

```sql
-- Neriješeni događaji koje indeks NE pokriva (pokreni barem jednom dnevno u tjednu lansiranja).
select id, received_at, event_name, order_id, outcome, outcome_detail
from webhook_events
where outcome in ('ignored', 'refused', 'needs_manual_link')
order by received_at desc
limit 100;

-- Uplate koje čekaju ručno vezivanje ili nisu potvrdile naplatu.
select id, received_at, order_id, outcome, outcome_detail, raw_payload -> 'data' -> 'object' ->> 'receipt_email' as email
from webhook_events
where outcome in ('needs_manual_link', 'ignored')
  and event_name = 'payment_intent.succeeded'
order by received_at asc;
```

**Ručno vezivanje** (uplata koja je stvarno naplaćena Lektin proizvod, a nije dobila pravo pristupa,
prije svega ishod `needs_manual_link`), kao service role:

1. Iz `raw_payload` pročitaj PaymentIntent id (`data.object.id`, to je `order_id`), e-mail kupca
   (`data.object.receipt_email`) i, ako postoji, `data.object.metadata.product_id`.
2. Nađi ili otvori Supabase korisnika za taj e-mail i zabilježi njegov `user_id`.
3. Nađi proizvod: `select id as product_id, work_type, slots_total, purchase_window_days from products
   where id = '<product_id>'`. Taj `id` je `products.id`, isti `product_id` koji čita
   `generate-report` (spaja se na `products(slot_window_days)` preko view-a iz migracije 0008), pa
   mora ući u entitlement, ne ostati samo u ovom koraku.
4. Upiši redak s `product_id` iz koraka 3 i rokom izračunatim iz `purchase_window_days` istog retka:

   ```sql
   insert into entitlements (user_id, work_type, slots_total, product_id, order_id, provider, purchase_expires_at)
   select '<user_id>', p.work_type, p.slots_total, p.id, '<order_id>', 'stripe',
          now() + (p.purchase_window_days * interval '1 day')
   from products p
   where p.id = '<product_id>'
   on conflict (provider, order_id) do nothing;
   ```

   `unique (provider, order_id)` u migraciji 0001 je pravi unique constraint (ne samo indeks), pa
   `on conflict` cilja izravno na njega i drugi pokušaj za isti `order_id` ne udvostručuje redak.
   Stupci ovdje su isti koje pri kupnji piše `buildEntitlementInsert` u `src/report/webhook.ts`.
5. Zatvori trag: `update webhook_events set outcome = 'processed', outcome_detail = 'rucno_vezano'
   where id = '<id>'`, pa taj redak više ne ispada u upitu iznad.

U logu Edge funkcije isti slučajevi imaju imenovane retke: `webhook-mor ignored_needs_attention`
(ERROR, tiče se novca: uplata bez potvrđene naplate ili povrat pod imenom koje nije
`charge.refunded`), `webhook-mor needs_manual_link` (ERROR, potvrđena naplata bez korisnika),
`webhook-mor ignored_foreign_event` (WARN, pretplaćen događaj koji ne nosi novac),
`webhook-mor event_refused` (ERROR, testni način ili tuđi račun) i
`webhook-mor foreign_event_ignored` (WARN, povrat bez PaymentIntenta ili tuđi proizvod).
Log ističe, baza ne, pa je upit iznad mjerodavan.

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
3. Ako server vrati 402 → prikaže se „Kupi paket" → potvrda kupnje → Stripe Payment Element se
   otvara U STRANICI (nema odlaska na vanjski checkout).
4. Plati testnom karticom (uz privremeni `STRIPE_ALLOW_TEST_MODE=1`) → webhook kreira
   `entitlement` → izvještaj se otključava bez povratka s vanjske stranice, ali TEK kad webhook
   upiše pravo: klijent do 30 s pita tablicu `entitlements` za taj PaymentIntent
   (`waitForEntitlement`), pa tek onda zove generate-report. Ako pravo u tom roku nije vidljivo,
   korisnik dobiva poruku da ne plaća ponovno i da otključa za minutu; paywall se NE prikazuje.
   Status `processing` (odgođeni bankovni načini) ne otključava ništa i javlja da se plaćanje
   obrađuje. U smoke testu provjeri oba puta: brz webhook (otključano) i zaustavljen webhook
   (poruka, bez paywalla).
4b. **Isprobaj i povrat**: u Stripe sučelju napravi puni refund te testne uplate → `entitlements.status`
   mora postati `refunded`, a redak u `webhook_events` dobiti `outcome = 'processed'` uz
   `outcome_detail = 'refunded'`. Ako se ništa ne dogodi, `charge.refunded` nije pretplaćen (korak 4.4);
   to je jedini ulaz za povrat i propust se inače vidi tek kad kupac zadrži plaćeni pristup.
   Nakon smoke testa obriši `STRIPE_ALLOW_TEST_MODE` i ponovi `npm run deploy:naplata`.
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
