# Audit toka podataka i privatnosti (Lekta)

Dimenzija: data-flow. Datum: 2026-07-10. Metoda: READ-ONLY pregled koda (bez builda i testova).
Svaki nalaz nosi dokaz iz koda (datoteka:linija).

## Mapa podrucja: put korisnickog dokumenta

Trazeni put upload -> lokalna analiza -> rezultat -> repair -> izvjestaj, uz sve tocke gdje podaci
napustaju uredaj.

1. Upload i predanaliza (LOKALNO). `setFile` (`src/ui/app.ts:145`), `updateQuickStats`
   (`src/ui/app.ts:157`), `detectDocxContext` (`src/ui/app.ts:158`) citaju `.docx` preko
   `file.arrayBuffer()` u pregledniku. Nista se ne salje.
2. Analiza (LOKALNO, Web Worker). `analyzeDocxOffThread` (`src/analysis/analyze-docx-client.ts:68`)
   pokrece `analyze-docx.worker.ts`, uz inline fallback na `analyzeDocx`
   (`src/analysis/analyze-docx.ts`). Sav unzip, XML i auditi su na uredaju. Rezultat je objekt
   `currentResult` sagraden u `analyze-docx.ts:94` (sadrzi `documentStructure`, `stats`, `checks`,
   `issues`, `details.typoLint`, `details.legalCitationEngine`).
3. Rezultat i teaser (LOKALNO). `renderResult` (`src/ui/app.ts:566`) crta ekran iz `currentResult`.
   Ovdje se, medutim, poziva i `renderWaitlistBar()` koji moze automatski poslati signal na
   posluzitelj (vidi nalaz data-flow-02).
4. Repair Engine (LOKALNO, pise u korisnikov docx). `renderRepairSection` (`src/ui/app.ts:680`),
   `src/repair/*`. Bajtovi dolaze iz `file.arrayBuffer()` (`src/ui/app.ts:699`); ispravljeni docx
   se preuzima lokalno. Nista se ne salje.
5. Puni izvjestaj (SALJE NA POSLUZITELJ, kad je ozicen). `handleUnlockReport` (`src/ui/app.ts:649`)
   -> `unlockFullReport` (`src/report/report-client.ts:92`) -> Edge Function
   `supabase/functions/generate-report/index.ts`. Salje `parsedStructure` + `analysisResult`
   (vidi nalaz data-flow-03). Dormant u zadanoj konfiguraciji (`reportEndpoint` je prazan).
6. Rucna narudzba (SALJE DOKUMENT NA POSLUZITELJ). `submitOrder` (`src/ui/app.ts:712`) Netlify
   formom uz `fd.append('document', file, ...)`. Gejtano izricitom privolom (`#orderConsent`) i
   `productionStatus().active`. Dormant u zadanoj konfiguraciji (`orderEndpoint`/`enabled`).

### Sto ide na posluzitelj (zivo u zadanoj konfiguraciji)

Zadani `DEFAULT_PRODUCTION_CONFIG` (`src/ui/app.ts:71`) ima popunjene `supabaseUrl`,
`supabaseAnonKey` i `waitlistEndpoint` (produkcijski projekt `zrrjttizjyfcxmcpgzml`), a prazne
`reportEndpoint`, `checkoutEndpoint`, `guaranteeEndpoint`, `analyticsEndpoint`, `errorEndpoint`,
`referralEndpoint`. Posljedica po zadanom:

- Prijava e-mailom (OTP) je ZIVA: `requestEmailOtp`/`verifyEmailOtp`
  (`src/auth/session.ts:88,113`) gadaju `/auth/v1/otp` i `/auth/v1/verify` na live Supabase.
  E-mail adresa ulazi u `auth.users`.
- Waitlist (`faculty-request`) je ZIV: automatski signal i naknadno vezanje e-maila
  (`src/waitlist/waitlist-bar.ts:82`, `src/waitlist/waitlist-client.ts:74`).
- Puni izvjestaj, checkout, garancija, analitika, error-kolektor: OFF (endpointi prazni).

### Supabase tablice i osobni podaci (backend, projekt zrrjttizjyfcxmcpgzml)

| Tablica | Osobni/izvedeni podaci | Retencija |
|---|---|---|
| `auth.users` | e-mail (OTP prijava) | brisanje na zahtjev |
| `faculty_requests` (0011) | `email` (opc.), `faculty_name_raw`, `program_id`, `work_type`, `user_id`, `ip_hash` | `ip_hash` se nulira nakon 30 dana (`purge_faculty_request_ip`); red i e-mail ostaju |
| `document_slots` (0001) | `fingerprint` = { titleNorm, **authorNorm**, headings[], sectionCount }, `label` (fragment naslova), `user_id` | nema purge joba |
| `report_generations` (0001) | `doc_fingerprint`, `ip_hash`, `user_id`, `status` | purge > 90 dana (`purge_old_report_generations`, 0009) |
| `entitlements`, `coupon_grants`, `manual_orders` (0001/0003) | `user_id`, `order_id` | nije definirano |
| `checkout_consents` (0021) | `user_id`, `consent_text`, `terms_version`, `consented_at` | dokazna, drzi se |
| `guarantee_claims` (0007) | `user_id`, `slot_id`, `rule_key`, `evidence_path` (slobodan tekst korisnika) | nije definirano |
| `deadline_subscriptions` (0012) | `user_id`, `faculty_id`, `work_type`, `deadline_date` | opt-out |
| `referral_signups` (0013) | `user_id`, `referred_ip_hash` | anti-fraud |

RLS je ukljucen na svim korisnickim tablicama (select-own politike); upisi idu preko service-role
Edge Functiona. Sirovi IP se nigdje ne sprema, samo soljeni sha256 (`hashClientIp`,
`faculty-request/index.ts:97`).

## Tablica nalaza

| ID | Prioritet | Naslov | Lokacija |
|---|---|---|---|
| data-flow-01 | P1 | Apsolutna tvrdnja "Nista se ne salje na posluzitelj" nije istinita u zivom ponasanju | `index.html:20` |
| data-flow-02 | P1 | Waitlist traka automatski salje signal na posluzitelj bez radnje korisnika, tijekom "lokalne" faze | `src/waitlist/waitlist-bar.ts:82` |
| data-flow-03 | P1 | Puni izvjestaj salje cijeli rezultat s doslovnim isjeccima teksta rada, protivno obavijesti o privatnosti | `src/report/report-client.ts:99` |
| data-flow-04 | P2 | Nema automatske retencije za `document_slots` (ime autora) i redove `faculty_requests` (e-mail) | `supabase/migrations/0011_faculty_requests.sql:132` |
| data-flow-05 | P2 | Resend (dostava e-maila) nije naveden kao izvrsitelj obrade; podsjetnik nosi fragment naslova rada | `supabase/functions/send-reminders/index.ts:34` |
| data-flow-06 | P2 | Live Supabase URL i anon kljuc su hardkodirani default pa su prijava i waitlist zivi za sve posjetitelje | `src/ui/app.ts:71` |
| data-flow-07 | P3 | `faculty-request` ima otvoren CORS `*` i anoniman upis: bilo koje porijeklo moze slati signale i okidati IP-hash logiranje | `supabase/functions/faculty-request/index.ts:19` |
| data-flow-08 | P3 | Error-kolektor (kad je ozicen) salje User-Agent i putanju bez privole; nije PII-gejtan kao analitika | `src/ui/app.ts:77` |

---

## Nalazi

### data-flow-01 (P1): Apsolutna tvrdnja "Nista se ne salje na posluzitelj"

- Problem: marketinski meta opis tvrdi apsolutno "Nista se ne salje na posluzitelj", a hero i meta
  opisi tvrde "Dokument ostaje na tvom uredaju". U zadanoj konfiguraciji aplikacija ipak salje
  podatke na posluzitelj: automatski waitlist signal (data-flow-02), prijavu e-mailom (Supabase
  GoTrue) i, kad se ozice, puni izvjestaj i narudzbu s dokumentom. Apsolut je netocan.
- Lokacija: `index.html:20` ("Nista se ne salje na posluzitelj."), potkrijepljeno `index.html:6`
  ("Dokument ostaje na tvom uredaju") i `index.html:266` ("Datoteka ostaje na uredaju").
- Dokaz/reprodukcija: usporedi `index.html:20` s `src/waitlist/waitlist-bar.ts:82` (automatski
  POST) i `src/auth/session.ts:88` (OTP prema Supabase). Odaberi nepokriven fakultet i pokreni
  analizu: DevTools Network pokazuje POST na `.../functions/v1/faculty-request` bez ijednog klika.
- Posljedica: transparentnost prema GDPR cl. 13 i potrosacko pravo (zavaravajuca tvrdnja).
  Nijansirana obavijest o privatnosti (`src/legal/legal-content.ts:82`) je tocnija od meta copyja,
  pa marketing i pravni tekst divergiraju.
- Preporuka: ublazi apsolut. Npr. "Tekst i datoteka rada ostaju na uredaju; automatska analiza je
  lokalna." Zadrzi tvrdnju samo za tekst/datoteku dokumenta, ne za sav mrezni promet.
- Acceptance: nijedan javni meta/hero tekst ne tvrdi da se NISTA ne salje; tvrdnje su ogranicene na
  tekst i datoteku rada; poravnate su s obavijesti o privatnosti.
- Rizik regresije: nizak (tekstualna izmjena; bez utjecaja na logiku).

### data-flow-02 (P1): Waitlist traka automatski salje signal bez radnje korisnika

- Problem: `mountWaitlistBar` na prikazu trake automatski poziva `fireSignal`, koji radi POST na
  `faculty-request` s odabirom fakulteta; posluzitelj iz `x-forwarded-for` racuna soljeni `ip_hash`.
  To se dogada tijekom faze koju obavijest o privatnosti (`src/legal/legal-content.ts:82`, odjeljak
  1) opisuje kao potpuno lokalnu ("ne salju se na posluzitelj"). Signal je fire-and-forget, bez
  eksplicitne privole ni klika.
- Lokacija: `src/waitlist/waitlist-bar.ts:82` (`if (!entry) void fireSignal(...)`), definicija
  `fireSignal` na `:49`; okida se iz `renderResult` preko `renderWaitlistBar` (`src/ui/app.ts:566`,
  `:562`). Endpoint je ziv po defaultu (`src/ui/app.ts:71` `waitlistEndpoint`).
- Dokaz/reprodukcija: odaberi nepokriven fakultet/program/vrstu rada, analiziraj dokument; u
  Network tabu pojavi se POST na `functions/v1/faculty-request` s tijelom `{facultyId, facultyName,
  programId, workType, ...}`, iako korisnik nije nista upisao ni kliknuo.
- Posljedica: pseudonimni telemetrijski upis (odabir fakulteta + hashirani IP) bez privole i bez
  objave u obavijesti o privatnosti; izravna nesuklada s pozicijom "lokalno / nista se ne salje".
- Preporuka: (a) odgodi svaki mrezni upis do eksplicitne radnje korisnika (klik "Obavijesti me" ili
  upis e-maila), ili (b) izricito dokumentiraj automatski demand-signal u obavijesti o privatnosti i
  kolacicima (pravna osnova: legitimni interes) i ponudi opt-out. Preferiraj (a).
- Acceptance: bez korisnicke radnje nema mreznog poziva na `faculty-request`; ako se zadrzi
  automatika, ona je opisana u pravnom tekstu i ima opt-out; test u `tests/*` dokazuje da render
  trake sam ne salje.
- Rizik regresije: srednji (mijenja se ponasanje demand-signala; potrebno azurirati waitlist testove
  koji ocekuju upis na prikazu, `src/waitlist/waitlist-bar.ts` doc komentar :6).

### data-flow-03 (P1): Puni izvjestaj salje doslovne isjecke teksta rada

- Problem: obavijest o privatnosti i "Obrada dokumenata" tvrde da se za puni izvjestaj salju SAMO
  "naslov i autor rada, struktura naslova te pronadene stavke provjere" i da "sam tekst rada ...
  ostaje u pregledniku" (`src/legal/legal-content.ts:82` odjeljak 1, `:106` odjeljak 2). Klijent,
  medutim, salje CIJELI `currentResult` kao `analysisResult`. `buildReportRequest` prosljeduje
  citav objekt rezultata (`src/report/report.ts:187`, `unlockFullReport` na
  `src/report/report-client.ts:99`), a taj objekt sadrzi `details.typoLint.findings[].excerpt`:
  doslovne isjecke teksta dokumenta (do ~60 znakova svaki, do 200 nalaza), plus
  `details.incompleteReferences[].text` (do 70 znakova zapisa literature),
  `details.legalCitationEngine.problems` i doslovne tekstove naslova. To su fragmenti "teksta rada".
- Lokacija: gradnja payloada `src/report/report-client.ts:99-101`; sadrzaj rezultata
  `src/analysis/analyze-docx.ts:94` (`typoLint:_typoReport` gdje je `findings:_typoAll.slice(0,200)`);
  isjecak `src/tools/typo-lint.ts:31` (`EXCERPT_MAX=60`), `:35` (`excerptAt`). Prijem na posluzitelju
  `supabase/functions/generate-report/index.ts:68` (koristi cijeli `body.analysisResult`).
- Dokaz/reprodukcija: (staticki) `buildReportRequest` vraca `{ parsedStructure, analysisResult:
  result, workType }` bez ciscenja; `result.details.typoLint.findings` nose polje `excerpt` s
  doslovnim tekstom. Kad se `reportEndpoint` ozici, taj payload ide na posluzitelj.
- Posljedica: doslovni fragmenti teksta rada i ime autora napustaju uredaj protivno izricitoj
  tvrdnji da tekst ostaje u pregledniku; GDPR transparentnost i moguca osjetljivost sadrzaja.
  Trenutno dormant (`reportEndpoint` prazan, `src/ui/app.ts:71`), ali kod je ozicen i aktivira se
  cim se endpoint postavi, pa je latentno P1 (postaje P0 na dan ozicenja bez ispravka).
- Preporuka: prije slanja sanitiziraj `analysisResult`: ukloni `details.typoLint.findings[].excerpt`
  (posalji samo `summary`/`byKind`/indeks odlomka), skrati `incompleteReferences[].text`, izbaci
  doslovne isjecke iz `legalCitationEngine.problems`. Alternativno uskladi pravni tekst da izricito
  navede da se salju kratki isjecci okolnog teksta radi objasnjenja nalaza (manje pozeljno).
- Acceptance: payload prema `generate-report` ne sadrzi doslovne isjecke teksta dokumenta (unit test
  koji tvrdi da serijalizirani zahtjev ne sadrzi `excerpt`/sirovi tekst); obavijest o privatnosti i
  ponasanje su uskladeni.
- Rizik regresije: srednji (mijenja se oblik payloada; `buildFullReport` na posluzitelju mora raditi
  bez uklonjenih polja; pokriti golden/report testovima).

### data-flow-04 (P2): Nema automatske retencije za document_slots i faculty_requests

- Problem: obavijest o privatnosti navodi rokove cuvanja i brisanje po isteku (`src/legal/
  legal-content.ts:82` odjeljak 6, `:106` odjeljak 3). U shemi postoji purge samo za
  `report_generations` (90 dana, `0009_log_retention.sql:12`) i nuliranje `ip_hash` u
  `faculty_requests` (30 dana, `0011_faculty_requests.sql:142`). Ne postoji purge job za
  `document_slots` (koji u `fingerprint` drzi `authorNorm`, tj. ime autora, i `label` = fragment
  naslova) ni za same redove `faculty_requests` (e-mail ostaje neograniceno). Brisanje je samo
  na zahtjev (privacy odjeljak 8).
- Lokacija: `supabase/migrations/0001_monetization.sql:28-29` (`fingerprint`, `label`);
  `supabase/migrations/0011_faculty_requests.sql:14` (`email`), `:132-144` (purge nulira samo
  `ip_hash`); potvrda sadrzaja otiska `src/fingerprint/fingerprint.ts:54,62` (`authorNorm`).
- Dokaz/reprodukcija: grep migracija ne nalazi `delete from document_slots` niti brisanje reda
  `faculty_requests`; jedini `delete` je u `0009` nad `report_generations`.
- Posljedica: ime autora (osobni podatak) i e-mail iz waitlista mogu se cuvati neograniceno,
  protivno nacelu ogranicenja pohrane (GDPR cl. 5(1)(e)) i deklariranim rokovima.
- Preporuka: dodaj purge/anonimizaciju: brisi ili anonimiziraj `document_slots` po isteku prozora
  slota + garancijskog roka; postavi rok cuvanja i za redove `faculty_requests` (npr. brisi e-mail
  nakon obavijesti o pokrivenosti ili nakon N dana). Uskladi rokove s pravnim tekstom.
- Acceptance: postoji zakazan job (pg_cron) koji brise/anonimizira istekle `document_slots` i
  stare `faculty_requests` (barem e-mail); dokumentirani rok odgovara privacy tekstu.
- Rizik regresije: nizak do srednji (novi SQL job; paziti da ne brise aktivne slotove unutar
  garancijskog prozora vezanog na `guarantee_claims`).

### data-flow-05 (P2): Resend nije naveden kao izvrsitelj; podsjetnik nosi fragment naslova rada

- Problem: obavijest o privatnosti nabraja izvrsitelje obrade: Supabase, Netlify i payment provider
  (`src/legal/legal-content.ts:82` odjeljak 5) i tvrdi da se posluziteljski podaci drze u EU
  (`:106` odjeljak 4). `send-reminders` salje e-mailove preko Resend API-ja
  (`api.resend.com`), koji nije naveden kao izvrsitelj, a tijelo e-maila ukljucuje `slot.label`
  (fragment naslova rada), `work_type` i `faculty_id`. Resend je izvan popisa i moguc je prijenos
  izvan EU.
- Lokacija: `supabase/functions/send-reminders/index.ts:34` (`fetch('https://api.resend.com/emails'
  ...)`), sadrzaj e-maila `:74` i `:160` (`sub.work_type`, `sub.faculty_id`, `slot.label`).
- Dokaz/reprodukcija: citaj `send-reminders/index.ts`; adresa primatelja (`auth.users.email`) i
  fragment naslova rada salju se Resendu. Feature je INERT dok vlasnik ne postavi `RESEND_API_KEY`,
  ali kod i pg_cron su deployani.
- Posljedica: nepotpun popis izvrsitelja obrade i moguc nedeklariran transfer u trecu zemlju (GDPR
  cl. 13(1)(e), pogl. V), plus izlaganje fragmenta naslova rada u e-mailu.
- Preporuka: dodaj Resend (ili odabrani mailer) u popis izvrsitelja s regijom obrade i osnovom
  transfera; iz e-maila ukloni fragment naslova (`label`) ili ga svedi na neutralnu oznaku vrste
  rada; potvrdi EU region/DPA prije aktivacije.
- Acceptance: privacy odjeljak 5 navodi mailer i regiju; podsjetnik ne otkriva naslov rada; provjera
  prije ukljucenja `RESEND_API_KEY`.
- Rizik regresije: nizak (tekst + manja izmjena tijela e-maila).

### data-flow-06 (P2): Live Supabase i waitlist su zivi za sve posjetitelje po defaultu

- Problem: `DEFAULT_PRODUCTION_CONFIG` hardkodira produkcijski `supabaseUrl`, `supabaseAnonKey` i
  `waitlistEndpoint`, a `loadProductionConfig` ih samo nadmece spremljenim overrideom. Zato su
  prijava e-mailom i waitlist ZIVI za svakog posjetitelja, sto odstupa od dokumentirane soft-launch
  pozicije ("supabaseUrl/anon prazni, auth OFF"). Time e-mail adrese i demand-signali ulaze u live
  bazu bez posebne najave da je backend aktivan.
- Lokacija: `src/ui/app.ts:71` (popunjeni `supabaseUrl`/`supabaseAnonKey`/`waitlistEndpoint`),
  `:221` (`loadProductionConfig` merge), potrosaci `authConfigured` `:596`, `waitlistConfig` `:556`.
- Dokaz/reprodukcija: bez ikakvog localStorage overridea, `authConfigured()` vraca true (vidljiv
  "Prijava" ulaz, `renderAuthEntry` `:621`) i `waitlistConfig().endpoint` je live URL.
- Posljedica: stvarni backend prima osobne podatke (e-mail) i pseudonimne signale, dok
  komunikacija/ocekivanje ("sve lokalno, bez registracije", `index.html:266`) sugerira suprotno.
- Preporuka: donesi svjesnu odluku: ili ostavi backend ziv i uskladi svu komunikaciju (registracija/
  prijava postoji, backend aktivan), ili isprazni default endpointe i drzi ih iskljucivo iza
  konfiguracije, kako memorija projekta tvrdi da je namjera. Ne mijesati dvije poruke.
- Acceptance: stanje endpointa u kodu odgovara javnoj komunikaciji; ako je prijava/waitlist ziva,
  "Bez registracije" i "nista se ne salje" tvrdnje su uklonjene ili preformulirane.
- Rizik regresije: nizak (konfiguracijska/tekstualna odluka), ali dodiruje dijeljenu datoteku
  `app.ts` (paziti na git-race iz memorije projekta).

### data-flow-07 (P3): faculty-request otvoreni CORS i anoniman upis

- Problem: `faculty-request` deploya se s `--no-verify-jwt` i CORS `Access-Control-Allow-Origin: *`,
  te dopusta anoniman upis (bez JWT). Bilo koje web porijeklo moze slati demand-signale i time
  okidati serversko racunanje/logiranje `ip_hash`. Zastita je samo rate-limit po `ip_hash`
  (`0011`).
- Lokacija: `supabase/functions/faculty-request/index.ts:19-23` (CORS `*`), `:66-73` (opcionalan
  auth, `user_id` null za anon), `:97` (`ip_hash` iz `x-forwarded-for`).
- Dokaz/reprodukcija: POST s proizvoljne domene na endpoint prolazi CORS i upisuje red (do rate
  limita). Nema Origin allowlist.
- Posljedica: abuse vektor (spam demand-signala) i pseudonimno logiranje IP-a iniciranih s tudih
  stranica; nije curenje osobnih podataka, ali sirsi napadni prostor od potrebnog.
- Preporuka: ogranici CORS na vlastito porijeklo (`https://lektahr.netlify.app`), zadrzi rate limit,
  razmotri lagani proof-of-work ili captcha na "nema mog fakulteta" formi.
- Acceptance: endpoint odbija ne-allowlistana porijekla; rate limit ostaje; funkcionalnost s
  vlastitog sitea nepromijenjena.
- Rizik regresije: nizak (CORS konfiguracija), ali provjeriti da preflight s produkcijske domene i
  dalje prolazi.

### data-flow-08 (P3): Error-kolektor salje UA i putanju bez privole

- Problem: `installErrorTracking` (kad je `errorEndpoint` konfiguriran) salje `sendBeacon`/`fetch`
  payload s porukom, skracenim stackom, verzijom, `path` i `navigator.userAgent`. Analitika je
  striktno PII-gejtana (`sanitizeEventData` whitelist + privola, `src/ui/app.ts:234-235`), ali
  error-kanal nema privolu ni whitelist i salje User-Agent (moguc dio otiska preglednika).
- Lokacija: `src/ui/app.ts:77` (`installErrorTracking`, `ua:(navigator.userAgent||'').slice(0,200)`);
  poziva se u `init` (`:122`). Endpoint je prazan po defaultu (`:71`), pa je kanal OFF dok se ne
  ozici.
- Dokaz/reprodukcija: postavi `errorEndpoint` i izazovi gresku; beacon nosi UA i putanju. Bez teksta
  dokumenta (dobro), ali bez privole.
- Posljedica: kad se ozici, salje pseudonimni tehnicki kontekst (UA) bez privole; blaga transparentnost
  praznina spram odjeljka o analitici.
- Preporuka: dokumentiraj error-telemetriju u obavijesti o privatnosti (osnova: legitimni interes,
  sigurnost) ili izostavi `navigator.userAgent`; zadrzi izostavljanje teksta dokumenta.
- Acceptance: error payload je opisan u pravnom tekstu ili ne sadrzi UA; potvrdeno da nikad ne nosi
  sadrzaj dokumenta.
- Rizik regresije: nizak (kanal OFF po defaultu; mala izmjena payloada/teksta).

---

## Zakljucak o tvrdnji "sve je lokalno"

Jezgra tvrdnje je TOCNA za ono sto najvise znaci: parsiranje, analiza i repair rade u pregledniku,
a sam `.docx`/`.pdf` i puni tekst rada ne napustaju uredaj osim uz izricitu narudzbu (data-flow-06
tok 6). Neuskladenosti su na rubovima: (1) apsolutna marketinska tvrdnja "nista se ne salje"
(data-flow-01), (2) automatski waitlist signal tijekom "lokalne" faze (data-flow-02) i (3) doslovni
isjecci teksta u payloadu punog izvjestaja kad se ozici (data-flow-03). Ta tri nalaza su oznacena
P1 jer su izravne nesuklade privatnost-tekst vs stvarno ponasanje; ostalo su retencijske i
disclosure praznine (P2) te manji abuse/telemetrijski rubovi (P3).
