# Audit arhitekture: Lekta (ThesisReady)

Datum: 2026-07-10
Auditor: agent za arhitekturu (read-only pregled)
Opseg: cijeli repozitorij (src, data, supabase, HTML ulazne tocke, build konfiguracija).
Metoda: staticko citanje koda i podataka. Bez pokretanja builda i testova.

Napomena o jeziku: bez em i en crtica, koriste se zarez, dvotocka i zagrade.

---

## 1. Mapa podrucja (kako je sustav slozen)

### 1.1 Ulazne tocke (multi-page app, NIJE SPA)

Aplikacija je Vite multi-page build. Svaka HTML stranica ima svoj modul-entry:

| Stranica | Entry skripta | Uloga |
| --- | --- | --- |
| `index.html` | `src/main.ts` (uvozi `shared/ui-boot` + `ui/app`) | Glavna aplikacija (analiza, rezultat, naplata, QA) |
| `landing_usporedba.html` | `src/shared/ui-boot.ts` | Marketinska usporedba (samo boot: tema, nav, ikone) |
| `alati.html` | `src/shared/ui-boot.ts` | Hub besplatnih alata |
| `citat.html` | `src/tools/citat-page.ts` | Generator citata |
| `kartice.html` | `src/tools/kartice-page.ts` | Brojac kartica |
| `naslovnica.html` | `src/tools/naslovnica-page.ts` | Generator naslovnice |
| `literatura.html` | `src/tools/literatura-page.ts` | Popis literature |
| `izjava.html` | `src/tools/izjava-page.ts` | Izjava o izvornosti |
| `verification.html` | `src/ui/verification-console.ts` | Interna QA/verifikacijska konzola (izuzeta iz javnog builda) |

`vite.config.ts` (linije 37 do 48) definira sve entryje. `DEPLOY=1` izbacuje `verification.html`
iz grafa (i time `import.meta.glob` svih source PDF-ova, ~163MB) i rezi dev-only HTML regije
(setup modal, QA konzola) preko `stripDevOnly`. `__DEV_TOOLS__` define tree-shakea pripadajuci
JS iz `src/ui/app.ts`. Ovo je dobro rijesena granica javno vs interno.

### 1.2 Slojevi

- Podatkovni sloj `data/**`: tipizirani JSON (profili, izvori, katalog, coverage, rokovi,
  metodologija, checks, packages, legal). 94+ fakulteta, `data/profiles/verified-profiles.json`
  je 1,45 MB (38k redaka), plus 169 draft JSON datoteka po fakultetima.
- Loaderi `src/{profiles,catalog,coverage,methodology,submission,config}/*`: tanki prolazi koji
  hidriraju JSON u tipizirane registre (npr. `profiles/profile-registry.ts`, `config/config-loader.ts`).
- Analiticka jezgra `src/analysis/analyze-docx.ts`: `analyzeDocx` + auditni helperi (bez DOM-a).
  Vrti se u Web Workeru preko `analysis/analyze-docx-client.ts` (most s inline fallbackom) i
  `analysis/analyze-docx.worker.ts`. Golden ulaz je `analysis/golden-entry.ts`.
- Domenski moduli bez DOM-a: `src/{docx,audits,citations,scoring,pdf,repair,fingerprint}`.
- Repair Engine `src/repair/*`: pise izmjene u korisnikov `.docx` lokalno na uredjaju.
- UI orkestrator `src/ui/app.ts`: 713 redaka; UI, narudzbe, placanje, auth, checkout, garancija,
  referral, waitlist, submission gate, PDF i metadata analiza, demo, QA konzola, produkcijska konfiguracija.
- Report i naplata `src/report/*`: pricing, checkout, report/report-client, slot-logic, guarantee,
  partner, webhook, rulebook, referral.
- Auth `src/auth/session.ts`: klijentska OTP sesija (Supabase).
- Backend (Supabase Edge funkcije) `supabase/functions/*`: create-checkout, webhook-mor,
  generate-report, file-guarantee-claim, faculty-request, send-reminders, unsubscribe-reminder,
  redeem-referral-signup, health. RLS migracije `supabase/migrations/0001..0013`.
- Meta-tooling `scripts/*` (55 skripti): harvest, draft, seed, verify, generate (SEO stranice,
  naslovnice, citati). Build lanac je u `netlify.toml`.

### 1.3 Tok podataka (visoka razina, glavna analiza)

1. `init()` (app.ts:120) hidrira katalog, profile, produkcijsku konfiguraciju i renderira wizard.
2. Korisnik odabere fakultet/program/vrstu rada; `currentProfile()` (app.ts:309) slaze profil iz
   `VERIFIED_PROFILE_REGISTRY` (raw JSON) + baseline + katedra + override + advisory demotion.
3. `runAnalysis()` (app.ts:449) salje `.docx` u `analyzeDocxOffThread` (worker), koji vraca rezultat
   s `checks`, `issues`, `score`, `stats`, `details`, `documentStructure`.
4. `renderResult()` (app.ts:566) crta ocjenu, kategorije, plan ispravaka, submission gate, teaser
   ili puni izvjestaj (ovisno o paywallu).
5. Za puni izvjestaj `unlockFullReport` (report-client) salje parsiranu strukturu Edge Functionu
   `generate-report`, koji donosi serversku odluku (slot, 402 paywall, 429). Klijent nikad ne
   odlucuje o pravu pristupa.

### 1.4 Konfiguracija i feature flagovi

- Build-time: `__DEV_TOOLS__` (Vite define), `DEPLOY` env. Ove dvije zajedno gate-aju interne alate.
- Runtime: `DEFAULT_PRODUCTION_CONFIG` (app.ts:71) je const u UI modulu; drzi endpointe, payment
  provider, `supabaseUrl` i `supabaseAnonKey`, waitlist/referral/error/analytics endpointe, retention,
  upload cap. Prepisuje ga localStorage (`lekta.production.v2.1`) preko setup panela.
- Izvedeni runtime gejtovi: `paidOffersLive()`, `reportEndpointConfigured()`, `checkoutConfigured()`,
  `authConfigured()`, `guaranteeConfigured()`, `productionStatus().active`.

Stvarno stanje soft-launcha (iz `DEFAULT_PRODUCTION_CONFIG`):
- `supabaseUrl` + `supabaseAnonKey` POSTAVLJENI, `waitlistEndpoint` POSTAVLJEN: auth (OTP) i
  waitlist/faculty-request su ZIVI.
- `reportEndpoint`, `checkoutEndpoint`, `guaranteeEndpoint`, `referralEndpoint`, `analyticsEndpoint`
  PRAZNI, `enabled:false`: puni izvjestaj, checkout, garancija, referral share, narudzbe i analitika
  su DORMANTNI (kod postoji, gejtovi ga gase).

### 1.5 Admin / QA povrsina

- `verification.html` + `src/ui/verification-console.ts`: interna konzola, izuzeta iz javnog builda.
- `openQa()` (app.ts:577) + setup modal: gejtano `__DEV_TOOLS__` (stripano na DEPLOY) i
  `setupAllowed()` (localhost ili `localStorage.lekta.admin=1`). Dobro izolirano.

---

## 2. Tablica nalaza

| ID | Prioritet | Naslov | Lokacija |
| --- | --- | --- | --- |
| architecture-01 | P1 | Monolitni `src/ui/app.ts` mijesa 10+ odgovornosti | `src/ui/app.ts` (713 redaka) |
| architecture-02 | P1 | Cijeli nacionalni skup profila staticki u klijentskom bundleu | `src/profiles/profile-registry.ts:30,49` |
| architecture-03 | P2 | `effectiveRules` i `profile-loader` nisu ozicani u runtime (mrtav sloj + doc drift) | `src/profiles/profile-loader.ts:8`, `src/ui/app.ts:311` |
| architecture-04 | P2 | Dva izvora istine za PACKAGES (`data/packages.json` vs inline) | `src/config/config-loader.ts:11`, `src/ui/app.ts:94` |
| architecture-05 | P2 | Parser i analiza ugradjeni u UI orkestrator | `src/ui/app.ts:158,358,361` |
| architecture-06 | P2 | Produkcijska runtime konfiguracija hardkodirana u UI modulu | `src/ui/app.ts:71` |
| architecture-07 | P2 | Edge funkcije uvoze klijentski `src/**` bez Deno provjere u build gateu | `supabase/functions/generate-report/index.ts:13` |
| architecture-08 | P3 | Dormantna povrsina naplate/autha isporucuje se u produkciju, samo runtime-gejtana | `src/ui/app.ts:71,227` |
| architecture-09 | P3 | Default `orderEndpoint:'/'` je latentni footgun za slanje dokumenta | `src/ui/app.ts:71,712` |

---

## 3. Detaljni nalazi

### architecture-01 (P1): Monolitni `src/ui/app.ts` mijesa 10+ odgovornosti

- Problem: `src/ui/app.ts` ima 713 redaka i objedinjuje UI wizard, render rezultata, narudzbe,
  placanje (checkout), auth (OTP modal), garancijski zahtjev, referral, waitlist, submission gate,
  PDF i metadata analizu, demo fixture, QA konzolu i produkcijsku konfiguraciju. Stil je zbijen
  (jedan izraz po liniji, gusti ternari) uz sveprisutni `any` na granici prema DOM-u i podacima.
- Lokacija: `src/ui/app.ts` (cijela datoteka; primjeri: `init` 120, `bind` 132, `currentProfile` 309,
  `runAnalysis` 449, `submitOrder` 712, `openQa` 577, `handleUnlockReport` 649, `submitGuaranteeClaim` 632).
- Dokaz: CLAUDE.md backlog stavka 3 oznacena je kao GOTOVO uz tekst da je split dovrsen, ali datoteka
  je i dalje 713 redaka s mijesanim slojevima. Zbog stila (npr. linija 71 nosi cijeli
  `DEFAULT_PRODUCTION_CONFIG`, linija 712 cijeli `submitOrder`) diff je tesko citljiv i sklon
  git-race sukobima (vise puta zabiljezenima u memoriji projekta: app.ts je namjerno izostavljan iz
  commita jer dijeljena datoteka drzi tudje izmjene).
- Moguca posljedica: visok rizik regresije pri svakoj promjeni, tesko jedinicno testiranje (nema
  cistih granica), sporije onboardanje, ucestali merge sukobi na jednoj vrucoj datoteci. Blokira
  ostatak roadmapa koji trazi izmjene u ovom modulu.
- Preporuceno rjesenje: nastaviti split po odgovornosti u tanke module s cistim funkcijama i
  eksplicitnim ovisnostima (bez `any`), npr. `src/ui/orders.ts`, `src/ui/checkout-ui.ts`,
  `src/ui/auth-ui.ts`, `src/ui/guarantee-ui.ts`, `src/ui/submission-ui.ts`, `src/ui/demo.ts`,
  `src/ui/qa-console.ts`. Analizu aux datoteka premjestiti u `src/analysis`/`src/docx` (vidi
  architecture-05). `app.ts` svesti na tanki orkestrator koji zice module. Svaki korak uz golden
  i UI smoke zelen.
- Acceptance kriteriji: `app.ts` ispod ~250 redaka orkestracije; svaka izvucena domena ima barem
  jedan jedinicni test; `npm run check` zelen; golden snapshoti nepromijenjeni; nema nove `@ts-nocheck`.
- Rizik regresije: visok tijekom rada, nizak po zavrsetku ako je svaki korak pokriven golden i
  smoke testovima. Kljucno je izvlaciti bez mijenjanja ponasanja (1:1 premjestaj, pa refaktor).

### architecture-02 (P1): Cijeli nacionalni skup profila staticki u klijentskom bundleu

- Problem: `profile-registry.ts` staticki uvozi `verified-profiles.json` (1,45 MB / 38k redaka) i
  eager `import.meta.glob` nad SVIH 169 draft datoteka (`data/profiles/*/drafts/*.json`), plus
  katalog i coverage. Sve zavrsi u index bundleu koji svaki posjetitelj skida i parsira, iako u
  jednoj sesiji koristi samo jedan profil.
- Lokacija: `src/profiles/profile-registry.ts:30` (`rawVerified`), `:49` (`import.meta.glob(..., { eager: true })`);
  `data/profiles/verified-profiles.json` (1,45 MB).
- Dokaz: `wc -c data/profiles/verified-profiles.json` = 1453295 bajta; `find data/profiles -path '*/drafts/*.json' | wc -l` = 169.
  Glob je `eager: true`, dakle svih 169 modula ulazi u graf glavnog bundlea.
- Moguca posljedica: veliki JS payload i trosak parsiranja na svakom ucitavanju `index.html`, najvise
  na slabijim mobilnim uredajima, tj. bas onima za koje se upload cap snizava (app.ts:534 `effectiveUploadCap`).
  Sporiji Time to Interactive, veci memorijski otisak taba.
- Preporuceno rjesenje: lijeno ucitavati profil po odabranom fakultetu (dynamic import po id-u ili
  fakultetu), a globalno drzati samo lagan indeks (id, naziv, unit, workTypes) za popunjavanje
  izbornika. Drafts glob ionako sluzi samo advisory demotionu i repair items; moze biti lijen ili
  izostavljen iz glavnog entryja i ucitan tek u rezultatu. Izmjeriti bundle prije i poslije.
- Acceptance kriteriji: glavni JS chunk za `index.html` znatno manji (cilj: profilski podaci nisu u
  inicijalnom chunku); analiza i dalje radi za sve profile; golden i smoke zeleni; nema regresije u
  QA dijagnostici (`runRegistryDiagnostics`).
- Rizik regresije: srednji. `runRegistryDiagnostics`, coverage snapshot i waitlist detekcija citaju
  cijeli registar sinkrono, pa async ucitavanje trazi paznju na redoslijed (init mora cekati indeks).

### architecture-03 (P2): `effectiveRules` i `profile-loader` nisu ozicani u runtime

- Problem: CLAUDE.md (sekcija Option A) tvrdi da engine (`currentProfile` u app.ts) cita
  `definition.effectiveRules` uz fallback na `definition.rules`. U kodu to nije tako: zivi engine cita
  `definition.rules` izravno, a `profile-loader.ts`/`compileProfile` (koji jedini proizvode
  `effectiveRules`) nisu pozvani nigdje na runtime putanji.
- Lokacija: `src/ui/app.ts:311` (`definition?structuredClone(definition.rules)`),
  `src/analysis/golden-entry.ts:18` (`structuredClone(entry.rules)`), `src/profiles/profile-loader.ts:8`
  (`loadProfiles` -> `compileProfile`), `src/profiles/rule-compiler.ts:125,129`.
- Dokaz: `grep -rn "loadProfiles|compileProfile"` daje samo self-reference unutar `profile-loader.ts`;
  nijedan UI ni analysis modul ne uvozi `profile-loader`. `compileEffectiveRules` koristi samo
  `src/verification/published-rules.ts` i testovi, ne zivi engine. Dakle `effectiveRules` nikad ne
  stigne do bodovanja.
- Moguca posljedica: doc-vs-code drift zavarava buducu izmjenu. CLAUDE.md upute "Kako se od sada
  ureduje pravilo" nalazu uredivanje `ruleEntry` uz ocekivanje da overlay proizvede `effectiveRules`
  za engine; buduci da engine cita `rules`, takva izmjena tiho NE mijenja zivo ponasanje osim ako je
  kljuc i u `rules`. `profile-loader.ts` je efektivno mrtav sloj.
- Preporuceno rjesenje: donijeti odluku i uskladiti kod s dokumentacijom. Ili (a) ozicati zivi engine
  i `golden-entry` da citaju `effectiveRules` (uz fallback na `rules`) kroz `compileProfile`/`loadProfiles`,
  ili (b) ako Option A ostaje samo za verifikacijski sloj, ispraviti CLAUDE.md da to jasno kaze i
  oznaciti `profile-loader.ts` kao verifikacijski-only (ili ga ukloniti ako nije potreban). U oba
  slucaja ukloniti mrtvi uvoz.
- Acceptance kriteriji: dokumentacija i kod se slazu oko toga sto engine cita; `tests/rule-compiler.test.ts`
  i faithfulness ostaju zeleni; nijedan izvezeni simbol nije mrtav bez namjere; `npm run check` zelen.
- Rizik regresije: nizak ako se izabere opcija (b) (samo doc + brisanje mrtvog koda). Srednji za (a)
  jer mijenja izvor pravila bodovanja (mora proci golden + faithfulness za sve profile).

### architecture-04 (P2): Dva izvora istine za PACKAGES

- Problem: `config-loader.ts` izvozi `PACKAGES` iz `data/packages.json` (dokumentirano kao
  podatkovni sloj konfiguracije), ali `app.ts` definira vlastiti inline `PACKAGES` const koji je
  ono sto se stvarno koristi u UI-u. Dvije definicije su vec DIVERGIRALE.
- Lokacija: `src/config/config-loader.ts:11` (`export const PACKAGES = rawPackages`),
  `src/ui/app.ts:94` (inline `const PACKAGES=[...]`), koristen na app.ts:124, 248, 576, 712.
- Dokaz: `data/packages.json` sadrzi paket `instant` (9 EUR) i `premium` naziva "Premium audit";
  inline `PACKAGES` u app.ts nema `instant` i koristi naziv "Premium obrada". `grep -rn config-loader`
  pokazuje da `config-loader.PACKAGES` nema nijednog potrosaca, dakle export je mrtav dok je pravi
  izvor hardkodiran u monolitu.
- Moguca posljedica: buduca izmjena cijena/paketa u `data/packages.json` (ocekivano mjesto) nema
  ucinak, a stvarne cijene u UI-u ostaju stare. Rizik netocnih cijena/naziva prema korisniku i u
  narudzbi (`submitOrder` cita inline `PACKAGES`).
- Preporuceno rjesenje: jedan izvor istine. Ili uskladiti `data/packages.json` sa stvarnim paketima i
  uvesti ga u app.ts (obrisati inline const), ili ukloniti neiskoristeni export i `data/packages.json`
  ako je inline namjerno. Preferirano: podatkovni sloj (`data/packages.json`) kao izvor, uz test koji
  cuva shape.
- Acceptance kriteriji: samo jedna definicija paketa u repou; UI, setup panel i narudzba citaju isti
  izvor; nema mrtvog exporta; `npm run check` zelen.
- Rizik regresije: nizak. Promjena je lokalizirana; treba provjeriti da setup payment linkovi
  (`setupPay-<id>`) i QA `PACKAGES.length` provjere i dalje odgovaraju id-jevima paketa.

### architecture-05 (P2): Parser i analiza ugradjeni u UI orkestrator

- Problem: unatoc postojanju namjenskih slojeva `src/analysis`, `src/docx`, `src/pdf`, dio stvarne
  analize zivi u UI modulu: `detectDocxContext` (ZIP + XML parsiranje za auto-detekciju fakulteta),
  `analyzeMetadataDocx` (potpuni parser zasebnog Worda sa sazetkom i kljucnim rijecima), i
  `docxCoreMetadata`. Ove funkcije nemaju golden pokrivenost i vezane su na DOM/UI kontekst.
- Lokacija: `src/ui/app.ts:158` (`detectDocxContext`), `:358` (`analyzeMetadataDocx`), `:361`
  (`docxCoreMetadata`); `:357` (`analyzePdfFile` je tanki omotac, to je u redu).
- Dokaz: `analyzeMetadataDocx` (app.ts:358 do 360) je jednolinijski parser koji radi `ZipReader`,
  `parseXml`, heuristiku sazetka/kljucnih rijeci i vraca `compliant` procjenu, sve u UI modulu.
  `detectDocxContext` (app.ts:158 do 172) parsira `word/document.xml` i `docProps/core.xml` u UI-u.
- Moguca posljedica: logika analize koja utjece na submission gate (metadata compliant/blocked)
  nije pokrivena golden harnessom, pa se moze tiho pokvariti pri promjeni parsera. Mijesanje sloja
  otezava testiranje i ponovnu upotrebu (npr. u workeru).
- Preporuceno rjesenje: premjestiti `detectDocxContext`, `analyzeMetadataDocx`, `docxCoreMetadata` u
  `src/analysis` ili `src/docx` kao ciste funkcije (ulaz: bajtovi ili DOM, izlaz: podaci), uz golden
  ili jedinicne fixture. UI zadrzava samo I/O omotac (citanje `File` u bajtove) i render.
- Acceptance kriteriji: nova analiza aux datoteka ima jedinicni test; UI vise ne parsira XML izravno;
  golden nepromijenjen; `npm run check` zelen.
- Rizik regresije: nizak do srednji. Premjestaj mora biti 1:1 (isto ponasanje), a submission gate
  ovisi o tim izlazima pa treba smoke provjera rezultata.

### architecture-06 (P2): Produkcijska runtime konfiguracija hardkodirana u UI modulu

- Problem: sva runtime konfiguracija (endpointi, payment provider, `supabaseUrl`, `supabaseAnonKey`,
  waitlist/referral/error/analytics endpointi, retention, upload cap, business podaci) zivi kao
  const `DEFAULT_PRODUCTION_CONFIG` u UI modulu, umjesto u konfiguracijskom sloju `src/config`. Sloj
  `src/config` je tanak i pokriva samo verziju, packages, work-type-labels i checks.
- Lokacija: `src/ui/app.ts:71` (`DEFAULT_PRODUCTION_CONFIG`), koristen kroz `loadProductionConfig`
  (app.ts:221) i cijeli tok naplate/autha.
- Dokaz: `supabaseUrl` i `supabaseAnonKey` doslovno su upisani u UI izvoru na liniji 71. Konfiguracija
  je time vezana uz UI datoteku (svaka promjena okruzenja je izmjena `app.ts`), a `src/config` ne drzi
  runtime endpointe.
- Moguca posljedica: konfiguracija i kod su spregnuti; tesko je razdvojiti okruzenja (dev/stage/prod)
  bez diranja monolita; anon kljuc i URL su u izvoru (anon je javan po dizajnu uz RLS, ali spregnutost
  s UI-em je losa). Otezava buduci pravi backend (Supabase) i env-driven konfiguraciju.
- Preporuceno rjesenje: izvuci runtime konfiguraciju u `src/config` (npr. `production-config.ts`) uz
  tipiziranu shemu i, gdje je moguce, citanje iz Vite env (`import.meta.env`) za URL/kljuc. UI cita
  konfiguraciju kroz loader, ne kroz vlastiti const.
- Acceptance kriteriji: `DEFAULT_PRODUCTION_CONFIG` vise nije u `app.ts`; endpointi i Supabase
  parametri dolaze iz konfiguracijskog sloja; setup panel i dalje radi; `npm run check` zelen.
- Rizik regresije: nizak do srednji. Mnogo funkcija cita `productionConfig`; premjestaj mora ocuvati
  isti oblik objekta i default vrijednosti (posebno prazne endpointe koji drze soft-launch gejtove).

### architecture-07 (P2): Edge funkcije uvoze klijentski `src/**` bez Deno provjere u build gateu

- Problem: Supabase Edge funkcije (Deno) izravno uvoze module iz klijentskog `src/**` (fingerprint,
  report, slot-logic, partner, guarantee, pricing). To je pametna ponovna upotreba ciste logike, ali
  build gate (`npm run check` = tsc + vitest + vite build) ne pokrece Deno, pa se ove funkcije ne
  tipiziraju ni ne testiraju za Deno runtime.
- Lokacija: `supabase/functions/generate-report/index.ts:13` do `:20` (uvozi
  `../../../src/fingerprint/fingerprint.ts`, `../../../src/report/*.ts`, `_shared/*`); slican obrazac
  u drugim funkcijama.
- Dokaz: komentar u funkciji (linije 7 i 8) izricito kaze da se logika "verificira preko cistih
  modula" u `npm run check`, ali da se sam glue izvodi u Deno runtimeu izvan checka. Ako bi neki
  dijeljeni modul u `src/report/*` uvukao klijentsku ovisnost (DOM, `import.meta.glob`, Vite-specificno),
  Deno funkcija bi pukla u runtimeu, a build gate to ne bi uhvatio.
- Moguca posljedica: tiho lomljenje serverske funkcije pri naizgled bezopasnoj izmjeni dijeljenog
  modula; regresija vidljiva tek u produkciji Edge Functiona (naplata, puni izvjestaj).
- Preporuceno rjesenje: dodati Deno provjeru u CI (npr. `deno check supabase/functions/**/index.ts`)
  ili barem lint koji zabranjuje klijentske uvoze u modulima koje dijele klijent i Deno. Alternativa:
  jasno oznaciti "shared-isomorphic" podskup `src/report/*` koji ne smije uvoziti DOM/Vite, uz test.
- Acceptance kriteriji: postoji automatska provjera koja pada ako dijeljeni modul postane
  ne-izomorfan; dokumentirana granica izomorfnih modula; `npm run check` i Deno provjera zeleni.
- Rizik regresije: nizak (dodaje se provjera, ne mijenja se ponasanje). Trosak je CI vrijeme i
  eventualno ciscenje postojecih uvoza ako vec postoji ne-izomorfan modul.

### architecture-08 (P3): Dormantna povrsina naplate/autha isporucuje se u produkciju, samo runtime-gejtana

- Problem: velika povrsina (checkout, puni izvjestaj, garancija, referral share, narudzbe, analitika)
  isporucuje se u javni bundle iako je dormantna (endpointi prazni). Gasi je samo runtime provjera, za
  razliku od QA/setup panela koji se build-time izbacuju (`DEPLOY`/`__DEV_TOOLS__`).
- Lokacija: `src/ui/app.ts:71` (prazni endpointi), `:227` (`paidOffersLive`), plus svi checkout/auth/
  guarantee/referral handleri koji ostaju u bundleu.
- Dokaz: `reportEndpoint`, `checkoutEndpoint`, `guaranteeEndpoint`, `referralEndpoint`,
  `analyticsEndpoint` prazni su u `DEFAULT_PRODUCTION_CONFIG`, `enabled:false`. Kod tih znacajki je i
  dalje u glavnom modulu i isporucuje se svima.
- Moguca posljedica: nepotreban kod u produkcijskom bundleu (velicina i povrsina) za znacajke koje
  trenutno ne donose vrijednost; veca povrsina za greske i sigurnosni pregled. Nije funkcionalni bug
  jer gejtovi rade, ali je arhitekturni dug.
- Preporuceno rjesenje: kad naplata jos nije uzivo, razmotriti build-flag (slicno `__DEV_TOOLS__`) koji
  lijeno ucitava ili izostavlja monetizacijski modul dok endpointi nisu postavljeni; ili barem
  code-splitati checkout/guarantee/referral u zaseban chunk koji se ucita tek kad su ozicani.
- Acceptance kriteriji: inicijalni bundle ne sadrzi dormantni monetizacijski kod kad naplata nije
  konfigurirana, ili je jasno izdvojen u lijeni chunk; gejtovi i puni tok rade kad se ozice; check zelen.
- Rizik regresije: nizak do srednji. Treba paziti da lijeno ucitavanje ne pokvari tok koji se aktivira
  cim se endpoint postavi (npr. povratak s placanja).

### architecture-09 (P3): Default `orderEndpoint:'/'` je latentni footgun

- Problem: default `orderEndpoint` je `'/'`. Narudzbe se salju samo ako je `productionStatus().active`
  (`enabled && endpoint`), a `enabled:false` u soft-launchu, pa danas padaju na lokalni draft. Ako
  netko ubuduce postavi `enabled:true` a zaboravi promijeniti endpoint, `submitOrder` bi POST-ao
  multipart formu (ukljucujuci korisnikov `.docx`) na korijen sitea.
- Lokacija: `src/ui/app.ts:71` (`orderEndpoint:'/'`), `:712` (`submitOrder` salje `FormData` s
  `document` na `productionConfig.orderEndpoint`).
- Dokaz: `submitOrder` (app.ts:712) uvjetuje slanje na `productionStatus().active`, koji zahtijeva
  `endpoint` neprazan; `'/'` je neprazan, pa je jedina zastita `enabled` zastavica.
- Moguca posljedica: rizik nenamjernog slanja korisnickog dokumenta na krivo odrediste ako se
  `enabled` uklopi bez ispravnog endpointa (privatnost, gubitak podataka).
- Preporuceno rjesenje: default `orderEndpoint` postaviti na prazno i tretirati prazno kao "nije
  konfigurirano"; `productionStatus().active` neka trazi eksplicitan, validan apsolutni ili namjenski
  endpoint (ne korijen). Dodati validaciju u setup panelu.
- Acceptance kriteriji: prazan/neispravan `orderEndpoint` gasi slanje bez obzira na `enabled`; test
  pokriva da se dokument ne salje na `'/'`; `npm run check` zelen.
- Rizik regresije: nizak. Promjena je konzervativnija zastita; treba samo potvrditi da legitimni
  konfiguriran endpoint i dalje prolazi.

---

## 4. Pozitivni nalazi (za kontekst)

- Cista granica javno vs interno: `DEPLOY`/`__DEV_TOOLS__` build-time izbacuju verifikacijsku konzolu,
  QA i setup panel i ~163MB source PDF-ova (vite.config.ts, netlify.toml). Ovo je uzoran obrazac.
- Analiza je pravilno izvucena iz UI-a u `src/analysis/analyze-docx.ts` i vrti se u Web Workeru s
  inline fallbackom; golden harness pokriva worker putanju (isti xmldom DOMParser).
- Serverska odluka o pristupu punom izvjestaju: klijent nikad ne odlucuje o pravu, `generate-report`
  racuna otisak iz istog payloada (report-client.ts, generate-report/index.ts). Dobar security stav.
- Namjerna divergencija golden (sirovi engine) vs zivi engine (advisory demotion) je dokumentirana i
  pokrivena testom, sto stiti detekciju parsera od produktne politike.

## 5. Preporuceni redoslijed

1. architecture-02 (bundle bloat, pogadja sve korisnike, mjerljiv ucinak).
2. architecture-01 (monolit, otklanja rizik za sav daljnji rad; radi se inkrementalno).
3. architecture-03 i architecture-04 (drift i mrtav kod, jeftino, spreacava tihe greske u pravilima i cijenama).
4. architecture-05, architecture-06 (slojevito ciscenje, priprema za pravi backend).
5. architecture-07 (CI zastita za Edge funkcije).
6. architecture-08, architecture-09 (higijena povrsine i sigurnosni default) uz sljedecu iteraciju naplate.
