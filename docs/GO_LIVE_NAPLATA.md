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
3. **Katalog Monetizacije V1** (odluka vlasnika 27.9.2026., `docs/decisions/MONETIZACIJA_V1.md`)
   postavlja migracija `0207_monetizacija_v1.sql`: Repair (`slot_*`) 3,99 / 5,99 / 9,99 / 16,99 /
   24,99 € uz prozore 7 / 7 / 14 / 21 / 30 dana, Final Pass (`pass_zavrsni`, `pass_diplomski`,
   `pass_specijalisticki`, `pass_doktorski`) 12,99 / 19,99 / 29,99 / 39,99 € uz 180 / 180 / 240 /
   365 dana, i `pass_semestralni` 14,99 € (6 seminarskih slotova, 180 dana). Cijene mijenja
   ISKLJUČIVO kroz `set_product_price`, i to samo kad se razlikuju, pa ponovni `db push` ne dopisuje
   `pricing_changelog`. Oba `*_do_obrane` proizvoda su ugašena (`active = false`, ne obrisana), pa
   odjeljak 3.1 niže vrijedi kao povijest. Svaki proizvod nosi `offer_code` (`repair_v1`,
   `final_pass_v1`, `semester_pass_v1`, `expert_v1`; prava u tablici `offer_codes`), a webhook ih pri
   kupnji snapshotira na entitlement (`offer_code`, `capabilities`, `slot_window_days`,
   `paid_amount_cents`), pa kasnija promjena kataloga ne mijenja već kupljeno. Prozor slota koji
   `generate-report` i `repair-docx` stvarno primjenjuju čita se iz `entitlements.slot_window_days`
   (živi `products.slot_window_days` samo za stariji redak bez snapshota). Postojeća prava dobivaju
   snapshot prozora pod kojim su kupljena (backfill ide PRIJE promjene prozora u istoj migraciji), a
   trigger `entitlements_snapshot_offer` popunjava prazna polja snapshota i za prava koja ne upisuje
   webhook (nagrade, kuponi, ručno vezivanje). **Migraciju 0207 primijeni PRIJE deploya funkcija iz
   ovog izdanja**: webhook upisuje nove stupce, a `generate-report` i `repair-docx` čitaju
   `slot_window_days`; bez migracije bi upit prava pao, a te funkcije tada odgovaraju 500 (ne 402).
   `entitlements` ima TOČNO jedan strani ključ prema `products` (`product_id`);
   `upgraded_from_product_id` je namjerno bez ključa, jer bi drugi ključ ugradnju `products(...)`
   učinio dvosmislenom (PostgREST PGRST201). Gard: `tests/monetizacija-v1-migracija.test.ts`.
   `specijalisticki` je od 0207 prodajna vrsta rada i serverski je prihvaćaju i potrošači prava
   (`src/report/billable-work-type.ts`); klijentski izbornik i cjenik (`src/report/pricing.ts`) su
   M3 i ovdje se ne mijenjaju.
4. **`products.mor_product_id` je NASLIJEĐEN i ne popunjava se.** Do 23.9.2026. je nosio variant
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
3. **Stripe proizvodi i cijene su ZRCALO kataloga, nikad izvor iznosa.** Iznos PaymentIntenta
   dolazi iz `products.price_eur` pri svakom pozivu, a proizvod se u webhooku traži po
   `metadata[product_id]` (`products.id`), ne po naslijeđenom stupcu `mor_product_id`. Zrcalo
   (jedan Stripe Product `lekta_<products.id>` i jedna aktivna Price s `lookup_key = products.id`
   po SKU-u) služi Stripe izvještajima i računima, i ne ručno nego skriptom:

   ```bash
   # zadano je --dry-run: ispiše plan, ne šalje nijedan zahtjev Stripeu
   node scripts/stripe-sync-products.mjs
   # katalog iz žive baze umjesto iz migracija (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
   node scripts/stripe-sync-products.mjs --from=db
   # stvarna sinkronizacija (STRIPE_SECRET_KEY; live ključ traži i --live)
   node scripts/stripe-sync-products.mjs --from=db --apply
   ```

   `--apply` bez eksplicitnog `--from` se odbija i traži `--from=db`: u Stripe se zrcali živi
   katalog, ne sjeme cijena iz migracija. Ključ, `--live` i `--from` provjeravaju se PRIJE ikakvog
   mrežnog poziva. Skripta je idempotentna: drugi prolaz nad nepromijenjenim katalogom je sav
   `noop`. Promjena cijene stvara novu Price s prenesenim `lookup_key` (`transfer_lookup_key`) i
   gasi staru, jer Stripe iznos postojeće Price ne mijenja. Zrcale se samo aktivni retail proizvodi
   koje Lekta prodaje (bez `katedra_*` i partnerskih). Ugašeni Lektin SKU (`active = false`, npr.
   `*_do_obrane`) se u Stripeu **arhivira**: plan navodi `archive_product` (Product `active=false`)
   i `archive_price` (aktivna Price se gasi i ostaje bez `lookup_key`), a ako ga u Stripeu nema ili
   je već arhiviran, `noop_archived`. Kvar zrcala ne mijenja nijednu naplatu. **Tijekom bete se
   skripta ne pokreće s `--apply`.**
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
`outcome is null or outcome in ('failed','unknown_product')`, pa **ishodi `ignored`, `refused`,
`needs_manual_link`, `needs_manual_review` i `conflict_other_user` u njega ne ulaze**. Njih se
traži izravnim upitom po stupcu `outcome` (kao service role):

| `outcome` | Što znači | Što napraviti |
|---|---|---|
| `ignored` uz `outcome_detail` koji počinje s `payment_status:` | stigao je `payment_intent.succeeded`, ali objekt nema `status` `succeeded` (ili ga uopće nema) | provjeri PaymentIntent u Stripe sučelju; ako je naplaćen, Stripe je promijenio oblik događaja i to je kvar koda, ne podatka. Nakon ispravka koda replayaj događaj |
| `ignored` uz `outcome_detail` koji počinje s `amount_received:` | `payment_intent.succeeded` bez pozitivnog `amount_received` (nula ili nedostaje), dakle nije potvrđen naplaćen iznos | provjeri PaymentIntent u Stripe sučelju; pravo pristupa se ne dodjeljuje dok naplata nije potvrđena |
| `ignored` uz `outcome_detail` koji počinje s `povrat_bez_charge_refunded:` | stigao je događaj koji **nosi vraćen novac**, a ne zove se `charge.refunded` | provjeri u Stripe sučelju o kojoj se uplati radi i povrat obradi ručno; handler namjerno **ne** piše po tom događaju. Ako ovo stiže redovito, provjeri pretplatu (korak 4.4) |
| `ignored` uz `outcome_detail` koji počinje s `nepodrzan_dogadjaj:` | pretplaćen je događaj koji nam ne treba i ne nosi novac (ime događaja je iza dvotočke) | makni ga iz pretplate (korak 4.4) |
| `needs_manual_link` uz `outcome_detail` `missing_user_metadata` | `payment_intent.succeeded` s **potvrđenom naplatom** (`status` `succeeded`, `amount_received` > 0), ali bez `metadata[user_id]`: novac je naplaćen, a pravo nema kome pripasti (ručni Payment Link za Lektin proizvod ili izgubljena metadata) | veži ručno (postupak niže), isti dan; ERROR redak `webhook-mor needs_manual_link` je signal |
| `needs_manual_review` uz `outcome_detail` koji počinje s `amount_below_catalog`, `currency_not_eur` ili `catalog_price_unusable` | potvrđena naplata čiji iznos je **manji od kataloške cijene** (`round(products.price_eur * 100)`), ili je naplaćena u valuti koja nije EUR, ili proizvod **nema upotrebljivu katalošku cijenu** (`catalog_price_unusable`: cijena null, 0 ili se zaokruži na 0 centi, ili je proizvod neaktivan; `aktivan=` u detalju). Po odluci vlasnika (2026-09-27) takva uplata **ne daje pravo**: nema entitlementa ni ručne narudžbe. `outcome_detail` nosi oba iznosa i valutu (`ocekivano=`, `naplaceno=`, `valuta=`). Ponovljena dostava već proknjižene uplate istog korisnika ovamo ne dolazi: webhook je knjiži kao duplikat i ponovno osigura obveze bonusa | isti dan, uz ERROR redak `webhook-mor needs_manual_review`. Prvo koraci 4 i 5 postupka ručnog vezivanja niže (postojeće pravo ili narudžba, pa povrat): ako zapis već postoji ili je PaymentIntent već vraćen, samo zatvori trag. Inače odluči: **povrat** u Stripe sučelju (puni povrat, pa `charge.refunded` zatvori ostatak), ili, ako je niži iznos opravdan (npr. dogovoren popust), **ručno vezivanje** (postupak niže). Za proizvod s ručnom obradom (`premium_human`, `work_type` null) vezivanje otvara **ručnu narudžbu** (`manual_orders`), ne entitlement (korak 6) |
| `conflict_other_user` | `payment_intent.succeeded` čiji insert entitlementa je pao na `unique (provider, order_id)` (23505), a postojeći redak pripada **drugom** korisniku nego `metadata[user_id]` događaja. Pravo se ne dodjeljuje i nijedan bonus se ne izdaje; `outcome_detail` nosi oba korisnika i id postojećeg retka | isti dan, uz ERROR redak `webhook-mor conflict_other_user`. Provjeri tko je stvarno platio (Stripe sučelje, `receipt_email`) i kako je postojeći redak nastao (npr. ručno vezivanje na krivi račun). Ispravi vlasnika postojećeg retka ili napravi povrat; ne upisuj drugi redak za isti `order_id` |
| `ignored` uz `outcome_detail` `missing_payment_intent` | naplata ili povrat bez PaymentIntenta (naslijeđena izravna naplata iz dashboarda) | provjeri u Stripe sučelju; ako je to ipak kupnja Lektinog proizvoda, veži je ručno |
| `ignored` uz `outcome_detail` koji počinje s `foreign_product:` | proizvod koji Lekta ne prodaje (npr. Katedra pass na istom računu) | ništa; Katedra ga knjiži sama |
| `refused` | testni način rada ili događaj povezanog računa (`test_mode_refused`, `livemode_unverifiable`, `account_mismatch`) | provjeri `STRIPE_ALLOW_TEST_MODE`; kod `account_mismatch` provjeri da endpoint sluša vlastiti račun, ne povezane račune (korak 4.4) |
| `unknown_product` | `metadata[product_id]` nije u `products` | popravi katalog pa replayaj |
| `failed` | upis u bazu je pao (`manual_order_insert`, `product_without_work_type`, `entitlement_insert`, `entitlement_owner_lookup`, `replay_lookup`, `refund_marker_lookup`, `refund_marker_recheck`, `refund_pending`, `refund_consequences_failed`); događaj je potpisan i platio je, ali entitlement, manualna narudžba ili povrat nisu provedeni do kraja. `refund_consequences_failed` znači da je pravo VEĆ ugašeno, a otkazivanje ručne narudžbe ili povlačenje kupona čeka Stripeov retry; i ta oznaka vrijedi kao puni povrat (`REFUND_MARKERS`). Tekst greške baze je SAMO ovdje i u logu; odgovor Stripeu nosi generički kod | provjeri `outcome_detail` za razlog i bazu, popravi pa replayaj |
| `processed` | događaj je obrađen do kraja (kupnja, povrat, djelomični povrat ili ručno vezan redak). Puni povrat (`refunded`) uz entitlement otkazuje i ručnu narudžbu istog PaymentIntenta (`manual_orders.status = 'refunded'`) i povlači pass kupon iz iste kupnje (`coupon_grants.expires_at` postaje trenutak povrata); djelomični povrat (`partial_refund_noted`) ne dira ništa od toga. Redoslijed nije bitan: uplata koja stigne nakon punog povrata (Stripe ne jamči redoslijed, a prvi pokušaj uplate može čekati retry) upiše pa odmah zatvori i entitlement i ručnu narudžbu (`refunded_before_payment`). Puni povrat koji stigne DOK uplata izdaje bonuse zatvara `refunded_during_payment`: uplata nakon upisa kupona i nagrade preporučitelju ponovo čita oznaku povrata i opoziva izdano | ništa |

```sql
-- Neriješeni događaji koje indeks NE pokriva (pokreni barem jednom dnevno u tjednu lansiranja).
select id, received_at, event_name, order_id, outcome, outcome_detail
from webhook_events
where outcome in ('ignored', 'refused', 'needs_manual_link', 'needs_manual_review', 'conflict_other_user')
order by received_at desc
limit 100;

-- Uplate koje čekaju ručno vezivanje, ručni pregled (iznos ili vlasnik) ili nisu potvrdile
-- naplatu. Uplata čiji je PaymentIntent već vraćen (isti order_id s oznakom punog povrata,
-- REFUND_MARKERS u webhook-mor/handler.ts) ne čeka vezivanje nego je zatvorena povratom, pa je
-- upit namjerno izostavlja.
select w.id, w.received_at, w.order_id, w.outcome, w.outcome_detail,
       w.raw_payload -> 'data' -> 'object' ->> 'receipt_email' as email
from webhook_events as w
where w.outcome in ('needs_manual_link', 'needs_manual_review', 'conflict_other_user', 'ignored')
  and w.event_name = 'payment_intent.succeeded'
  and not exists (
    select 1
    from webhook_events as r
    where r.provider = w.provider
      and r.order_id = w.order_id
      and r.outcome_detail in ('refund_pending', 'refund_consequences_failed', 'refund_without_entitlement', 'refunded')
  )
order by w.received_at asc;
```

**Prije ručnog vezivanja provjeri postojeći zapis i povrat.** Za isti `order_id` možda već postoji
pravo ili ručna narudžba (ranije vezivanje, ponovljena dostava), a uplata je mogla biti vraćena dok
je čekala. Obje provjere su obavezni koraci 4 i 5 postupka niže i idu PRIJE svakog upisa; ako
korak 4 nađe zapis ili korak 5 nađe povrat, **ne veži** nego samo zatvori trag (korak 8).

**Ručno vezivanje** (uplata koja je stvarno naplaćena Lektin proizvod, a nije dobila pravo pristupa,
prije svega ishodi `needs_manual_link` i, nakon odluke da se niži iznos prihvaća,
`needs_manual_review`), kao service role:

1. Iz `raw_payload` pročitaj PaymentIntent id (`data.object.id`, to je `order_id`), e-mail kupca
   (`data.object.receipt_email`) i, ako postoji, `data.object.metadata.product_id`.
2. Nađi ili otvori Supabase korisnika za taj e-mail i zabilježi njegov `user_id`.
3. Nađi proizvod: `select id as product_id, work_type, slots_total, purchase_window_days,
   manual_fulfillment from products where id = '<product_id>'`. Taj `id` je `products.id`, isti
   `product_id` koji čita `generate-report` (spaja se na `products(slot_window_days)` preko view-a iz
   migracije 0008), pa mora ući u zapis, ne ostati samo u ovom koraku. Stupac `manual_fulfillment`
   odlučuje o koraku 6: proizvod s ručnom obradom (`manual_fulfillment = true`, npr. `premium_human`,
   `work_type` je null) **nema entitlement** nego ručnu narudžbu, isto kao kad ga knjiži webhook.
4. **Obavezno prvo: postoji li već pravo ili narudžba za taj `order_id`.** Obje tablice imaju
   `unique (provider, order_id)`, a webhook ponovljenu dostavu već proknjižene uplate istog korisnika
   ne šalje na ručni pregled nego je knjiži kao duplikat (`entitlement_duplicate`,
   `manual_order_duplicate`). Redak ovdje zato znači raniji upis (ručno vezivanje ili prva dostava).

   ```sql
   select 'entitlement' as vrsta, id, user_id, status
   from entitlements
   where provider = 'stripe' and order_id = '<order_id>'
   union all
   select 'manual_order' as vrsta, id, user_id, status
   from manual_orders
   where provider = 'stripe' and order_id = '<order_id>';
   ```

   Redak s istim `user_id` znači da je uplata već proknjižena: **ništa ne upisuj**, preskoči korake
   5 do 7 i u koraku 8 zatvori trag s `outcome_detail = 'vec_proknjizeno'`. Redak s drugim
   `user_id` je sukob vlasnika: ne upisuj drugi redak nego postupi kao za `conflict_other_user`
   (tablica iznad). Samo prazan rezultat vodi dalje.
5. **Obavezno prije upisa: provjeri je li isti PaymentIntent već vraćen.** Povrat (`charge.refunded`)
   u `webhook_events` nosi isti `order_id` kao uplata (PaymentIntent), a handler oznaku punog
   povrata piše u `outcome_detail` (`REFUND_MARKERS` u `supabase/functions/webhook-mor/handler.ts`).
   Uplata bez korisnika nema pravo koje bi povrat ugasio, pa povrat završi kao
   `refund_without_entitlement`; pravo upisano ručno nakon toga ostalo bi aktivno za vraćen novac.

   ```sql
   select id, received_at, event_name, outcome, outcome_detail
   from webhook_events
   where provider = 'stripe'
     and order_id = '<order_id>'
     and outcome_detail in ('refund_pending', 'refund_consequences_failed', 'refund_without_entitlement', 'refunded');
   ```

   Vrati li upit ijedan redak, novac je vraćen ili se povrat još obrađuje (`refund_pending`,
   `refund_consequences_failed`): **ne upisuj ništa**, preskoči korake 6 i 7 i u koraku 8 zatvori
   trag s `outcome_detail = 'vraceno_prije_vezivanja'`. Djelomični povrat (`partial_refund_noted`)
   nije oznaka punog povrata i ne priječi vezivanje. Upit vidi samo povrate koje je webhook već
   zabilježio: prije upisa zato i u Stripe sučelju otvori taj PaymentIntent i potvrdi da nema
   povrata (povrat čiji `charge.refunded` kasni, ili redak `ignored` s `povrat_bez_charge_refunded:`,
   upit ne vidi).
6. Upiši zapis prema vrsti proizvoda iz koraka 3.

   Proizvod s `work_type` (`manual_fulfillment = false`): entitlement s `product_id` iz koraka 3 i
   rokom izračunatim iz `purchase_window_days` istog retka.

   ```sql
   insert into entitlements (user_id, work_type, slots_total, product_id, order_id, provider, purchase_expires_at)
   select '<user_id>', p.work_type, p.slots_total, p.id, '<order_id>', 'stripe',
          now() + (p.purchase_window_days * interval '1 day')
   from products p
   where p.id = '<product_id>' and not p.manual_fulfillment
   on conflict (provider, order_id) do nothing;
   ```

   `unique (provider, order_id)` u migraciji 0001 je pravi unique constraint (ne samo indeks), pa
   `on conflict` cilja izravno na njega i drugi pokušaj za isti `order_id` ne udvostručuje redak.
   Stupci ovdje su isti koje pri kupnji piše `buildEntitlementInsert` u `src/report/webhook.ts`.

   Proizvod s ručnom obradom (`manual_fulfillment = true`, npr. `premium_human`): **ne upisuj u
   `entitlements`** (pravo bez `work_type` ne otključava ništa, a webhook takav proizvod nikad ne
   knjiži kao pravo). Otvori ručnu narudžbu, isto kao grana `manual_orders` u handleru; `status`
   ostaje zadani `pending`, pa narudžba ulazi u red za ljudsku obradu.

   ```sql
   insert into manual_orders (user_id, product_id, order_id, provider)
   select '<user_id>', p.id, '<order_id>', 'stripe'
   from products p
   where p.id = '<product_id>' and p.manual_fulfillment
   on conflict (provider, order_id) do nothing;
   ```

   Uvjet `manual_fulfillment` u oba upisa sprječava krivu tablicu: upis za pogrešnu vrstu proizvoda
   ne upiše nijedan redak.
7. Ponovi upit iz koraka 5 odmah nakon koraka 6: povrat koji stigne između provjere i upisa možda
   ne vidi ručno upisan zapis. Vrati li upit tada redak, ugasi upisano ručno:
   `update entitlements set status = 'refunded' where provider = 'stripe' and order_id = '<order_id>'`
   ili, za ručnu narudžbu,
   `update manual_orders set status = 'refunded' where provider = 'stripe' and order_id = '<order_id>'`.
8. Zatvori trag: `update webhook_events set outcome = 'processed', outcome_detail = 'rucno_vezano'
   where id = '<id>'` (ili s `vec_proknjizeno` odnosno `vraceno_prije_vezivanja`, ovisno o koraku 4
   ili 5), pa taj redak više ne ispada u upitu iznad.

U logu Edge funkcije isti slučajevi imaju imenovane retke: `webhook-mor ignored_needs_attention`
(ERROR, tiče se novca: uplata bez potvrđene naplate ili povrat pod imenom koje nije
`charge.refunded`), `webhook-mor needs_manual_link` (ERROR, potvrđena naplata bez korisnika),
`webhook-mor needs_manual_review` (ERROR, naplaćeno manje od kataloške cijene, u valuti koja
nije EUR ili za proizvod bez upotrebljive kataloške cijene), `webhook-mor conflict_other_user`
(ERROR, pravo za isti PaymentIntent već pripada drugom korisniku),
`webhook-mor refund_consequences_failed` (ERROR, pravo je već ugašeno, ali puni povrat nije uspio
otkazati ručnu narudžbu ili povući kupon; Stripe ponavlja), `webhook-mor refunded_during_payment`
(ERROR, puni povrat stigao dok je uplata izdavala bonuse; kupon i nagrade su opozvani),
`webhook-mor replay_lookup_failed` (ERROR, provjera ponovljene dostave nije uspjela; Stripe ponavlja),
`webhook-mor ignored_foreign_event` (WARN, pretplaćen događaj koji ne nosi novac),
`webhook-mor event_refused` (ERROR, testni način ili tuđi račun) i
`webhook-mor foreign_event_ignored` (WARN, povrat bez PaymentIntenta ili tuđi proizvod).
Log ističe, baza ne, pa je upit iznad mjerodavan.

### 5.2 Monetizacija V1: nadogradnja Repair -> Final Pass, snapshot prava i F21

**Nadogradnja** (`docs/decisions/MONETIZACIJA_V1.md`, odjeljak 14). Klijent šalje
`create-checkout` samo namjeru: `productId` Final Passa i `upgradeFromEntitlementId` (id vlastitog
Repair prava). Iznos računa server: `products.price_eur` Final Passa minus `paid_amount_cents`
istog prava (stvarno naplaćeno pri kupnji Repaira). Nadogradnja je dopuštena samo za plaćeno
(`provider = 'stripe'`), aktivno Repair pravo s jednim slotom, iste vrste rada, koje još nije
nadograđeno i čija izvorna uplata nije djelomično vraćena. Rok potrošnje (`purchase_expires_at`) je
rok vezivanja uz rad, pa vrijedi samo za Repair koji još nije vezan (`slots_used = 0`); izvan njega
je 409 `upgrade_source_expired`, a u bazi `unavailable`.
Ako je Repair već vezan uz rad (`slots_used > 0`), otisak njegova slota mora biti još netaknut, tj.
neanonimiziran. Ni istek prozora slota ni istek roka potrošnje **nisu** granica (odjeljak 14:
korisnik koji je prvo kupio Repair ne smije biti kažnjen; npr. `slot_diplomski` kupljen dan 0 i vezan
dan 85 smije se nadograditi i na dan 92): nadogradnja tada isti slot oživi na prozor Final Passa i
produlji rok potrošnje. Granica je
anonimizacija: `purge_document_slots` (0016) 30 dana nakon isteka briše naslov, autora i poglavlja
iz otiska, pa bi nadograđeni Final Pass produljio otisak koji ne prepoznaje nijednu verziju rada.
Takav zahtjev je 409 `upgrade_slot_anonymized`, a `apply_entitlement_upgrade` istu provjeru
ponavlja atomski (uz zaključavanje slota protiv istodobnog purgea) i vraća `slot_anonymized`.
Repair koji još nije vezan uz rad smije se nadograditi. Djelomičan povrat izvorne uplate
(`partial_refund_noted`) i webhook čita istim upitom kao checkout, prije pretvorbe.

**Djelomičan povrat i nadogradnja** (Codex pregled PR #217, M1). Odbitak nadogradnje je puni
plaćeni iznos Repaira, pa se vraćeni iznos vodi u bazi i usklađuje s pretvorbom u istoj transakciji.
Webhook za djelomičan povrat (`charge.refunded` ispod punog iznosa) PRVO upiše oznaku
`partial_refund_noted` u inbox, pa zove `note_entitlement_partial_refund` (0207, odjeljak 10): pod
zaključavanjem retka upiše `entitlements.refunded_cents` (kumulativni Stripe `amount_refunded`,
nikad se ne smanjuje) i javi je li pravo već pretvoreno. `apply_entitlement_upgrade` pod istim
zaključavanjem odbija pretvorbu (`partially_refunded`) ako je `refunded_cents > 0` ili ako u inboxu
postoji oznaka djelomičnog povrata izvorne uplate ili uplate same nadogradnje. Redoslijed nije bitan:

- **povrat PRIJE pretvorbe**: pretvorba se odbija, uplata nadogradnje ide na ručni pregled
  (`needs_manual_review` uz `upgrade:upgrade_source_unavailable ... ishod=partially_refunded`), a
  plaćeni Repair ostaje netaknut; radnja je povrat uplate nadogradnje u Stripe sučelju;
- **povrat NAKON pretvorbe** (npr. Repair 9,99 + nadogradnja 10,00, pa povrat 5,00): pravo se
  **ne dira automatski**. Vraćanje na Repair oduzelo bi Final Pass koji je nadogradnja platila, a
  automatska naplata razlike ne postoji. Ishod je `needs_manual_review` uz `outcome_detail`
  `partial_refund_noted` i `outcome_note` `partial_refund_after_upgrade: uplata=<PaymentIntent>
  vraceno=<centi> naplaceno=<centi> ishod=upgraded_needs_review`, uz ERROR redak
  `webhook-mor partial_refund_after_upgrade`. Isto vrijedi za djelomičan povrat same uplate
  nadogradnje nakon pretvorbe.

Djelomičan povrat nikad ne oduzima pristup (PAY-09); pravo koje nije nadograđeno ostaje kakvo jest
(`processed` uz `partial_refund_noted`), samo više nije kandidat za nadogradnju.
`Idempotency-Key` PaymentIntenta nadogradnje nosi i iznos u centima, pa nova ciljna cijena daje
novi PaymentIntent, a ne stari iznos pod istim ključem.
Odbijanje je 409 (`upgrade_*`) ili 404 za tuđe ili nepostojeće pravo, bez PaymentIntenta.
PaymentIntent nosi `metadata[upgrade_from_entitlement_id]`, a webhook tada **pretvara isto
pravo** (`apply_entitlement_upgrade`, migracija 0207) umjesto da stvara drugo: isti vezani slot i
otisak dokumenta, dulji prozor, novi snapshot prava, `upgrade_order_id` = PaymentIntent
nadogradnje. Nadogradnja ne izdaje bonuse (pass kupon, nagrada preporučitelju).

Ishodi nadogradnje u `webhook_events`:

| Ishod i detalj | Značenje | Radnja |
|---|---|---|
| `processed` uz `entitlement_upgraded` | pravo je pretvoreno u Final Pass | ništa |
| `processed` uz `upgrade_duplicate` | ponovljena dostava iste uplate nadogradnje | ništa |
| `needs_manual_review` uz `outcome_detail` koji počinje s `upgrade:` | uplata nadogradnje je naplaćena, a pretvorba nije dopuštena: iznos ispod razlike (`upgrade:amount_below_catalog`), pravo tuđe ili nepostojeće, već nadograđeno drugom uplatom, vraćeno, isteklo, izvorna uplata djelomično vraćena (`upgrade:upgrade_source_partially_refunded`), vezani slot anonimiziran (`upgrade:upgrade_slot_anonymized`), ili ga je u međuvremenu promijenila druga uplata ili ga je purge anonimizirao između checkouta i uplate (`upgrade:upgrade_source_unavailable ... ishod=unavailable` ili `ishod=slot_anonymized`). ERROR redak `webhook-mor upgrade_needs_manual_review` | isti dan: povrat uplate nadogradnje u Stripe sučelju, ili ručna pretvorba ako je opravdana |
| `processed` uz `outcome_detail` `refunded` i `outcome_note` `upgrade_reverted: ...` | puni povrat **uplate nadogradnje**: pravo je vraćeno na plaćeni Repair (`revert_entitlement_upgrade`), Final Pass je nestao. Bilješka nosi `izvorna_uplata=<PaymentIntent>`, `naplaceno_repair=<centi>` i `ishod=` (`reverted`, `duplicate` za ponovljenu dostavu, `inactive` ako je pravo već bilo ugašeno) | ništa |
| `needs_manual_review` uz `outcome_detail` `refunded` | puni povrat koji dira nadogradnju, a jedna uplata je ostala bez prava. `outcome_note` počinje s `refund_of_upgraded_entitlement:` (vraćena je izvorna Repair uplata, pravo je ugašeno; nosi `nadogradnja=<PaymentIntent>` i `naplaceno_nadogradnje=<centi>`) ili s `upgrade_refunded:` (vraćena je uplata nadogradnje, a stanje prije nadogradnje NIJE zapamćeno, `no_snapshot`, pa je pravo ugašeno; nosi `izvorna_uplata=<PaymentIntent>` i `naplaceno_repair=<centi>`). `outcome_detail` ostaje `refunded`, pa oznaka punog povrata (`REFUND_MARKERS`) vrijedi kao i dosad | isti dan: za `refund_of_upgraded_entitlement` povrat uplate nadogradnje u Stripe sučelju; za `upgrade_refunded` povrat Repair uplate u Stripe sučelju (vidi napomenu ispod tablice) |
| `failed` uz `upgrade_source_lookup` ili `upgrade_apply` | čitanje prava ili `apply_entitlement_upgrade` je pao; Stripe ponavlja | provjeri bazu i migraciju 0207 |
| `needs_manual_review` uz `outcome_detail` `partial_refund_noted` i `outcome_note` `partial_refund_after_upgrade: ...` | djelomičan povrat izvorne Repair uplate ili uplate nadogradnje stigao je NAKON pretvorbe: Final Pass stoji uz manji neto iznos od cijene. Pravo nije dirano | isti dan, jedno od dvoje: (a) puni povrat uplate nadogradnje u Stripe sučelju, pa `revert_entitlement_upgrade` vrati plaćeni Repair; (b) svjesno zadrži Final Pass (npr. povrat je bio goodwill za drugi razlog) i to zabilježi uz redak. Nikad ne mijenjaj redak ručno u Repair |
| `failed` uz `outcome_detail` `partial_refund_noted` i `outcome_note` `partial_refund_note: ...` | `note_entitlement_partial_refund` je pao; oznaka u inboxu ostaje (pretvorba je i dalje odbija), Stripe ponavlja | provjeri bazu i migraciju 0207 |

**Nikad ne vraćaj `status = 'active'` na nadograđenom retku** (`upgrade_order_id` postavljen, a
`upgrade_reverted_at` prazan). Taj redak nosi Final Pass (`offer_code = final_pass_v1`, njegova prava,
prozor slota i vezani slot produljen na prozor passa), pa bi takvo "vraćanje Repaira" dalo Final
Pass za vraćen novac. Stanje Repaira prije nadogradnje vraća samo `revert_entitlement_upgrade`; za
`upgrade_refunded` (`no_snapshot`, stanje nije zapamćeno) ispravna radnja je povrat Repair uplate.

Ako je puni povrat uplate nadogradnje zabilježen PRIJE same uplate (Stripe ne jamči redoslijed),
pravo se uopće ne pretvara i Repair ostaje netaknut (`processed` uz `refunded_before_payment`). Povrat
koji stigne istodobno s pretvorbom (uplata pretvori pravo, pa vidi oznaku) pretvorbu vraća na Repair
istom funkcijom: `processed` uz `refunded_before_payment` i `outcome_note` `upgrade_reverted: ...`.
Samo bez zapamćenog stanja (`no_snapshot`) pravo se gasi, a ishod je `needs_manual_review` uz
`refunded_before_payment` i bilješku `upgrade_refunded: ...` (ista radnja kao u tablici).

Puni povrat **uplate nadogradnje** (traži se po `upgrade_order_id`) pravo NE gasi: vraćena je samo
uplata nadogradnje, a Repair uplata je i dalje naplaćena (odjeljak 14: korisnik koji je prvo kupio
Repair ne smije biti kažnjen). `revert_entitlement_upgrade` (0207) atomski vraća pravo na stanje
koje je `apply_entitlement_upgrade` zapamtio pri pretvorbi (`upgraded_from_*`): Repair proizvod,
ponudu, prava, prozor slota i rok potrošnje, a vezani slot na istek prije nadogradnje (slot vezan
tek pod Final Passom dobiva Repair prozor od vezivanja). Final Pass i produljen prozor tako nestaju:
isti rad nakon isteka Repair prozora više nije besplatan, a unutar njega re-check i dalje radi.
`upgrade_order_id` i `upgrade_paid_cents` ostaju kao trag, a `upgrade_reverted_at` bilježi vraćanje;
ponovljena dostava povrata je `duplicate` i ne mijenja ništa. Vraćeno pravo se samo ne nadograđuje
ponovno (409 `upgrade_already_applied`): novu nadogradnju nakon vraćene odobrava operater. Radnik
`process-bonus-outbox` povrat uplate nadogradnje ne tumači kao povrat izvorne Repair uplate
(nagrada preporučitelju za Repair ostaje), što je sada usklađeno sa stanjem prava: i Repair ostaje.
Pravo koje je već ugašeno (npr. prvo je vraćena izvorna Repair uplata) se ne oživljava (`inactive`).

Puni povrat **izvorne Repair uplate** prava koje je već nadograđeno gasi i Final Pass, uz ERROR
redak `webhook-mor refund_of_upgraded_entitlement`: odluči o povratu uplate nadogradnje (taj povrat
tada završi kao `upgrade_reverted` uz `ishod=inactive` i ništa ne oživljava). Povrat izvorne uplate
prava čija je nadogradnja već vraćena obična je Repair uplata (`processed`/`refunded`). Slučajevi
kad jedna uplata ostane bez prava (`refund_of_upgraded_entitlement` i `upgrade_refunded`) ostavljaju
trajan trag u bazi, ne samo u logu koji istječe: `outcome = 'needs_manual_review'`,
`outcome_detail = 'refunded'` i `outcome_note` s PaymentIntentom i iznosom druge uplate (tablica
iznad). Zato ih dnevni upit iz 5.1 (`outcome in (..., 'needs_manual_review', ...)`) vidi.

**Snapshot prava.** Webhook proizvod čita zajedno s pravima ponude (`offer_codes(capabilities)`) i
upisuje ih uz entitlement. Lektin proizvod bez `offer_code` ili bez prava ne knjiži se s praznim
snapshotom: ishod `failed` uz `product_without_offer: <id>` i ERROR redak
`webhook-mor product_without_offer`; popravi katalog (migracija 0207), Stripe ponovi dostavu. Pravo
upisano ručnim vezivanjem (5.1) dobiva `offer_code`, prava i prozor iz kataloga preko triggera
`entitlements_snapshot_offer`, ali nema `paid_amount_cents`, pa nije kandidat za nadogradnju dok
operater ne upiše stvarno naplaćeni iznos.

**F21 (povrat i obveze bonusa).** Puni povrat otkazuje obveze iz `bonus_outbox` za isti
PaymentIntent koje još čekaju (`status = 'cancelled'`, `last_error = 'refunded'`), a radnik
`process-bonus-outbox` prije i poslije izvršenja nagrade preporučitelju čita oznaku punog povrata
(`REFUND_MARKERS`) i stanje kupčeva prava: nagrada za vraćen novac se ne isplaćuje, a ona izdana u
prozoru povrata se povlači. Pad sporednog koraka povrata (ručna narudžba, pass kupon, obveze) i
dalje ostavlja oznaku `refund_consequences_failed`, a korak i greška su sada i u stupcu
`webhook_events.outcome_note` (migracija 0207), ne samo u logu.

**Ishod nagrade preporučitelju** (Codex pregled PR #217, M2). Webhook i radnik čitaju ishod
dodjele: prolazan pad (`grant_failed`, `error`) ostavlja obvezu `referrer_reward` u stanju
`pending` (ERROR redak `webhook-mor referrer_reward_retry`), pa je radnik ponavlja do
`BONUS_OUTBOX_MAX_ATTEMPTS`, a zatim `failed` čeka čovjeka. Trajna odluka bez dodjele (preporuke
nema ili je već nagrađena, prijevara po IP-u, mjesečni strop) ili prava koje je već izdao raniji
pokušaj (insert padne na 23505, dovršavanje `referral_signups` idempotentno pa nema nova dodjela)
zatvara obvezu kao `done` uz `bonus_outbox.done_reason` (`no_pending_referral`, `ip_match_fraud`,
`monthly_cap_reached`, `already_granted`). `done_reason` je revizijska bilješka o razlogu
zatvaranja obveze, NE izvor istine o izdanoj nagradi: nagrada može biti izdana i uz `done_reason`
koji to ne kaže, ako je kasniji korak (npr. upis u `referral_signups`) tiho pao. Izvor istine je
`referral_signups.status` (`rewarded`) i `referral_signups.referrer_reward_entitlement_id`.

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
