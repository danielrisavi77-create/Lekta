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

**BL-P0-01-1, Uskladiti zive endpointe s javnom komunikacijom**
- Prioritet: P0 (izvorni data-flow-06 P2, elevirano)
- Problem: DEFAULT_PRODUCTION_CONFIG hardkodira zivi supabaseUrl, anon kljuc i
  waitlistEndpoint pa su prijava i waitlist zivi za sve, dok komunikacija sugerira suprotno.
- Lokacija: src/ui/app.ts:71, :221 (loadProductionConfig), :556 (waitlistConfig), :596
  (authConfigured), :621 (renderAuthEntry)
- Dokaz: bez overridea authConfigured()=true i waitlistConfig().endpoint je zivi URL.
- Posljedica: backend prima e-mail i pseudonimne signale dok se komunikacijom sugerira
  "bez registracije".
- Preporuka: svjesna odluka, ili ostavi zivim i uskladi copy, ili isprazni default
  endpointe i drzi ih iza konfiguracije.
- Acceptance: stanje endpointa u kodu odgovara javnoj komunikaciji.
- Rizik regresije: nizak, ali dira dijeljeni app.ts (git-race oprez).
- Velicina: S

**BL-P0-01-2, Ukloniti apsolutnu tvrdnju "Nista se ne salje na posluzitelj"**
- Prioritet: P0 (izvorni data-flow-01 P1, CONFIRMED)
- Problem: twitter meta apsolutno tvrdi da se nista ne salje; prijava i waitlist salju.
- Lokacija: index.html:20 (potkrijepljeno :6, :266)
- Dokaz: index.html:20 twitter:description = "...Nista se ne salje na posluzitelj";
  usporedi session.ts:88 (OTP), waitlist-bar.ts:82 (auto POST).
- Posljedica: GDPR cl.13 transparentnost, zavaravajuca apsolutna tvrdnja.
- Preporuka: ograniciti na tekst i datoteku rada ("Tekst i datoteka rada ostaju na
  uredaju; automatska analiza je lokalna").
- Acceptance: nijedan javni meta/hero tekst ne tvrdi da se nista ne salje.
- Rizik regresije: nizak (tekst).
- Velicina: S

**BL-P0-01-3, Waitlist traka ne smije slati signal bez radnje korisnika**
- Prioritet: P0 (izvorni data-flow-02 P1, CONFIRMED)
- Problem: mountWaitlistBar na prikazu automatski POST-a na faculty-request; server racuna
  soljeni ip_hash. Bez privole i bez objave.
- Lokacija: src/waitlist/waitlist-bar.ts:82 (fireSignal :49, guard :72); okida se iz
  src/ui/app.ts:566; endpoint app.ts:71; server faculty-request/index.ts:97
- Dokaz: `if(!entry) void fireSignal(detection,deps)` na prikazu trake bez klika.
- Posljedica: pseudonimni telemetrijski upis bez privole, nesuklad s "lokalno".
- Preporuka: odgoditi mrezni upis do eksplicitne radnje; alternativno dokumentirati
  automatski demand-signal (legitimni interes) uz opt-out. Preferirati prvo.
- Acceptance: bez korisnicke radnje nema poziva na faculty-request; test dokazuje da render
  trake sam ne salje.
- Rizik regresije: srednji (mijenja demand-signal, azurirati waitlist testove).
- Velicina: M

**BL-P0-01-4, Ujednaciti default origin generatora i dodati origin guard**
- Prioritet: P0 (spoj seo-01 P1 PLAUSIBLE + routes-01 P2; realni impact P3, ali se rjesava
  ovdje jer je dio konfiguracije)
- Problem: generatori citata i naslovnica default-aju na lekta.hr (nije ziva domena);
  pravni generator na lektahr.netlify.app. Nekonzistentno; footgun za build bez env-a.
- Lokacija: scripts/generate-citation-tools.mjs:37, scripts/generate-title-page-tools.mjs:
  33 (default 'https://lekta.hr'); scripts/generate-legal-pages.mjs:24 (ispravan);
  scripts/verify-deploy-dist.mjs (ne provjerava origin)
- Dokaz: dist lokalni build daje lekta.hr kanonike na citati/naslovnica; netlify.toml:22
  postavlja env pa je zivi deploy ispravan; dist/ u .gitignore (nije commitan).
- Posljedica: latentni cross-domain kanonik i CTA na neregistriranu domenu ako build izade
  bez env-a (Cloudflare Pages dashboard).
- Preporuka: ujednaciti fallback na 'https://lektahr.netlify.app'; verify-deploy-dist.mjs
  pada ako neki canonical/loc sadrzi lekta.hr ili ne pocinje s LEKTA_SITE_ORIGIN.
- Acceptance: grep dist/alati/** ne nalazi lekta.hr; sva tri generatora dijele isti izvor
  domene; build bez env-a pada ili koristi tocnu domenu.
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

**BL-P0-02-2, Pinati Edge importe @supabase/supabase-js (esm.sh)**
- Prioritet: P0 (izvorni dependencies-01 P1, CONFIRMED)
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

**BL-P0-02-3, IP hash salt fallback u generate-report i redeem-referral-signup**
- Prioritet: P0 (izvorni security-02 P2, elevirano u paket)
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

**BL-P0-02-4, faculty-request CORS suziti na vlastito porijeklo**
- Prioritet: P0 paket (izvorni data-flow-07 P3)
- Problem: CORS `*` i anoniman upis s bilo kojeg porijekla; zastita samo rate-limit.
- Lokacija: supabase/functions/faculty-request/index.ts:19-23, :66-73, :97
- Dokaz: POST s proizvoljne domene prolazi CORS i upisuje red do rate limita.
- Posljedica: abuse vektor (spam signala) i pseudonimno logiranje IP-a s tudih stranica.
- Preporuka: ograniciti CORS na https://lektahr.netlify.app; razmotriti lagani PoW/captcha.
- Acceptance: endpoint odbija ne-allowlistana porijekla; rate limit ostaje; vlastiti site
  nepromijenjen.
- Rizik regresije: nizak (provjeriti preflight s produkcijske domene).
- Velicina: S

**BL-P0-02-5, verify_jwt zakovati po funkciji u config.toml**
- Prioritet: P0 paket (izvorni security-04 P3)
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

**BL-P0-02-6, .gitignore .env i revoke purge RPC od anon**
- Prioritet: P0 paket (izvorni security-06 P3)
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

**BL-P0-03-1, verification.html izuzeti iz produkcijskog builda hosting-neovisno**
- Prioritet: P0 (izvorni routes-02 P2, elevirano)
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

**BL-P0-04-1, Sanitizirati payload punog izvjestaja (doslovni isjecci teksta rada)**
- Prioritet: P0 (izvorni data-flow-03 P1, CONFIRMED; dormant, P0 na dan ozicavanja)
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

**BL-P0-04-2, Retencija za document_slots i faculty_requests**
- Prioritet: P0 paket (izvorni data-flow-04 P2)
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

**BL-P0-04-3, Resend kao izvrsitelj + ukloniti naslov iz podsjetnika**
- Prioritet: P0 paket (izvorni data-flow-05 P2)
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

**BL-P0-04-4, Error-kolektor UA i privola**
- Prioritet: P0 paket (izvorni data-flow-08 P3)
- Problem: installErrorTracking salje navigator.userAgent i putanju bez privole (kanal OFF
  po defaultu).
- Lokacija: src/ui/app.ts:77, :122; kontrast sanitizeEventData :234-235
- Dokaz: beacon nosi UA i path; ne nosi tekst dokumenta.
- Posljedica: pseudonimni tehnicki kontekst bez privole kad se ozici.
- Preporuka: dokumentirati u privacy (legitimni interes) ili izostaviti UA; zadrzati
  izostavljanje teksta dokumenta.
- Acceptance: error payload opisan u pravnom tekstu ili bez UA; nikad ne nosi sadrzaj.
- Rizik regresije: nizak.
- Velicina: S

### P0-05 Obrada datoteka

**BL-P0-05-1, Skinuti autorski podatkovni sloj s kriticnog puta (2,4 MB chunk)**
- Prioritet: P0 (izvorni performance-01 P1, CONFIRMED)
- Problem: glavni entry chunk 2.478.762 B raw / 369.013 B gzip; dominiraju podaci
  (verified-profiles 1,45 MB + 169 draftova 1,3 MB + source-registry 152 KB); draftovi
  eager glob.
- Lokacija: src/profiles/profile-registry.ts:49-51, :7; src/ui/app.ts:20-21
- Dokaz: markeri provenijencije u chunku 1:1 s izvorom (verifiedBy x1392, Risavi x2380).
- Posljedica: parse/compile sekunde glavne niti na mobitelu prije interaktivnosti.
- Preporuka: (a) ispeci advisory listu (BL-P0-05-2), (b) razdvoji verified-profiles na indeks
  + puni skup po profilu (dinamicki), (c) build.json.stringify.
- Acceptance: glavni chunk gzip padne barem 40 posto; 0 draft markera u glavnom chunku;
  selektori/analiza/advisory nepromijenjeni; golden i UI smoke zeleni.
- Rizik regresije: srednji (asinkroni currentProfile/applyScoredAdvisory, utrka odabir vs
  pravila; golden stiti jezgru; treba UI smoke odaberi-pa-odmah-pokreni).
- Velicina: L

**BL-P0-05-2, Ispeci advisory mapu u buildu, izbaci draftove iz runtimea**
- Prioritet: P0 paket (izvorni performance-02 P2)
- Problem: draftovi + source-registry sluze runtimeu samo za applyScoredAdvisory (kratka
  advisoryDimensions lista).
- Lokacija: src/ui/app.ts:327; src/profiles/advisory-demotion.ts:36-54;
  src/verification/published-rules.ts:29-46
- Dokaz: advisoryDimensions je jedini izlaz koji app konzumira iz cijelog lanca.
- Posljedica: 1,45 MB raw JSON u javnom bundleu samo da bi se iznova izracunala mala lista.
- Preporuka: predizracunaj advisory-map.json (profileId -> checkId-jevi) u buildu; runtime
  ucita samo mapu; computePublishedRules ostaje build-time.
- Acceptance: draftRuleEntriesFor i SOURCE_REGISTRY nisu u grafu index.html; identican
  advisoryDimensions (snapshot test); CI test da se pecena mapa ne razide od izvora.
- Rizik regresije: nizak do srednji.
- Velicina: M

**BL-P0-05-3, build.json.stringify za brzi startup parse**
- Prioritet: P0 paket (izvorni performance-05 P2)
- Problem: veliki JSON emitiran kao objektni literali (sporiji V8 parse).
- Lokacija: vite.config.ts:67-70
- Preporuka: dodati build:{json:{stringify:true}}.
- Acceptance: glavni chunk sadrzi JSON.parse omote za profilne podatke; script evaluation
  vrijeme padne; ponasanje nepromijenjeno.
- Rizik regresije: nizak (golden i registar testovi hvataju rubove).
- Velicina: S

**BL-P0-05-4, Lijeno ucitati DOCX/PDF motor (skinuti s landinga)**
- Prioritet: P0 paket (izvorni performance-03 P2)
- Problem: analyzeDocx u glavnom chunku preko inline fallbacka; pdf preflight staticki;
  motor duplo isporucen.
- Lokacija: src/analysis/analyze-docx-client.ts:12; src/ui/app.ts:16, :34
- Dokaz: markeri jezgre analize u glavnom i worker chunku.
- Preporuka: inline fallback -> dinamicki import; lijeno uciti analizator na prvu interakciju.
- Acceptance: 0 markera jezgre u glavnom chunku; prva analiza i fallback rade; golden zelen.
- Rizik regresije: nizak do srednji (testirati fallback granu simulacijom Worker iznimke).
- Velicina: M

**BL-P0-05-5, Gumb Prekini analizu + Escape**
- Prioritet: P0 paket (izvorni performance-04 P2)
- Problem: nema prekida tekuce analize; worker se gasi tek pri novoj analizi.
- Lokacija: src/ui/app.ts:449-457; index.html:329; src/analysis/analyze-docx-client.ts:35
- Preporuka: gumb Prekini u #progressView + Escape -> terminate(), ponisti token, vrati na
  wizard; izloziti cancelActiveAnalysis().
- Acceptance: klik/Escape unutar ~100 ms vrati wizard, worker prestane trositi CPU, kasni
  postMessage se odbaci tokenom.
- Rizik regresije: nizak (token guard postoji; resetirati analyzeBtn u finally).
- Velicina: M

**BL-P0-05-6, Immutable cache za hashirane assete**
- Prioritet: P0 paket (izvorni performance-06 P2)
- Problem: public/_headers nema Cache-Control za /assets/*.
- Lokacija: public/_headers:18-22; netlify.toml
- Preporuka: /assets/* Cache-Control: public, max-age=31536000, immutable; HTML kratko
  keširan.
- Acceptance: /assets/* nose immutable godinu; HTML nema dugi cache; ponovni posjet iz cachea.
- Rizik regresije: vrlo nizak.
- Velicina: S

**BL-P0-05-7, Memorija i mobilni cap (OOM)**
- Prioritet: P0 paket (izvorni performance-08 P3)
- Problem: analiza cita cijelu datoteku u memoriju; grubi progress; moguc OOM na graniznom
  dokumentu na slabom mobitelu.
- Lokacija: src/analysis/analyze-docx.ts:43, :41; src/ui/app.ts:534
- Preporuka: sniziti mobilni cap ili gejtati po deviceMemory; inkrementalni progress;
  oslobadanje velikih medupolja. Spojiti s BL-P0-05-5.
- Acceptance: granicni dokument prode ili padne s jasnom porukom (ne tihi crash); progres
  glatko napreduje.
- Rizik regresije: srednji (diranje analyzeDocx tek uz zeleni golden).
- Velicina: M

**BL-P0-05-8, Jak default profil i potvrda profila prije analize**
- Prioritet: P0 paket (izvorni ux-02 P2)
- Problem: default tvrdo FPZG/Politologija/Diplomski; auto-detekcija samo unizg; non-unizg
  korisnik tiho dobije FPZG-specifican rezultat; analiza se pali cim je datoteka odabrana.
- Lokacija: src/ui/app.ts:278, :164, :149, :449
- Preporuka: ublaziti default (neutralni/opci profil) ili potvrda profila prije analize;
  prosiriti auto-detekciju na sve institucije.
- Acceptance: korisnik koji nije mijenjao izbornike ne dobiva tiho FPZG rezultat; profil
  istaknut uz gumb; auto-detekcija pokusava sve institucije.
- Rizik regresije: srednji (dira default i detekciju; golden/UI smoke).
- Velicina: M

**BL-P0-05-9, Uskladiti oglaseni i stvarni limit uploada na mobitelu**
- Prioritet: P0 paket (izvorni ux-07 P2)
- Problem: opis tvrdi 50 MB, mobilni efektivni cap je 20 MB.
- Lokacija: index.html:288; src/ui/app.ts:208, :534, :147
- Preporuka: prikazati stvarni efektivni limit iz effectiveUploadCap ovisno o uredaju.
- Acceptance: mobitel prikazuje 20 MB, desktop 50 MB; nema neslaganja.
- Rizik regresije: nizak.
- Velicina: S

### P0-06 Pravne stranice i 404

**BL-P0-06-1, Eksplicitna izjava da Lekta nije provjera plagijata**
- Prioritet: P0 (izvorni ux-01 P1, CONFIRMED)
- Problem: rijec plagijat ne postoji na pocetnoj; jaz u ocekivanjima (Turnitin).
- Lokacija: index.html:341, :281, :264
- Dokaz: grep plagijat|Turnitin|slicnost|originaln u index.html = 0.
- Posljedica: korisnik ocekuje slicnost, dobije audit, rizik povrata kod naplate.
- Preporuka: vidljiva izjava u hero/FAQ + FAQ pitanje "Provjerava li Lekta plagijat?" s Ne.
- Acceptance: na pocetnoj i u FAQ-u eksplicitna recenica da alat nije provjera plagijata/
  slicnosti/originalnosti.
- Rizik regresije: vrlo nizak.
- Velicina: S

**BL-P0-06-2, Ublaziti preobecavanje spremnosti ("Spremno", "potvrduje")**
- Prioritet: P0 (spoj ux-03 P2 + ux-04 P2)
- Problem: pecat "Spremno" i disclaimer "potvrduje tehnicku uskladjenost" sugeriraju
  certifikaciju spremnosti, u napetosti s "nije sluzbena potvrda".
- Lokacija: index.html:230, :263, :340; src/ui/app.ts:566, :128
- Preporuka: pecat u tehnicki okvir ("Tehnicki uredno") uz caveat; "potvrduje" -> "procjenjuje/
  provjerava" na oba mjesta.
- Acceptance: nijedan javni disclaimer ne tvrdi bezuvjetnu spremnost ni "potvrduje
  uskladjenost".
- Rizik regresije: vrlo nizak.
- Velicina: S

**BL-P0-06-3, Pravila kupnje i povrata u footer**
- Prioritet: P0 paket (izvorni routes-04 P2)
- Problem: glavni footer izostavlja pravila-povrata.html; footeri alata linkaju 3 od 7.
- Lokacija: index.html:344; citat.html:327-329; alati.html:183-185;
  generate-legal-pages.mjs:69-72
- Preporuka: dodati poveznicu na Pravila kupnje i povrata u sve footere; ujednaciti pravni set.
- Acceptance: pravila-povrata.html dostupan iz footera svake javne stranice; svih 7 u dva
  klika.
- Rizik regresije: nizak (paziti data-legal="purchase" ili href fallback).
- Velicina: S

**BL-P0-06-4, Brandirana 404 stranica**
- Prioritet: P0 paket (spoj routes-06 P3 + seo-07 P3)
- Problem: nema 404.html ni [[redirects]]; clean URL i typani linkovi padaju na genericki
  Netlify 404.
- Lokacija: netlify.toml; glob 404.html/_redirects prazan
- Preporuka: public/404.html s brendom i navigacijom; po zelji redirect za clean URL.
- Acceptance: nepostojeca ruta vraca brandiranu 404 s navigacijom.
- Rizik regresije: nizak (aditivno).
- Velicina: S

**BL-P0-06-5, Pravne poveznice u index footeru kao pravi <a href>**
- Prioritet: P0 paket (izvorni routes-07 P3)
- Problem: pravne stavke su JS gumbi (legal-open), ne <a>; bez JS nema poveznice; nulti link
  equity.
- Lokacija: index.html:344; kontrast citat.html:327
- Preporuka: uciniti <a href="/privatnost.html"> uz legal-open preko preventDefault
  (progressive enhancement).
- Acceptance: footer sadrzi prave poveznice; modal radi uz JS.
- Rizik regresije: nizak do srednji (legal-open handler ne smije puknuti kad element postane
  <a>).
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

**BL-P1-01, Skip link na svim stranicama**
- Prioritet: P1 (izvorni accessibility-01, CONFIRMED)
- Problem: nijedna stranica nema "Preskoci na sadrzaj" (WCAG 2.4.1 A); 6 do 8 nav poveznica
  prije sadrzaja.
- Lokacija: index.html:236-258; citat.html:110-147; sve ostale stranice
- Preporuka: vidljiv-na-fokus skip link kao prvi element u <body> preko
  src/shared/ui-boot.ts; cilj ima id.
- Acceptance: prvi Tab fokusira skip link koji pomice fokus na glavni sadrzaj (light/dark/
  forced-colors).
- Rizik regresije: vrlo nizak.
- Velicina: S

**BL-P1-02, Fokus i najava rezultata nakon analize**
- Prioritet: P1 (izvorni accessibility-02, CONFIRMED)
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

**BL-P2-05, Canonical i og:url na tool stranicama; OG za landing**
- Prioritet: P2 (spoj routes-03 + seo-03, + seo-04 za landing)
- Problem: alati/citat/izjava/literatura/naslovnica bez canonical/og:url; landing_usporedba
  bez OG/canonical/JSON-LD.
- Lokacija: citat.html:1-109; alati.html; izjava.html; literatura.html; naslovnica.html;
  landing_usporedba.html:1-132; uzor kartice.html
- Preporuka: dodati canonical + og:url (apsolutni zivi URL); landingu puni OG blok.
- Acceptance: sve tool stranice i landing imaju tocno jedan canonical + og:url.
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

**BL-P2-07, og:image / social slika**
- Prioritet: P2 (seo-05)
- Problem: nijedna stranica nema og:image; nema asseta.
- Lokacija: index.html:18; nema og*.png u public/
- Preporuka: default 1200x630 u public/, og:image + twitter:image apsolutni URL, propagirati
  kroz generatore (CSP img-src 'self').
- Acceptance: glavne stranice imaju og:image koji vraca 200.
- Rizik regresije: nizak. Velicina: S

**BL-P2-08, motion/mini umjesto motion barrela**
- Prioritet: P2 (dependencies-02)
- Problem: import('motion') vuce framer-motion; koristi se samo animate/stagger.
- Lokacija: src/shared/ui-boot.ts:26
- Preporuka: import('motion/mini') s imenovanim {animate, stagger}; zadrzati lijeni oblik i
  .catch.
- Acceptance: mini ulaz; animacije rade uz reduced-motion; chunk ne sadrzi framer-motion.
- Rizik regresije: nizak. Velicina: S

**BL-P2-09, Teski dev CLI-jevi iz devDependencies**
- Prioritet: P2 (dependencies-03)
- Problem: netlify-cli i supabase dominiraju lockfileom (1314 zapisa), napuhuju npm ci i
  audit.
- Lokacija: package.json:31, :32
- Preporuka: prebaciti na npx/CI po potrebi ili dokumentirati; koristiti npm audit --omit=dev.
- Acceptance: npm ci za check ne treba pune CLI-jeve ili je zadrzavanje dokumentirano;
  produkcijski audit cist.
- Rizik regresije: nizak. Velicina: S

**BL-P2-10, HSTS zaglavlje**
- Prioritet: P2 (security-03)
- Problem: nema Strict-Transport-Security; downgrade na prvi posjet.
- Lokacija: public/_headers:19-23
- Dokaz: grep strict-transport = 0; ublazeno jer je netlify.app na HSTS preload listi.
- Preporuka: /* Strict-Transport-Security: max-age=31536000; includeSubDomains; preload tek
  uz vlastitu domenu.
- Acceptance: odgovor nosi HSTS max-age >= 15552000.
- Rizik regresije: nizak. Velicina: S

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

**BL-P2-12, Prijava pogresne provjere bez window.prompt**
- Prioritet: P2 (ux-05)
- Problem: reportWrongCheck koristi native window.prompt (neostiliziran, blokirljiv, losa
  mobilna UX).
- Lokacija: src/ui/app.ts:546; index.html:332
- Preporuka: mali modal (textarea + gumb) uz postojeci trapModal; zadrzati mailto/JSON.
- Acceptance: unos kroz tematizirani element, radi na mobitelu, hvata fokus; slanje isto.
- Rizik regresije: nizak do srednji. Velicina: S

---

## FAZA P3 (optimizacije)

**BL-P3-01, Usporedna tablica bez zaglavlja po opsegu** (accessibility-07)
- landing_usporedba.html:188-216; dodati scope=col, <th scope=row>, <caption>. Velicina: S

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

**BL-P3-10, Favicon pokrivenost i /favicon.ico** (spoj routes-08 + seo-06)
- index.html:10; generatori pageShell; dodati rel=icon u zajednicki head i .ico fallback.
  Velicina: S

**BL-P3-11, Sitemap: index, lastmod, ujednacen kanonski oblik** (seo-08)
- public/sitemap.xml; generatori; sitemap index + lastmod + ujednacen oblik direktorija.
  Velicina: S

**BL-P3-12, @fontsource ciljani podskupovi** (spoj dependencies-04 + performance-07)
- src/shared/ui-boot.ts:6-7; uvesti samo latin + latin-ext, preload primarnog fonta; PAZITI
  da latin-ext ostane (nosi c,c,z,s,d). Obavezan vizualni pregled hrvatskog teksta. Velicina: S

**BL-P3-13, canvas-confetti tipovi** (dependencies-05)
- src/types/ambient.d.ts:2; dodati @types/canvas-confetti, ukloniti goli declare module.
  Velicina: S

**BL-P3-14, Supply chain provjera u CI (npm audit, Dependabot/Renovate)** (dependencies-06)
- package.json:27; .github/workflows/; npm audit --omit=dev --audit-level=high + Dependabot;
  overrides za hitne zakrpe. Velicina: S

**BL-P3-15, Permissions-Policy i suzenje CSP connect-src/form-action** (security-05)
- public/_headers:19; Permissions-Policy camera=()/microphone=()/geolocation=()/payment=();
  suziti connect-src na self + *.supabase.co + Lemon Squeezy. Velicina: S (srednji rizik za
  connect-src suzenje).

**BL-P3-16, Redundantne tocke ulaza i preuzimanja** (ux-08)
- index.html:265, :327; src/ui/app.ts:503, index.html:332; jedan primarni ulaz po radnji.
  Velicina: S

**BL-P3-17, Prazan tab "Spremnost za predaju" u zadanoj fazi** (ux-09)
- src/ui/app.ts:664, :442; index.html:307; CTA "Dodaj konacni PDF i odaberi fazu" u praznom
  stanju. Velicina: S

---

## Odbaceno (REFUTED)

- architecture-01 (P1, REFUTED): placeholder stub bez sadrzaja (title="Test", location="l",
  problem/evidence jednoslovni). Nema tvrdnje ni datoteke; iskljuceno iz backloga.

## Napomena o korekciji impacta

- seo-01 je zaveden kao PLAUSIBLE: nekonzistentnost defaulta je stvarna (obradena u
  BL-P0-01-4), ali tvrdnja o zivoj/commitanoj SEO steti je osporena (dist u .gitignore,
  netlify.toml postavlja LEKTA_SITE_ORIGIN). Realni prioritet stavke je P3 higijena, no
  rjesava se u P0-01 jer je dio konfiguracijskog paketa.
