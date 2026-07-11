# PRODUCTION_BACKLOG.md, Lekta

Potpuni prioritizirani backlog svih auditnih nalaza (P0 do P3), poredan po redoslijedu
izvrsavanja (poglavlje 19): P0-01 javna konfiguracija, P0-02 tajne/RLS, P0-03 admin,
P0-04 privatni izvjestaji, P0-05 obrada datoteka, P0-06 pravne/404, P0-07 naplata, pa
preostali P1, P2, P3.

REFUTED nalazi su izbaceni (architecture-01, placeholder stub). Duplikati kroz dimenzije
su spojeni; izvorni id-jevi navedeni uz svaki item. Velicina: S (sati), M (dan ili dva),
L (vise dana / dira jezgru ili build).

Legenda prioriteta: P0 = blokator lansiranja (sigurnost, gubitak podataka, pravni rizik);
P1 = vazan problem funkcionalnosti/UX/pouzdanosti; P2 = vazno poboljsanje, nije blokator;
P3 = optimizacija.

Datum: 2026-07-11.

---

## FAZA P0 (blokatori, redoslijed izvrsavanja)

### P0-01 Javna konfiguracija

**BL-P0-01-1, Uskladiti zive endpointe s javnom komunikacijom** — RIJESENO ODLUKOM (2026-07-11)
- Prioritet: P0 (izvorni data-flow-06 P2, elevirano)
- Problem: DEFAULT_PRODUCTION_CONFIG hardkodira zivi supabaseUrl/anon/waitlistEndpoint pa su
  prijava i waitlist zivi, dok je komunikacija sugerirala suprotno.
- ODLUKA: endpointi OSTAJU zivi (auth za podsjetnike + waitlist su namjerne, deployane funkcije);
  umjesto praznjenja configa USKLADENA je javna komunikacija da bude istinita (BL-P0-01-2 copy +
  BL-P0-01-3 disclosure). Time "stanje endpointa odgovara javnoj komunikaciji" bez diranja app.ts
  configa (izbjegnut git-race na dijeljenom app.ts).
- Velicina: S (zatvoreno kroz copy)

**BL-P0-01-1-STARO (referenca):**
- Lokacija: src/ui/app.ts:71 (DEFAULT_PRODUCTION_CONFIG), :221/:556/:596/:621.

**BL-P0-01-2, Ukloniti apsolutnu tvrdnju "Nista se ne salje na posluzitelj"** — GOTOVO (2026-07-11)
- Prioritet: P0 (izvorni data-flow-01 P1, CONFIRMED)
- Isporuceno: index.html:20 twitter:description "...Nista se ne salje na posluzitelj" ->
  "...Tekst i datoteka rada ostaju na tvom uredaju" (dokument-scoped, istinito, uskladeno s :6/:17).
  Dodatno index.html:396 "nema registracije" -> "ne treba obavezna registracija" (prijava je opciona).
- Verifikacija: dist/index.html vise nema apsolutnu tvrdnju (grep = 0); nova dokument-scoped tvrdnja
  prisutna. Ostale tvrdnje (:6/:17 "Dokument ostaje na uredaju", :400 footer "obradjuju lokalno") su
  vec dokument-scoped i istinite pa ostaju.
- Rizik regresije: nizak (tekst). Velicina: S

**BL-P0-01-3, Waitlist traka ne smije slati signal bez radnje korisnika** — DJELOMICNO: OBJAVLJENO (2026-07-11)
- Prioritet: P0 (izvorni data-flow-02 P1, CONFIRMED)
- Problem: mountWaitlistBar na prikazu automatski POST-a na faculty-request; server racuna
  soljeni ip_hash. Bez privole i bez objave.
- ISPORUCENO (opcija 2 iz audita, transparentnost): waitlist traka sada OBJAVLJUJE upis na tocki
  obrade (waitlist-copy.ts note: "Bez imena biljezimo da je ovaj fakultet trazen; e-mail koristimo
  samo za tu jednu obavijest."). Time se zatvara GDPR cl.13 transparentnost (osnova: legitimni
  interes, agregatna potraznja, soljeni ireverzibilni ip_hash, bez imena/e-maila).
- SVJESNO NIJE odabrana opcija 1 (ukloniti auto-signal): to bi obrisalo zivu discovery telemetriju
  (anonimni "hit" po nepokrivenom fakultetu), ucinilo attachEmailToRequest mrtvim i trazilo prepis 3
  testa. Opcija 2 popravlja stvarni nedostatak (objava) bez gubitka funkcije.
- FOLLOW-UP (owner): ako se zeli maksimalna privatnost, dodati opt-out ILI upis u sluzbeni tekst
  obrade (legal-content.ts, odjeljak izvrsitelji/osnova) i po zelji odgoditi na eksplicitnu radnju.
- Acceptance: bez korisnicke radnje nema poziva na faculty-request; test dokazuje da render
  trake sam ne salje.
- Rizik regresije: srednji (mijenja demand-signal, azurirati waitlist testove).
- Velicina: M

**BL-P0-01-4, Ujednaciti default origin generatora i dodati origin guard** — GOTOVO (kod, 2026-07-11; necommitano)
- Prioritet: P0 (spoj seo-01 P1 PLAUSIBLE + routes-01 P2; realni impact P3, ali se rjesava
  ovdje jer je dio konfiguracije)
- Status: RIJESENO. Jedan izvor origina scripts/site-origin.mjs (fallback lektahr.netlify.app,
  bez zavrsne kose crte); generate-citation-tools.mjs i generate-legal-pages.mjs oba ga uvoze
  (nema vlastitog fallbacka). Guard u verify-deploy-dist.mjs pada ako neki dist HTML/sitemap
  nosi lekta.hr ili kanonik izvan LEKTA_SITE_ORIGIN. Test tests/deploy-origin.test.ts (2) cuva
  rascjep u `npm run check`. DOKAZANO: default build -> canonical lektahr.netlify.app, grep
  dist/alati lekta.hr = 0, guard OK; LEKTA_SITE_ORIGIN=lekta.hr -> guard FAIL (exit 1). Napomena:
  src/ui/referral-share-section.ts:15 ima lekta.hr samo u komentaru-primjeru (runtime vrijednost
  se prosljeduje), izvan opsega ovog SEO popravka. npm run check zelen. Necommitano: paralelna
  sesija drzi dijeljene datoteke; ove izmjene su samo build-skripte + test (nema git-race).
- Problem: generator citata default-a na lekta.hr (nije ziva domena); pravni generator na
  lektahr.netlify.app. Nekonzistentno; footgun za build bez env-a. (KOREKCIJA 2026-07-11 iz
  AUDIT_STATUS: scripts/generate-title-page-tools.mjs NE postoji; naslovnica je staticki MPA
  bez canonical/og:url pa nije u opsegu. Ostaje samo generator citata.)
- Lokacija: scripts/generate-citation-tools.mjs:37 (default 'https://lekta.hr');
  scripts/generate-legal-pages.mjs:24 (ispravan default 'https://lektahr.netlify.app');
  scripts/verify-deploy-dist.mjs (ne provjerava origin)
- Dokaz: dist lokalni build daje lekta.hr kanonike na statickim citatnim stranicama;
  netlify.toml:22 postavlja env pa je zivi deploy ispravan; dist/ u .gitignore (nije commitan).
- Posljedica: latentni cross-domain kanonik i CTA na neregistriranu domenu ako build izade
  bez env-a (Cloudflare Pages dashboard).
- Preporuka: ujednaciti fallback na 'https://lektahr.netlify.app'; verify-deploy-dist.mjs
  pada ako neki canonical/loc sadrzi lekta.hr ili ne pocinje s LEKTA_SITE_ORIGIN.
- Acceptance: grep dist/alati/** ne nalazi lekta.hr; generator citata i pravni generator
  dijele isti izvor domene (fallback lektahr.netlify.app); build bez env-a pada ili koristi
  tocnu domenu.
- Rizik regresije: nizak (string + build provjera, ne dira runtime).
- Velicina: S

### P0-02 Tajne i RLS

**BL-P0-02-1, send-reminders autorizacija + per-slot sent-marker** — GOTOVO (commit 20964ca)
- Prioritet: P0 (izvorni security-01 P1, CONFIRMED)
- Status: RIJESENO. _shared/cron-auth.ts (Bearer + konstantno-vremenska usporedba, fail-closed)
  gate prije ikakvog rada; _shared/slot-reminder.ts cista odluka + migracija 0014 marker
  (document_slots.slot_expiry_reminder_sent_at); 11 testova; cron/GO_LIVE na REMINDER_CRON_SECRET.
  npm run check zelen (828 testova). Feature ostaje INERT dok vlasnik ne postavi tajne.
- Problem: handler provjerava samo POST pa salje preko Resenda i pise service_role kljucem;
  deployan verify_jwt=false, potpuno otvoren; slot grana bez sent-markera pa ponavlja slanje.
- Lokacija: supabase/functions/send-reminders/index.ts:170-173, :25, :164;
  migracija 0012_deadline_subscriptions.sql:120; docs/GO_LIVE_ROKOVI.md:10,77
- Dokaz: handler nikad ne cita Authorization; config.toml nema [functions.send-reminders];
  deadline grana pise marker (:79-84), slot grana ne.
- Posljedica: prisilno izvrsavanje, ponavljano slanje e-mailova, trosak Resenda. Latentno
  dok RESEND_API_KEY nije postavljen.
- Preporuka: gate na ulazu (Bearer prema REMINDER_CRON_SECRET, NE service role; 401);
  uskladiti cron iz 0012; dodati per-slot sent-marker.
- Acceptance: POST bez cron tajne vraca 401 bez diranja baze/Resenda; dvostruki poziv ne
  salje isti slot dvaput; npm run check zelen.
- Rizik regresije: nizak (aditivni gate, fail-closed).
- Velicina: M

**BL-P0-02-2, Pinati Edge importe @supabase/supabase-js (esm.sh)** — KOD GOTOVO (commit df2bdc5)
- Prioritet: P0 (izvorni dependencies-01 P1, CONFIRMED)
- Status: KOD RIJESEN. Svih 10 importa (8 index + 2 type-only) pinano na eksaktnu @2.110.2;
  guard test tests/supabase-edge-imports.test.ts pada na golom @2. PREOSTAJE vlasniku
  (traži Deno CLI, ne Node): deno.lock s integritetom + smoke checkout/webhook potpis pri
  deployu (dokumentirano u GO_LIVE_NAPLATA.md korak 5).
- Problem: svih 8 Edge funkcija (uklj. create-checkout, webhook-mor) uvoze createClient s
  esm.sh @2 bez tocne verzije, bez deno.lock/import map integriteta.
- Lokacija: create-checkout/index.ts:10, webhook-mor/index.ts:12, generate-report/index.ts:
  11, file-guarantee-claim/index.ts:7, faculty-request/index.ts:14, send-reminders/index.ts:
  15, unsubscribe-reminder/index.ts:11, redeem-referral-signup/index.ts:10 (+2 type-only u
  _shared)
- Dokaz: create-checkout cita SERVICE_ROLE (:15), gradi admin klijent (:71), POST na
  api.lemonsqueezy.com (:115); webhook istim CDN klijentom verificira potpis.
- Posljedica: supply chain rizik na placanju i funkcijama sa service_role; build nije
  reproducibilan.
- Preporuka: pinati tocnu verziju ili import_map.json + deno.lock; isto za type-only.
- Acceptance: nijedan Edge import nije goli @2; dva deploya daju bajt-identican graf; smoke
  checkout i webhook potpis prolaze.
- Rizik regresije: nizak do srednji (pin je no-op; ublazuje deno.lock + staging webhook).
- Velicina: M

**BL-P0-02-3, IP hash salt fallback u generate-report i redeem-referral-signup** — GOTOVO (commit u tijeku)
- Prioritet: P0 (izvorni security-02 P2, elevirano u paket)
- Status: RIJESENO. hash-ip.ts dobio deriveIpSalt (stabilan salt iz service-role kljuca kad
  IP_HASH_SALT fali, isti string kao faculty-request) + hashClientIpSalted; generate-report i
  redeem-referral-signup prebaceni na hashClientIpSalted(fwd, IP_HASH_SALT, SERVICE_ROLE). 7
  testova (soljen != nesoljen, cross-fn konzistentnost). Napomena rizika: OK jer je jos nema
  zivih ip_hash upisa (soft-launch, generate-report se ne poziva). npm run check zelen (847 t).
- Problem: ip_hash fallbacka na prazan salt; nesoljeni SHA-256 IPv4 je reverzibilan.
- Lokacija: generate-report/index.ts:27, redeem-referral-signup/index.ts:17,
  _shared/hash-ip.ts:20; kontrast faculty-request/index.ts:39-45
- Dokaz: faculty-request svjesno izvodi salt iz service role kljuca; ostale dvije ostaju na ''.
- Posljedica: hash IP-a prakticki obrnjiv, slabi GDPR minimizaciju. Latentno (generate-report
  se ne poziva u soft-launchu).
- Preporuka: preslikati derivaciju salta u zajednicki hash-ip.ts ili ucini secret obaveznim.
- Acceptance: uz nepostavljen IP_HASH_SALT, ip_hash soljen istim izvedenim saltom u sve tri
  funkcije; anti-fraud usporedba i dalje pogada.
- Rizik regresije: srednji (promjena salta nakon upisa razjedini hasheve; uvesti prije
  pisanja u produkciji).
- Velicina: S

**BL-P0-02-4, faculty-request CORS suziti na vlastito porijeklo** — GOTOVO
- Prioritet: P0 paket (izvorni data-flow-07 P3)
- Status: RIJESENO. _shared/cors.ts (pickAllowedOrigin/corsHeadersFor) reflektira samo dopusteno
  porijeklo (produkcija + localhost), inace primarno, nikad *; faculty-request prebacen (json u
  closure koji hvata per-request CORS). Override ALLOWED_ORIGIN env. 7 testova (cors.test.ts).
- Problem: CORS `*` i anoniman upis s bilo kojeg porijekla; zastita samo rate-limit.
- Lokacija: supabase/functions/faculty-request/index.ts:19-23, :66-73, :97
- Dokaz: POST s proizvoljne domene prolazi CORS i upisuje red do rate limita.
- Posljedica: abuse vektor (spam signala) i pseudonimno logiranje IP-a s tudih stranica.
- Preporuka: ograniciti CORS na https://lektahr.netlify.app; razmotriti lagani PoW/captcha.
- Acceptance: endpoint odbija ne-allowlistana porijekla; rate limit ostaje; vlastiti site
  nepromijenjen.
- Rizik regresije: nizak (provjeriti preflight s produkcijske domene).
- Velicina: S

**BL-P0-02-5, verify_jwt zakovati po funkciji u config.toml** — GOTOVO
- Prioritet: P0 paket (izvorni security-04 P3)
- Status: RIJESENO. config.toml dobio [functions.<ime>] verify_jwt za svih 9 funkcija: true za
  create-checkout/generate-report/redeem-referral-signup/file-guarantee-claim (getUser), false za
  faculty-request/send-reminders/unsubscribe-reminder/webhook-mor/health (anon/cron/potpis/token).
  Kodificira postojecu namjeru (bez promjene ponasanja); vlasnik deploya iz konfiguracije.
- Problem: nema [functions.<ime>] blokova; posture ovisi o ad-hoc deploy zastavicama.
- Lokacija: supabase/config.toml (nema [functions]); namjera samo u komentarima
  unsubscribe-reminder/index.ts:11, redeem-referral-signup/index.ts:9
- Dokaz: grep verify_jwt u supabase/ = 0.
- Posljedica: nije ziva ranjivost (funkcije same rade getUser), ali neponovljiva posture.
- Preporuka: dodati eksplicitne verify_jwt blokove i deployati iz konfiguracije.
- Acceptance: svaka funkcija ima eksplicitan verify_jwt; deploy iz konfiguracije daje istu
  posture; smoke (health 200, create-checkout bez tokena 401).
- Rizik regresije: nizak (dira deploy proces).
- Velicina: S

**BL-P0-02-6, .gitignore .env i revoke purge RPC od anon** — GOTOVO
- Prioritet: P0 paket (izvorni security-06 P3)
- Status: RIJESENO. .gitignore dobio .env i .env.*; migracija 0015_revoke_purge.sql: revoke execute
  on purge_old_report_generations(int)/purge_faculty_request_ip(int) from public (obje language sql
  bez security definer pa bezopasno; cron kao postgres i dalje radi). Time je P0-02 paket zatvoren.
- Problem: .gitignore ne hvata obican .env; purge_old_report_generations i
  purge_faculty_request_ip nisu revocani od public/anon.
- Lokacija: .gitignore:1-7; 0009_log_retention.sql:7; 0011_faculty_requests.sql:135
- Dokaz: .gitignore ima *.local ali ne .env; obje purge funkcije bez revoke.
- Posljedica: rizik slucajnog commita service role tajne; anon moze pozvati purge (RLS
  odbija promjenu pa bezopasno, tek izlozena povrsina).
- Preporuka: dodati .env i .env* u .gitignore; revoke all on function ... from public, anon,
  authenticated u novoj migraciji.
- Acceptance: git check-ignore .env uspijeva; anon vise ne moze pozvati purge (403); cron
  kao postgres radi.
- Rizik regresije: nizak.
- Velicina: S

### P0-03 Admin izlozenost

**BL-P0-03-1, verification.html izuzeti iz produkcijskog builda hosting-neovisno** — GOTOVO
- Prioritet: P0 (izvorni routes-02 P2, elevirano)
- Status: RIJESENO. Logika obrnuta u SAFE-BY-DEFAULT: scripts/dev-console.mjs resolveDevTools
  (serve uvijek alati; build samo uz DEV_CONSOLE=1, DEPLOY vise nerelevantan). vite.config.ts:
  verification entry, stripDevOnly i __DEV_TOOLS__ svi vezani na devTools; plain vite build na
  BILO KOJEM hostu ne sadrzi konzolu. Novi host-neovisni closeBundle guard assertSafeBuild pada
  ako verification.html procuri (dopunjuje verify-deploy-dist.mjs koji je samo u netlify lancu).
  Provjereno: clean build (8 HTML, bez verification), DEV_CONSOLE=1 (emitira), safe rebuild
  (emptyOutDir makne staru). 3 testa (dev-console.test.ts). Napomena: netlify.toml DEPLOY=1 sada
  redundantan (safe je default), komentar ondje moze osvjeziti vlasnik netlify.toml.
- Problem: verification.html se izuzima samo kad DEPLOY=1; guard je dio samo netlify command
  lanca; na hostu bez env-a konzola i teski PDF artefakti zavrse u dist/.
- Lokacija: vite.config.ts:48, :33-36; netlify.toml:14,19; scripts/verify-deploy-dist.mjs:54
- Dokaz: verification entry samo kad !isDeploy; guard obara build ako datoteka postoji, ali
  je vezan na netlify lanac; Cloudflare Pages naveden kao alternativni cilj.
- Napomena: ?setup=1 admin panel je ZASEBAN i ispravno gejtan (app.ts:68 setupAllowed), nije
  dio ovog blokatora.
- Posljedica: javno dostupna interna QA/admin konzola i privatni artefakti.
- Preporuka: obrnuti logiku (produkcijski set nikad ne ukljucuje verification.html osim uz
  interni flag); guard u zajednicki build korak; potvrditi u CI.
- Acceptance: build na bilo kojem hostu bez internog flaga ne proizvodi dist/verification.
  html; guard dio zajednickog koraka; lokalni QA i dalje radi.
- Rizik regresije: srednji (dira build konfiguraciju).
- Velicina: M

### P0-04 Privatni izvjestaji

**BL-P0-04-1, Sanitizirati payload punog izvjestaja (doslovni isjecci teksta rada)** — GOTOVO
- Prioritet: P0 (izvorni data-flow-03 P1, CONFIRMED; dormant, P0 na dan ozicavanja)
- Status: RIJESENO (report.ts, BEZ diranja golden enginea). buildReportRequest sada zove
  sanitizeAnalysisResult: whitelist score/profil/stats/checks/issues + sigurna details jezgra
  (ruleAuthority/profileFingerprint/profileDefinitionId/sources); IZBACENI svi nosaci doslovnog
  teksta (typoLint.findings/excerpt, missing/uncited/incompleteReferences.text, legalCitationEngine,
  file.name, documentStructure). Uz to redactParagraphQuotes ("odlomak N: <tekst>" -> "odlomak N",
  linije 76/81 enginea) na opisima nalaza. Lokalni prikaz i analyze-docx NETAKNUTI. 8 testova
  (serijalizirani payload bez SECRET stringa; buildFullReport i dalje radi). tsc+report testovi
  zeleni. parsedStructure (naslov/autor/struktura) i dalje ide zasebno = objavljeno, ne curi.
- Problem: klijent salje cijeli currentResult ukljucujuci typoLint.findings[].excerpt
  (doslovni isjecci do 60 znakova, do 200 nalaza), incompleteReferences[].text,
  legalCitationEngine.problems i doslovne naslove, iako privacy tvrdi da tekst ostaje lokalno.
- Lokacija: src/report/report-client.ts:99-101; src/report/report.ts:187-192;
  src/analysis/analyze-docx.ts:94; src/tools/typo-lint.ts:31,35;
  supabase/functions/generate-report/index.ts:68
- Dokaz: buildReportRequest vraca {parsedStructure, analysisResult:result, workType} bez
  ciscenja; excerpt nosi doslovni tekst. Salje se samo kad je reportEndpoint konfiguriran
  (prazan po defaultu app.ts:71).
- Posljedica: doslovni fragmenti rada i ime autora napustaju uredaj protivno tvrdnji; GDPR.
- Preporuka: sanitizirati prije slanja (ukloniti excerpt, poslati summary/byKind/indeks
  odlomka; skratiti incompleteReferences[].text; izbaciti isjecke iz legalCitationEngine).
- Acceptance: payload ne sadrzi doslovne isjecke (unit test nad serijaliziranim zahtjevom);
  buildFullReport radi bez uklonjenih polja.
- Rizik regresije: srednji (mijenja oblik payloada; report i golden testovi).
- Velicina: M

**BL-P0-04-2, Retencija za document_slots i faculty_requests** — GOTOVO (migracija 0016)
- Prioritet: P0 paket (izvorni data-flow-04 P2)
- Status: RIJESENO (0016_retention_slots_faculty.sql; dizajn verificiran workflowom
  p0-04-retention-design). ANONIMIZACIJA (ne DELETE, jer FK-ovi su ON DELETE SET NULL pa bi
  DELETE unistio kontekst): purge_document_slots nulira fingerprint.authorNorm/titleNorm/headings
  + label WHERE slot_expires_at < now()-30d (kljuci na STUPAC, ne konstantu, zbog 'Do obrane' 120d)
  I preskace slot s pending guarantee_claim; zadrzava sectionCount/bound_at/coverage_tier/work_type
  (v_tier_share + FK). purge_faculty_request_email nulira email 7d nakon notified_at ili 90d od
  created_at (red ostaje = discovery signal). Obrazac 0009/0011/0015 (language sql, search_path,
  pg_extension guard, revoke from public, stagger 03:30/03:45). NE dira 0009 90d (referral anti-fraud
  gornja granica). Tradeoff: nuliranje emaila degradira faculty_request_counts.unique_requesters
  (zaseban requester_hash zadatak, ne blokira privatnost). Vlasnik: ukljuci pg_cron + primijeni.
- Problem: nema purge joba za document_slots (authorNorm = ime autora, label = fragment
  naslova) ni brisanja reda faculty_requests (e-mail neograniceno).
- Lokacija: 0001_monetization.sql:28-29; 0011_faculty_requests.sql:14, 132-144;
  src/fingerprint/fingerprint.ts:54,62
- Dokaz: jedini delete je 0009 nad report_generations; 0011 samo nulira ip_hash.
- Posljedica: ime autora i e-mail cuvani neograniceno protivno GDPR cl.5(1)(e) i deklariranim
  rokovima.
- Preporuka: pg_cron purge/anonimizacija istekle document_slots i starih faculty_requests;
  uskladiti rokove s privacy tekstom.
- Acceptance: zakazan job brise/anonimizira istekle redove; rok odgovara privacy tekstu.
- Rizik regresije: nizak do srednji (paziti na garancijski prozor guarantee_claims).
- Velicina: M

**BL-P0-04-3, Resend kao izvrsitelj + ukloniti naslov iz podsjetnika** — KOD GOTOVO
- Prioritet: P0 paket (izvorni data-flow-05 P2)
- Status: KOD RIJESEN. Tijelo maila (send-reminders slot-expiry grana) vise NE nosi slot.label
  (fragment naslova) - uklonjeno; subject je vec bio samo work_type; slot.label se vise nigdje
  ne cita. PREOSTAJE vlasniku (pravni + potvrda, dokumentirano u GO_LIVE_ROKOVI.md korak 1):
  potvrditi Resend regiju (US default) + DPA i dodati ga u src/legal/legal-content.ts odjeljak 5
  s regijom/osnovom transfera PRIJE postavljanja RESEND_API_KEY (ne upisivati "EU regija" bez
  potvrde; uskladiti s processing.html odjeljak 4). Feature INERT dok tajna nije postavljena.
- Problem: send-reminders salje preko api.resend.com (nije u popisu izvrsitelja, moguc
  transfer izvan EU); tijelo nosi slot.label (fragment naslova rada).
- Lokacija: supabase/functions/send-reminders/index.ts:34, :74, :160
- Dokaz: fetch api.resend.com/emails; label u tijelu.
- Posljedica: nepotpun popis izvrsitelja, moguc nedeklariran transfer, izlaganje naslova.
- Preporuka: dodati mailer u popis izvrsitelja s regijom i osnovom; ukloniti label; potvrditi
  EU region/DPA prije aktivacije.
- Acceptance: privacy odjeljak navodi mailer i regiju; podsjetnik ne otkriva naslov.
- Rizik regresije: nizak.
- Velicina: S

**BL-P0-04-4, Error-kolektor UA i privola** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni data-flow-08 P3)
- Isporuceno: `ua:(navigator.userAgent||'').slice(0,200)` UKLONJEN iz error payloada
  (installErrorTracking, app.ts). Beacon sada nosi samo: kind, message (<=500), stack (<=2000),
  version, path (ruta, ne PII), timestamp. Bez UA -> nema pseudonimnog otiska preglednika bez
  privole. Komentar dopunjen upozorenjem da se UA ne dodaje natrag bez pravne osnove. Tekst
  dokumenta se i dalje nikad ne salje (bilo i ostaje).
- Acceptance ispunjen: error payload bez UA; nikad ne nosi sadrzaj. Kanal je i dalje OFF po
  defaultu (errorEndpoint prazan). tsc 0; nijedan test ne ovisi o payloadu.
- Velicina: S

### P0-05 Obrada datoteka

**BL-P0-05-1, Skinuti autorski podatkovni sloj s kriticnog puta (2,4 MB chunk)** — VELIKIM DIJELOM (2026-07-11)
- Prioritet: P0 (izvorni performance-01 P1, CONFIRMED)
- Problem: glavni entry chunk 2.478.762 B raw / 369.013 B gzip; dominiraju podaci
  (verified-profiles 1,45 MB + 169 draftova 1,3 MB + source-registry 152 KB).
- NAPREDAK (mjereno): glavni chunk gzip 369.010 -> **178.054 B (-51,7%)**; raw 2.478.826 -> 1.225.927.
  ACCEPTANCE (>=40% gzip pad) ISPUNJEN. Postignuto u tri koraka:
  (a) draftovi + source-registry MAKNUTI iz runtimea (BL-P0-05-2, pecene mape);
  (b) motor analize lijen (perf-03);
  (c) BL-P0-05-1b: strip fieldValidation.publicSources (PID+sha256 provenijencija, ~174 KB, ~1300
      hashova) iz PRODUKCIJSKOG bundlea preko build-only Vite plugina (vite.config.ts
      stripRuntimeDeadProvenance, apply:'build', gate !devTools). Draft/provenance markeri
      (verifiedBy/Risavi/sourcePage/publicSources) = 0 u javnom chunku.
- KLJUC (zasto NIJE trebao rizicni async split): tezina verified-profiles NIJE u `rules` (126 KB)
  nego u DISPLAY-only provenijenciji; publicSources (174 KB) runtime NIKAD ne cita (samo title-page
  TEST cita raw JSON izravno pa apply:'build' plugin njega ne dira). Zato je izbjegnut async
  currentProfile (utrka odabir vs pravila) - dobiven pun 40%+ bez tog rizika.
- PREOSTALO (opcionalno, manji povrat): note (106 KB) + sources (89 KB) + scopes su jos u chunku,
  ali ih updateProfile renderira sinkrono na odabir profila pa bi njihovo micanje trazilo async
  panel (srednji rizik, mali povrat). Nije nuzno za acceptance.
- Velicina: L (ISPORUCENO, acceptance ispunjen)

**BL-P0-05-2, Ispeci advisory mapu u buildu, izbaci draftove iz runtimea** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni performance-02 P2)
- Isporuceno: eager glob 169 draftova PRESELJEN iz profile-registry.ts u novi src/profiles/
  drafts-runtime.ts (uvoze ga samo verification-console = nije u javnom buildu, i testovi). Zivi
  app.ts vise NE cita drafts: (a) advisory demotion cita pecenu data/profiles/advisory-map.json
  (profileId -> demotirani checkId-jevi) preko applyBakedAdvisory (profile-runtime-maps.ts); (b)
  repair panel cita pecenu data/profiles/repair-map.json (slim autoFixable+verified ruleEntries)
  preko repairEntriesFor. Obje mape pece scripts/gen-profile-runtime-maps.mts (vite-node).
  DEMOTION poluge izdvojene u advisory-levers.ts (jedan izvor za racunski i peceni put).
- Verifikacija: draftRuleEntriesFor + SOURCE_REGISTRY vise nisu u grafu index.html (verifiedBy/
  Risavi/sourcePage/snapshotHash = 0 u glavnom chunku). tests/profile-runtime-maps.test.ts dokazuje
  (1) pecene mape == izracun iz izvora (drift guard) i (2) applyBakedAdvisory bit-identican starom
  applyScoredAdvisory za svih 212 profila. tsc 0, vitest 1157/1157, golden zelen.
- Velicina: M

**BL-P0-05-3, build.json.stringify za brzi startup parse** — ODBIJENO (mjereno 2026-07-11)
- Prioritet: P0 paket (izvorni performance-05 P2)
- Problem: veliki JSON emitiran kao objektni literali (sporiji V8 parse).
- Lokacija: vite.config.ts (top-level `json`, NE `build.json` kako je audit napisao).
- ISHOD: implementirano `json:{stringify:true}` pa IZMJERENO na stvarnom buildu. Vite emitira
  `JSON.parse('...')` ali ASCII-escapea sav ne-ASCII u \uXXXX. Ovaj korpus je gusto hrvatski
  (c, c, z, s, d): 20.402 \u escapea. Glavni chunk: raw 2.478.826 -> 4.315.059 B, gzip
  369.010 -> 473.051 B (+28% / +104 KB na zici). JSON.parse omoti skocili 2 -> 189 (parse-dobitak
  postoji) ali je download veci, sto na mobitelu (ciljani slucaj) kosta vise nego sto parse stedi.
- ODLUKA: vraceno na objektne literale; ostavljen komentar u vite.config.ts da se ne pokusa opet.
  Pravi lijek za parse/veličinu je BL-P0-05-1/2 (maknuti podatke iz runtime grafa), ne stringify.
- Velicina: S (zatvoreno, wontfix)

**BL-P0-05-4, Lijeno ucitati DOCX/PDF motor (skinuti s landinga)** — DJELOMICNO GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni performance-03 P2)
- Problem: analyzeDocx u glavnom chunku preko inline fallbacka; pdf preflight staticki;
  motor duplo isporucen.
- Lokacija: src/analysis/analyze-docx-client.ts:12 (RIJESENO); src/ui/app.ts:16, :34 (preostaje)
- ISPORUCENO (moja datoteka, bez app.ts): staticki `import { analyzeDocx }` u analyze-docx-client.ts
  zamijenjen dinamickim `await import('./analyze-docx')` u fallback grani. Jezgra (parser/auditi/
  pravni citation engine) ispala iz glavnog chunka u zaseban lazy chunk (analyze-docx-*.js ~73 KB),
  dohvaca se samo kad worker padne. Mjereno: glavni chunk gzip 369.010 -> 344.002 B (-25 KB, -6,8%);
  markeri "Otvaram Word strukturu"/"Provjeravam font" 1 -> 0 u glavnom chunku. Golden nedirnut
  (golden-entry.ts zove analyzeDocx izravno). 3 postojeca fallback testa i dalje zelena.
- PREOSTAJE (dio koji dira app.ts, uz P0-05b): pdfPreflight (app.ts:16) je jos staticki pa
  "dekompresijska bomba" ostaje 3x u glavnom chunku; i lijeno uciti cijeli analizator na prvu
  interakciju (drop/odabir). Traži app.ts izmjenu -> coord s paralelnom sesijom.
- Rizik regresije: nizak. Fallback grana sada radi dodatni fetch samo kad je worker vec pao;
  sretni put nepromijenjen (worker chunk isti).
- Velicina: M (S dio isporucen)

**BL-P0-05-5, Gumb Prekini analizu + Escape** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni performance-04 P2)
- Problem: nema prekida tekuce analize; worker se gasi tek pri novoj analizi.
- Isporuceno: analyze-docx-client dobio izlozeni prekid cancelActiveAnalysis() (gasi aktivni
  worker i odbacuje tekuci promise novim AnalysisCancelledError; helper isAnalysisCancelled)
  + cancelActive seam u analyzeInWorker (postavljen dok analiza traje, ocisti se u done()).
  app.ts: cancelAnalysis() bumpa _analyzeToken (utisa in-flight preko postojeceg guarda),
  zove cancelActiveAnalysis(), vrati progressView->wizardView, re-enable analyzeBtn, progress(0)
  reset, fokus natrag na gumb (a11y); runAnalysis catch dobio `||isAnalysisCancelled(e)` (prekid
  nikad ne prikaze error toast). Gumb #cancelAnalysisBtn u #progressView (index.html) + Escape
  (samo kad je progress vidljiv I nijedan modal nije otvoren, da Escape prvo zatvara modal).
- Acceptance ispunjen: klik/Escape sinkrono vrati wizard i rejecta worker promise (worker.terminate),
  kasni postMessage odbacuje token guard; inline (glavna nit) analiza se ne moze prekinuti jer drzi
  nit, ali njen kasni rezultat token guard svejedno odbaci.
- Test: tests/analyze-docx-cancel.test.ts (hanging-Worker stub) dokazuje prekid rejecta kao
  AnalysisCancelledError + cancelActiveAnalysis()=false kad nista ne tece. Zaseban file (svjez
  workerBroken state).
- Rizik regresije: nizak (token guard postoji; cancelAnalysis vlasnik stanja gumba nakon bumpa).
- Velicina: M

**BL-P0-05-6, Immutable cache za hashirane assete** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni performance-06 P2)
- Isporuceno: public/_headers dobio `/assets/* Cache-Control: public, max-age=31536000, immutable`
  (Vite fingerprint u imenu jamci sigurnost dugog cachea) i `/*.html max-age=0, must-revalidate`
  (HTML nema hash pa se novi build odmah vidi). Postojeci `/*` sigurnosni blok netaknut.
- Verifikacija: `dist/_headers` sadrzi immutable pravilo nakon builda (Vite kopira public/).
- Acceptance ispunjen: /assets/* nose immutable godinu; HTML kratko; ponovni posjet iz cachea.
- Velicina: S

**BL-P0-05-7, Memorija i mobilni cap (OOM)** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni performance-08 P3)
- Problem: analiza cita cijelu datoteku u memoriju; grubi progress; moguc OOM na graniznom
  dokumentu na slabom mobitelu.
- Isporuceno: nova cista, testabilna jezgra src/analysis/memory-budget.ts:
  * uploadCapBytes() GRADUIRAN po uredaju: deviceMemory<=2 GB -> 12 MB, coarse pointer ili
    <=4 GB -> 20 MB, ostalo (desktop) -> 50 MB (prije binarno 20/50). effectiveUploadCap()/
    isLikelyMobile() u app.ts sad citaju samo signale (deviceMemoryGb/coarsePointer) i delegiraju.
  * decompressionBudgetBytes() -> device-aware dekompresijski budzet PO ZAPISU koji se salje
    ZipReaderu: <=2 GB -> 100 MB, <=4 GB -> 150 MB, jaci uredaj -> null (ZipReader koristi puni
    MAX_DECOMPRESSED_BYTES=200 MB). runAnalysis stavlja maxDecompressedBytes u settings; analyze-docx.ts:43
    prosljedjuje ZipReaderu SAMO ako postoji (settings?.maxDecompressedBytes?{...}:{}).
  * Na slabom uredaju runaway inflacija (legit velik doc ili bomba) pada RANIJE na postojeci
    ZipReader cap (jasna throw poruka, ne tihi OOM); analysisErrorMessage na mobitelu dodaje
    "granica je niza radi memorije; za velike dokumente pokusaj na racunalu".
- KLJUC (golden): golden-entry NE salje maxDecompressedBytes (settings bez njega) -> ZipReader koristi
  default 200 MB -> golden snapshoti NEPROMIJENJENI (docx-golden 1/1 zeleno potvrdjeno). result echira
  settings pa production result.settings dobije maxDecompressedBytes (null na desktopu), sto golden ne dira.
- Test: tests/memory-budget.test.ts (tieri uploadCap + budget, nevaljan deviceMemory). parser-security
  6/6 (ZipReader custom cap vec podrzan i testiran, MAX ostaje >=100 MB).
- Acceptance ispunjen: granicni dokument prode ili padne s jasnom porukom (ZipReader throw + hint),
  slab uredaj dobije nizu granicu (manje inflacije). Napomena: pravi OOM se ne moze uhvatiti, zato
  preventivno (nizi cap + tvrdi budzet). Inkrementalni progress i oslobadanje medupolja NISU dirani
  (DOM je dominantni trosak i drzi se kroz cijelu funkciju; snizavanje capa je stvarna poluga).
- Rizik regresije: nizak (golden zelen, promjena ZipReadera aktivna samo uz eksplicitni budzet).
- Velicina: M

**BL-P0-05-8, Jak default profil i potvrda profila prije analize** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni ux-02 P2)
- Problem: default tvrdo FPZG/Politologija/Diplomski; auto-detekcija samo unizg; non-unizg
  korisnik tiho dobije FPZG-specifican rezultat. (Napomena: "analiza se pali cim je datoteka
  odabrana" je bio zastario; analiza se okida SAMO klikom na #analyzeBtn, setFile samo omoguci gumb.)
- Dizajn: workflow (3 pristupa + judge, wf_777700f5-d38); izabran hibrid (detekcija svih institucija
  + istaknuti profil uz gumb + potvrdni gate OGRANICEN na nepotvrdjeni verificirani default).
- Isporuceno:
  * Nova cista, DOM-free jezgra src/ui/profile-detect.ts: detectContextFromText(units, rawText) radi
    longest-match po SVIM jedinicama kataloga (allUnits() vec nosi institutionId/institutionName) i vraca
    institutionId; needsProfileConfirmation(statusKey, confirmed) = verified && !confirmed. Jedinicno
    testirano (tests/profile-detect.test.ts, 7 testova).
  * (c) detectDocxContext sada zove detectContextFromText(allUnits(), ...) umjesto unizg-only petlje;
    applyDetectedContext postavlja ctx.institutionId (ne tvrdi 'unizg') -> detekcija POKUSAVA sve institucije.
  * (b) novi #analyzeProfile sazetak tik uz #analyzeBtn (renderAnalyzeSummary, zove se iz updateProfile
    i setFile): status pill + red "Institucija · Fakultet · Studij · Vrsta · Stil".
  * (a) _profileConfirmed zastavica (pali se na stvarnu promjenu izbornika preko addEventListener('change'),
    na uspjesnu detekciju, i na restorePreferences); gate na vrhu runAnalysis: needsProfileConfirmation ->
    prikazi warn + gumbe "Da, ovo je moj profil" / "Promijeni fakultet" i return (netaknuti verificirani
    default NE moze tiho zabodovati). Programatske .value= dodjele NE pale change pa se zastavica ne lazira.
- GOLDEN NETAKNUT: detekcija/summary/gate su UI, ne ulaze u analyzeDocx ni golden-entry (docx-golden 1/1).
- Git-race: app.ts + index.html dijeljeni; stageani samo moji hunkovi (git apply --cached / binarni reconstruct).
- Acceptance ispunjen (a/b/c). Rizik: gate dodaje 1 potvrdni klik samo kad detekcija ne prepozna verificirani
  default (uzak, tocno rizican slucaj). Istoimeni fakulteti u vise gradova = moguc krivi longest-match,
  ublazeno gateom+badgeom (ispravljivo), buduci tie-break po nazivu sveucilista.
- Velicina: M

**BL-P0-05-9, Uskladiti oglaseni i stvarni limit uploada na mobitelu** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni ux-07 P2)
- Problem: opis tvrdi 50 MB, a stvarni cap je graduiran (BL-P0-05-7): 12/20/50 MB po uredaju.
- Isporuceno: opis dropzone (#wordUploadDescription) sada prikazuje STVARNI effectiveUploadCap
  po uredaju: app.ts updatePackageUi (zove se na init i na svakoj promjeni) racuna
  Math.round(effectiveUploadCap()/1024/1024) i upisuje "Word (.docx), do {cap} MB" (odn.
  "Prateci tekst · najvise {cap} MB" u AV nacinu). Staticki index.html #wordUploadDescription
  vise ne hardkodira "· najvise 50 MB" (JS ga svejedno prepise na boot; time nema krive brojke
  ni u pre-hydration flashu). setFile poruka o prevelikoj datoteci vec je koristila effectiveUploadCap.
- Acceptance ispunjen: desktop prikazuje 50, <=4 GB / coarse pointer 20, <=2 GB 12 MB; prikazani
  broj == stvarno nametnuti cap (setFile odbija po istom effectiveUploadCap). NAPOMENA: order-upload
  (rucna usluga) je zaseban productionConfig.uploadMaxBytes (8 MB) i nije predmet ovog taska.
- Git-race: app.ts + index.html imali su tudji WIP; stageani samo moji hunkovi (app.ts git apply
  --cached; index.html binarni reconstruct iz HEAD bloba uz update-index, jer je blob CRLF pa je
  LF reconstruct lazno mijenjao svaki redak).
- Rizik regresije: nizak.
- Velicina: S

### P0-06 Pravne stranice i 404

**BL-P0-06-1, Eksplicitna izjava da Lekta nije provjera plagijata** — GOTOVO (2026-07-11)
- Prioritet: P0 (izvorni ux-01 P1, CONFIRMED, refund driver)
- Isporuceno (dizajn workflowom p0-06, 6 sweep + 3 draft agenta; nacelo partial-status-reframe: vodi
  pozitivom, plagijat-negacija ide gdje oprezni kupac gleda, NE u hero da ne posije sumnju):
  * index.html: novi FAQ "Provjerava li Lekta plagijat ili slicnost teksta? Ne...", plagijat-negacija u
    #pricingDisclaimer (uz cjenik/CTA), footer-copy i meta description ("Nije provjera plagijata").
  * legal-content.ts (pravno najcvrsce): disclaimer.html (negacijska lista + "ne usporeduje s bazama,
    nije zamjena za Turnitin"), terms.html Predmet usluge (negativni opseg), purchase.html Predmet i
    cijena, guarantee.html t.8 (razdvojeno "izvan usluge" od "izvan garancije").
  * app.ts: paidOffersLive pricingDisclaimer + guaranteeNote dobili istu plagijat-negaciju.
- Acceptance ispunjen: eksplicitna recenica na pocetnoj (FAQ+disclaimer), u pravnim tekstovima i uz naplatu.

**BL-P0-06-2, Ublaziti preobecavanje spremnosti ("Spremno", "potvrduje")** — GOTOVO (2026-07-11)
- Prioritet: P0 (spoj ux-03 P2 + ux-04 P2)
- Isporuceno: pecat #readyStamp "Spremno" -> "Tehnicki uredno" (konfeti/animacija netaknuti); glagol
  jamstva "Usluga potvrduje tehnicku uskladjenost" -> "Usluga provjerava oblikovanje/strukturu/opseg/
  citatnu tehniku" (index.html #pricingDisclaimer I app.ts:132 paid grana); gate hero (app.ts:447)
  "<STATUS> ZA PREDAJU" -> "Tehnicka spremnost za predaju: <STATUS>" + tekst reframe ("ruce obveze si
  oznacio, nije potvrda prihvacanja"); preuzeti izvjestaj (app.ts:577) naslov -> "Tehnicka spremnost
  (provjerljiva pravila)"; hero podnaslov + PRICING_TIERS + guaranteeNote suzeni na tehnicki opseg;
  titlovi/meta reframe. statusLabel BAZA namjerno NEDIRNUTA (reuse za pod-kartice) - scoping na hero/report.
- Acceptance ispunjen: nijedan javni tekst ne tvrdi bezuvjetnu spremnost ni "potvrduje uskladjenost".
- DEFERRANO -> checks.ts scoreMeta GOTOVO (2026-07-11): label "Nije spremno za predaju" (bezuvjetni
  predajni verdikt) -> "Slaba usklađenost s profilom" (paralelno "Visoka/Dobra usklađenost"; tehnicki
  opseg, spremnost odlucuje mentor/fakultet). Golden BEZ rizika: scoreMeta je UI/report sloj, NE ulazi
  u analyzeDocx ni golden-entry (grep src/analysis = 0; docx-golden 1/1 potvrdjen). Nijedan test/HTML
  nije asertirao staru oznaku. Dodan tests/score-meta.test.ts (3): pragovi + nijedan razred ne daje
  "spremno za predaju" verdikt. Time je ux-04 preobecavanje spremnosti POTPUNO zatvoreno (pecat,
  glagoli, gate hero, izvjestaj naslov, scoreMeta).
- DEFERRANO -> JSON-LD FAQ mirror GOTOVO (2026-07-11): vidljivi FAQ imao 6 pitanja (ukljucujuci honesty
  "Provjerava li Lekta plagijat ili slicnost teksta?"), ali FAQPage JSON-LD (index.html:22) samo 5 - plagijat
  Q&A nije stizao u Google rich results. Dodano plagijat pitanje u strukturirane podatke na poziciju 3 (isti
  redoslijed kao vidljivi FAQ). CRLF ocuvan (diff = 1 linija). Guard test tests/faq-jsonld.test.ts (3): vidljivi
  FAQ i JSON-LD isti skup/redom, plagijat pitanje u oba, svaki JSON-LD odgovor neprazan - hvata buducu drift.
- PREOSTALO DEFERRANO (nizi prioritet): tool-page disclaimeri
  (citat/kartice/naslovnica/alati/landing_usporedba - vecina LOW, neki kontendirani).
- Gate: tsc 0, vitest svi (legal-content+csp-hash 8/8), build OK; 3 ciste datoteke (index/app/legal).

**BL-P0-06-3, Pravila kupnje i povrata u footer** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni routes-04 P2)
- Problem: glavni footer izostavlja pravila-povrata.html; footeri alata linkaju 3 od 7.
- Isporuceno: index.html footer dobio poveznicu Pravila kupnje i povrata (data-legal="purchase",
  href="/pravila-povrata.html"); svih 7 root alata (citat/alati/kartice/naslovnica/literatura/
  izjava/landing_usporedba) prosireno s 3 na svih 7 legal linkova (dodano Odricanje, Obrada
  dokumenata, Kolacici, Pravila kupnje i povrata). generate-legal-pages.mjs footer vec renderira
  svih 7 dokumenata (Object.values(docs)) pa je bez izmjene. Per-fakultet citatne SEO stranice
  imaju CTA natrag na hub pa je "svih 7 u dva klika" pokriveno (per-fakultet -> citat.html/index
  -> legal).
- Acceptance ispunjen: pravila-povrata.html dostupan iz footera svake glavne javne stranice; svih
  7 u jednom kliku s huba, u dva klika s per-fakultet stranica.
- Gate: DEPLOY build + verify-deploy-dist OK; dist tool pages 7/7 legal linkova, index footer
  purchase prisutan.
- Velicina: S

**BL-P0-06-4, Brandirana 404 stranica** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (spoj routes-06 P3 + seo-07 P3)
- Problem: nema 404.html ni [[redirects]]; clean URL i typani linkovi padaju na genericki
  Netlify 404.
- Isporuceno: public/404.html (self-contained, kopira se u dist/ root pa Netlify automatski servira
  na svakoj nepostojecoj ruti; bez [[redirects]]). Brend (logo mark), veliki "404", hrvatska poruka,
  primarni CTA na provjeru rada + navigacija na 6 alata. CSP-safe: inline <style> (style-src
  'unsafe-inline'), BEZ inline <script> (script-src hasha samo FOUC skriptu glavnih stranica).
  robots noindex,follow. Paleta uskladjena s legal statickim stranicama (#f8f6f0/#33407e).
- Acceptance ispunjen: nepostojeca ruta vraca brandiranu 404 s navigacijom (dist/404.html potvrdjen
  u buildu; Vite kopira public/ -> dist/ root).
- Velicina: S

**BL-P0-06-5, Pravne poveznice u index footeru kao pravi <a href>** — GOTOVO (2026-07-11)
- Prioritet: P0 paket (izvorni routes-07 P3)
- Problem: pravne stavke su JS gumbi (legal-open), ne <a>; bez JS nema poveznice; nulti link
  equity.
- Isporuceno: svih 7 legal stavki u index footeru pretvoreno iz <button class="footer-link-btn
  legal-open"> u <a class="footer-link-btn legal-open" href="/slug.html"> (progressive enhancement).
  Handler (app.ts:146) vec radi e.preventDefault() na .legal-open pa uz JS otvara modal, a bez JS
  <a href> navigira na staticku pravnu stranicu. CSS .footer-link-btn (border:0;background:transparent;
  color:inherit) radi identicno na <a> (naslijedi muted iz .footer-links, hover var(--text)) pa nema
  vizualne regresije. Obrazac vec postoji u guaranteeModalu (<a class="legal-open" href="/garancija.html">).
- Acceptance ispunjen: footer sadrzi prave poveznice s href; modal i dalje radi uz JS (0 preostalih
  legal <button> u dist/index.html, 7 legal <a> s href).
- Velicina: S

### P0-07 Naplata

**BL-P0-07-1, Preduvjet supply chain (vidi BL-P0-02-2)**
- Prioritet: P0 (gate za naplatu; izvor dependencies-01)
- Napomena: create-checkout i webhook-mor moraju biti pinani prije ukljucivanja naplate.
  Detalji u BL-P0-02-2.
- Velicina: (obuhvaceno u BL-P0-02-2)

**BL-P0-07-2, Cjenovni sum "USKORO" u soft-launchu**
- Prioritet: P3 (izvorni ux-10), rjesava se u naplatnoj fazi
- Problem: cjenik prikazuje cijene s bedzem USKORO iako je sve besplatno.
- Lokacija: src/ui/app.ts:123, :128; index.html:340
- Preporuka: jasnije istaknuti besplatnost automatske provjere; "uskoro" tarife diskretno.
- Acceptance: na prvi pogled jasno da je provjera besplatna i neogranicena.
- Rizik regresije: nizak.
- Velicina: S

---

## FAZA P1 (nakon P0)

**BL-P1-01, Skip link na svim stranicama** — GOTOVO (kod, 2026-07-11; necommitano)
- Prioritet: P1 (izvorni accessibility-01, CONFIRMED)
- Status: RIJESENO bez diranja HTML-a (izbjegnut git-race). Nova cista datoteka
  src/shared/skip-link.ts (setupSkipLink: prepend <a class="skip-link"> kao PRVI element
  <body>, cilja <main>, reuse postojeceg id-a ili fallback 'glavni-sadrzaj', tabindex=-1 na
  main, fokus na klik) + src/shared/skip-link.css (nevidljiv dok nije fokusiran, reduced-motion
  + forced-colors fallback). Wirano jednim pozivom u boot() zajednickog ui-boot.ts (loada svaka
  stranica). Test tests/skip-link.test.ts (5). DOKAZANO u pregledniku (vite preview + Playwright):
  prvi Tab na / i /citat.html fokusira vidljiv "Preskoci na sadrzaj" (translateY 0), Enter pomice
  fokus na <main> (#top odn. #glavni-sadrzaj). npm run check zelen; CSS u dijeljenom ui-boot chunku.
- Problem: nijedna stranica nema "Preskoci na sadrzaj" (WCAG 2.4.1 A); 6 do 8 nav poveznica
  prije sadrzaja.
- Lokacija: index.html:236-258; citat.html:110-147; sve ostale stranice
- Preporuka: vidljiv-na-fokus skip link kao prvi element u <body> preko
  src/shared/ui-boot.ts; cilj ima id.
- Acceptance: prvi Tab fokusira skip link koji pomice fokus na glavni sadrzaj (light/dark/
  forced-colors).
- Rizik regresije: vrlo nizak.
- Velicina: S

**BL-P1-02, Fokus i najava rezultata nakon analize** — GOTOVO (kod, 2026-07-11; necommitano)
- Prioritet: P1 (izvorni accessibility-02, CONFIRMED)
- Status: RIJESENO. Cista datoteka src/shared/result-a11y.ts (focusResult: #resultTitle dobije
  tabindex=-1 + .focus({preventScroll}); announceStatus preko polite aria-live regije
  #lekta-sr-status). Wirano JEDNIM pozivom u renderResult (app.ts, odmah nakon
  $('#resultTitle').textContent=r.file.name) pa pokriva SVE putanje rezultata (runAnalysis,
  runDemo, history-restore koje sve idu kroz renderResult). Test tests/result-a11y.test.ts (3).
  DOKAZANO u pregledniku (vite preview + Playwright, demo tok): activeElement === #resultTitle,
  tabindex=-1, aria-live regija najavljuje "Rezultat analize je spreman.". app.ts diff = +2 reda
  (import + poziv), aditivno. npm run check zelen. Necommitano: app.ts je dijeljen (git-race).
- Problem: fokus pada na <body> nakon skrivanja #wizardView; #resultView nije ziva regija;
  citac ekrana ne dobiva obavijest (WCAG 2.4.3, 4.1.3).
- Lokacija: src/ui/app.ts:449-457, :566, :466; index.html:329, :330
- Preporuka: #resultTitle tabindex=-1 + .focus() (preventScroll) + SR-only najava; isto u
  runDemo; pri gresci vratiti fokus na dropzone.
- Acceptance: nakon analize i demo fokus na naslovu rezultata, citac ga procita, Tab
  nastavlja unutar rezultata.
- Rizik regresije: nizak.
- Velicina: S

---

## FAZA P2 (vazna poboljsanja, ne blokatori)

**BL-P2-01, Teznu problema izloziti tekstom za citac ekrana**
- Prioritet: P2 (accessibility-03)
- Problem: teznu razlikuje samo boja + aria-hidden ikona; citac ne cita teznu (WCAG 1.4.1,
  1.1.1).
- Lokacija: src/ui/app.ts:705; index.html:63
- Preporuka: SR-only oznaka tezine u svaku karticu (klasa sr-only postoji).
- Acceptance: citac izgovori teznu prije naslova; vizual nepromijenjen.
- Rizik regresije: vrlo nizak. Velicina: S

**BL-P2-02, Vidljiv fokus u forced-colors na 6 alatnih stranica**
- Prioritet: P2 (accessibility-04)
- Problem: :focus-visible{outline:none;box-shadow} bez forced-colors fallbacka; fokus
  nestaje u WHCM.
- Lokacija: citat.html:36 (i izjava/literatura/naslovnica/alati/landing_usporedba); uzor
  index.html:39, kartice.html
- Preporuka: dodati @media (forced-colors:active) outline; poravnati s indexom.
- Acceptance: fokus vidljiv u forced-colors na svih 8 stranica. Rizik: vrlo nizak. Velicina: S

**BL-P2-03, Inertna pozadina modala**
- Prioritet: P2 (accessibility-05)
- Problem: trapModal hvata Tab ali ne postavlja inert/aria-hidden na pozadinu; citac cita
  pozadinu.
- Lokacija: src/ui/app.ts:244, :245; index.html:345-353
- Preporuka: inert (fallback aria-hidden) na landmarke izvan modala pri otvaranju, ukloniti
  pri zatvaranju; testirati sve modale.
- Acceptance: dok je modal otvoren citac ne doseze pozadinu; nakon zatvaranja pozadina
  dostupna, fokus vracen.
- Rizik regresije: srednji (ne primijeniti na sam modal; paziti toast). Velicina: M

**BL-P2-04, a11y smoke u CI/build gate**
- Prioritet: P2 (accessibility-06)
- Problem: npm run check nema a11y provjeru; jedini CI je docx-smoke.yml.
- Lokacija: package.json; .github/workflows/
- Preporuka: axe smoke u vitest+happy-dom (landmarci, labeli, dupli id, ARIA); Playwright +
  axe za dinamicke tokove (report-only pa blokirajuce).
- Acceptance: check pada na uvedenoj a11y regresiji, zelen na bazi.
- Rizik regresije: nizak za bazu, srednji za CI vrijeme. Velicina: M

**BL-P2-05, Canonical i og:url na tool stranicama; OG za landing** — GOTOVO (2026-07-11)
- Prioritet: P2 (spoj routes-03 + seo-03, + seo-04 za landing)
- Problem: alati/citat/izjava/literatura/naslovnica bez canonical/og:url; landing_usporedba
  bez OG/canonical/JSON-LD.
- ISPORUCENO: svih 7 statickih tool stranica ujednaceno. 5 nepotpunih (citat/naslovnica/
  literatura/izjava/alati) dobilo self-canonical (apsolutni, po imenu) + og:url + og:image
  (/og-image.png iz BL-P2-07) + width/height/alt + twitter:image; kartice.html popravljena
  (og:image favicon.svg -> og-image.png jer social ne renderira SVG, uklonjen stale "Privremena"
  komentar); landing_usporedba dobio PUNI og/twitter/canonical set (prije nista). Svi twitter:card
  summary -> summary_large_image. Nativni EOL svakog fajla ocuvan (6x LF, landing CRLF; Python
  bytes.replace s assert count==1 po anchoru). CSP img-src netaknut (meta sliku dohvaca crawler).
- Guard test tests/tool-pages-seo.test.ts (30): po stranici self-canonical==og:url, og:image==
  twitter:image==/og-image.png, summary_large_image; globalno: nijedan .html ne referencira
  favicon.svg kao og/twitter sliku (regresija SVG placeholdera), index.html root canonical+og:image.
- Acceptance ispunjen: sve tool stranice i landing imaju tocno jedan canonical + og:url (+ og:image).
- NAPOMENA: BL-P2-06 (diferencirati GENERIRANE citatne stranice /alati/citati/**, thin content)
  je zaseban i dira generate-citation-tools.mjs = SEO/citation domena paralelne sesije, NE ovdje.
- Rizik regresije: vrlo nizak. Velicina: S

**BL-P2-06, Diferencirati staticke citatne stranice (thin content)**
- Prioritet: P2 (seo-02)
- Problem: 91 near-duplikat, caveat JS-only, bez OG/JSON-LD; rizik thin/doorway.
- Lokacija: scripts/generate-citation-tools.mjs:311, :523, :340, :252-264
- Preporuka: upisati diferencirajuci sadrzaj (status, vrste rada, godina, izvor+datum,
  ogranicenja) u staticki HTML; renderirati caveat u HTML-u; dodati OG i JSON-LD.
- Acceptance: svaka stranica ima jedinstveni crawlani blok izvan H1; caveat u HTML-u; OG +
  JSON-LD.
- Rizik regresije: srednji (mijenja generator; escapeHtml/CSP). Velicina: M

**BL-P2-07, og:image / social slika** — GOTOVO (landing, 2026-07-11)
- Prioritet: P2 (seo-05)
- Problem: index.html NIJE imao nijednu og:image/twitter:image (twitter:card=summary bez slike),
  pa Lekta pri dijeljenju na social mrezama nije imala preview sliku.
- ISPORUCENO: public/og-image.png (1200x630, 52 kB, brand paleta #f5f2ea/#33407e/#1a7a54,
  logo mark + "Provjeri rad prije nego sto ga predas." + honesty pill "Nista se ne salje" +
  lektahr.netlify.app). Deterministicki generiran Pillowom (scratchpad/gen_og.py, bez novih
  deps; kvacica rucno crtana jer Arial nema U+2713); vizualno provjeren. index.html head dobio
  og:image + og:image:width/height (1200/630) + og:image:alt + twitter:image (apsolutni URL na
  LEKTA_SITE_ORIGIN, konzistentno s canonical/og:url) i twitter:card summary -> summary_large_image.
  Vite kopira public/ -> dist root pa /og-image.png vraca 200. CSP img-src 'self' ne dira (meta
  sliku dohvaca crawler, ne stranica). CRLF ocuvan (binarni bytes.replace; diff = 6 linija).
- Guard test tests/og-image.test.ts (5): og:image==twitter:image na /og-image.png (apsolutni),
  summary_large_image, 1200x630, raster postoji + >5kB + PNG magicni bajtovi (ne preimenovan SVG).
- PREOSTAJE (deferrano, SEO domena paralelne sesije - generatori): propagirati og:image kroz
  generate-citation-tools/generate-legal-pages na tool/legal stranice (per-stranica ili shared).
- Acceptance (landing): index.html ima og:image koji vraca 200. Rizik regresije: nizak. Velicina: S

**BL-P2-08, motion/mini umjesto motion barrela** — BLOKIRANO PAKETOM (provjereno 2026-07-11)
- Prioritet: P2 (dependencies-02)
- NALAZ: motion/mini (motion 12.42.2) izvozi `animate` i `animateSequence`, ali NE `stagger`.
  ui-boot.ts:86 koristi `m.stagger(0.07)` u hero kaskadi. Prelazak bi trazio ili uvoz `stagger` iz
  punog `motion` (ponistava dobitak) ili rucni prepis staggera po elementu (mijenja user-facing
  animaciju). Motion se vec ucitava LIJENO (zaseban chunk, ne na kriticnom putu) pa je dobitak mali.
  Ostavljeno kako jest dok se ne pojavi mini stagger ili dok se hero animacija namjerno ne prepise.

**BL-P2-09, Teski dev CLI-jevi iz devDependencies**
- Prioritet: P2 (dependencies-03)
- Problem: netlify-cli i supabase dominiraju lockfileom (1314 zapisa), napuhuju npm ci i
  audit.
- Lokacija: package.json:31, :32
- Preporuka: prebaciti na npx/CI po potrebi ili dokumentirati; koristiti npm audit --omit=dev.
- Acceptance: npm ci za check ne treba pune CLI-jeve ili je zadrzavanje dokumentirano;
  produkcijski audit cist.
- Rizik regresije: nizak. Velicina: S

**BL-P2-10, HSTS zaglavlje** — GOTOVO (2026-07-11)
- Prioritet: P2 (security-03)
- Isporuceno: /* blok u public/_headers dobio `Strict-Transport-Security: max-age=31536000;
  includeSubDomains` (max-age 1 god >= tražen 15552000). `preload` NAMJERNO izostavljen: smo na
  *.netlify.app (vec HSTS-preloadan na razini registra); preload se dodaje tek uz vlastitu domenu.
- Verifikacija: dist/_headers nosi HSTS nakon builda; csp-hash test i dalje zelen (CSP linija netaknuta).
- Rizik regresije: nizak (cisto aditivno zaglavlje). Velicina: S

**BL-P2-11, Fokusirani ulaz umjesto guste pocetne**
- Prioritet: P2 (ux-06)
- Problem: pocetna servira landing + analizator + cjenik + FAQ na jednom scrollu; analizator
  ispod tri sekcije.
- Lokacija: index.html:258-342, :282, :340
- Preporuka: podici analizator odmah nakon hero ili primarni CTA u laksi "provjeri sada"
  kontekst.
- Acceptance: nakon CTA upload + profil su glavni fokus bez okolnog marketinga; krace do
  prvog uploada.
- Rizik regresije: srednji (sidra #analyzer, SEO, breakpointi). Velicina: M

**BL-P2-12, Prijava pogresne provjere bez window.prompt** — GOTOVO (2026-07-11)
- Prioritet: P2 (ux-05)
- Problem: reportWrongCheck koristio native window.prompt (neostiliziran, blokirljiv, losa
  mobilna/a11y UX; ne hvata fokus, ne moze se tematizirati).
- ISPORUCENO: reportWrongCheck() sada otvara tematizirani #reportModal (labeliran textarea
  #reportNote maxlength 1000 + privacy napomena "bez teksta rada") preko postojeceg trapModal
  (fokus na .modal-close, Tab trap, Escape zatvara, klik na backdrop zatvara). Logika slanja
  izvucena u submitReport() koji zadrzava IDENTICAN mailto/JSON-fallback + trackEvent, note se
  cita iz textarea (uz empty-guard: prazna poruka toasta i vraca fokus). Reuse .modal/.field/
  .history-privacy klasa (nula novog CSS-a). Escape handler dobio closeReport(). Sve funkcije
  na jednoj liniji (app.ts je CRLF, gust stil) da se ocuva CRLF; index.html modal binarno umetnut.
- Guard test tests/report-modal.test.ts (6): app.ts NEMA window.prompt/goli prompt(, reportWrongCheck
  otvara modal, closeReport/submitReport postoje, submitReport zadrzava mailto/downloadBlob/trackEvent,
  gumbi ozicani u bind(), Escape zatvara reportModal, index.html ima role=dialog+aria-modal+labeliran textarea.
- Acceptance ispunjen: unos kroz tematizirani element, hvata fokus, radi na mobitelu; slanje isto.
- Rizik regresije: nizak (reuse postojece modal infrastrukture, mailto/JSON logika netaknuta). Velicina: S

---

## FAZA P3 (optimizacije)

**BL-P3-01, Usporedna tablica bez zaglavlja po opsegu** (accessibility-07) — GOTOVO (2026-07-11)
- Problem: <table class="cmp"> u landing_usporedba.html bez scope, bez row-headera, bez caption
  (WCAG 1.3.1) pa citac ekrana ne povezuje celije sa zaglavljima stupca/retka.
- ISPORUCENO: 5 zaglavlja stupaca dobilo scope="col"; prvi (dimenzijski) stupac svakog od 7 redaka
  konvertiran iz <td class="dim"> u <th scope="row" class="dim">; dodan vizualno skriven <caption>
  (SR ga cita). KRITICNO: tablica ima slozeni responzivni layout (desktop td.dim = 250px bold stupac;
  mobitel display:block card + :before labeli), pa su 3 CSS pravila prosirena da th dobije isti stil
  kao td.dim (.cmp td.dim -> .cmp td.dim,.cmp th.dim x2; display:block set + table.cmp th) cime je
  vizualni rezultat identican. Value celije ostaju <td>. Nativni CRLF ocuvan.
- Guard test tests/comparison-table-a11y.test.ts (4): caption uz table, 5x scope=col, 7x th scope=row,
  nijedan <td class="dim"> ne ostaje, CSS prosiren na th.dim/th.
- Acceptance ispunjen: scope=col + th scope=row + caption. Velicina: S

**BL-P3-02, Spinner gejtati prefers-reduced-motion** (accessibility-08)
- index.html:62; @media reduce animation:none. Velicina: S

**BL-P3-03, Alati izbornik: ARIA menu i desink stanja** (accessibility-09)
- index.html:240, :41; src/shared/ui-boot.ts:117-137; ukloniti role=menu/menuitem,
  sinkronizirati aria-expanded s vidljivim stanjem. Velicina: S

**BL-P3-04, Ciljevi manji od 24x24 px** (accessibility-10)
- index.html:61 (.remove-file), :210 (.wl-close); min-width/height:24px. Velicina: S

**BL-P3-05, Fokus prsten niskog kontrasta** (accessibility-11)
- index.html:31 (--focus), :39; povecati kontrast na >= 3:1. Velicina: S

**BL-P3-06, Preskok razine naslova + h1 u QA konzoli** (accessibility-12)
- src/ui/app.ts:705; index.html:332,335; verification.html:40; h4 -> h3, staticki h1 u
  verification.html. Velicina: S

**BL-P3-07, Dropzone kao gumb s fokusabilnim potomcima** (accessibility-13)
- index.html:288; ukloniti role=button/tabindex ili file input iz tab reda; jedna jasna
  kontrola; zadrzati Enter/Space i drag/drop. Velicina: M

**BL-P3-08, Preklopnik teme bez aria-pressed** (accessibility-14)
- index.html:241; src/shared/ui-boot.ts:142-150; aria-pressed prati temu. Velicina: S

**BL-P3-09, Siroce SEO stranice bez interne poveznice** (routes-05)
- alati.html:159-163; dodati poveznice na /alati/citati/ i /alati/naslovnica/; hub. Velicina: S

**BL-P3-10, Favicon pokrivenost i /favicon.ico** (spoj routes-08 + seo-06) — GOTOVO (2026-07-11)
- Problem: samo index.html imao favicon (svg); 7 tool stranica BEZ ijednog favicona (generic tab
  ikona + /favicon.ico 404 jer .ico nije postojao); nigdje apple-touch-icon (iOS home-screen).
- ISPORUCENO: public/favicon.ico (multi-size 16/32/48, 2.3kB) + public/apple-touch-icon.png
  (180x180, puni kvadrat jer iOS sam zaobljuje), oba deterministicki Pillowom iz ISTOG brand marka
  kao favicon.svg (indigo #33407e zaobljeni kvadrat rx 7/32 + bijeli geometrijski L polygon iz SVG
  path-a; bez novih deps). Svih 8 stranica (index + 7 tool) dobilo <link rel=icon svg> + <link rel=icon
  favicon.ico sizes=32x32> + <link rel=apple-touch-icon>; index imao svg pa +ico/apple, tool stranice
  dobile puni trio prije color-scheme. Nativni EOL po fajlu (index+landing CRLF, 6 tool LF; bytes.replace
  assert count==1). CSP img-src netaknut (favikoni nisu u img-src opsegu; browser ih dohvaca izravno).
- Guard test tests/favicon.test.ts (10): svaka od 8 stranica ima svg+ico+apple link; favicon.ico ICO
  magicni bajtovi (00 00 01 00) + >200B; apple-touch-icon PNG magicni bajtovi + >200B.
- Acceptance ispunjen: rel=icon u svim head-ovima + .ico fallback (nema vise /favicon.ico 404). Velicina: S

**BL-P3-11, Sitemap: index, lastmod, ujednacen kanonski oblik** (seo-08)
- public/sitemap.xml; generatori; sitemap index + lastmod + ujednacen oblik direktorija.
  Velicina: S

**BL-P3-12, @fontsource ciljani podskupovi** (spoj dependencies-04 + performance-07) — BLOKIRANO PAKETOM (provjereno 2026-07-11)
- src/shared/ui-boot.ts:6-7; cilj: uvesti samo latin + latin-ext.
- NALAZ: @fontsource-variable/inter i /source-serif-4 (5.2.x) NE izvoze per-subset CSS ulaze (samo
  po OSI: wght/opsz/standard). Build vec emitira samo `wght-normal` po subsetu (nema italic/opsz
  otpada); jedini "otpad" su ne-latinski subsetovi (cyrillic/greek/vietnamese woff2). Preglednik ih
  zbog `unicode-range` ionako NE skida (runtime trosak = 0); ostaje samo cisci build artefakt.
  Micanje bi trazilo rucni @font-face + self-host konkretnih subset woff2 (fragilno, obavezan
  vizualni pregled). Za P3 "nije blokator" nije vrijedno rizika. Preload hasiranog fonta trazi
  build-time injekciju (hashirano ime), zaseban zadatak.

**BL-P3-13, canvas-confetti tipovi** (dependencies-05) — GOTOVO (2026-07-11)
- Isporuceno: src/types/ambient.d.ts vise nije goli `declare module` (any); dodana minimalna
  tipizirana deklaracija (ConfettiOptions + default ConfettiFn + reset/create) koja hvata tipfelere
  u opcijama confetti poziva (app.ts). BEZ novog devDependencyja (@types/canvas-confetti) da se ne
  dira dijeljeni package.json. tsc 0 (poziv mod.default||mod ostaje kompatibilan).

**BL-P3-14, Supply chain provjera u CI (npm audit, Dependabot/Renovate)** (dependencies-06)
- package.json:27; .github/workflows/; npm audit --omit=dev --audit-level=high + Dependabot;
  overrides za hitne zakrpe. Velicina: S

**BL-P3-15, Permissions-Policy i suzenje CSP connect-src/form-action** (security-05) — DJELOMICNO (2026-07-11)
- ISPORUCENO: /* blok dobio `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
  (zakljucava senzore koje app ne koristi; nizak rizik, aditivno).
- PREOSTAJE (srednji rizik, kad se ozici naplata): suziti connect-src/form-action s `https:` na
  self + *.supabase.co + Lemon Squeezy; trazi provjeru zive liste hostova (auth/waitlist/katalog/
  checkout) da se legitiman poziv ne blokira. Dokumentirano komentarom u public/_headers.
- Velicina: S (Permissions-Policy dio isporucen).

**BL-P3-16, Redundantne tocke ulaza i preuzimanja** (ux-08)
- index.html:265, :327; src/ui/app.ts:503, index.html:332; jedan primarni ulaz po radnji.
  Velicina: S

**BL-P3-17, Prazan tab "Spremnost za predaju" u zadanoj fazi** (ux-09) — GOTOVO (2026-07-11)
- Problem: u zadanoj fazi "Samo dokument" (currentSubmissionPhase default) tab je pokazivao slijepu
  poruku "nema administrativne checkliste" bez iduceg koraka; a tu vecina korisnika i zavrsi.
- ISPORUCENO: renderSubmissionChecklist (app.ts) prazno-groups stanje sada prikazuje CTA blok
  (2 recenice objasnjenja + gumb "Odaberi fazu predaje i dodaj PDF", data-open-phase). Klik
  (delegiran preko #submissionChecklist onclick, uz postojeci data-download-submission) vraca u
  carobnjak ($('#resultView') hidden, $('#wizardView') visible), otvara .advanced-options, skrola
  na #analyzer i fokusira #submissionPhase, po uzoru na nsPrecise. Nula novog CSS-a (reuse .empty,
  .btn.btn-secondary.btn-sm; 2 intra-line izmjene pa CRLF ocuvan).
- Guard test tests/submission-empty-cta.test.ts (3): prazno-groups fallback sadrzi data-open-phase
  gumb "Odaberi fazu", delegirani handler vraca wizardView+advanced-options+focus submissionPhase,
  download akcija netaknuta.
- Acceptance ispunjen: prazno stanje vodi na iduci korak umjesto slijepe poruke. Velicina: S

---

## Odbaceno (REFUTED)

- architecture-01 (P1, REFUTED): placeholder stub bez sadrzaja (title="Test", location="l",
  problem/evidence jednoslovni). Nema tvrdnje ni datoteke; iskljuceno iz backloga.

## Napomena o korekciji impacta

- seo-01 je zaveden kao PLAUSIBLE: nekonzistentnost defaulta je stvarna (obradena u
  BL-P0-01-4), ali tvrdnja o zivoj/commitanoj SEO steti je osporena (dist u .gitignore,
  netlify.toml postavlja LEKTA_SITE_ORIGIN). Realni prioritet stavke je P3 higijena, no
  rjesava se u P0-01 jer je dio konfiguracijskog paketa.
