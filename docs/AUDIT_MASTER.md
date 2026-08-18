# AUDIT_MASTER.md, Lekta: konsolidirani audit i status

Datum konsolidacije: 28. srpnja 2026. Pregledan commit: `1329c43` (grana `audit/remediation-2026-07-16`).

**Zadnje ažuriranje: 17. kolovoza 2026.** (grana `fix/audit-remediation-2026-08`), nakon vanjskog
audita repozitorija i verifikacije njegovih tvrdnji protiv žive produkcije, staginga i GitHub
postavki. Do tog ažuriranja dokument je bio zamrznut na 28.7., a repozitorij je u međuvremenu
primio 221 commit, pa je sam bio primjer drifta na koji upozorava. Vidi poglavlje 4A.

## 0. Svrha ovog dokumenta

Ovo je JEDINI kanonski audit/status dokument za Lektu. Zamjenjuje 33 razasute
datoteke (9 raundova auditâ iz razdoblja 10.7. do 27.7.2026, njihove planove
remedijacije i statusne provjere) koje su obrisane iz repozitorija u istom
commitu koji uvodi ovaj dokument. Puni tekst svake obrisane datoteke ostaje
dostupan u git povijesti (`git log --follow -- <putanja>` ili `git show
<commit>:<putanja>`); popis obrisanih datoteka je u poglavlju 16.

**Pravilo održavanja od sada:** kad se napravi novi audit ili se nešto
popravi, ažuriraj OVAJ dokument (pomakni nalaz iz otvorenog u zatvoreni
registar, dodaj redak u promjenjivi zapisnik na dnu). Ne otvaraj novu
`AUDIT_*.md` ili `*_AUDIT.md` datoteku. Iznimka: dubinski, isključivo
read-only istražni materijal (sirovi nalazi prije sinteze) smije privremeno
živjeti u `docs/audit/` tijekom izrade, ali se unutar iste sesije mora
sažeti ovamo i obrisati, ne smije se akumulirati.

Ovaj dokument NE zamjenjuje forward-looking planove (`LEKTA_90_DAY_PLAN.md`,
`LEKTA_PRODUCT_ROADMAP.md`, `LEKTA_IMPLEMENTATION_BACKLOG.md`,
`docs/roadmap/CO_PILOT_STRATEGY.md`, `docs/roadmap/PHASE4_CLOUD_INTEGRITY.md`,
`docs/roadmap/LAUNCH_CHECKLIST.md`) ni operativne runbookove (`PRE_LAUNCH.md`,
`PRE_LAUNCH_CHECKLIST.md`, `GO_LIVE_*.md`, `RUNBOOK_OPS.md`) koji ostaju
zasebni jer opisuju BUDUĆI rad i vlasničke korake, ne nalaze audita. Gdje se
preklapaju, ovaj dokument upućuje na njih umjesto da duplicira sadržaj.

---

## 1. Sažetak za odluku

Lekta je tehnički zrela klijentska aplikacija: lokalna analiza radi u Web
Workeru, parser i citation engine su golden-pokriveni, `src/` je u cijelosti
tipiziran bez `@ts-nocheck`, CI (9 workflowa, stanje 17.8.) vrti typecheck/testove/build/
conformance/security na svaki push. Repair Engine je u zadnja 3 dana (25 do
28.7.) prošao veliku seriju popravaka: oba P0 nalaza (gubitak OMML jednadžbi,
malformed XML kod uparenih praznih elemenata) i gotovo svi P1 nalazi iz
adversarijalnog audita od 25.7. su zatvoreni kroz 20+ ciljanih commitova s
regresijskim testovima. Ovo je najvažnija promjena od zadnjeg pisanja bilo
kojeg internog audit dokumenta i nijedan od njih to još ne odražava (vidi
poglavlje 5).

Ono što ostaje stvarno otvoreno grupira se u tri vrste:

1. **Vlasnički/pravni koraci koji ne traže kod**: OIB, adresa i voditelj
   obrade u `data/legal/provider.json` su prazni; naplata (Lemon Squeezy
   varijante, webhook, tajne) nije spojena; domena je i dalje Netlify
   poddomena. Ovo je poznato i praćeno u `docs/PRE_LAUNCH.md` i
   `docs/GO_LIVE_NAPLATA.md`, nije novi nalaz.
2. **Stvarni preostali kod nalazi** (popisani u poglavljima 5 do 9): profil
   se može tiho potvrditi bez da je studij prepoznat (poglavlje 7, sad
   RIJEŠENO), preostali nalazi na ekranu rezultata iz audita 23.7. (poglavlje
   6), analytics/error endpointi prazni (poglavlje 9), Repair Engine ima
   preostala 4 do 5 P1/P2 nalaza plus podatkovni gap od 205/395 profila bez
   `autoFixable` pravila (poglavlje 5.2).
3. **Dokumentacijski dug**, sada zatvoren ovim dokumentom.

**Preporuka nepromijenjena naspram vanjskog audita od 27.7.**: besplatna
beta može krenuti čim se zatvori kratki popis u poglavlju 14; puna naplata
čeka pravni identitet i naplatnu infrastrukturu (vlasnički koraci, kod je
spreman prema `docs/GO_LIVE_NAPLATA.md`).

---

## 2. Status po površini (GO/NO-GO)

| Površina | Status | Uvjet |
|---|---|---|
| Javna lokalna analiza (bez naplate) | **CONDITIONAL GO** | Zatvoriti poglavlje 14 (P0 popis) |
| Besplatni server-side repair (beta, `REPAIR_FREE_MODE=true`) | **CONDITIONAL GO** | Isto + potvrditi rate limit slojeve (poglavlje 9) |
| Naplaćeni repair (produkcija) | **NO-GO** | Pravni identitet + Lemon Squeezy infrastruktura (vlasnički, kod gotov) |
| Rokovi/podsjetnici e-mailom | **NO-GO (inertno)** | Domena + Resend DPA/regija (vlasnički) |
| Cloud integritet (plagijat/AI-detekcija) | **Nije pokrenuto** | Faza 4, namjerno posljednja (`docs/roadmap/PHASE4_CLOUD_INTEGRITY.md`) |

---

## 3. Oznake korištene u ovom dokumentu

Preneseno iz izvornih audita radi razumljivosti povijesnih ID-jeva (AUD-\*,
RE-\*, LEKTA-SEC-\*, BL-\*, ux-\*, itd. i dalje se pojavljuju kao referenca).

- **Prioritet**: P0 (blokira launch površinu), P1 (jezgra iskustva/prihoda),
  P2 (kvaliteta), P3 (kozmetika/nice-to-have).
- **Verdikt nalaza**: CONFIRMED (dokazano čitanjem koda), PLAUSIBLE
  (vjerojatno, nije 100% reproducirano), REJECTED (provjereno, nije problem).
- **Status u ovom dokumentu**: OTVORENO / RIJEŠENO (s dokazom, commit ili
  file:line) / DJELOMIČNO / ODLUKA (čeka vlasnika) / BY-DESIGN (namjerno) /
  ODBAČENO (verificirano kao ne-problem).

---

## 4. P0, kriticno otvoreno, danas

| ID | Opis | Izvor | Dokaz stanja |
|---|---|---|---|
| PRAVNI IDENTITET | `data/legal/provider.json`: `oib`, `address`, `privacyController` prazni; `contactEmail` je Gmail adresa | Vanjski audit 27.7. + `docs/PRE_LAUNCH.md` sekcija C | Potvrđeno čitanjem datoteke 28.7., blokira svaku ozbiljnu B2C naplatu |

Napomena: RESULT-02, RESULT-03 i RESULT-05 su RIJEŠENI 28.7.; RESULT-01 i RESULT-04 (izvorno P0) su DJELOMIČNO ili
potpuno adresirani, sve u poglavlju 6. LEKTA-SEC-01/02 (izvorno High) su
RIJEŠENI, vidi poglavlje 8. RE-01/RE-02 (izvorno P0, gubitak sadržaja) su
RIJEŠENI, vidi poglavlje 5.1. Ovo je najkraći P0 popis otkad postoji audit
povijest za ovaj projekt.

---

## 4A. Vanjski audit repozitorija (17.8.2026.): rekoncilijacija

Vanjski audit proglasio je Lektu NO-GO za launch s naplatom. Svaka tvrdnja je prije unosa
ovamo VERIFICIRANA protiv stvarnog stanja (živa produkcijska baza `zrrjttizjyfcxmcpgzml`,
staging `bnyemcnsphlitjradrst`, GitHub API, kod na grani). Nalazi koji nisu izdržali provjeru
navedeni su odvojeno, jer je precijenjen nalaz jednako štetan kao propušten.

### 4A.1 Potvrđeno i OTVORENO (P0)

| ID | Opis | Dokaz |
|---|---|---|
| A26-01 | `data/legal/provider.json`: `oib`, `address`, `privacyController` prazni, kontakt Gmail | Isto kao P0 iz srpnja, i dalje otvoreno |
| A26-02 | Svih 20 aktivnih redaka u `products` ima `mor_product_id = null`, pa `create-checkout` vraća `409 product_not_mapped` | SQL nad produkcijom 17.8. Nije bug nego neizvršen korak `GO_LIVE_NAPLATA.md` §3.3 |
| A26-03 | Cjenik proturječan: `pass_zavrsni` 9,99/180d dominira `slot_zavrsni_do_obrane` 9,99/120d; `pass_diplomski` 14,99/180d dominira `slot_diplomski_do_obrane` 16,99/120d | SQL nad produkcijom 17.8. |
| A26-04 | Migracijski identitet ne postoji: produkcija pamti 67 verzija od kojih je samo JEDNA četveroznamenkasta (`0053`), ostale su timestampi; repo ima 85 numeriranih | `supabase_migrations.schema_migrations` |
| A26-05 | Staging nije vjerna kopija: 3 Edge funkcije naspram 16 u produkciji, a migracijski je ISPRED produkcije (105 naspram 67) | `list_edge_functions` + SQL |
| A26-06 | `master` nezaštićen: jedini ruleset ("Tamara") ima `enforcement: disabled`, branch protection vraća 404 | GitHub API |
| A26-07 | `src/config/deployment.ts` bez env varijabli tiho pada na produkcijski Supabase URL i anon ključ, pa `npm run dev` može čitati živu produkciju | Čitanje datoteke |
| A26-08 | Privola nije dokaziva: server prima `consent.text`, `consent.timestamp` i `termsVersion` doslovno od klijenta; kanonski tekst živi samo u `src/ui/app.ts` i server ga nikad ne vidi | `create-checkout/index.ts:74-131` |
| A26-09 | Webhook ne provjerava `store_id`, `test_mode` ni plaćeni iznos; nepoznat proizvod vraća 200 pa provider ne retry-a; nema tablice sirovih evenata | `webhook-mor/index.ts`, `src/report/webhook.ts` |
| A26-10 | Baza: 13 tablica s RLS bez ijedne politike, `pg_net` u `public`, `increment_job_view(uuid)` izvršiva od `anon`, zaštita od kompromitiranih lozinki isključena | Supabase security advisor 17.8. |
| A26-11 | **NIJE BILO U AUDITU.** `src/repair/zip-codec.ts` nikad ne provjerava CRC ulaznih zip članova (`crc32()` se koristi samo pri pisanju), a integrity gate skenira isključivo dijelove koje je sam mijenjao. Motor nema nijedan mehanizam koji bi razlikovao oštećen ulazni docx od ispravnog | `zip-codec.ts:186-225`, `apply-fixers.ts:825-827` |
| A26-12 | Word Tier 2 nije release gate: `verify:word` je ručna PowerShell skripta koju ne zove nijedan od 9 workflowa | `package.json`, `.github/workflows/` |
| A26-13 | CI retry pretvara stvaran pad u zeleno (`playwright.config.ts:13`), a jedini repair E2E (`tests/ux/repair-panel.spec.ts`) ne zove `repair-docx` ni ne otvara izlazni docx | Čitanje konfiguracije i testa |
| A26-14 | `tsc --noEmit` pokriva samo `src`; `tests`, `scripts`, `supabase/functions` i `vite.config.ts` su izvan njega. `bundleSizeGuard` je definiran ali nije registriran u `plugins`, dakle mrtav | `tsconfig.json`, `vite.config.ts:143` naspram `:325` |

### 4A.2 Zatvoreno 17.8.2026.

| ID | Opis | Kako je zatvoreno |
|---|---|---|
| A26-15 | `preflight-start` i `preflight-result` bile su ACTIVE u produkciji dok je `docs/deploy/PREFLIGHT_DEPLOY.md` tvrdio da je stup ODGOĐEN. Frontend ih nikad nije zvao, pa su bile čista izložena površina | Obje undeployane; runbook nosi zapis o gašenju |
| A26-16 | `cleanup-orphan-repairs` i `delete-repair-job` nosile su oznaku "NACRT" iako su ACTIVE u produkciji | Zaglavlja ispravljena u stvarni status |
| A26-17 | Nije postojao način da se vidi razlika između repozitorija i deployanog stanja | `npm run deploy-drift` -> `docs/generated/DEPLOY_DRIFT.md` |
| A26-06 | `master` nezaštićen (ruleset "Tamara" `enforcement: disabled`) | Branch protection aktivna: obvezan PR, required checks `build-gate`/`conformance-matrix`/`check`, bez force-pusha i brisanja |
| A26-08 | Privola je bila ono što klijent kaže da jest | Kanonski tekst u `src/legal/consent-text.ts` (dijeli ga i Deno); verzija obavezna, tekst se uspoređuje, `consented_at` je serverski, klijentova tvrdnja ide u `client_claimed_at` (0091) |
| A26-09 | Webhook bez provjere `store_id`, `test_mode` i iznosa; nepoznat proizvod nestaje uz 200 | `acceptEvent` + `isFullRefund` (fail-closed); inbox `webhook_events` (0092) zapisuje događaj prije obrade, pa je replay moguć |
| A26-11 | `zip-codec.ts` nikad nije provjeravao CRC ulaznih članova | `readZip` provjerava CRC iz central directoryja i odbija oštećen paket imenujući dio; dokazano testom koji kvari jedan bajt sadržaja |
| SEC-01, SEC-02 | CSP je dopuštao `https://*.supabase.co` i `https://*.lemonsqueezy.com`, uz komentar da je odljev tehnički onemogućen | `cspAllowlist` plugin supstituira KONKRETNE hostove u `dist/_headers`; `verify-deploy-dist` pada na wildcard ili nesupstituiran token |
| SEC-11, SEC-12 | CORS je bezuvjetno dopuštao localhost, a tuđem porijeklu vraćao primarno dopušteno | localhost samo uz `LEKTA_ALLOW_LOCALHOST_CORS=1`; nedopušteno porijeklo NE dobiva `Access-Control-Allow-Origin` uopće |
| SEC-13 | `analytics-event` vraćao 200 i kad zapis padne, pa je gubitak telemetrije izgledao kao uredan rad | Neuspjeh vraća 202 uz `reason`, klijent i dalje nije srušen |
| SEC-21 | `repair-docx` provjeravao samo 2 magic bajta (slabije od `field-render`) | Provjeravaju se sva četiri bajta lokalnog ZIP zaglavlja |
| CODE-11 | `.gitignore` uzorkom `.env.*` pojeo i sablonu, pa kanonski popis varijabli nije postojao | `.env.example` (samo imena i objašnjenja, nijedna vrijednost) uz izričit izuzetak u `.gitignore` |
| OPS-01..03 | `health` je vraćao 200 za svaku metodu, nije provjeravao nijednu ovisnost i nije nosio verziju: monitor je javljao "zdravo" i kad je baza nedostupna | Metode osim GET/HEAD/OPTIONS daju 405; provjerava se baza uz 3 s timeout; odgovor nosi `release` i `commit`; pad ovisnosti daje **503**, ne 200 uz `degraded` u tijelu |
| OPS-13..17, UX-12..14 | Podsjetnici: sirova HTML interpolacija iz baze, naslovi otkrivaju vrstu rada i fakultet, `daysLeft <= 0` bez donje granice, odjava se izvršavala na GET, greške upisa se ignorirale | `esc()` na svim HTML interpolacijama; neutralni naslovi; granica `daysLeft >= -1`; odjava mijenja stanje samo na POST (GET pita), nudi povrat i pošteno prijavljuje neuspjeh; dodan `List-Unsubscribe` |
| TEST-01 (dio) | `tsc --noEmit` pokrivao je samo `src`, pa `supabase/functions/**` nije imao NIJEDNU provjeru: ondje živi kod koji barata novcem, tuđim dokumentima i pravom pristupa | `npm run check:edge` (`scripts/check-edge.mjs`) vrti `deno check` nad svih 21 funkcijom i **pada** ako Deno nedostaje, umjesto da se tiho preskoči; uvršten u `check:full` i u CI (`check.yml`) |
| TEST-04 | `bundleSizeGuard` je bio definiran, imao smislenu provjeru i komentar da "PADA produkcijski build", ali NIJE bio u `plugins` nizu, pa se nikad nije izvršio | Registriran. **Pritom se otkrilo da je glavni entry narastao s dokumentiranih ~502 KB na 929 KB**, dakle 33% preko starog budžeta od 700 KB, a nitko to nije vidio jer guard nije radio. Lazy split je netaknut (heavy chunkovi su zasebni), pa je riječ o postupnom rastu, ne o urušenom code-splitu. Budžet je postavljen na današnju mjeru (960 KB) da spriječi DALJNJI rast; smanjivanje entryja ostaje otvoreno |
| DOCX-01, DOCX-02 | Repair je na svaki poziv slao naslov, autora i naslove poglavlja (`parsedStructure`), a server ih je koristio samo kao presence-check | Polje uklonjeno iz repair puta (klijent i server); otisak se ionako računa iz bajtova zipa (RE-18). Put punog izvještaja ga zadržava jer ondje JEST potreban. Test sada čuva da se ne vrati |
| UX-07 | JSON-LD je oglašavao `Offer` s cijenom 0 uz plaćene pakete | `offers` uklonjen: proizvod ima besplatan i plaćen sloj, pa nijedna jedna cijena nije istinita, a cijene ionako žive u bazi (`products`), ne u HTML-u |
| CODE-22..24 | `package.json` bez `engines`, `packageManager`, `license`, `repository` | Dodani: `node >=20` (Netlify gradi na 20, CI dokazuje 20 i 24), `npm@11.11.0`, `UNLICENSED`, git URL |
| DOCX-13 | Zahtjev s nepoznatim `fixerId` tiho se preskakao: korisnik bi dobio dokument i vjerovao da je stavka primijenjena | Odgovor nosi `unknownFixers`, klijent ga čita I sučelje ga PRIKAZUJE (odvojeno od `skipped`, koji znači "prepoznato, ali nije trebalo"). Tišina je ovdje najgori ishod jer je nerazlučiva od uspjeha; podatak koji se vrati a ne prikaže bio bi ista rupa |
| DOCX-14 | Broj zahtjeva bio je ograničen (64), ali njihov SADRŽAJ nije: jedan zahtjev mogao je nositi niz od desetaka tisuća indeksa | `paramsWithinBudget` u `docx-budget.ts` (jedan izvor granica): 16 KB po zahtjevu i 2000 elemenata po nizu, uz dubinsko pretraživanje. Prekoračenje se odbija glasno, ne preskače |
| DOCX-19 | ZIP64 i lozinkom zaštićeni paketi nisu se prepoznavali: sentinel (`0xffff`/`0xffffffff`) uzeo bi se kao stvarna vrijednost i čitanje bi krenulo s besmislenog offseta | `readZip` odbija oboje s razlogom koji korisnika vodi u pravom smjeru; zaštićen dokument se izričito ne prijavljuje kao "oštećen" |
| SEC-06 | `adminSignOut` brisao je samo lokalni zapis; refresh token je ostajao valjan pa je ukraden token radio i nakon "odjave" | Poziva `/auth/v1/logout?scope=global`. Lokalni zapis se briše ODMAH i neovisno o ishodu poziva, da mrežna greška ne ostavi otvorenu sesiju na ekranu |
| DOCX-12 | Globalni Storage cap bio je fail-open na GREŠKI UPITA: `count` se defaultirao na 0, pa je pad upita značio "kvota je prazna, samo naprijed" — strop nije štitio ništa upravo kad je baza u problemu | Greška upita se razlikuje od "nula poslova" i vodi na preskakanje pohrane. Fail-closed je ovdje jeftin: popravljeni docx se svejedno vraća, gubi se samo zapis u "Moji popravci" i sučelje to pošteno kaže (`jobId: null`) |
| CODE-06, CODE-07 | Svi fallbackovi u `mapProductRow` išli su u smjeru "pretpostavi da je u redu": redak bez cijene postajao je AKTIVAN proizvod od 0 EUR, dakle nešto što se može prodati besplatno. Odgovor koji nije niz tiho je postajao prazan katalog | Redak s neispravnom/negativnom cijenom ili bez `id` označava se NEAKTIVNIM (jedan pokvaren proizvod ne ruši paywall, ali se ni ne prodaje); izričita cijena 0 ostaje legitimna. Odgovor koji nije niz baca umjesto da vrati `[]` |
| CODE-08 (točnije) | Audit navodi "više izvora istine za cijene". Izvora je **TRI**, i jedan je mrtav: popis u `src/ui/app.ts` (jedini koji korisnik vidi), `data/packages.json` kroz `config-loader` (ima paket `instant` 9 EUR kojeg u UI-ju nema, a čita ga samo test koji tvrdi da je jednak svojoj JSON datoteci), i tablica `products` (jedini mjerodavan cjenik popravka) | Granica je zapisana na sva tri mjesta. Namjerno BEZ promjene ponašanja: spajanje popisa promijenilo bi ono što korisnik vidi u obrascu narudžbe, što je proizvodna odluka, ne remedijacija |
| P0-13, P0-12 (dio) | Nije postojala jedna naredba koja vrti sve razine dokaza, pa se za konkretan commit nije moglo reći je li Tier 2 (pravi Word) uopće izveden | `npm run release:check` vrti svih 8 razina i piše `docs/generated/RELEASE_PROOF.json` (commit, vrijeme, ishod po razini). Nedostupna razina se bilježi kao `unavailable`, NE kao prolaz. `verify-deploy-dist` odbija zastario ili nepotpun dokaz kad je `LEKTA_REQUIRE_RELEASE_PROOF=1`; do tada glasno upozorava, da prvi sljedeći deploy ne padne prije nego vlasnik jednom odvrti višesatni lanac |
| TEST-10 | Playwright retry pretvarao je stvaran pad u zeleno (točno scenarij iz audita: glavni repair tok pao prvi put, workflow zelen) | `failOnFlakyTests` u CI-ju: retry ostaje (drugi pokušaj daje trace i screenshot), ali run više ne završava zeleno ako je test uspio tek iz drugog pokušaja |
| **NOVO, izvan audita** | **Vlastita regresija, uhvaćena prije commita.** Prvo rješenje za A26-07 bacalo je iznimku u dev načinu bez Supabase varijabli. To ruši app na učitavanju modula, dakle i Playwright UX suite (koji diže `npm run dev` i uopće ne treba backend). `npm run check` to NE bi uhvatio jer ne vrti Playwright | Dev bez konfiguracije sada pokazuje na LOKALNI Supabase (`127.0.0.1:54321`) uz glasno upozorenje: slučajan poziv pukne vidljivo umjesto da tiho uspije nad produkcijom, a app se i dalje diže. Potvrđeno punim UX prolazom (40/41; jedini pad je dokumentirani lokalni resursni flake koji izolirano prolazi) |
| DOCX-17, DOCX-18 | `writeZip` je REKOMPRIMIRAO svaki zapis, pa je popravak jednog XML-a usput prepisivao i ugrađene slike, fontove i medij, a gubili su se timestampovi, kompresijska metoda i atributi. Svako ponovno pakiranje je nova prilika da paket suptilno odstupi od onoga što je Word napisao | Zapis koji nijedan fixer nije dirao prepisuje se BAJT ZA BAJT, s izvornom metodom, vremenom i atributima. Kriterij je identitet objekta (`entry.data === raw.originalData`), pravilo na koje se `apply-fixers` već oslanja. **Dokazano na sve tri razine**: golden nepromijenjen, Tier 1 (python-docx) 33/33 popravljenih paketa, Tier 2 (pravi Word) oba gatea prošla uz očuvane tablicu, sliku, fusnotu, sekcije, zaglavlja i dijakritiku. Novi test hvata regresiju usporedbom KOMPRIMIRANIH bajtova, jer golden gleda dekomprimirani sadržaj i prošao bi i da se sve ponovno pakira |
| DOCX-20 (dio) | Vrata integriteta provjeravala su samo je li DIRANI dio dobro oblikovan XML. Paket može biti sastavljen od samih besprijekornih XML-ova i svejedno ne biti valjan OPC: dio bez zapisa u `[Content_Types].xml`, ili `.rels` koji pokazuje na dio kojeg nema. Word oboje javlja kao "dokument je oštećen", a nastaje upravo kad popravak DODA ili UKLONI dio | `checkPackageStructure` nad CIJELIM konačnim paketom, uz vrata isporuke. Dokazano u oba smjera: svih 13 fixtura prolazi bez lažnog pozitiva, a uklonjena slika i dio s nedeklariranim tipom se hvataju. Vanjske veze (`TargetMode="External"`) se preskaču, inače bi svaki dokument s hipervezom bio proglašen neispravnim. Zaustavlja SAMO ono što je popravak sam uveo (struktura se mjeri i na ulazu i na izlazu), isto pravilo koje gate već primjenjuje na XML kvarove: dokument koji je stigao neispravan takav i odlazi. Bez te razlike gate je odbijao 29 postojećih testnih paketa. Preostaje neprovjereno: puna OOXML shema i digitalni potpisi |
| TEST-15 | gitleaks binarij se preuzimao i instalirao BEZ ijedne provjere integriteta, i to u jobu koji postoji zbog sigurnosti | SHA256 se provjerava prije raspakiranja. Hash je UPISAN u workflow, ne dohvaćen uz binarij: to štiti od izmijenjenog/okrnjenog preuzimanja, ali NE od kompromitiranog releasea (za to bi trebao potpis, koji gitleaks ne nudi) |
| TEST-16 | Sve GitHub akcije koristile su promjenjive tagove, pa se sadržaj treće strane mogao promijeniti bez ijedne promjene u Lekti | Svih 9 referenci pinano na commit SHA uz komentar s verzijom (Dependabot ih i dalje ažurira) |
| TEST-20 | Dependabot je u CIJELOSTI ignorirao `netlify-cli` i `supabase`, a upravo ta dva alata kontroliraju deploy i bazu | Ignoriraju se samo major i minor (to je bio šum); PATCH se prati, jer u tom pojasu stižu sigurnosne zakrpe |
| TEST-09, TEST-12 (dio) | Playwright je vrtio samo Desktop Chrome; mobilni audit bio je uglavnom provjera vidljivosti | Dodan `mobile-chromium` projekt (Pixel 5 emulacija, bez novog preglednika): **38 provjera zeleno**. Firefox/WebKit ostaju otvoreni, jer ih nema smisla uključiti dok se ne može dokazati da prolaze |
| **NOVO, izvan audita** | **Pod stvarnom mobilnom emulacijom (`isMobile` + `hasTouch`) klik na "Nastavi na profil" u sticky navigaciji ne prolazi ni u 120 s.** Na desktop Chromeu isti test prolazi, pa je nalaz bio nevidljiv. Ovo je točno ono na što TEST-12 cilja: mobilni audit nije dokazivao da se sučelje da koristiti prstom | `roadmap-v2.spec.ts` je IZRIČITO izuzet iz mobilnog projekta uz komentar koji imenuje nalaz, umjesto da se projekt tiho ugasi. Popravak je UX posao (dodirna meta ili preklapanje sticky trake), ne remedijacija |
| OPS-06, OPS-07, OPS-10, OPS-12 | Podsjetnici: `select('*')` bez ograničenja i bez prozora po datumu (raste s bazom, ne s poslom), pa se slalo PA tek onda upisivao marker. Dva usporedna cron poziva oba bi vidjela `null` i poslala duplikat; ako bi e-mail otišao a upis markera pao, sljedeći bi ga cron poslao ponovno | Prozor po datumu (-2 do +31 dan) i `limit(200)`; marker se postavlja PRVI, uvjetno (`is(col, null)`), pa uspije samo JEDAN pozivatelj. Ako slanje padne, marker se vraća na null. Preostali prozor je obrnut i sigurniji: moguć propušten podsjetnik, ne duplikat |
| OPS-18, OPS-19, OPS-20 | Katedra worker je runove samo ČITAO, pa su dva ticka dispatchala isti skup; serijska petlja s 180 s po runu mogla je trajati do 30 min (Edge toliko ne živi); djelomičan neuspjeh vraćao je 502 pa bi ponovni pokušaj re-dispatchao i uspjele runove | Atomsko preuzimanje UPDATE-om uz `updated_at < cutoff` (lease 10 min, bez nove kolone i migracije); budžet ticka (100 s) zaustavlja PRIJE novog poziva i prijavljuje `deferred`; djelomičan neuspjeh vraća 200, jer se neuspjeli runovi ionako vrate u red kad lease istekne |
| DOCX-21 (dio) | Nije postojala usporedba koja bi otkrila POMAKNUT ili slomljen sadržaj: postojeće Tier 2 provjere samo BROJE elemente (1 tablica, 1 slika), pa ne vide tablicu koja je izgubila stupac ni sliku koja je "preživjela" srušena na nulu | Tier 2 mjeri dimenzije tablica (`3x4`), dimenzije slika (`90x60`) i njihov međusobni REDOSLIJED (`TI`), sve iz živog Worda. Broj STRANICA se namjerno ne uspoređuje: popravak mijenja font, prored i margine, pa je drugačija paginacija očekivana, a ne kvar. Puna vizualna usporedba renderiranih stranica ostaje otvorena |
| DOCX-05 | Odgovor je bio JSON s `docxBase64`, pa su za dokument od 20 MB u istom trenutku živjeli: ulazni bajtovi, rezultat, base64 string (~27 MB) i JOŠ jedna njegova kopija unutar `JSON.stringify` (~27 MB). Edge runtime ima 256 MB | Binarni okvir (duljina + JSON metapodaci + sirovi bajtovi) briše obje kopije stringova, ~54 MB po velikom popravku. Vlastiti okvir, ne HTTP zaglavlje: metapodaci nose changelog i provjeru izvora (kilobajti), a zaglavlja imaju tihe granice od 8–16 KB. **Prijelazno razdoblje je ugrađeno**: server šalje binarno samo kad klijent pošalje `X-Lekta-Response: binary`, inače zatečeni JSON, jer deploy nije atomaran. Oba oblika grade ishod ISTOM funkcijom (`okFromMeta`), a test tvrdi da daju identičan rezultat |
| **NOVO, izvan audita** | **`repair-docx` i `generate-report` ne bi se UČITALI da su deployani bez bundlanja.** `src/repair/zip-codec.ts`, `src/docx/parser.ts` i `src/report/report.ts` uvozili su relativne module BEZ `.ts` nastavka, što Deno zahtijeva, a CLAUDE.md izričito propisuje. Radilo je samo zato što `scripts/bundle-edge.mjs` (esbuild) razriješi nastavak prije deploya, pa je `supabase functions deploy` bio skrivena mina | Dodani `.ts` nastavci; `check:edge` sada hvata ovu klasu greške umjesto da se otkrije pri deployu |
| **NOVO, izvan audita** | **Link za odjavu u SVAKOM podsjetniku bio je 404.** Poruke su linkale na `${APP_BASE_URL}/odjava-podsjetnika`, a ta ruta ne postoji: nema je kao stranicu, `public/_redirects` ne postoji, `netlify.toml` nema redirect. Nije naškodilo samo zato što su podsjetnici još inertni (bez Resend tajni nijedna poruka nije poslana), ali bi puknulo u trenutku uključenja, i to na obavezi koja mora raditi iz prve | Linka se izravno na Edge funkciju; `UNSUB_PUBLIC_URL` ostaje za ljepši javni URL kad se doda pravi redirect |

### 4A.2b Napisano, ali ČEKA primjenu na produkciju

Ovo NIJE zatvoreno: kod i migracije postoje u repozitoriju, ali zahvat nad živom bazom nije izveden.

| ID | Što čeka | Gdje je |
|---|---|---|
| A26-04 | Usklađivanje migracijskog dnevnika produkcije (66 redaka, UPDATE verzije) | `docs/deploy/MIGRATION_IDENTITY.md`, korak 3. NE kroz `supabase migration repair` |
| A26-05 | Staging se gradi iznova iz produkcije i dobiva svih 21 Edge funkciju | isto, korak 5 |
| A26-10 | Grantovi i RLS po advisoru | `supabase/migrations/0093_security_advisor_2026_08.sql` (nije primijenjena) |
| A26-02, A26-03 | Mapiranje `mor_product_id` i ispravak dominiranog cjenika kroz `set_product_price` | `docs/GO_LIVE_NAPLATA.md` §3.2 i §3.3 |

### 4A.3 Nalazi audita koji NISU izdržali provjeru

Navedeni su namjerno: dokument koji prepisuje tuđe tvrdnje bez provjere sam postaje izvor drifta.

| Tvrdnja audita | Stvarno stanje |
|---|---|
| "Nepoznat `workType` tiho se pretvara u završni rad" | NETOČNO. `repair-docx/index.ts:222` odbija s 400 (`isReportWorkType`). Fallback postoji samo kao `suggestedWorkType` u 409 grani |
| "Copy tvrdi da doslovni tekst ne ulazi u metapodatke, a ulazi" | DJELOMIČNO. Pravni tekst (`src/legal/legal-content.ts:109`) pošteno navodi naslov, autora i strukturu naslova. Kontradikcija postoji samo u marketinškom copyju (`index.html:6`, `:2055`). K tome je `parsedStructure` na serveru funkcionalno mrtav (samo presence-check), pa je ispravan popravak brisanje polja |
| "Staging zaostaje za produkcijom (~0070 naspram 0085)" | OBRNUTO. Staging je ISPRED produkcije (105 naspram 67 migracija) |
| "Produkcijska migracijska povijest završava oko 0061" | GORE od toga. U produkciji postoji samo jedna četveroznamenkasta verzija (`0053`); numeracija praktički ne postoji |
| "`field-render` provjerava samo ZIP magic byteove" | DJELOMIČNO, i pogrešna meta: `field-render:27` provjerava punih 4 bajta. Slabija je `repair-docx:218` s 2 bajta |
| "FAQ schema je ručno duplicirana pa se vidljivi FAQ i JSON-LD mogu razići" (UX-08) | DJELOMIČNO. Nisu generirani iz istog izvora, to stoji, ali `tests/faq-jsonld.test.ts` već čuva sinkronizaciju i pada kad se raziđu (povod mu je bio točno takav slučaj). Rizik je zato manji nego što nalaz sugerira |
| "Repair E2E stvarno pada u CI-ju" | NEPOTVRĐENO iz CI-ja (GitHub Actions API nedostupan pri pregledu). Potvrđen je samo mehanizam koji to omogućuje, vidi A26-13 |

---

## 5. Repair Engine, pregled

Repair Engine je bio predmet zasebnog adversarijalnog audita 25.7.2026.
(`AUDIT_REPAIR_ENGINE_2026-07-25.md`, 16 dimenzija, 216 kandidata, 141
CONFIRMED) i pripadnog plana faza (`PLAN_REPAIR_REMEDIATION_2026-07-25.md`,
Faze 0 do 7). Nijedan od ta dva dokumenta nije ažuriran otkad je izvršenje
plana krenulo, pa je slika u njima danas netočna. Ovo poglavlje je
rekonstruirano iz `git log` (25. do 28.7., grana `audit/remediation-2026-07-16`)
i izravne provjere koda, ne iz teksta plana.

### 5.1 P0 (gubitak sadržaja/korupcija), oba RIJEŠENA

| ID | Opis | Commit | Dokaz |
|---|---|---|---|
| RE-01 | `empty-paragraph-fixer` brisao odlomak čiji je jedini sadržaj OMML jednadžba (`m:oMath`/`m:oMathPara`, tekst u `<m:t>` ne `<w:t>`) | `16cb20b` | `src/analysis/paragraph-cleanup.ts` sad eksplicitno štiti `m:oMath(Para)?`; regresijski testovi u `paragraph-cleanup.test.ts` (blok, inline i 3 uzastopne jednadžbe) |
| RE-02 | `upsertChild` mogao upisati atribut u ZATVARAJUĆI tag kod uparenog praznog elementa (`<name></name>`), dajući malformed XML | `089cd11` | `src/repair/xml-patch.ts`, komentar i grananje eksplicitno referenciraju RE-02: atribut ide isključivo u otvarajući tag |

### 5.2 P1, status po ID-ju

| ID | Opis | Status | Commit |
|---|---|---|---|
| RE-03 | Prored/poravnanje/razmak tvrdo ciljali literalni "Normal" stil, no-op na LibreOffice/Google Docs/hrvatski Word | RIJEŠENO | `6705276` |
| RE-04 | Poravnanje broja stranice mrtvo (gate `=== true` umjesto stringa) | RIJEŠENO | `2c14199` |
| RE-05 | Umetanje numeracije od Uvoda unosilo novi prekršaj poravnanja | RIJEŠENO | `05390a3` |
| RE-06 | 205/395 profila (uklj. SVI FPZG i Pravo) nemaju nijedan `autoFixable` ruleEntry | **OTVORENO** (podatkovni zadatak, veliki opseg) | nema commita; Faza 6 plana |
| RE-07 | `patchFooterPageAlignment` nije radio kad Word izostavlja `w:jc` | RIJEŠENO | `55572a3` |
| RE-08 | Velika slova naslova prepoznavala samo literalni "Heading{n}" | RIJEŠENO | `80a46eb` |
| RE-09 | `toCroatianUpper` kvario heksadecimalne XML entitete | RIJEŠENO | `e71b1b7` |
| RE-10 | Naslov unutar `w:pPrChange` (track changes) tretiran kao živi | RIJEŠENO | `083272b` |
| RE-11 | Prazan odlomak s vidljivim `pBdr`/`shd`/`numPr` (potpisne linije) brisan | RIJEŠENO | `c1388f5` |
| RE-12 | Odlomci s tracked-changes/comment markerima brisani kao "prazni" | RIJEŠENO | `20458c9` |
| RE-13 | `<w:tab/>` s leaderom (potpisna linija) brisan | RIJEŠENO | `0f7be85` |
| RE-14 | Front-matter zaštita naslovnice pucala na "Naslov"/"Podnaslov" stilu | RIJEŠENO | `6f93136` |
| RE-15 | Deep čišćenje skidalo prored s uvučenih blok-citata | RIJEŠENO | `be325c8` |
| RE-16 | Odlomak s inline `w:sdt` (Zotero/Mendeley) preskočen cijeli u deep čišćenju | RIJEŠENO | `e045587` |
| RE-17 | Plaćeni slot trošen prije `applyFixers`, nije se vraćao na pad/nula-izmjenu | RIJEŠENO | `94e28a2` (Faza 4) |
| RE-18 | Otisak naplatnog gatea iz klijentske meta, ne uploadane datoteke | RIJEŠENO | `94e28a2` |
| RE-19 | Serverski panel primjenjivao section-insert bez traženog potvrdnog koraka | RIJEŠENO | `94e28a2` |
| RE-20 | Dvoklik na "Popravi sve" mogao pokrenuti dva paralelna uploada | RIJEŠENO | `94e28a2` |
| RE-21 | `footnoteSpacingFixer` razrješavao stil fusnota samo po točnom "FootnoteText" | RIJEŠENO | `fffae27` |
| RE-22 | `patchDefaultFont` korak 3 mogao upisati font izvan `rPr` | RIJEŠENO | `058a6f9` |
| RE-23 | Self-closing `w:rPrDefault` davao lažni `applied:true` bez izmjene | RIJEŠENO | `5d19abf` |
| RE-24 | `maskElement`/`findStyleBlock` nisu pokrivali self-closing oblik | RIJEŠENO | `ae26f71` |
| RE-25 | O(n²) skeniranje sidra po tekstu (~10s na 4000 odlomaka) | **OTVORENO** | nema commita; Faza 7.1/7.2 |
| RE-26 | `applyFixers` nije imao try/catch po fixeru, jedan pad ruši cijelu bateriju | RIJEŠENO | `689247c` |
| RE-27 | `runFixer` upisivao `NaN` u XML za prazne parametre | RIJEŠENO | `fac26a8` |
| RE-28 | Zip-codec default budžet 64MB odbijao realne radove pune slika | **OTVORENO** | nema commita; Faza 7.3 |
| RE-29 | Golden harness tiho preskakao 4/16 fixera | **OTVORENO** | nema commita; Faza 0.1 |
| RE-30 | `patchSectionPageNumbering` mogao brojati fantomski `sectPr` unutar `pPrChange`/komentara (PLAUSIBLE, ne CONFIRMED) | **OTVORENO** | nema commita; Faza 3.5 |
| RE-31, 34, 35, 37, 38, 39, 40, 42, 45 | Poštenje UX povratne informacije (labele, Escape zatvara modal, download bez popup-blocka, itd.) | RIJEŠENO | `55fa66e` (Faza 5) |
| RE-32, RE-33 | Vezano uz server/naplatu | RIJEŠENO | `94e28a2` |
| RE-36, RE-41 | Razdvajanje "već usklađeno" od "nije bilo moguće" | **DJELOMIČNO** (9/16 fixera dobilo signal, `xml-patch.ts` nije dirano) | `55fa66e`, vidi commit napomenu |
| RE-43 | `CHECK_TITLES`/fixer mapa bez tripwire testa | RIJEŠENO | `e059ce3` |
| RE-31..45 ostatak (P2 izbor iz izvornog auditnog dokumenta) | Sirovi slugovi u UI, "0 izmjena"="Popravljeno" i sl. | Većina RIJEŠENA kroz `55fa66e`, provjeri pojedinačno prije oslanjanja | `55fa66e` |
| ~99 P3 nalaza | Bili u `scratchpad/audit/p3.md`, nikad uneseni u čitljiv korpus | **NEPOZNATO**, ne postoji izvor za provjeru | N/A |

**Zaključak za ovo poglavlje**: rizik profil Repair Enginea je danas
bitno bolji nego što bilo koji postojeći dokument tvrdi. Preostaje: RE-06
(najveći, podatkovni: proširiti `autoFixable` pokrivenost profila),
RE-25/RE-28/RE-29 (performanse i test-mreža), RE-30 (nizak rizik, PLAUSIBLE),
i verifikacija da RE-36/RE-41 doista pokrivaju preostalih 7/16 fixera.
`docs/AUDIT_REPAIR_ENGINE_2026-07-25.md` i `docs/PLAN_REPAIR_REMEDIATION_2026-07-25.md`
su obrisani jer je njihov sadržaj prenesen ovamo; za pun izvorni tekst
nalaza (RE-31..45 P2 opisi, metodologija D1-D16) vidi git povijest.

### 5.3 Kritični put popravka (arhitektura, 28.7.)

Commit `1329c43` (danas) izdvojio je provjeru izvora (`source-check`) u
zaseban, usporedan Edge poziv (ne blokira upload), a pohranu u "Moji
popravci" prebacio u `EdgeRuntime.waitUntil` (`storagePending` na
klijentu). Ovo NE zatvara nijedan RE-ID iz gornje tablice, riječ je o
odvojenoj arhitekturnoj promjeni (kritični put/latencija), dokumentiranoj u
memoriji projekta i generiranom `docs/REPAIR_RECIPE.md`.

---

## 6. Ekran rezultata (UX), preostalo

Izvor: `docs/audit/RESULT_EXPERIENCE_AUDIT_2026-07-23.md` (stvarna analiza
jedne fixture u Chromiumu). Djelomično adresirano commitom `ff660d7`
(25.7., "preuzimanje kao izričit gumb, prilozi na novoj stranici, 'Zašto
<ocjena>?', popravci pregleda dokumenta").

| ID | Opis | Prioritet | Status |
|---|---|---|---|
| RESULT-01 | Ocjena (score) izgleda kao izjava o spremnosti za predaju | P0 | **RIJEŠENO (28.7., nadograđeno na `ff660d7`).** `renderPhaseTwoResultViews` (vec u `ff660d7`, ali dokumentacija to nije znala do danas) vodi tekstom "Što prvo napraviti" i statusom "Nije spremno za predaju / Tehnička ocjena NE potvrđuje spremnost" ODVOJENO od broja; live-testirano. Otkriven i popravljen usput: "Zašto \<ocjena\>?" transparentni raspis je od `ff660d7` bio TIHO NEVIDLJIV (Phase Two je prepisivao cijeli `#resultGuide` i brisao ga bez traga greške); sad je vraćen kao jedini pisac istog elementa, vidi poglavlje 6a |
| RESULT-02 | Ručna promjena statusa nalaza sakrije kritičan nalaz bez undo | P0 | **RIJEŠENO (28.7.)**: `src/ui/finding-view-model.ts` odvaja `open`/`confirmed`/`ignored` (nikad tiho "riješeno"); `confirmed` NE nestaje iz `topFindings` (samo `ignored` se izdvaja, uz eksplicitan razlog koji korisnik upisuje); oba statusa imaju "Poništi" (`data-finding-reopen`). Ovo je bilo vec izgradjeno u WIP-u iz `ff660d7`, samo dokumentacija nije stigla do toga. Dodano 28.7.: `ignored` sad ima isti tretman kao `confirmed`, toast + on-card napomena da se ocjena ne mijenja i da je nalaz izdvojen iz tri najvažnija koraka (`wireFindingCards` u `app.ts`, `finding-status-note` u `finding-view-model.ts`); testovi u `tests/finding-view-model.test.ts` |
| RESULT-03 | "Automatski popravi" ne radi ono što obećava | P0 | **RIJEŠENO (28.7.), live-testirano.** Nova korelacija nalaz→popravak preko `matchKeys` (naslov checka/issuea): svaka `RepairableItem` u `src/ui/repair-items.ts` sad nosi `matchKeys` (naslov(i) checka čiju povredu popravlja), `FindingViewModel` nosi isto (`issue.title` + upareni `check.title`, `src/ui/finding-view-model.ts`). Nova čista funkcija `pickTargetItem(matchKeys, items)` (jedinično testirana, uklj. integracijski test sa stvarnim `pageNumberingRepairableItem`) nalazi točno onu stavku koja odgovara kliknutom nalazu. `data-finding-repair` sad prosljeđuje `finding` u `scrollToRepairPanel(r, finding)` (`app.ts`), koja: (a) kad je stavka nađena u već-mountiranom panelu (`data-rule-id` atribut na `<li>`/text-item redu), scrolla je u vidokrug, dodaje jednokratni highlight (`.lekta-repair-panel__item--target`, `repair-panel.css`), prisilno je označi (SAMO glavne stavke, ne one koje mijenjaju autorov tekst) i pomiče fokus na nju uz toast "Otvoren je popravak za: \<label\>."; (b) kad stavka NE postoji za ovaj dokument, honest toast umjesto tihog slijetanja na nepovezanu stavku: "Ovaj popravak trenutno nije ponuđen kao automatska stavka za ovaj dokument. Pogledaj cijeli popis ispod." **Live-testirano Playwrightom** (`fer-diplomski-prazni-odlomci.docx`): klik na "Provjeri rimsku i arapsku numeraciju" danas ispravno prepoznaje da ovaj dokument nema detektabilan split sekcija za numeriranje i prikazuje upravo tu honest poruku (umjesto da tiho označi nepovezanu "pretvori Sadržaj u TOC polje" stavku, kako je radilo prije popravka). Uspješan match-i-highlight put dokazan jedinično (`tests/repair-items.test.ts`, `tests/finding-view-model.test.ts`), DOM/vizualni dio dokazan čitanjem+buildom (live-dokazivanje kroz sve tipove nalaza ometano nestabilnošću dev servera zbog paralelne sesije koja je istovremeno mijenjala `data/profiles/**`, nevezano uz ovaj kod) |
| RESULT-04 | Desktop faksimil gubi prekidač Čitljivo/Faksimil zbog CSS-a (sticky zoom traka prekriva) | P0 | RIJEŠENO (`ff660d7`, `#previewZoomBar` više nije sticky, z-index popravljen) |
| RESULT-05 | Profilni izvor izgleda kao dokaz za SVAKI nalaz na kartici | P0 | **RIJEŠENO** (vec u WIP-u iz `ff660d7`, potvrdjeno citanjem koda 28.7.): `finding.source` se u `findingCardHtml` prikazuje SAMO kad `source.exact===true`; `buildFindingViewModels` danas taj flag postavlja uvijek na `false` (nema jos podatkovnog modela za izravnu vezu pravilo->izvor), pa se izvor NIKAD ne ponavlja po karticama; profilni kontekst (ista poveznica koju je audit uhvatio) prikazuje se JEDNOM, u `#profileNote` prije popisa nalaza (`updateProfile()`), ne po nalazu. Regresijski test vec postoji: `tests/finding-view-model.test.ts` provjerava `not.toContain('Kontekst profila')` na kartici. Nije dodan tekst "izvor nije povezan" na svaku karticu (audit preporuka) jer bi to danas znacilo isti redak na SVIM karticama (exact je uvijek false), sto ponovno uvodi gustocu/duplikat koju RESULT-06 kritizira; namjeran izbor da se blok jednostavno izostavi dok ne postoji stvaran per-pravilo izvor |
| RESULT-06..11 | 4 sloja dupliciranog sadržaja; mobilni prvi ekran bez jasne akcije; CTA nazivi zavaravaju; metapodaci pomiješani s greškama; status/score bez jasnog odnosa; serverski popravak dolazi nakon poruke o privatnosti | P1 | **RIJEŠENO, live-testirano 28.7.** Svih 6 je već bilo riješeno kroz "Fazu 2/3" (`renderPhaseTwoResultViews`/`renderPhaseThreeRepairEntry`), bačenu kao WIP u `ff660d7` (25.7., 2 dana nakon audita), samo dokumentacija nikad nije uhvatila taj commit. Vidi poglavlje 6a za dokaz po stavci i za čišćenje mrtvog koda otkriveno usput |

Vanjski audit od 27.7. (poglavlje 6.5 i 6.7 tog dokumenta) neovisno je
potvrdio istu klasu problema (gusto sučelje, AutoFix CTA trenje) ali
opisao KONKRETAN AutoFix CTA bug (drugi klik potreban za otvaranje panela)
koji **više nije reproducibilan**: `scrollToRepairPanel` (`src/ui/app.ts`)
danas u jednom pozivu otvara detalje, skrola i fokusira gumb, na PRVI klik
(commit `576b87e`, 20.7., prije reviewanog commita vanjskog audita). Postoji
mrtav, nikad ožičen gumb `data-triage-repair` u `src/ui/triage-view.ts`
(funkcija `triagePanelHtml` se nigdje ne importa), koji nije taj problem.

### 6a. RESULT-06..11: dokaz po stavci, čišćenje mrtvog koda, 3 usput otkrivene i popravljene regresije

Live-testirano Playwrightom (`fer-diplomski-prazni-odlomci.docx`) protiv
`renderPhaseTwoResultViews`/`renderPhaseThreeRepairEntry` u `src/ui/app.ts`:

- **RESULT-06** (4 sloja duplikata): stari "Plan ispravaka" tab trajno skriven
  (`$('#tabbtn-action')?.classList.add('hidden')`); jedan objedinjeni popis
  nalaza s 7 filtera (Problemi dokumenta/Blokatori/Dorade/Ručna provjera/
  Ograničenja analize/Ručno provjereno/Zanemareno).
- **RESULT-07** (mobilni ekran bez CTA): "Što prvo napraviti" + jedan primarni
  CTA (`guideOpenPreview`/`guideOpenPriority`).
- **RESULT-08** (zavaravajući "Otvori označeni pregled"): CTA sad glasi
  "Otvori označeno mjesto u dokumentu" SAMO kad postoji `anchored` nalaz.
- **RESULT-09** (metapodaci pomiješani s greškama): `#issueCountLabel`
  ispisuje "N problema dokumenta, M ograničenja analize" odvojeno; potvrđeno
  live da filter "Ograničenja analize" prikazuje isključivo `kind:'limitation'`.
- **RESULT-10** (status/score bez odnosa): `#resultReadiness` dobiva raspis
  "X blokatora, Y dorada, Z ručnih provjera" uz status spremnosti.
- **RESULT-11** (server-repair skriven do klika): tekst "Dokument se pritom
  šalje na server radi popravka i pohranjuje dok ga ne obrišeš" stoji na
  samom `#repairEntry` CTA-u, prije ijednog klika (`renderPhaseThreeRepairEntry`,
  RE-34).

**Čišćenje mrtvog koda (isti prolaz, `src/ui/app.ts`):** tri sloja renderiranja
su postojala usporedno (stari `renderResultGuide`/`renderActionPlan`/
`renderIssues`, posredni `renderUnifiedActionPlan`/`renderUnifiedIssues`, i
stvarni `renderPhaseTwoResultViews`), pri čemu su prva dva sloja bila
BEZUVJETNO pregažena trećim na svakom renderu (pisala u DOM, odmah izbrisano).
Uklonjeno: sve 5 starih/posrednih funkcija, njihovi pozivi iz `renderTriage`/
`refreshFindingViews`/`renderResult`, mrtva `_triageFilter` varijabla (nikad
čitana), i dva zastarjela `#issueFilters` onclick ožičenja koja su referencirala
uklonjene funkcije. `renderTriage` sveden na `renderReadinessHeader + renderPhaseTwoResultViews`.

**3 regresije otkrivene i popravljene TIJEKOM ovog čišćenja** (sve su bile
tiho aktivne već od `ff660d7`, 25.7., ne od danas):
1. `#resultGuide` počinje s `class="hidden"` u `index.html`; stara
   `renderResultGuide` je to čistila, `renderPhaseTwoResultViews` nikad nije
   imala svoj `classList.remove('hidden')`. Bez ovog popravka bi cijeli
   "Što prvo napraviti" blok ostao NEVIDLJIV usprkos ispravnom innerHTML-u
   (uhvaćeno live testom, ne statičkim čitanjem).
2. "Zašto \<ocjena\>?" (`scoreBreakdownHtml`) i "Podijeli ocjenu" (`shareScore`,
   `guideShareScore`) su živjeli isključivo u staroj `renderResultGuide`, koja
   je pisala u `#resultGuide` PRIJE nego ga `renderPhaseTwoResultViews`
   bezuvjetno prepiše: oba obilježja su bila tiho nevidljiva otkad je Faza 2
   uvedena. Sad su ugrađena izravno u `renderPhaseTwoResultViews`.
3. `suggestTool` (naslovnica/izjava/literatura/kartice/citat CTA po nalazu,
   `src/ui/tool-suggestions.ts`) je bio ožičen ISKLJUČIVO u staroj
   `renderActionPlan`, koja je pisala u `#actionPlan` unutar trajno skrivenog
   `#tab-action`: CTA je bio nedohvatljiv i PRIJE ovog čišćenja. Otkriveno
   preko `tests/tool-suggestions.test.ts` source-tripwirea (koji je ispravno
   pao kad je `renderActionPlan` uklonjena). Preseljeno u
   `finding-view-model.ts` (`FindingViewModel.tool`, računa se u
   `buildFindingViewModels` preko novog `settings`/`selection` konteksta na
   `FindingResultInput`), prikazano u `findingCardHtml` na SVAKOM mjestu gdje
   se nalazi renderiraju (triage, svi nalazi), umjesto samo u mrtvom planu.
   Live-testirano: 7 `.action-tool` CTA-ova ispravno prikazano na stvarnom
   dokumentu, uklj. parametriziranu naslovnicu (`?fakultet=fpzg&razina=diplomski&smjer=...`).

Testovi: `tests/finding-view-model.test.ts` (+2 nova, `tool` polje),
`tests/tool-suggestions.test.ts` (source-tripwire premješten na
`finding-view-model.ts`). `npm run check` zelen (vidi promjenjivi zapisnik).

---

## 7. Poznati preostali UX nalazi izvan ekrana rezultata

| ID | Opis | Prioritet | Status |
|---|---|---|---|
| Potvrda profila (novi, 27.7.) | `applyDetectedContext` (`src/ui/app.ts`): kad `ctx.program` nije prepoznat (null), select ostaje na alfabetski prvom programu (`populatePrograms`), ali kod je BEZUVJETNO postavljao `_profileConfirmed=true`, gaseći `needsProfileConfirmation` gate koji bi inače tražio potvrdu za verificirani profil | **P1** | **RIJEŠENO (28.7.)**: novi eksportirani `isConfidentDetection(ctx)` u `src/ui/profile-detect.ts` vraća `true` samo kad je `ctx.program` stvarno prepoznat; `applyDetectedContext` sad postavlja `_profileConfirmed=isConfidentDetection(ctx)`. Regresijski testovi u `tests/profile-detect.test.ts` (pozitivan slučaj, slučaj "fakultet prepoznat, program nije", `null` ulaz). `npm run check` zelen (196 datoteka, 2768 testova) |
| ux-02 / ux-07 (Jak default profil, nesklad limita) | Default FPZG/Politologija/Diplomski; auto-detekcija samo za unizg; dropzone tvrdi 50MB dok mobilni cap je 20MB | P2 | DJELOMIČNO (BL-P0-05-8 potvrda profila i BL-P0-05-9 graduirani prikaz limita po uređaju su odrađeni prema `AUDIT_STATUS_2026-07-11.md`; gornji "Potvrda profila" nalaz koji je otvarao istu rupu za slučaj neprepoznatog studija je sad RIJEŠEN) |
| ux-01 | Nigdje se eksplicitno ne kaže da Lekta NIJE provjera plagijata | P1 | OTVORENO, nema poznatog popravka teksta |
| accessibility-03..14 (12 preostalih P2/P3) | Težina nalaza samo bojom, forced-colors fokus, modal nije inert, nema axe u CI, tablica bez scope, spinner bez reduced-motion, ARIA menu desink, mali touch ciljevi, nizak kontrast fokusa, preskok h-razina, dropzone ugniježđena interaktivnost, tema bez aria-pressed | P2/P3 | OTVORENO (accessibility-01 skip-link i accessibility-02 fokus/najava nakon analize su RIJEŠENI, `BL-P1-01`/`BL-P1-02`) |
| performance-02, 03, 04, 06, 07, 08 | Draftovi+source-registry (1,45MB) samo za advisory listu; DOCX/PDF motor eager na landingu; nema prekid analize; nema immutable cache za `/assets/*`; font subseting; cijela datoteka u memoriji | P2/P3 | OTVORENO (`performance-01`, glavni chunk 2,4MB/369KB gzip, je RIJEŠEN light/heavy splitom, danas ~97KB gzip) |
| `docs/audit/PERFORMANCE_OPTIMIZATION_PLAN_2026-07-24.md` (bundle lazy-load plan) | Cilj: smanjiti glavni bundle 20 do 35KB gzip lazy-loadanjem legal-content, repair-history, preflight-panel, repair-panel, repair-client, auth/session, checkout | P2 | DJELOMIČNO: `repair-client`, `repair-history`, `auth/session`, `checkout`, `preflight-panel` su danas lijeno učitani (`src/ui/app.ts`, `loadRepairClient`/`loadRepairHistoryClient`/`loadAuthClient`/`loadCheckoutClient`, dinamički `import('../preflight/preflight-panel')`); `repair-panel` i `legal-content` NISU (statički import na vrhu `app.ts`) |
| seo-01..08 | Nekonzistentan default origin u 2 generatora (`lekta.hr` vs `lektahr.netlify.app`), tanki near-duplicate citatne stranice, tool stranice bez canonical/og:url, nema og:image, favicon samo na indexu, sitemap higijena | P1/P2/P3 | seo-01 (origin) DJELOMIČNO (BL-P0-01-4 origin-guard riješen za live deploy; ostaje footgun za build bez env varijable); seo-07 (404 stranica) RIJEŠEN (`public/404.html`); ostali OTVORENO |
| Broj "mogućih problema" vs broj trijažnih nalaza (npr. "15 vs 14") | `findingsFor()`/`metricIssues` (UI) broji iz `result.issues`; `src/analysis/triage.ts:buildTriage()` neovisno broji `counts.total` iz `result.checks` vlastitim `isFinding()` predikatom | P2 | DJELOMIČNO: uzrok koji je zabilježio interni audit 23.7. (advisory stavke ulazile u isti broj) je RIJEŠEN (`findingKind()` u `src/ui/finding-view-model.ts` ih danas isključuje kao `kind:'limitation'`), ali arhitektura i dalje ima DVA neovisna brojača bez garancije podudaranja; mismatch je i dalje moguć |

---

## 8. Sigurnost, preostalo

Root `SECURITY_AUDIT.md` (14.7., shema `LEKTA-SEC-01..07`) bio je aktualni
izvor istine i zamijenio je stariji `docs/audit/SECURITY_AUDIT.md` (10.7.,
shema `security-*`). Oba su obrisana, status ovdje.

| ID | Opis | Prioritet | Status |
|---|---|---|---|
| LEKTA-SEC-01 | `integrity-check` "full" bez kvote/idempotency/timeouta | High | RIJEŠENO (AUD-22/29) |
| LEKTA-SEC-02 | Retencija (pg_cron) nije bila dokazivo aktivna | High | RIJEŠENO (AUD-18/19/30, fail-closed) |
| LEKTA-SEC-03 | Preflight može premašiti CPU/mem budžet | Medium | DJELOMIČNO (busy-check + concurrency guard riješeno; CPU kill dretve ostaje "needs-decision") |
| LEKTA-SEC-04 | XML parser bez DTD/entity obrane | Medium | RIJEŠENO (AUD-31/39, `_xml_root` DOCTYPE/ENTITY guard) |
| LEKTA-SEC-05 | Preširok CORS (`*`) na autenticiranim funkcijama | Medium | RIJEŠENO (AUD-24/33, `corsHeadersFor` allowlist) |
| LEKTA-SEC-06 | Checkout bez server rate limita | Low | RIJEŠENO (AUD-23/35, dnevni cap) |
| LEKTA-SEC-07 | CI bez secret scanning/SAST | Low | RIJEŠENO (AUD-47, gitleaks job u `security-audit.yml`) |
| security-04 (stariji, 10.7.) | `verify_jwt` nije zakovan po funkciji u configu | P3 | OTVORENO |
| security-06 (stariji) | Purge RPC-ovi (`purge_old_report_generations`, `purge_faculty_request_ip`) nisu revocani od public/anon | P3 | OTVORENO (posljedica danas bezopasna, RLS odbija promjenu) |
| P0-02b (dependencies-01, `LAUNCH_BLOCKERS.md`) | 8 Edge funkcija uvozi `@supabase/supabase-js` s `esm.sh` bez pina/`deno.lock` | P1 | Status nepoznat u ovom prolazu, treba provjeru `supabase/functions/*/index.ts` importa i postoji li `deno.lock`; ovo je jedini P0-02 podnalaz koji nijedan naknadni dokument ne potvrđuje kao zatvoren |

### 8.1 Novi production audit, 4.8.2026.

Ovo su nalazi izravno provjereni na produkcijskom projektu
`zrrjttizjyfcxmcpgzml`, ne samo iz lokalnog koda.

| ID | Opis | Prioritet | Status i dokaz |
|---|---|---|---|
| PROD-01 | Klijent iz `repairEndpoint` izvodi `/source-check`, ali funkcija nije deployana | P1 | **RIJEŠENO**: `source-check` je deployan kao production Function, `verify_jwt=true`, a `OPTIONS https://zrrjttizjyfcxmcpgzml.supabase.co/functions/v1/source-check` sada vraća 200. |
| PROD-02 | Produkcijski `send-reminders` je stari, javno okidljiv deploy | P1 | **RIJEŠENO**: deployana je lokalna verzija s `isCronAuthorized` i `REMINDER_CRON_SECRET`; neautorizirani POST sada vraća 401. Generirana je nova cron tajna, spremljena samo u Supabase secrets, a postojeći cron poziv je ažuriran da je šalje. |
| PROD-03 | Produkcijski `send-reminders` ne podržava novih pet razina podsjetnika | P1 | **RIJEŠENO**: produkcijska shema sada ima svih pet markera (`30d`, `14d`, `7d`, `72h`, `1d`), insert policy provjerava da su svi prazni, a `send-reminders` je deployan u verziji 8. |
| PROD-04 | Produkcijski `create-checkout` zaostaje za lokalnim server-side tier gateom | P1 prije naplate | **RIJEŠENO**: deployana je lokalna verzija s `checkoutMismatch`/`tier_mismatch`; bundling je dodatno popravljen eksplicitnim `.ts` importima. Endpoint bez JWT-a vraća 401. |
| PROD-05 | Produkcijska baza i repo nisu jedan reproducibilan migration source of truth | P1 operativno | **POTVRĐENO, OTVORENO**: produkcija ima 56 zapisa u `supabase_migrations.schema_migrations`, repo ima 38 lokalnih migracija; produkcija dodatno sadrži `academic_suite`, `completion_app`, `jobs` i `record-completion-check` objekte koji nisu u ovom repozitoriju. Treba odlučiti je li Supabase projekt namjerno dijeljen i dokumentirati granicu ili ga razdvojiti. |
| PROD-06 | Supabase Security Advisor i dalje vidi higijenske rizike | P2 | **POTVRĐENO, neujednačene težine**: `generate_referral_code` i `purge_old_report_generations` imaju mutable `search_path`; `pg_net` je u `public`; Auth zaštita od procurjelih lozinki je isključena. `increment_job_view` je javno izvršiva SECURITY DEFINER funkcija, ali pripada tablici `jobs` iz drugog sustava i nije dio Lekta koda. |
| PROD-07 | Staging preflight funkcije imaju hardkodirani production origin | P2 staging | **LOKALNO RIJEŠENO, DEPLOY ODGOĐEN**: `preflight-start` i `preflight-result` sada čitaju `ALLOWED_ORIGIN` kao zarezom odvojenu listu, uz production fallback. Staging backend je pauziran, pa se deploy radi pri ponovnom uključivanju staginga. |

Status nakon sanacije 4.8.2026.: PROD-01 do PROD-04 su riješeni i potvrđeni production smoke testom. PROD-05 ostaje otvoren kao širi migration drift. PROD-06 je djelomično riješen: production funkcijama `generate_referral_code` i `purge_old_report_generations` postavljen je `search_path = public`, a purge RPC-u opozvan je public EXECUTE; preostaju `pg_net`, leaked-password zaštita i javna funkcija iz drugog sustava. Leaked-password zaštita je provjerena, ali Supabase je odbija na trenutnom planu, dostupna je na Pro planu i višem. PROD-07 je lokalno riješen, a deploy čeka ponovno uključivanje staginga.

Production end-to-end test 4.8.2026.: anonimna sesija 200, `source-check` 200, `repair-docx` 200 sa stvarnom promjenom (`changelogCount=1`), zapis `storagePending` postao vidljiv u povijesti nakon čekanja, brisanje je vratilo 200, a naknadna provjera potvrdila je nula redaka i nula Storage objekata. Vraćeni DOCX prošao je `strict-open` i otvorio se Microsoft Wordom s `OpenAndRepair=false`.

`npm audit`: 20 ranjivosti (1 critical, 1 high, 14 moderate, 4 low), SVE u
dev-only lancima (`vitest`/`vite`/`esbuild` i `netlify-cli`). Produkcijski
`npm audit --omit=dev --audit-level=high` = 0. **Odluka (14.7., potvrđena
16.7.): prihvaćeno, ne popravljati**, jer nijedan napadački put nije dostupan
u workflowu (vitest UI se nikad ne pokreće, `netlify-cli` nije u nijednom
npm skriptu). Re-verificiraj ako `npm audit --omit=dev` ikad prijavi > 0,
ili ako se počne koristiti `vitest --ui`.

---

## 9. Operativno: analytics, error monitoring, rate limit, backup

| Stavka | Status | Dokaz |
|---|---|---|
| `analyticsEndpoint`, `errorEndpoint`, `reportEndpoint`, `checkoutEndpoint` | Prazni u `DEFAULT_PRODUCTION_CONFIG` (`src/ui/app.ts`) | Potvrđeno 28.7.; poznato i praćeno (`docs/PRE_LAUNCH.md` D, `docs/PRE_LAUNCH_CHECKLIST.md` sekcija 8) |
| `paymentProvider` u istom configu | **RIJEŠENO (28.7.)**: default promijenjen sa zastarjelog `'stripe'` na `'lemonsqueezy'` (uskladjeno s podatkom da je Lemon Squeezy stvarni MoR), na sva 3 mjesta gdje se defaultira (`DEFAULT_PRODUCTION_CONFIG`, `productionStatus()`, `openSetup()`). Napomena: `paymentProvider` nije bio mrtav kod kako je izvorno opisano, aktivno grana `buildPaymentUrl()` (Stripe vs Lemon Squeezy vs generic query params) za legacy `PACKAGES` rucni narudzbeni tok; taj tok ostaje izvan opsega ove izmjene (vidi BL-12/BL-13 za konsolidaciju/uklanjanje) | `src/ui/app.ts` |
| `repairEndpoint` | Aktivan (živi Supabase URL) | `src/ui/app.ts` |
| Production Edge deploy | **RIJEŠENO za obuhvaćene funkcije**: `source-check` v1, `send-reminders` v8 i `create-checkout` v8; smoke testovi: 200/401/401 | Production audit 4.8., PROD-01 do PROD-04 |
| Production migration schema | **DJELOMIČNO RIJEŠENO**: reminder schema je primijenjena kroz Supabase managed migration endpoint i potvrđena s pet markera; širi drift produkcijske baze i repozitorija ostaje PROD-05 | Production audit 4.8., PROD-03, PROD-05 |
| Rate limit na `repair-docx` | **RIJEŠENO (28.7.)**: file-size limit i dvostruki dnevni cap i dalje postoje, plus tri nova sloja: (1) kill switch `REPAIR_DISABLED` (isti obrazac kao `preflight-start`), (2) `ConcurrencyGate` best-effort limit paralelnih teskih zahtjeva PO IZOLATU (`REPAIR_MAX_CONCURRENT`, default 4, 503 `{error:'busy'}`; honestno dokumentirano da NIJE globalno atomican, isto ogranicenje kao vec postojeci per-user TOCTOU), (3) globalna dnevna storage-kvota (`REPAIR_STORAGE_DAILY_CAP`, default 500 `repair_jobs` redaka/24h) koja preskace pohranu (ne sam popravak) kad je dosegnuta, fail-open isto kao postojeci null-storage slucajevi. Odluke izdvojene u `src/report/repair-limits.ts` (ciste, jedinicno testirane: `tests/repair-limits.test.ts`), DB/env glue u `index.ts`. Provjereno `deno check` (0 novih gresaka naspram baselinea, 12 pred-postojecih DOM-tip gresaka iz `helpers.ts` nepromijenjeno) jer Supabase MCP i `tsc` scope ne pokrivaju ovaj direktorij | `supabase/functions/repair-docx/index.ts`, `src/report/repair-limits.ts` |
| `REPAIR_FREE_MODE` | Postoji kao flag, gate preskače naplatu ali čuva auth/consent/rate-limit; trenutni operativni mod (besplatna beta strategija) | `supabase/functions/repair-docx/index.ts`, `supabase/migrations/0029_repair_gen_status_free.sql`; stvarna vrijednost na živom Supabase projektu nije provjeriva iz repozitorija (dashboard postavka) |
| CI | 9 aktivnih workflowa (stanje 17.8.): `check.yml` (gate na svaki push/PR + Playwright), `conformance.yml`, `docx-smoke.yml`, `docx-strict-open.yml`, `foundation-check.yml`, `repair-slow.yml`, `academic-suite-db.yml`, `security-audit.yml` (npm audit + gitleaks, i tjedni cron), `training-pipeline.yml` (manual). Nijedan nema `concurrency`, pet nema `timeout-minutes`, nijedan `uses:` nije pinan na SHA (A26-14 susjedstvo) | `.github/workflows/*`; vanjski audit od 27.7. koji tvrdi da CI ne postoji je ZASTARIO (ili je testirao stariju živu deploy verziju) |
| Retencija, korisnički tekst | Dosljedan: "dok je ne obrišeš... kod prijave bez e-maila najviše 30 dana" na svim mjestima (`app.ts`, `src/legal/legal-content.ts`); server provodi (`cleanup-orphan-repairs`, `ANON_RETENTION_DAYS=30`) | Uskladeno od commita `71c8631` (19.7.), prije vanjskog audita 27.7. koji tvrdi suprotno, taj nalaz je ZASTARIO |
| Retencija za e-mail prijavljene korisnike | OTVORENO ("sada: neograničeno" po `docs/PRE_LAUNCH.md`) | |
| PITR i uptime monitor | Vlasnička radnja, status neizvjestan iz repozitorija | `docs/RUNBOOK_OPS.md` |
| Ugniježđeni git repo `lekta-pipeline/` (1,6GB) | ODLUKA (AUD-43/AUD-57), čeka izbor submodule/.gitignore/spajanje; trenutno stanje radnog stabla (28.7.) ponovno pokazuje `lekta-pipeline/` kao untracked, provjeri da odluka nije regresirala | `git status` |
| `debug.log` u working tree (28.7.) | Neobrisana skitnica datoteka, nisko prioritetno čišćenje | `git status` |
| `netlify-cli`/`supabase` teške dev-ovisnosti | ODLUKA (AUD-52), operativni/deploy rizik, namjerno nije uklonjeno | |
| Demo video 15,95MB u gitu | ODLUKA (AUD-53/AUD-12), čeka LFS/CDN izbor | |

---

## 10. Pravni i komercijalni blokatori

- **Pravni identitet prazan** (poglavlje 4). Blokira svaku naplatu.
- **Cjenovnik, rekoncilijacija (novo u ovom dokumentu)**: postoje DVA odvojena
  proizvoda s vlastitim cijenama, ne konflikt kako je prvotno izgledalo:
  - Automatski repair (`src/report/pricing.ts`, `PRICING_TIERS`): seminarski
    3,99 €, završni 5,99 €, diplomski 9,99 €, doktorski 24,99 €. Ovo se
    poklapa s `docs/GO_LIVE_REPAIR.md` i je BLIZU (ne identično) preporuci
    vanjskog audita od 27.7. (6,99/7,99/11,99/24,99 €). Starija tablica u
    `docs/MONETIZATION_AND_ANTI_ABUSE.md` (3/5/10/19 do 25 €) je nacrt,
    superseded je stvarnim `pricing.ts`.
  - Ručna ljudska usluga (`PACKAGES` u `src/ui/app.ts`, legacy Netlify
    obrazac): formatiranje 39 €, "Predaja bez panike" 69 €, premium 99 €.
    Zaseban `premium_human` proizvod u `src/catalog/products-catalog.ts` (49 €)
    preklapa se konceptno s ovim paketima; `LEKTA_IMPLEMENTATION_BACKLOG.md`
    (BL-12, BL-13) već identificira potrebu konsolidacije i uklanjanja starog
    obrasca. Ovo OSTAJE otvoreno, ali je poznat, praćen zadatak, ne novi nalaz.
  - Preporuka vanjskog audita da se automatska cijena testira agresivnije
    (osnivačka cijena, vremenski ograničena) je vrijedna razmatranja kad se
    naplata uključi, ali ne mijenja da je `pricing.ts` već razumno postavljen.
- **Ručna usluga nema operativni okvir**: opseg, rok, revizije, refund
  politika za PACKAGES (39/69/99 €) nisu dokumentirani nigdje u repozitoriju.
  Ovo JEST nov, konkretan gap koji je vanjski audit (poglavlje 8.5) točno
  pogodio; vrijedi riješiti prije nego se ta ponuda aktivno promovira.
- **Domena**: i dalje `lektahr.netlify.app`, blokira e-mail (Resend traži
  verificiranu domenu), i sputava SEO/brand autoritet. Poznato,
  `docs/PRE_LAUNCH.md` sekcija A.
- **Fiskalizacija/eRačun 2026.**: spomenuto u vanjskom auditu kao razlog za
  konzultaciju s računovođom prije prve žive naplate; nema internog traga da
  je ovo provjereno, treba dodati na `docs/GO_LIVE_NAPLATA.md` checklistu.

---

## 11. Vanjski marketinški/UX/go-live audit (27.7.2026.): rekoncilijacija

Vanjski audit (commit `deee9fde`, jedan dan prije ovog pregleda) dao je
vrijedan vanjski pogled, ali dio njegovih nalaza o STANJU KODA bio je
zastario već u trenutku pisanja (izgleda da je testiran stariji živi deploy,
ne sadržaj navedenog commita). Sažetak provjere svih njegovih 12 provjerljivih
tvrdnji o kodu:

| Tvrdnja vanjskog audita | Verdikt danas |
|---|---|
| Config prazan (checkout/analytics/error/report), `paymentProvider:'stripe'` | **TOČNO**, vidi poglavlje 9 |
| `data/legal/provider.json` prazan (OIB/adresa/voditelj obrade), Gmail kontakt | **TOČNO**, vidi poglavlje 4 |
| Automatska detekcija profila tiho odabire pogrešan/prvi studij | **TOČNO**, novi potvrđeni nalaz, vidi poglavlje 7 |
| AutoFix CTA treba drugi klik da otvori panel | **VIŠE NIJE TOČNO**, popravljeno commitom `576b87e` prije reviewanog commita |
| Retencija nedosljedna ("do brisanja" vs "30 dana") | **VIŠE NIJE TOČNO**, uskladeno od `71c8631` (19.7.), prije reviewanog commita |
| Nema CI-ja osim npm audit workflowa | **VIŠE NIJE TOČNO**, 9 aktivnih workflowa (17.8.) |
| Rate limit/file-size/concurrency/kill switch za repair nepotvrđeni | **DJELOMIČNO TOČNO**, vidi poglavlje 9 (2 od 5 mehanizama postoje) |
| "15 vs 14" broj problema neobjašnjen | **DJELOMIČNO TOČNO**, vidi poglavlje 7, uzrok djelomično popravljen, arhitekturni rizik ostaje |
| Sitemap `.html` vs extensionless nesklad | **NIJE REPRODUCIRANO**, sitemap i navigacija dosljedno koriste `.html` |
| `src/ui/app.ts` ~1300-1530 redaka, monolitan | **TOČNO**, danas 1613 redaka, poznat i praćen zadatak (CLAUDE.md backlog #3) |
| Ne postoji kanonski `GO_LIVE_STATUS.md` | **BILO TOČNO**, ovaj dokument je odgovor na taj nalaz |

### Što je vanjski audit donio NOVO i vrijedno (nije bilo u internim dokumentima)

1. **Konkretan popis analitičkih događaja** (`landing_view`,
   `analyzer_opened`, `upload_completed`, `profile_suggested`,
   `profile_changed`, `analysis_completed`, `result_viewed`,
   `repair_cta_clicked`, `repair_panel_viewed`, `server_consent_given`,
   `checkout_started`, `purchase_completed`, `repair_started/succeeded/failed`,
   `repaired_doc_downloaded`, `recheck_completed`, `support_opened`,
   `refund_requested`) s ciljanim pragovima konverzije po koraku. Interni
   dokumenti su prepoznali da analytics fali, ali nisu imali ovu razinu
   detalja. Preporuka: usvojiti ovaj popis kad se `analyticsEndpoint` ozici.
2. **SEO long-tail popis ključnih riječi** (margine diplomskog FPZG, rokovi
   obrane po fakultetu, "je li diplomski spreman za predaju", itd.) i
   koncept programatskih landing stranica po profilu
   (`/pravila/<fakultet>/<vrsta-rada>`). Nadopunjuje postojeći SEO backlog
   (BL-18) konkretnim primjerima.
3. **Ručna usluga, operativni okvir** (poglavlje 10 iznad), pogodio pravu
   rupu.
4. **Launch dashboard, jedna stranica metrika** za tjedan lansiranja
   (posjetitelji, otvoreni analizatori, uploadi, dovršene analize,
   promijenjeni auto-profili, verificirani vs generički profili, AutoFix
   klikovi, repair panel view, checkout start/success, prihod/AOV, repair
   success, download rate, refund rate, storage/function trošak). Korisna
   praktična lista za operativni sastanak, nema internog ekvivalenta.
5. **Tržišna veličina/ekonomika** (DZS 31.237 diplomiranih 2024., scenariji
   2/5/10% penetracije, Lemon Squeezy 5%+0,50€ naknada primijenjena na
   raspon cijena). Novi vanjski kontekst, ne postoji u internim dokumentima,
   koristan ulaz u odluku o cijeni.
6. **Pozicioniranje**: "hrvatski preflight za akademske radove" kao interni
   okvir kategorije. Komplementarno postojećem `docs/LEKTA_COMPETITIVE_POSITIONING.md`,
   ne proturječi mu.

### Već pokriveno u postojećem 90-dnevnom planu (ne duplicirati)

`docs/LEKTA_90_DAY_PLAN.md` (13.7.) je već postojeći tjedan-po-tjedan
launch plan vezan uz jesenski predajni val, s pragovima uspjeha i stop-loss
pravilima. `docs/LEKTA_PRODUCT_ROADMAP.md` i `docs/LEKTA_IMPLEMENTATION_BACKLOG.md`
su njegova strateška/taktička podloga, s AutoFix re-check petljom kao
najviše rangiranom stavkom (43/45 bodova u prioritizacijskoj matrici).
Vanjski audit predlaže sličan redoslijed (dokaži AutoFix, onda naplata) ali
BEZ znanja da ovaj plan postoji. Prije pokretanja bilo koje nove
"30-dnevne" inicijative iz vanjskog audita, provjeri poklapa li se s
postojećim planom umjesto da se paralelno izvodi.

---

## 12. Poznate namjerne odluke (BY-DESIGN, nisu bug)

- Hardkodiran javni anon ključ za Supabase u klijentskom configu (AUD-13):
  namjerno, anon ključ je dizajniran za javnu izloženost, RLS je stvarna
  granica.
- Teaser gate za integrity/preflight je prezentacijski, ne sigurnosni
  (AUD-16).
- `m4_corpus` (interni korpus podataka) već ispravno skriven iz javnog
  builda (AUD-37).
- `performance-05` (JSON stringify eksperiment): implementirano pa VRAĆENO
  jer je pogoršalo transfer za hrvatsku dijakritiku. Namjerna odluka, ne
  propust.
- `npm audit`: prihvaćeno stanje dev-only ranjivosti, vidi poglavlje 8.

## Odbačeni nalazi (verificirano kao NE-problem)

- AUD-21: RPC revoke `from public` bio dovoljan, nije bio problem.
- AUD-51: tvrdnja da je `NPM_AUDIT_ACCEPTED.md` zastario, odbačena nakon
  reverifikacije (brojke 20/1/1/14/4 su i dalje točne).
- `architecture-01` (10.7.): placeholder stub bez sadržaja, nema dokaziva
  nalaza.
- `seo-01` (10.7.): tvrdnja da je pogrešan origin "već utisnut u commitani
  dist" je osporena, `dist/` je u `.gitignore`, živi Netlify deploy dobiva
  ispravan origin preko env varijable; ostaje kao latentni footgun za build
  bez te varijable (npr. Cloudflare Pages), ne kao aktivna šteta.

---

## 13. Što ovaj dokument NE pokriva

Nepromijenjeno naspram svih prijašnjih audit rundi: Netlify/Supabase/Resend/
Lemon Squeezy administracijski dashboardi, produkcijske tajne, stvarni status
RLS-a/rate limita/kvota/backupa na živim projektima, knjigovodstvena/porezna
struktura, stvarni checkout tijek (endpoint prazan), mobilni fizički uređaji,
ponašanje popravljenog docx u desktop Wordu nakon deploya. Sve stavke koje
ovise o tome tretiraj kao "treba potvrditi", ne kao dokazano riješeno ili
dokazano nepostojeće.

---

## 14. Preporučeni sljedeći koraci

Redoslijed usklađen s postojećim `LEKTA_90_DAY_PLAN.md`, ne zamjenjuje ga.

**Novi production audit, prije šire beta upotrebe:**
- Deployati `source-check`, zatim redeployati `send-reminders` s cron tajnom i
   primijeniti migraciju 0036. Prije uključivanja naplate redeployati
   `create-checkout` i provjeriti serverski `tier_mismatch`.
- Uvesti deployment gate koji uspoređuje live Edge funkcije i migration history
   s repo verzijom. Trenutni `npm run check` ne može otkriti da je live funkcija
   starija ili da je live baza bez lokalne migracije.
- Odlučiti je li produkcijski Supabase namjerno dijeljen s drugim sustavom.
   Ako jest, dokumentirati vlasništvo i security boundary; ako nije, razdvojiti
   projekte prije naplate.

**Odmah, prije bilo kakvog šireg besplatnog puštanja:**
1. ~~Popraviti "Potvrda profila" nalaz~~ RIJEŠENO 28.7., vidi poglavlje 7.
2. ~~RESULT-02 i RESULT-05~~ RIJEŠENO 28.7., vidi poglavlje 6 (oboje su
   se pokazala vecim dijelom vec izgradjena u ranijem WIP-u, ostao je samo
   mali asimetrican gap na "zanemari" putanji, sad zatvoren).
3. ~~Ponovno testirati RESULT-03~~ RIJEŠENO 28.7., vidi poglavlje 6: nalaz→popravak
   korelacija (`matchKeys`/`pickTargetItem`) + honest fallback kad stavka ne postoji.
4. ~~Ukloniti `paymentProvider:'stripe'`~~ RIJEŠENO 28.7., vidi poglavlje 9
   (default promijenjen na `'lemonsqueezy'`; polje samo nije bilo mrtvo kako je opisano).

**Prije naplate (vlasnički, kod je spreman):**
5. Pravni identitet, `docs/GO_LIVE_NAPLATA.md`.
6. RE-06 profilna pokrivenost `autoFixable` pravila (najveći preostali
   Repair Engine zadatak, podatkovni; u tijeku, druga sesija).
7. ~~Concurrency limit i storage-quota/kill switch za `repair-docx`~~ RIJEŠENO
   28.7., vidi poglavlje 9.
8. `analyticsEndpoint`/`errorEndpoint` uz popis događaja iz poglavlja 11.1.

**Kad postoji kapacitet, niži prioritet:** RE-25/28/29/30, preostali
accessibility/SEO/performance P2/P3 (poglavlje 7), operativni okvir za
ručnu uslugu (poglavlje 10).

---

## 15. Zatvoreno, kompaktni povijesni zapisnik

Grupirano po auditnoj rundi radi sljedivosti; puni file:line dokazi su u
git povijesti obrisanih izvornih dokumenata (poglavlje 16).

- **10 do 12.7.2026.** (9-dimenzijski audit: architecture, data-flow,
  routes, dependencies, security, ux, accessibility, seo, performance,
  sintetiziran u `LAUNCH_BLOCKERS.md` P0-01..07, izvršen kroz
  `PRODUCTION_BACKLOG.md`, verificiran u `AUDIT_STATUS_2026-07-11.md`):
  gotovo sve P0/P1/P2/P3 stavke GOTOVO. Ostaci: seo-01 origin footgun
  (djelomično), routes/seo P2/P3 higijena (djelomično), vidi poglavlje 7.
- **14.7.2026.** (`SECURITY_AUDIT.md` root, LEKTA-SEC-01..07): svih 7
  RIJEŠENO ili DJELOMIČNO, vidi poglavlje 8.
- **16.7.2026.** (`AUDIT_2026-07-16/`, 62 nalaza AUD-01..64, 12 findera + 5
  adversarijalnih verifiera): 50+ nalaza RIJEŠENO kroz 8 remedijacijskih
  batcheva (`REMEDIATION_LOG.md`), uklj. oba High nalaza (AUD-17 kolizija
  migracija 0008/0009, AUD-38 OOM DoS preko footnotes/endnotes). Preostalo:
  AUD-52 (netlify-cli/supabase devDeps), AUD-53/AUD-12 (demo video), AUD-43/
  AUD-57 (ugniježđeni `lekta-pipeline/` repo), sve ODLUKA (vlasnička), vidi
  poglavlje 9.
- **23.7.2026.** (Result Experience audit): djelomično adresirano
  commitom `ff660d7` (25.7.), vidi poglavlje 6.
- **24.7.2026.** (Bundle lazy-load plan): djelomično izvršeno, vidi
  poglavlje 7.
- **25. do 28.7.2026.** (Repair Engine adversarijalni audit + izvršenje):
  oba P0 i gotovo svi P1 RIJEŠENI kroz 20+ commitova, vidi poglavlje 5.
  Ovo je najveći pojedinačni remedijacijski poduhvat u povijesti projekta.
- **27.7.2026.** (Vanjski marketinški/UX/go-live audit): rekoncilirano u
  poglavlju 11.

---

## 16. Izvori spojeni u ovaj dokument (obrisani, puni tekst u git povijesti)

```
docs/AUDIT_REPAIR_ENGINE_2026-07-25.md
docs/AUDIT_REPAIR_ENGINE_PROMPT.md
docs/LEKTA_CURRENT_STATE_AUDIT.md
docs/PLAN_REPAIR_REMEDIATION_2026-07-25.md
docs/audit/ACCESSIBILITY_AUDIT.md
docs/audit/AUDIT_BRIEF.md
docs/audit/AUDIT_STATUS_2026-07-11.md
docs/audit/CURRENT_ARCHITECTURE.md
docs/audit/DATA_FLOW.md
docs/audit/LAUNCH_BLOCKERS.md
docs/audit/NPM_AUDIT_ACCEPTED.md
docs/audit/PERFORMANCE_AUDIT.md
docs/audit/PERFORMANCE_OPTIMIZATION_PLAN_2026-07-24.md
docs/audit/RESULT_EXPERIENCE_AUDIT_2026-07-23.md
docs/audit/ROUTE_INVENTORY.md
docs/audit/SECURITY_AUDIT.md
docs/audit/SEO_AUDIT.md
docs/audit/THIRD_PARTY_DEPENDENCIES.md
docs/audit/UX_AUDIT.md
docs/audit/AUDIT_2026-07-16/00_SCOPE.md
docs/audit/AUDIT_2026-07-16/01_EXECUTIVE_SUMMARY.md
docs/audit/AUDIT_2026-07-16/02_FINDINGS.md
docs/audit/AUDIT_2026-07-16/10_CODE_TS.md
docs/audit/AUDIT_2026-07-16/11_SECURITY.md
docs/audit/AUDIT_2026-07-16/12_SUPABASE.md
docs/audit/AUDIT_2026-07-16/13_PIPELINE_PY.md
docs/audit/AUDIT_2026-07-16/14_DATA.md
docs/audit/AUDIT_2026-07-16/15_TESTS_CI.md
docs/audit/AUDIT_2026-07-16/16_DOCS_HYGIENE.md
docs/audit/AUDIT_2026-07-16/17_DEPS_PERF.md
docs/audit/AUDIT_2026-07-16/README.md
docs/audit/AUDIT_2026-07-16/REMEDIATION_LOG.md
SECURITY_AUDIT.md
SECURITY_REMEDIATION_PLAN.md
SECURITY_TEST_PLAN.md
THREAT_MODEL.md
```

Prilog A (skraćena metodologija sigurnosnog testiranja iz obrisanog
`SECURITY_TEST_PLAN.md`, zadrži se za buduće runde): staging projekt +
sintetički računi + canary tekst `LEKTA-AUDIT-CANARY-2026`, nikad stvarni
radovi. Automatizirane provjere: RLS po tablici (anon/vlasnik/drugi
korisnik), izvještaj s promijenjenim `slotId`/`userId`/entitlementom
(očekuje 401/403/402), webhook loš potpis/replay/paralelni isti order, OTP
limit, preflight privola/replay/malformed DOCX (magic/DTD/entity/zip bomba),
integrity paralelni teaser+full, retencija canary teksta nakon roka,
lokalnost (instrumentirani fetch/XHR/beacon/WebSocket), XSS payload u
nazivu/profilu/bibliografiji, HTTP security headeri. Ručna provjera:
Supabase RLS/Storage/tajne, Auth redirect/SMTP/rate-limit/CAPTCHA, cron
izvršenja, Netlify deploy postavke, Lemon Squeezy test event.

Prilog B (skraćen threat model iz obrisanog `THREAT_MODEL.md`): granice
sustava su (1) neprijavljeni korisnik → Netlify statička app → lokalni
parser/Worker, (2) prijavljeni korisnik+JWT → Supabase Edge → Auth/Postgres/
RLS → Lemon Squeezy/Resend, (3) preflight uz posebnu privolu → HMAC
propusnica → Python/Cloud Run → Supabase+bibliografski API-ji, (4) integrity
uz posebnu privolu → Integrity Edge → embedding/AI provider. Najosjetljivija
imovina: DOCX/PDF radovi i puni tekst integrity provjere (vrlo visoka
povjerljivost), JWT/webhook/HMAC/service-role tajne (vrlo visoka
povjerljivost i integritet). 5 obveznih produkcijskih dokaza prije
lansiranja: (1) screenshot/API dokaz RLS+Auth redirect+SMTP+CAPTCHA+rate
limit, (2) dokaz da pg_cron purge/reminder jobovi rade s alertom na
preskok, (3) staging test s dva računa da se ne može čitati/mijenjati/
brisati tuđe, (4) mrežni canary test da lokalni DOCX ne napušta preglednik
bez preflight privole, (5) opterećenje unutar sigurnih granica za
preflight/integrity.
