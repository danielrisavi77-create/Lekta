# LAUNCH_BLOCKERS.md, Lekta

Konsolidirani popis blokatora lansiranja. Sintetizirano iz 9 auditnih dimenzija
(architecture, data-flow, routes, dependencies, security, ux, accessibility, seo,
performance). Ulaze samo nalazi s verdiktom CONFIRMED ili PLAUSIBLE. REFUTED nalazi
su izbaceni iz zakljucaka (popis na dnu, poglavlje "Provjereno, nije problem").
Duplikati kroz dimenzije su spojeni u jedan blokator (izvorni id-jevi navedeni).

Datum: 2026-07-11. Autor: glavni auditor (read-only sinteza).

> Kanonski launch-gate (jedan izvor istine): ovaj dokument (paketi P0-01 do P0-07) je mjerodavni,
> konsolidirani popis blokatora lansiranja. Tematska pred-launch lista
> [docs/PRE_LAUNCH_CHECKLIST.md](../PRE_LAUNCH_CHECKLIST.md) (P0 po sekcijama) i co-pilot luk
> [docs/roadmap/LAUNCH_CHECKLIST.md](../roadmap/LAUNCH_CHECKLIST.md) su komplementarni; njihove P0
> sheme su zasebne i ne preslikavaju se 1:1 na P0-0x pakete odavde.

---

## 1. Executive sazetak

Lekta je tehnicki zrela klijentska aplikacija koja radi ono sto obecava u jezgri
(lokalna analiza u Web Workeru, golden pokriven parser, tipiziran src bez @ts-nocheck).
Ali izmedju stanja koda i onoga sto javna komunikacija tvrdi postoji nekoliko stvarnih
raskoraka, a najosjetljiviji serverski rubovi (placanje, funkcije sa service_role
kljucem, podsjetnici e-mailom) imaju konkretne sigurnosne i lanac-nabave rupe koje
postaju aktivne cim se ozici naplata i e-mail.

Kljucni nalaz oko konfiguracije: memorija projekta tvrdi da su supabaseUrl i anon kljuc
prazni pa da su auth i waitlist OFF. To vise NIJE tocno. `DEFAULT_PRODUCTION_CONFIG`
(src/ui/app.ts:71) sada hardkodira zivi Supabase URL, anon kljuc i waitlist endpoint,
pa su prijava e-mailom i automatski waitlist signal ZIVI za svakog posjetitelja, dok
marketinski meta tag (index.html:20) i dalje tvrdi "Nista se ne salje na posluzitelj".
To je istovremeno pravni (GDPR transparentnost, zavaravajuca apsolutna tvrdnja) i
tehnicki raskorak i zato je prvi na redu.

Struktura blokatora prati redoslijed izvrsavanja (poglavlje 19): P0-01 javna
konfiguracija, P0-02 tajne i RLS, P0-03 admin izlozenost, P0-04 privatni izvjestaji,
P0-05 obrada datoteka, P0-06 pravne stranice i 404, P0-07 naplata. Nakon P0 paketa
slijede preostali P1 blokatori (pristupacnost primarnog toka).

## 2. Launch gate (poglavlje 17): je li proizvod spreman za naplatu i javnu garanciju

Odluka: NIJE spreman za naplatu ni za javnu garanciju dok se ne zatvore paketi
P0-01 do P0-07 i P1 pristupacnosti primarnog toka.

Detaljno po scenariju:

- Besplatni soft-launch (trenutno stanje, bez naplate, reportEndpoint prazan): USLOVNO
  prihvatljiv, ali tek nakon sto se poprave dvije stvari koje su ziva neistina prema
  korisniku: apsolutna tvrdnja "nista se ne salje" (P0-01 / data-flow-01) i automatski
  waitlist POST bez privole i bez objave u pravnom tekstu (P0-01 / data-flow-02). Bez
  toga i besplatni launch nosi pravni rizik (zavaravajuca tvrdnja, GDPR cl.13).

- Naplata (ozicavanje checkouta i webhooka): BLOKIRANO dok se ne pinaju Edge importi
  koji drze service_role kljuc i grade checkout (P0-02 / dependencies-01) i dok se ne
  zatvori send-reminders bez autorizacije (P0-02 / security-01). Bez toga se placa i
  potpisuje kupnja preko koda dohvacenog s trece strane bez lockfilea.

- Javna garancija (obecanje "spremno za predaju" uz povrat novca): BLOKIRANO dok se ne
  ublazi preobecavanje spremnosti (P0-06 / ux-03, ux-04) i ne doda eksplicitna izjava
  da Lekta NIJE provjera plagijata (P0-06 / ux-01). Bez toga je garancija izlozena
  reklamacijama "alat je rekao da je spremno, referada je vratila rad".

- Ozicavanje punog izvjestaja na posluzitelj: BLOKIRANO dok se ne sanitizira payload
  koji danas nosi doslovne isjecke teksta rada (P0-04 / data-flow-03). Cim endpoint
  proradi, doslovni fragmenti rada odlaze na posluzitelj protivno izricitoj tvrdnji, sto
  je tada P0 curenje.

Zakljucak: zeleno svjetlo za javnu naplativu uslugu s garancijom nije opravdano prije
zatvaranja svih P0 paketa. Za besplatni soft-launch dovoljno je zatvoriti P0-01
(konfiguracija i copy) i P0-06 tekstualne stavke (plagijat, spremnost), ostalo prije
prve naplate.

---

## P0-01. Javna konfiguracija: zivi endpointi, kriva domena i neistinit copy

Objedinjuje: data-flow-06 (P2), data-flow-01 (P1, CONFIRMED), data-flow-02 (P1,
CONFIRMED), seo-01 (P1, PLAUSIBLE) + routes-01 (P2, isti problem domene).

Prioritet: P0 (elevirano iz izvornih P1/P2 jer konfiguracija odreduje sto je zivo i sto
se javno tvrdi).

Problem:
1. `DEFAULT_PRODUCTION_CONFIG` hardkodira zivi supabaseUrl, anon kljuc i waitlistEndpoint,
   pa su prijava e-mailom (renderAuthEntry) i waitlist demand-signal zivi za sve, iako
   komunikacija ("Bez registracije", "nista se ne salje") sugerira suprotno.
2. Marketinski twitter meta apsolutno tvrdi "Nista se ne salje na posluzitelj", sto nije
   istina jer prijava POST-a na GoTrue, a waitlist automatski POST-a demand-signal.
3. Waitlist traka na prikazu (bez klika) automatski salje POST na faculty-request s
   odabirom fakulteta; posluzitelj iz x-forwarded-for racuna soljeni ip_hash. To se
   dogada tijekom faze koju pravni tekst opisuje kao potpuno lokalnu.
4. SEO generatori citata i naslovnica default-aju origin na `https://lekta.hr` (nije
   ziva domena), dok pravni generator i ziva domena koriste `https://lektahr.netlify.app`.
   Nekonzistentan fallback je latentni footgun za svaki build bez LEKTA_SITE_ORIGIN.

Lokacija:
- src/ui/app.ts:71 (hardkodirani supabaseUrl, anon key, waitlistEndpoint), :221
  (loadProductionConfig merge), :556 (waitlistConfig), :596 (authConfigured), :621
  (renderAuthEntry)
- index.html:20 (twitter:description apsolut), index.html:266 ("Bez registracije")
- src/waitlist/waitlist-bar.ts:82 (auto fireSignal na prikazu), :49 (fireSignal), :72
  (mountWaitlistBar guard); okida se iz src/ui/app.ts:566
- scripts/generate-citation-tools.mjs:37, scripts/generate-title-page-tools.mjs:33
  (default 'https://lekta.hr'); usporedba scripts/generate-legal-pages.mjs:24 (ispravan
  default); scripts/verify-deploy-dist.mjs (ne provjerava origin)

Dokaz:
- Potvrdeno citanjem: app.ts:71 doslovno sadrzi supabaseUrl, anon JWT i
  waitlistEndpoint=.../functions/v1/faculty-request; loadProductionConfig samo nadmece
  spremljenim overrideom pa je bez overridea authConfigured()=true i waitlistConfig().
  endpoint je zivi URL.
- index.html:20: twitter:description = "...Nista se ne salje na posluzitelj." (apsolut).
  Precizniji FAQ (index.html:22 JSON-LD, :341) i modal (:345) su tocni, apsolut u meta
  tagu nije.
- waitlist-bar.ts:82: `if(!entry) void fireSignal(detection,deps)` na prikazu; fireSignal
  POST-a buildFacultyRequestBody({facultyId,facultyName,programId,workType,source:
  'upload_flow'}); server racuna ip_hash (faculty-request/index.ts:97).
- generate-citation-tools.mjs:37 i generate-title-page-tools.mjs:33 =
  `process.env.LEKTA_SITE_ORIGIN || 'https://lekta.hr'`. netlify.toml:22 postavlja env pa
  je zivi Netlify deploy ispravan; dist/ je u .gitignore (nije commitan), no build na
  hostu bez env-a (npr. Cloudflare Pages dashboard) dao bi lekta.hr kanonike.

Posljedica:
- Pravna: zavaravajuca apsolutna tvrdnja (potrosacko pravo) i GDPR transparentnost cl.13;
  pseudonimni telemetrijski upis (odabir fakulteta + hashirani IP) bez privole i bez
  objave.
- SEO: latentni cross-domain kanonik i CTA na neregistriranu domenu na 180+ generiranih
  stranica ako build ikad izade bez env varijable.

Preporuka:
- Donijeti svjesnu odluku o backendu: ili ostaviti zivim i uskladiti SVU komunikaciju
  (ukloniti apsolute i "bez registracije"), ili isprazniti default endpointe i drzati ih
  iskljucivo iza konfiguracije.
- Ublaziti apsolut na tvrdnju ogranicenu na tekst i datoteku rada ("Tekst i datoteka rada
  ostaju na uredaju; automatska analiza je lokalna").
- Odgoditi svaki mrezni waitlist upis do eksplicitne radnje (klik ili upis e-maila);
  alternativno izricito dokumentirati automatski demand-signal (legitimni interes) uz
  opt-out. Preferirati prvo.
- Ujednaciti default origin na 'https://lektahr.netlify.app' u sva tri generatora i dodati
  tvrdu provjeru u verify-deploy-dist.mjs (build pada ako neki kanonik/loc sadrzi lekta.hr
  ili ne pocinje s LEKTA_SITE_ORIGIN).

Acceptance:
- Nijedan javni meta/hero tekst ne tvrdi da se nista ne salje; tvrdnje su ogranicene na
  tekst i datoteku rada i poravnate s obavijesti o privatnosti.
- Bez korisnicke radnje nema poziva na faculty-request; ako se automatika zadrzi, opisana
  je u pravnom tekstu i ima opt-out; test dokazuje da render trake sam ne salje.
- Stanje endpointa u kodu odgovara javnoj komunikaciji.
- Grep po dist/alati/** ne nalazi lekta.hr; verify-deploy-dist.mjs pada na krivoj domeni;
  sva tri generatora dijele isti izvor domene ili isti fallback.

Rizik regresije:
- Nizak za copy i domenu (string konstante, dodatna build provjera).
- Srednji za waitlist ponasanje: mijenja se demand-signal, treba azurirati waitlist
  testove koji ocekuju upis na prikazu.
- Oprez: app.ts je dijeljena datoteka (git-race iz memorije projekta).

---

## P0-02. Tajne, RLS i lanac nabave Edge funkcija

Objedinjuje: security-01 (P1, CONFIRMED), dependencies-01 (P1, CONFIRMED), security-02
(P2), data-flow-07 (P3), security-04 (P3), security-06 (P3).

Prioritet: P0 (elevirano; ovo su serverski rubovi koji drze service_role kljuc, potpisuju
kupnju i salju e-mail).

### P0-02a. send-reminders nema autorizaciju (P1, CONFIRMED, security-01)

Problem: HTTP handler provjerava samo da je metoda POST pa odmah salje podsjetnike preko
Resenda i pise u bazu sa SUPABASE_SERVICE_ROLE_KEY. Nema provjere cron tajne. Deployan je
verify_jwt=false, pa je endpoint potpuno otvoren. Slot-expiry grana nema per-slot
sent-marker pa ponovljeni pozivi ponovno salju iste e-mailove.

Lokacija: supabase/functions/send-reminders/index.ts:170-173 (handler, samo req.method),
:25 (service role client), :164 (if(ok) sent++ bez markera); docs/GO_LIVE_ROKOVI.md:10,77
(verify_jwt=false, curl bez auth ocekuje 200); migracija 0012_deadline_subscriptions.sql:
120 (cron namjera).

Dokaz: handler nikad ne cita Authorization; config.toml nema [functions.send-reminders];
deadline grana pise reminder_7d/1d_sent_at (:79-84, :101-106) ali slot grana nema
ekvivalent. Eksploatacija (spam e-mailom, trosak Resenda) latentna dok RESEND_API_KEY nije
postavljen (feature INERT), ali kodni defekt je stvaran.

Posljedica: prisilno izvrsavanje serverskog posla po volji napadaca, ponavljano slanje
e-mailova legitimnim korisnicima, amplifikacija troska Resenda. Nije open relay (primatelj
je uvijek registrirani korisnik po user_id).

Preporuka: dodati gate na ulazu (usporedba dedicirane cron tajne, npr. Bearer prema
REMINDER_CRON_SECRET, NE prema service role kljucu; 401 na nepodudaranje); uskladiti cron
poziv iz migracije 0012; dodati per-slot sent-marker i preskociti vec obavijestene slotove.

Acceptance: POST bez ispravne cron tajne vraca 401 i ne dira bazu ni Resend; dvostruki
poziv s ispravnom tajnom ne salje isti slot-podsjetnik dvaput; npm run check zelen.

Rizik regresije: Nizak (aditivni gate + jedan marker). Fail-closed ako se cron ne uskladi
(podsjetnici stanu), sto je prihvatljivije od javne funkcije.

### P0-02b. Edge funkcije uvoze @supabase/supabase-js s esm.sh bez pina i integriteta (P1, CONFIRMED, dependencies-01)

Problem: svih 8 Edge funkcija (ukljucujuci create-checkout i webhook-mor koje drze
service_role kljuc i potpisuju kupnju) uvoze createClient iz
`https://esm.sh/@supabase/supabase-js@2`. Pin je samo major, bez tocne verzije, bez
deno.lock ni import map integriteta; kod se dohvaca s trece strane.

Lokacija: create-checkout/index.ts:10, webhook-mor/index.ts:12, generate-report/index.ts:
11, file-guarantee-claim/index.ts:7, faculty-request/index.ts:14, send-reminders/index.ts:
15, unsubscribe-reminder/index.ts:11, redeem-referral-signup/index.ts:10 (+ 2 type-only u
_shared). Nema deno.lock ni import_map.json pod supabase/.

Dokaz: create-checkout cita SUPABASE_SERVICE_ROLE_KEY (:15), gradi admin klijent (:71) i
POST-a na api.lemonsqueezy.com/v1/checkouts (:115); webhook-mor istim CDN klijentom
verificira potpis i izdaje entitlemente.

Posljedica: supply chain rizik na najosjetljivijem mjestu; kompromitiran ili nedostupan
esm.sh moze ubaciti ili srusiti kod u funkcijama koje potpisuju kupnje i drze admin kljuc.
Uz float @2 build nije reproducibilan.

Preporuka: pinati tocnu verziju (esm.sh/@supabase/supabase-js@2.x.y) ili centralizirati u
supabase/functions/import_map.json uz deno.lock s integritetom; isto za tip-only importe.

Acceptance: nijedan Edge import ne koristi goli @2; svaki pinat ili razrijesen kroz import
map + deno.lock; dva uzastopna deploya daju bajt-identican graf; smoke checkout create i
webhook potpis prolaze.

Rizik regresije: Nizak do srednji; pin na trenutno instaliranu 2.x je semanticki no-op,
rizik je samo krivi odabir verzije, ublazava ga deno.lock i staging test webhooka.

### P0-02c. IP hash pada na prazan salt u generate-report i redeem-referral-signup (P2, security-02)

Problem: ip_hash se u te dvije funkcije racuna sa saltom koji fallbacka na prazan string.
Nesoljeni SHA-256 IPv4 je reverzibilan brute-forceom cijelog 2^32 prostora, pa hash nije
prava pseudonimizacija. faculty-request isti problem svjesno rjesava izvodeci salt iz
service role kljuca.

Lokacija: generate-report/index.ts:27, redeem-referral-signup/index.ts:17
(IP_HASH_SALT ?? ''), helper _shared/hash-ip.ts:20; kontrast faculty-request/index.ts:
39-45.

Preporuka: preslikati derivaciju salta iz faculty-request u zajednicki hash-ip.ts (kad je
salt prazan, izvedi stabilan salt iz service role kljuca) ili ucini secret obaveznim
(fail-closed na startu).

Acceptance: uz nepostavljen IP_HASH_SALT, ip_hash je soljen istim izvedenim saltom u sve
tri funkcije; anti-fraud usporedba i dalje pogada.

Rizik regresije: Srednji; ako se salt promijeni nakon upisa hasheva, stari i novi se vise
ne poklapaju. Uvesti prije nego pocne pisanje IP hasheva u produkciji.

### P0-02d. Ostvrdnjavanje posture (P3): CORS, verify_jwt, .gitignore, RPC revoke

- data-flow-07: faculty-request ima CORS `*` i anoniman upis; suziti na vlastito porijeklo.
- security-04: config.toml nema [functions.<ime>] verify_jwt blokove; posture ovisi o
  ad-hoc deploy zastavicama. Zakovati u konfiguraciji.
- security-06: .gitignore ne ignorira obican .env (samo *.local); dodati .env i .env*.
  Purge RPC purge_old_report_generations (0009) i purge_faculty_request_ip (0011) nisu
  revocani od public/anon; dodati revoke. Posljedica danas bezopasna (RLS odbija promjenu),
  tek nepotrebno izlozena povrsina.

---

## P0-03. Admin izlozenost: verification.html u produkcijskom buildu

Izvor: routes-02 (P2). Prioritet: P0 (interna QA/admin konzola javno dostupna je ozbiljan
launch blocker).

Problem: verification.html (interna QA/verifikacijska konzola) izuzima se iz builda
iskljucivo kad je DEPLOY=1, a guard verify-deploy-dist se poziva samo iz netlify.toml
command lanca. Na hostu bez tog env-a ili sa skracenim lancem konzola zavrsi u dist/.
Konzola uz to uvozi source PDF-ove (~163MB po komentaru vite.config.ts).

Lokacija: vite.config.ts:48 (verification entry samo kad !isDeploy), :33-36 (komentar o
PDF uvozu), netlify.toml:14,19, scripts/verify-deploy-dist.mjs:54.

Napomena o razlici: ?setup=1 admin panel je zaseban i ISPRAVNO gejtan (app.ts:68
setupAllowed samo localhost ili localStorage 'lekta.admin'=1), pa taj panel nije javan.
Blokator je iskljucivo verification.html kao zaseban build entry.

Dokaz: vite.config.ts:48 uvrstava verification entry samo kad !isDeploy;
verify-deploy-dist.mjs:54 obara build ako dist/verification.html postoji, ali je taj skript
dio netlify command lanca; Cloudflare Pages je naveden kao alternativni cilj (netlify.toml
:8-9) gdje se env postavlja rucno.

Posljedica: javno dostupna interna admin/QA konzola i potencijalno teski privatni artefakti
na hostu koji ne postavi DEPLOY=1.

Preporuka: obrnuti logiku, produkcijski entry set NIKAD ne ukljucuje verification.html osim
uz eksplicitni interni flag; guard uciniti dijelom zajednickog build koraka, ne samo
netlify lanca; potvrditi u CI-u.

Acceptance: build na bilo kojem hostu bez internog flaga ne proizvodi dist/verification.html;
guard je dio zajednickog build koraka; lokalni QA i dalje ima pristup konzoli lokalno.

Rizik regresije: Srednji; dira build konfiguraciju, provjeriti da npm run check i lokalni
QA i dalje rade.

---

## P0-04. Privatni izvjestaji i telemetrija: curenje sadrzaja rada pri ozicavanju

Objedinjuje: data-flow-03 (P1, CONFIRMED), data-flow-04 (P2), data-flow-05 (P2),
data-flow-08 (P3).

Prioritet: P0 na dan ozicavanja reportEndpoint / Resend; danas dormant ali ozicen.

### P0-04a. Puni izvjestaj salje doslovne isjecke teksta rada (P1, CONFIRMED, data-flow-03)

Problem: privacy i "Obrada dokumenata" tvrde da se za puni izvjestaj salju samo
naslov/autor/struktura/stavke, a tekst rada ostaje u pregledniku. Klijent salje cijeli
currentResult kao analysisResult, ukljucujuci details.typoLint.findings[].excerpt (doslovni
isjecci do 60 znakova, do 200 nalaza), incompleteReferences[].text, legalCitationEngine.
problems i doslovne naslove.

Lokacija: src/report/report-client.ts:99-101 (payload), src/report/report.ts:187-192
(buildReportRequest vraca cijeli result bez ciscenja), src/analysis/analyze-docx.ts:94,
src/tools/typo-lint.ts:31,35 (EXCERPT_MAX=60), prijem
supabase/functions/generate-report/index.ts:68.

Dokaz: analyze-docx.ts:94 attacha details.typoLint={summary, findings:_typoAll.slice(0,200),
truncated} gdje svaki finding.excerpt nosi doslovni tekst rada; buildReportRequest vraca
{parsedStructure, analysisResult:result, workType} bez ciscenja. Protuslovi index.html:345
("Podaci automatske analize ne sadrze tekst rada"). UVJETNO: salje se samo kad je
reportEndpoint konfiguriran, a on je prazan po defaultu (app.ts:71), pa danas nema curenja.

Posljedica: doslovni fragmenti teksta rada i ime autora napustaju uredaj protivno izricitoj
tvrdnji; GDPR transparentnost i moguca osjetljivost sadrzaja. Postaje P0 na dan ozicavanja.

Preporuka: sanitizirati analysisResult prije slanja (ukloniti excerpt, poslati samo
summary/byKind/indeks odlomka; skratiti incompleteReferences[].text; izbaciti doslovne
isjecke iz legalCitationEngine.problems). buildFullReport na posluzitelju mora raditi bez
uklonjenih polja.

Acceptance: payload prema generate-report ne sadrzi doslovne isjecke teksta dokumenta (unit
test tvrdi da serijalizirani zahtjev ne sadrzi excerpt/sirovi tekst); privacy i ponasanje
uskladeni.

Rizik regresije: Srednji; mijenja se oblik payloada, pokriti report i golden testovima.

### P0-04b. Retencija (P2, data-flow-04)

Nema purge joba za document_slots (fingerprint drzi authorNorm = ime autora, label =
fragment naslova) ni brisanja reda faculty_requests (e-mail ostaje neograniceno). Purge
postoji samo za report_generations (0009) i nuliranje ip_hash u faculty_requests (0011).
Lokacija: supabase/migrations/0001_monetization.sql:28-29, 0011_faculty_requests.sql:14,
132-144, src/fingerprint/fingerprint.ts:54,62. Dodati pg_cron purge/anonimizaciju uz oprez
na garancijski prozor (guarantee_claims).

### P0-04c. Resend nije naveden izvrsitelj, podsjetnik nosi fragment naslova (P2, data-flow-05)

send-reminders salje preko api.resend.com (nije u popisu izvrsitelja, moguc transfer izvan
EU), tijelo nosi slot.label (fragment naslova rada). Lokacija:
supabase/functions/send-reminders/index.ts:34,74,160. Dodati mailer u popis izvrsitelja s
regijom i osnovom transfera; iz e-maila ukloniti label; potvrditi EU region/DPA prije
aktivacije.

### P0-04d. Error-kolektor salje User-Agent bez privole (P3, data-flow-08)

installErrorTracking (kad je errorEndpoint konfiguriran) salje UA i putanju bez privole,
dok je analitika striktno PII-gejtana. Lokacija: src/ui/app.ts:77 (ua:navigator.userAgent),
:122. Ne nosi tekst dokumenta (dobro). Dokumentirati u privacy (legitimni interes) ili
izostaviti UA.

---

## P0-05. Obrada datoteka i tezina isporuke na kriticnom putu

Objedinjuje: performance-01 (P1, CONFIRMED), performance-02 (P2), performance-03 (P2),
performance-04 (P2), performance-05 (P2), performance-06 (P2), performance-08 (P3),
ux-02 (P2), ux-07 (P2).

Prioritet: P0 za performance-01 (glavna mobilna poluga); ostalo P1/P2 unutar paketa.

### P0-05a. Glavni entry chunk 2,4 MB / 369 KB gzip, dominira ga podatkovni sloj (P1, CONFIRMED, performance-01)

Problem: jedini script na kriticnom putu index.html je index-*.js (2.478.762 B raw,
369.013 B gzip). To nisu prvenstveno kod nego podaci upeceni u bundle: verified-profiles.
json (1,45 MB) + svih 169 draftova (1,3 MB, puna provenijencija) + source-registry.json
(152 KB). Draftovi ulaze eagerno preko import.meta.glob(..., {eager:true}).

Lokacija: src/profiles/profile-registry.ts:49-51 (eager glob), :7 (verified-profiles),
src/ui/app.ts:20-21.

Dokaz: markeri draft provenijencije u glavnom chunku poklapaju se 1:1 s izvorom (verifiedBy
x1392, Risavi x2380); wc -c=2478762, gzip=369013.

Posljedica: parse/compile 2,4 MB JS-a (uglavnom objektni literali) trosi sekunde glavne
niti na slabom mobitelu prije interaktivnosti; najveca pojedinacna poluga za mobilne
performanse.

Preporuka: (a) makni draftove i source-registry iz runtimea pecenjem advisory liste u
buildu (P0-05b), (b) razdvoji verified-profiles.json na lagani indeks za selektore + puni
skup pravila po profilu koji se dinamicki ucita, (c) ukljuci build.json.stringify
(P0-05c). Cilj glavni chunk ispod ~150 KB gzip.

Acceptance: glavni entry chunk (gzip) padne barem 40 posto; draft provenijencija ima 0
pojava u glavnom chunku; selektori, analiza i advisory demotion nepromijenjeni (golden i
UI smoke zeleni); npm run check zelen.

Rizik regresije: Srednji; dinamicko ucitavanje pravila po profilu mijenja redoslijed
dostupnosti pa currentProfile() i applyScoredAdvisory treba asinkrono prilagoditi (utrka
odabir vs pristigla pravila). Golden stiti jezgru; UI grana treba smoke za
odaberi-pa-odmah-pokreni.

### P0-05b. Draftovi i source-registry salju se samo radi determinsticke advisory liste (P2, performance-02)

Jedina runtime uporaba je applyScoredAdvisory koja izracuna scored checkId-jeve i upise
kratku advisoryDimensions listu. Ispeci mapu profileId -> checkId-jevi u buildu; draftovi i
source-registry ispadaju iz javnog grafa. Lokacija: src/ui/app.ts:327,
src/profiles/advisory-demotion.ts:36-54, src/verification/published-rules.ts:29-46.

### P0-05c. JSON kao objektni literali umjesto JSON.parse stringa (P2, performance-05)

vite.config.ts ne postavlja build.json.stringify; V8 sporije parsira velike objektne
literale. Dodati build:{json:{stringify:true}}. Lokacija: vite.config.ts:67-70. Najjeftiniji
dobitak.

### P0-05d. DOCX/PDF motor eager na landingu (P2, performance-03)

analyzeDocx dolazi u glavni chunk preko inline fallbacka (analyze-docx-client.ts:12), pdf
preflight staticki uvezen (app.ts:16). Motor je duplo isporucen (glavni chunk + worker).
Pretvoriti inline fallback u dinamicki import; lijeno uciti analizator na prvu interakciju.

### P0-05e. Nema prekida analize (P2, performance-04)

#progressView nema gumb Prekini; worker se gasi tek pri novoj analizi. Dodati Prekini +
Escape koji poziva terminate(). Lokacija: src/ui/app.ts:449-457, index.html:329,
src/analysis/analyze-docx-client.ts:35.

### P0-05f. Cache i memorija (P2/P3, performance-06, performance-08)

public/_headers nema Cache-Control za /assets/* (hashirani, smiju immutable godinu);
analyza cita cijelu datoteku u memoriju (moguc OOM na graniznom dokumentu na slabom
mobitelu). Dodati immutable cache za assete + kratki za HTML; sniziti mobilni cap ili
gejtati po deviceMemory, inkrementalni progress. Diranje analyzeDocx tek uz zeleni golden.

### P0-05g. Jak default profil i nesklad limita (P2, ux-02, ux-07)

Default je tvrdo FPZG/Politologija/Diplomski; auto-detekcija radi samo za unizg, pa
non-unizg korisnik tiho dobije FPZG-specifican rezultat. Opis dropzone tvrdi 50 MB, a
mobilni efektivni cap je 20 MB. Lokacija: src/ui/app.ts:278,164,149,208,534,147,
index.html:288. Ublaziti default ili prisiliti potvrdu profila prije analize; prikazati
stvarni efektivni limit po uredaju.

---

## P0-06. Pravne stranice, 404 i tekst povjerenja

Objedinjuje: ux-01 (P1, CONFIRMED), ux-03 (P2), ux-04 (P2), routes-04 (P2), routes-06 (P3)
+ seo-07 (P3, isti 404), routes-07 (P3), routes-03 (P2) + seo-03 (P2, isti canonical),
seo-02 (P2), seo-04 (P2), seo-05 (P2), seo-06 (P3) + routes-08 (P3, favicon), seo-08 (P3),
routes-05 (P3).

Prioritet: P0 za tekstualne stavke koje diraju garanciju i ocekivanja (ux-01, ux-03,
ux-04, routes-04); ostalo P2/P3 SEO/higijena.

### P0-06a. Nema izjave da Lekta nije provjera plagijata (P1, CONFIRMED, ux-01)

Problem: rijec "plagijat" ne postoji na pocetnoj; student "provjeru rada" cesto vezuje uz
Turnitin. Grep index.html za plagijat|Turnitin|slicnost|originaln = 0. Lokacija:
index.html:341 (FAQ, 5 pitanja, nijedno o plagijatu), :281, :264.

Posljedica: korisnik ocekuje izvjestaj o slicnosti, dobije tehnicki audit, osjeti se
prevareno; kod placenih tarifa izravan uzrok povrata.

Preporuka: vidljiva izjava u hero ili prvom redu FAQ-a ("Lekta provjerava oblikovanje,
strukturu i citiranje. Nije provjera plagijata ni slicnosti") + FAQ pitanje "Provjerava li
Lekta plagijat?" s jasnim Ne.

Acceptance: na pocetnoj (prije uploada) i u FAQ-u postoji eksplicitna recenica da alat nije
provjera plagijata/slicnosti/originalnosti.

Rizik regresije: Vrlo nizak (staticki tekst).

### P0-06b. Preobecavanje spremnosti vs garancija (P2, ux-03, ux-04)

Pecat "Spremno" za >=90 uz hero "Je li rad spreman za predaju?" sugerira potvrdu spremnosti;
cjenovni disclaimer kaze "Usluga potvrduje tehnicku uskladjenost" (glagol certificira).
Lokacija: index.html:230,263,340, src/ui/app.ts:566,128. Precizirati pecat u tehnicki okvir
("Tehnicki uredno"/"Oblikovno spremno") uz caveat; zamijeniti "potvrduje" s "procjenjuje/
provjerava" na oba mjesta.

### P0-06c. Pravila kupnje i povrata nisu u footeru (P2, routes-04)

Generira se 7 pravnih stranica, ali glavni footer izostavlja pravila-povrata.html; footeri
alata linkaju samo 3 od 7. Za uslugu s naplatom uvjeti povrata trebaju biti trajno
dostupni. Lokacija: index.html:344, citat.html:327-329, alati.html:183-185,
generate-legal-pages.mjs:69-72. Dodati poveznicu na Pravila kupnje i povrata u sve footere.

### P0-06d. 404 i redirecti (P3, routes-06 + seo-07)

netlify.toml nema [[redirects]], nema public/_redirects ni 404.html; svaki clean URL ili
typani link pada na genericki Netlify 404. Dodati public/404.html s brendom i navigacijom;
po zelji redirect pravila za clean URL varijante.

### P0-06e. SEO higijena (P2/P3)

- routes-03 + seo-03: canonical i og:url nedostaju na alati/citat/izjava/literatura/
  naslovnica; landing bez OG-a.
- seo-02: staticke citatne stranice su tanki near-duplikati, caveat je JS-only, bez OG/
  JSON-LD; rizik thin/doorway. Upisati diferencirajuci sadrzaj po fakultetu u staticki HTML.
- seo-04: landing_usporedba.html bez canonical/OG/Twitter/JSON-LD (u sitemapu je).
- seo-05: nijedna stranica nema og:image; dodati default 1200x630.
- seo-06 + routes-08: favicon samo na indexu; nema /favicon.ico; dodati rel=icon u
  zajednicki head i generatore.
- seo-08: sitemap poboljsanja (index, lastmod, ujednacen kanonski oblik).
- routes-05: 184 SEO stranice bez ijedne interne poveznice (nulti link equity); dodati
  poveznice iz alati.html.
- routes-07: pravne poveznice u index footeru su JS gumbi, ne <a href> (nulti link equity,
  ne rade bez JS). Uciniti ih pravim <a> uz progressive enhancement.

---

## P0-07. Naplata

Izvor: ux-10 (P3) + preklapanje s P0-02b (dependencies-01) koji je primarno tamo obraden.

Prioritet: P0 kao gate (naplata se ne pali dok P0-02b nije zatvoren), sam ux-10 je P3.

### P0-07a. Supply chain u placanju

Vidi P0-02b: create-checkout (service_role + Lemon Squeezy checkout) i webhook-mor
(verifikacija potpisa + izdavanje entitlementa) dohvacaju klijent s esm.sh bez pina. Ovo je
tvrdi preduvjet za ukljucivanje naplate.

### P0-07b. Cjenovni sum "USKORO" u soft-launchu (P3, ux-10)

Cjenik prikazuje "od 3,99 EUR" i "od 39 EUR" s bedzem USKORO iako je sve besplatno, sto
sugerira da je besplatna provjera ogranicena. Lokacija: src/ui/app.ts:123,128,
index.html:340. U soft-launchu jasnije istaknuti da je automatska provjera besplatna i
neogranicena.

---

## P1 (izvan P0 paketa): pristupacnost primarnog toka

Ovi su P1 CONFIRMED i diraju najvazniji korisnicki tok (ucitaj pa analiziraj), ali ne
ulaze u sigurnosne/konfiguracijske P0 pakete. Blokatori su za inkluzivan launch.

### P1-A11Y-01. Nijedna stranica nema skip link (P1, CONFIRMED, accessibility-01)

Svaka stranica ima ljepljivu navigaciju sa 6 do 8 poveznica prije glavnog sadrzaja, bez
"Preskoci na sadrzaj" kao prvog fokusabilnog elementa (WCAG 2.4.1 A). Lokacija:
index.html:236-258, citat.html:110-147 i sve ostale stranice. Dodati vidljiv-na-fokus skip
link kao prvi element u <body> preko src/shared/ui-boot.ts; osigurati da cilj ima id.

Acceptance: prvi Tab na svakoj stranici fokusira vidljivi skip link koji Enterom pomice
fokus na glavni sadrzaj; provjereno u light/dark/forced-colors. Rizik regresije: vrlo nizak.

### P1-A11Y-02. Fokus se gubi nakon analize; rezultat se ne najavljuje (P1, CONFIRMED, accessibility-02)

runAnalysis sakriva #wizardView (s fokusiranim gumbom Analiziraj) pa fokus pada na <body>;
renderResult otkriva #resultView bez premjestanja fokusa; #resultView nije ziva regija.
Citac ekrana ne dobiva obavijest da je rezultat spreman (WCAG 2.4.3, 4.1.3). Lokacija:
src/ui/app.ts:449-457,566,466, index.html:329,330. Dati #resultTitle tabindex=-1 i .focus()
uz scrollIntoView, jednokratna SR-only najava; isto u runDemo.

Acceptance: nakon analize i demo prikaza fokus je na naslovu rezultata, citac ga procita,
Tab nastavlja unutar rezultata. Rizik regresije: nizak (koristiti preventScroll).

Napomena: ostali a11y nalazi (accessibility-03 do 14, P2/P3) su u PRODUCTION_BACKLOG.md.

---

## Provjereno, nije problem (REFUTED, izbaceno iz zakljucaka)

- architecture-01 (P1, REFUTED): placeholder stub bez sadrzaja (title="Test", location="l").
  Nema tvrdnje koja se moze provjeriti; nema datoteke ni linije. Ignorirano.

## Dijelom osporeno (impact korigiran)

- seo-01 (P1 -> realno P3, PLAUSIBLE): nekonzistentan default origin je STVARAN i ostaje u
  P0-01 kao higijena/footgun, ali tvrdnja da je "vec utisnuto u commitani dist" i da je
  na 275 zivih stranica je osporena: dist/ je u .gitignore (0 tracanih datoteka), a
  netlify.toml:22 postavlja LEKTA_SITE_ORIGIN pa zivi deploy dobiva ispravan origin. Nema
  zive stete; ostaje latentni footgun za build bez env varijable (npr. Cloudflare Pages).
