# LEKTA_CURRENT_STATE_AUDIT.md

Neovisni audit stvarnog stanja proizvoda prema zadatku iz `LEKTA_STRATESKI_AUDIT_I_PLAN.md`.

Datum: 2026-07-13. Grana: `redesign-korektorski-stol` (14 commita ispred mastera, samo lokalno).
Metodologija: 12 paralelnih auditnih agenata po dimenzijama (arhitektura, docx analiza, repair,
pdf, rules engine, besplatni alati, monetizacija, privatnost, testovi i deploy, UX, python
pipeline, postojeca dokumentacija) + adversarijalna verifikacija kljucnih tvrdnji (skeptik
agenti s protudokazima) + rucna inline verifikacija nosivih tvrdnji. Nijedna tvrdnja "funkcija
radi" nije prihvacena bez pracenja lanca event handler, poziv funkcije, generiranje izlaza.

Povezani dokumenti: [LEKTA_COMPETITIVE_POSITIONING.md](LEKTA_COMPETITIVE_POSITIONING.md),
[LEKTA_PRODUCT_ROADMAP.md](LEKTA_PRODUCT_ROADMAP.md),
[LEKTA_IMPLEMENTATION_BACKLOG.md](LEKTA_IMPLEMENTATION_BACKLOG.md),
[LEKTA_90_DAY_PLAN.md](LEKTA_90_DAY_PLAN.md). Ovaj audit NADOPUNJUJE (ne zamjenjuje)
produkcijski audit iz 2026-07-11 (`docs/audit/LAUNCH_BLOCKERS.md`) i strateske odluke iz
`docs/roadmap/CO_PILOT_STRATEGY.md`.

---

## 1. Izvrsni sazetak

Najvazniji nalaz cijelog audita: **strateska specifikacija znatno podcjenjuje stvarno stanje
proizvoda**. Vecina onoga sto `LEKTA_STRATESKI_AUDIT_I_PLAN.md` trazi kao "ciljani proizvod"
vec postoji u kodu, testirano i funkcionalno:

- Repair Engine (AutoFix v1) postoji i radi end-to-end: korisnik STVARNO preuzima popravljeni
  .docx (Blob + a.click, `src/ui/repair-panel.ts:107-215`), s prije/poslije changelogom,
  dubinskim ciscenjem (Feature B) i ozbiljnim sigurnosnim mehanizmima (66 zelenih testova).
- Rules engine je daleko iznad zahtjeva specifikacije: 344 verificirana profila preko 106
  sastavnica u 33 institucije, 1461 granularni ruleEntry, 1212 bodovanih pravila, 170/170
  izvora snapshotirano, strogi verifikacijski gate s 13+ kodova gresaka.
- Server-autoritativni paywall (teaser/full, slotovi, entitlementi, Lemon Squeezy checkout,
  webhook s HMAC potpisom) je kompletan u kodu, ali INERTAN: endpointi su prazni, backend
  naplate nije deployan, pa zivi korisnik dobiva sve besplatno (namjerni soft-launch).
- Analiza je dokazano 100% lokalna (nula mreznih poziva u analitickom stablu), a glavni
  privatnosni nalaz proslog audita (izvjestaj nosi isjecke teksta) je saniran
  (`sanitizeAnalysisResult`, `src/report/report.ts:214`).

Pravi problemi su drugdje: (1) javna komunikacija NEGIRA postojeci AutoFix (FAQ i JSON-LD
kazu da automatsko formatiranje "tek dolazi"), (2) strukturne AutoFix operacije (numeriranje
stranica od Uvoda, sectPr, TOC, Heading stilovi) postoje samo kao DETEKCIJA, ne popravak,
(3) naplata ceka iskljucivo vlasnicke korake (Supabase deploy, Lemon Squeezy tajne), (4) novi
Python `lekta-pipeline` (forenzika izvornosti) je strateski osjetljiv i zahtijeva pazljivo
pozicioniranje, (5) nijedan e2e/browser test ne pokriva glavni tok.

## 2. Klasifikacija funkcionalnosti (verificirano)

Legenda statusa: FUNKCIONALNO (radi end-to-end), DJELOMICNO (radi uz bitna ogranicenja),
DEMO (samo prikaz), PLANIRANO (kod/spec postoji, nije spojeno), RIZICNO, NEPOTREBNO.

### 2.1. Analiza dokumenta (jezgra) : FUNKCIONALNO

- Upload tok potpun: file input (.docx), drag&drop, browse, tipkovnica; validacija ekstenzije
  i velicine po uredjaju (12/20/50 MB po deviceMemory); `src/ui/app.ts` bind() ozicen u init().
- Analiza u Web Workeru s inline fallbackom i gumbom Prekini; jezgra `analyzeDocx`
  (`src/analysis/analyze-docx.ts`) parsira ZIP/OOXML sa styles kaskadom, fusnotama, sekcijama,
  zaglavljima; ~40 provjera u 4 bodovane kategorije (formatting, structure, citations,
  elements) + informativni slojevi (typoLint, registerLint, opseg).
- Ocjena = round(earned/max*100) samo nad bodovanim provjerama; makeCheck clampa earned;
  max=0 forsira "Informativno" status (verificirano adversarijalno, 2x POTVRDJENO).
- Dva prava citatna enginea: autor-godina (dvosmjerni matching citata i literature, aliasi,
  lokatori) i pravni fusnotni engine (13+ vrsta izvora, op. cit./Ibid./id. razrjesavanje, NN,
  sudska praksa). Ovo je najteze reproducibilan dio proizvoda.
- 100% lokalno: nula fetch/XHR/sendBeacon u `src/{analysis,docx,audits,citations,scoring}`.
- Sigurnosne granice: streaming dekompresijski cap (zip bomba), DTD odbijanje, 300k odlomaka
  max, escapeHtml/safeHref na izlazu, CSP sa sha256 u `netlify.toml`.
- Golden harness aktivan: 6 realnih .docx fixtura (FER, FFZG, GRF, MEF, PMF, TTF), snapshoti
  commitani, worker putanja pokrivena istim @xmldom/xmldom parserom.

Granice parsera (RIZICNO, dokumentirati): endnotes se ne parsiraju (pravni rad s endnotama
dobije lazni fail fusnota); PAGE/TOC detekcija regexom nad sirovim XML-om (moguc lazni
pozitiv); broj stranica samo iz docProps/app.xml (moze biti zastario, zato nebodovano);
mc:AlternateContent moze dvostruko brojati tekst u novijim Word elementima.

### 2.2. Repair Engine / AutoFix : FUNKCIONALNO (uzak opseg), strukturni dio NE POSTOJI

Sto danas radi (verificirano, 3x POTVRDJENO + 1 korekcija brojke testova):

- 5 fixera: margine, format papira, font + velicina, prored, poravnanje
  (`src/repair/fixers.ts:126-266`), svi nad word/document.xml i word/styles.xml preko
  regex-krpanja (`src/repair/xml-patch.ts`), plus Feature B dubinsko ciscenje izravnog
  formatiranja na razini runova (`src/repair/run-level.ts`).
- Preuzimanje popravljenog .docx STVARNO radi: `repair-panel.ts:107-215` (Blob,
  createObjectURL, a.download, odgodjena revokacija); zip-codec radi bit-identican round-trip
  s binarnim media zapisima (`src/repair/zip-codec.ts`).
- Stavke popravka dolaze iz pecene repair-map.json: 162 profila, 784 zapisa, gejtano
  fixerId-jem i verificiranim pravilima.
- Sigurnosni mehanizmi: backstop gating (fail-safe bit-identican no-op), maske za
  oMath/track-changes/w:del, w:sdt naslovnice i tekstualni okviri preko balancedRanges,
  simbolski fontovi izuzeti, Normal-konflikt gating. 66 testova zeleno (47 u src/repair + 19
  panel/items; verifikacijski agent ih je pokrenuo).
- U soft-launchu repair je BESPLATAN svima; s konfiguriranim reportEndpointom postaje teaser
  iza paywalla (kod postoji, gejt inertan).

Sto NE radi: nema automatske ponovne analize popravljenog dokumenta (uputa "ucitaj ponovno");
sve strukturne operacije samo se DETEKTIRAJU. Detaljna matrica u poglavlju 3.

### 2.3. PDF obrada : FUNKCIONALNO kao preflight, generiranje NE POSTOJI (namjerno)

- `src/pdf/pdf-preflight.ts` je vlastita byte-level heuristika bez PDF biblioteke: %PDF
  zaglavlje, %%EOF, /Encrypt, PDF/A oznaka (XMP pdfaid + GTS_PDFA), broj stranica, A4 udio,
  ugradjeni fontovi, JavaScript/AcroForm, Title/Author; cap skeniranja 32 MB. Wiring potpun:
  #pdfInput (cap 100 MB), lazy chunk, rezultat u tabu Spremnost za predaju; error note postaju
  blokatori submission gatea (4x verificirano).
- Granice: regex nad latin1 bajtovima ne vidi Flate-komprimirane streamove (pretrazivost
  teksta gotovo uvijek 0 na realnim PDF-ovima); PDF dodan NAKON analize ne pokrece preflight
  (stale prikaz do ponovne analize).
- DOCX u PDF u pregledniku NE POSTOJI i ne treba ga graditi: bez Word layout enginea svaki JS
  render daje drugaciji prijelom pa bi "finalni PDF" lagao o izgledu (4x verificiran zakljucak).
  PDF/A konverzija lokalno takodjer nerealna (veraPDF je Java, Ghostscript WASM je desetci MB).
- PDF/A zahtjev u podacima postoji samo za FPZG i hardkodiran je u app.ts umjesto kao polje
  profila (dug: podatkovno polje `requiresPdfA`).

### 2.4. Rules engine i profili : FUNKCIONALNO, iznad zahtjeva specifikacije

- 344 verificirana profila (+3 pravne katedre), 106 sastavnica, 33/37 institucija kataloga;
  1461 ruleEntry u 169 draft datoteka, 1212 scored, 1312 machineCheckable, 199 advisory;
  170/170 izvora snapshotirano. Readiness 100 postize 174/344 profila (runtime formula,
  `app.ts:301`).
- ruleEntry shema pokriva iz specifikacije: ID, kategoriju, strojni uvjet
  (checkId+value+machineCheckable), izvor (sourceId+quote), sourcePage (1395/1461), datum i
  status verifikacije, auto-popravak (fixerId gating). NEDOSTAJE: verzija pravila, ozbiljnost,
  korisnicka poruka po pravilu, akademska godina VAZENJA (postojeci academicYear znaci godinu
  verifikacije i prazan je).
- Statusi: shema definira 6, u podacima zive 3 (verified 1212, advisory 199, draft 50).
- Verifikacijski gate strog i globalno testiran: scored-not-derivable, orphan-source,
  source-no-snapshot, source-hash-drift, binding-no-review, stale (svjezina 24 mj)...
- Scored/advisory demotion LIVE preko pecene advisory-map.json (212 profila, 695 demotiranih
  dimenzija); LIGHT/HEAVY split funkcionalan i drift-testiran (glavni chunk 88 KB gzip).
- KLJUCNI DRIFT (4x POTVRDJENO + rucno verificirano): Option A `effectiveRules` NIJE ozicen u
  zivi engine. `currentProfile` cita `definition.rules` izravno; compileProfile se koristi samo
  u verifikacijskoj infrastrukturi. Ponasanje je danas identicno jedino zato sto faithfulness
  test drzi effectiveRules deep-equal rules. CLAUDE.md tvrdnja o wiringu je zastarjela.
  Posljedica: migracija "obrisi iz rules kljuceve koji su u ruleEntries" (backlog 2) SLOMILA bi
  zivi engine da se izvede prije wiringa.
- Korisnik vidi izvore i datum provjere na razini PROFILA (kartica + rezultat), ali ne po
  pojedinom pravilu (to je samo u internoj konzoli). Specifikacija trazi po-pravilo prikaz.

### 2.5. Besplatni alati : FUNKCIONALNO (5 alata + SEO sloj), 10 alata iz spec. nedostaje

Postojece (svi s pravim event handlerima, izlazom i testovima):

| Alat | Sto radi | Vraca datoteku? | CTA prema naplati |
|---|---|---|---|
| citat.html | generator citata (100+ institucija, vjerno po fakultetu) + bulk parser literature | ne (tekst/copy) | da, dvostruki |
| literatura.html | uredjivanje/formatiranje popisa literature, duplikati, rupe | DA (.docx, visece uvlacenje) | da |
| naslovnica.html | generator naslovnice, 198 verificiranih predlozaka, provenijencijski badge | DA (.docx) | da |
| izjava.html | izjava o izvornosti, date picker | DA (.docx) + print | da |
| kartice.html | brojac kartica real-time (A4 osnovica 2600) | ne (brojka) | da |
| dist/alati/** | build-time SEO stranice: 160 URL-ova u sitemap-alati.xml, po fakultetu i stilu | n/a | da |

Vlastiti OOXML writer (docx-writer s rels popravkom koji Word stvarno postuje) je zajednicki
temelj za sva tri .docx generatora.

Nedostaje kao ZASEBNI javni alat (najveci neiskoristeni SEO/akvizicijski potencijal, motori
vecinom vec postoje u analizatoru): numeriranje stranica od Uvoda, automatski sadrzaj,
numeriranje poglavlja, uklanjanje praznih stranica, popis slika i tablica, provjera
naslovnice, PDF preflight kao javni alat, provjera naziva datoteke, Word cistac (postoji kao
repair, nije standalone), fakultetska checklista (postoji samo kao tab analizatora).

### 2.6. Monetizacija, auth, premium gating : KOD KOMPLETAN, NAPLATA INERTNA

- Klijentski paywall (TEASER_SAMPLE=2, vodeni zig, zakljucane tablice), checkout prema Lemon
  Squeezyju s consent gateom, garancijski tok, slotovi po otisku dokumenta (re-check istog
  rada besplatan), Thesis Pass SKU (migracija 0017): SVE postoji u kodu i testirano je.
- Na zivom siteu naplata NIJE aktivna (verificirano protiv produkcije): reportEndpoint i
  checkoutEndpoint prazni pa `paidOffersLive()` = false; cjenik "USKORO"; na zivom Supabase
  projektu create-checkout, generate-report, webhook-mor i file-guarantee-claim vracaju 404,
  tablica products ne postoji. Zive su samo faculty-request i send-reminders funkcije.
- Auth je ZIV: supabaseUrl + anon key hardkodirani (`app.ts:77`), GoTrue OTP radi na produkciji.
- Cijene definirane na 4 mjesta: automatika konzistentna (3,99 / 5,99 / 9,99 / 24,99 EUR po
  vrsti rada), ali rucne usluge se RAZILAZE: klijent 39/69/99 EUR vs products seed
  premium_human 49 EUR. Prije go-livea treba jedan izvor istine (products tablica).
- Postoji i stariji narudzbeni tok koji nista ne naplacuje (Netlify forma lekta-orders +
  opcionalni payment link; neaktivan pada na lokalni JSON download): kandidat za uklanjanje
  ili jasno odvajanje od automatske naplate.
- Aktivacija naplate je OWNER-GATED, ne kodna: koraci u `docs/GO_LIVE_NAPLATA.md` (9 koraka).

### 2.7. Privatnost i sigurnost : FUNKCIONALNO I ISKRENO, uz 3 nijanse

- Automatska analiza lokalna (potvrdjeno); marketing copy nakon proslog audita uskladjen
  (tvrdnje ogranicene na automatsku provjeru); puni izvjestaj prolazi kroz
  `sanitizeAnalysisResult` + `redactParagraphQuotes` (`src/report/report.ts:191-214`, rucno
  verificirano) pa doslovni isjecci teksta NE idu na server: glavni P0 nalaz proslog audita
  je zatvoren.
- Edge funkcije sanirane: send-reminders fail-closed iza REMINDER_CRON_SECRET (rucno
  verificirano, `send-reminders/index.ts:30`), esm.sh importi pinani (@supabase/supabase-js@2.110.2),
  ip_hash soljen.
- Zivi mrezni pozivi u produkciji: samo Supabase auth (OTP), waitlist faculty-request i
  izvedeni referral endpoint. Analytics/error/report/checkout endpointi prazni pa inertni;
  analitika dvostruko gejtana (endpoint + consent), error tracking sanitiziran bez UA.
- Nijanse za popravak: (a) waitlist signal se salje automatski PRI PRIKAZU trake, bez klika,
  i nosi JWT prijavljenog korisnika iako se predstavlja anonimnim; (b) localStorage povijest
  sprema docFingerprint s normaliziranim naslovom, autorom i naslovima poglavlja u plaintextu,
  vise nego sto copy sugerira; (c) produkcijski config se cita iz localStorage kljuca
  `lekta.production.v2.1` bez gatea na PRIMJENU (setupAllowed stiti samo UI panel): lokalni
  XSS/extension vektor za preusmjeravanje endpointa.

### 2.8. Testovi, CI, deployment : FUNKCIONALNO, e2e rupa

- 1636 testova u 125 datoteka, svi zeleni (vitest exit 0, 473 s); tsc --noEmit prolazi.
- CI: 3 GitHub workflowa (check, security-audit tjedni cron, docx-smoke), master zelen.
- Deploy: netlify.toml build lanac (vite build, pa generate-citation-tools, pa
  generate-legal-pages, pa verify-deploy-dist fail-fast guard); dev konzola safe-by-default
  (DEV_CONSOLE=1 opt-in + assertSafeBuild); deploy invarijante pokrivene testovima (CSP hash,
  dev-strip, origin).
- Rupe: NULA e2e/browser testova (glavni tok upload-worker-render-paywall pokriven samo
  module-eval smoke testom; pravi Worker se u testovima nikad ne pokrece); repair nema golden
  test nad realnim fixturama (samo unit); staging ne postoji; aktualna redesign grana (14
  commita, ukljucivo repair Feature B) nikad nije prosla CI jer je samo lokalna.

### 2.9. UX i pozicioniranje : DOBRO, s jednim velikim raskorakom

- Novi korisnik razumije proizvod: H1 "Je li tvoj rad spreman za predaju? Lekta ti kaze prije
  mentora", hero animacija prije/poslije, demo video 26 s, 3 javna primjera izvjestaja,
  auto-detekcija fakulteta/studija/vrste rada iz naslovnice STVARNO radi; vrijeme do prve
  vrijednosti minimalno (primjer izvjestaja bez ijednog polja; vlastiti rad = upload + 1 klik).
- Rezultat se daje PRIJE ikakvog placanja (soft-launch); signali povjerenja implementirani
  (izvor + datum provjere po profilu, coverage brojaci).
- VELIKI RASKORAK (rucno verificirano u index.html:29 JSON-LD i index.html:1489 FAQ):
  na pitanje "Moze li aplikacija automatski ispraviti cijeli Word dokument?" FAQ odgovara
  "Ova verzija radi audit... Potpuno automatsko formatiranje bit ce zaseban modul", a
  Repair Engine s preuzimanjem popravljenog .docx VEC POSTOJI i besplatan je. Hero prodaje
  samo dijagnozu; repair panel je zakopan u cetvrtom tabu rezultata. Preporuceni smjer
  "Ucitaj rad. Preuzmi verziju spremnu za predaju." je tehnicki vec izgraden, samo ga
  komunikacija negira.
- Manje: distinkcija "nije plagiarism checker" postoji na 4 mjesta ali ne u prvom ekranu;
  meta description tvrdi pokrivenost "FPZG i Pravni" iako baza pokriva 33 institucije;
  KS nav izgubio link na Usporedbu i Alati dropdown (regresija ranijeg fixa a4bdec2).

### 2.10. lekta-pipeline (Python, netrackan) : FUNKCIONALAN CLI, STRATESKI OSJETLJIV

- Zaseban Python paket s vlastitim gitom: forenzicka provjera izvornosti .docx (lekta-check
  CLI, nula ovisnosti, 34 pytest testa zelena, HTML/JSON izvjestaj). Moduli m1 (metadata,
  RSID povijest, skriveni tekst, zero-width, homoglifi, stilovi) i m2 (Vancouver cross-check
  citata, mrezna verifikacija referenci Crossref/OpenAlex/PubMed, hvata halucinirane) gotovi;
  m3 web slicnost stub; m4-m7 samo specifikacije.
- Privatnost: cijeli tekst rada se NIKAD ne salje; van idu samo bibliografski unosi (do 280
  znakova) i naslovi referenci.
- Dizajn "signali, ne presuda" je ispravan, ali kolizija sa strategijom je ublazena, ne
  uklonjena: (a) fiksirana founder odluka za Fazu 4 (MVP = cross-lingual + AI signal, BEZ
  istojezicnog plagijata) proturjeci pipeline roadmapu m3/m4 koji gradi upravo istojezicnu
  web/korpus slicnost; (b) forenzicke heuristike (RSID_FEW_SESSIONS, META_TOTALTIME) nose
  rizik laznih optuzbi za legitimne workflowe (LibreOffice, Google Docs export); (c) dvosjekla
  ostrica: mentoru detekcija tragova, studentu preporuka kako ih ocistiti; (d) institucijska
  batch obrada (exit kod 2 za CI) otvara GDPR pitanja druge kategorije ispitanika.
- Dvorazinski tier dizajn (student/mentor, TotalTime izvan studentskog izvjestaja) vec
  postoji u motoru: dobra osnova za Expert/institucijski proizvod iza privole.

### 2.11. Postojeca dokumentacija : ZRELA, novi dokumenti je nadopunjuju

- Launch gate definiran (LAUNCH_BLOCKERS): nije spremno za naplatu ni javnu garanciju dok se
  ne zatvore P0-01..07 + P1; AUDIT_STATUS dokazuje da su SVE code-doable stavke ZATVORENE u
  kodu; preostali blokatori su iskljucivo vlasnicki (Supabase tajne, Lemon Squeezy, Resend
  DPA, pravni subjekt, PITR, primjena migracija).
- Fiksirane odluke koje ovi dokumenti postuju: (A) lokalno + cloud opt-in, (B) registar samo
  ne-generativne zastavice, (C) naplata po dokumentu + Thesis Pass, bez retail pretplate;
  istojezicni plagijat se NAMJERNO ne gradi (Turnitin/Srce besplatan).
- Manje nekonzistentnosti: VISION.md monetizacijska sekcija jos spominje pretplatu (proturjeci
  odluci C); CO_PILOT_STRATEGY referencira nepostojeci `lekta-strateski-plan.md`; PRE_LAUNCH
  checkboxovi nisu oznaceni iako su code stavke gotove; CLAUDE.md ima 2 zastarjele tvrdnje
  (app.ts ~517 redaka; effectiveRules wiring).

## 3. AutoFix matrica izvedivosti (19 operacija)

Verificirano nad kodom; "rizik" = rizik ostecenja dokumenta.

| Operacija | Postoji | Lokalno izvedivo | Rizik | Nacin | Sto nedostaje |
|---|---|---|---|---|---|
| Margine | DA (fixer) | da | nizak | auto uz potvrdu | umetanje w:pgMar kad ga sekcija nema |
| Font + velicina | DA (fixer + deep) | da | nizak | auto uz potvrdu | theme-only docDefaults; w:cs namjerno netaknut |
| Prored | DA (fixer + deep) | da | nizak | auto uz potvrdu | umetanje w:spacing kad ga Normal nema; fusnote |
| Format papira | DA (fixer) | da | nizak | auto uz potvrdu | - |
| Poravnanje | DA (fixer + deep) | da | nizak | auto uz potvrdu | - |
| Standardizacija odlomaka/uvlacenja | DJELOMICNO (poravnanje da; razmak/uvlake samo analiza) | da | srednji | auto uz potvrdu | fixer za before/after=0 i uvlake; profili nemaju ciljne vrijednosti uvlacenja |
| Visak razmaka i prazni odlomci | NE (samo detekcija) | da | srednji | auto uz potvrdu | prvi zahvat u TEKST (w:t, brisanje w:p); nova klasa zastita |
| Numeriranje stranica od Uvoda | NE (samo detekcija) | da | visok | auto uz potvrdu | fixer: prijelom sekcije prije Uvoda + footer PAGE polje + rels/ContentTypes; politika apply-fixers dira samo document.xml i styles.xml |
| Prijelomi odjeljaka (sectPr) | DJELOMICNO (krpanje postojecih; umetanje ne) | da | visok | auto uz potvrdu | umetanje novog w:sectPr na semanticki ispravno mjesto |
| Rimsko pa arapsko numeriranje | NE (samo detekcija) | da | visok | auto uz potvrdu | pgNumType fmt po sekcijama; lancano ovisi o sectPr |
| Heading 1-3 stilovi | NE | tesko | visok | samo prijedlog | klasifikacija "koji odlomak je naslov koje razine" je semanticka odluka |
| Viserazinsko numeriranje poglavlja | NE | tesko | visok | samo prijedlog | generiranje numbering.xml + numPr; ovisi o Heading stilovima |
| Automatski sadrzaj (TOC polje) | NE (samo detekcija) | da | srednji | auto uz potvrdu | umetanje TOC polja s dirty flagom (Word ga izracuna pri otvaranju); brisanje rucnog sadrzaja rizicno |
| Captions tablica i slika | NE | tesko | srednji | samo prijedlog | sadrzaj captiona semanticki nemoguc automatski; moguc samo skeleton |
| Popis slika / popis tablica | NE (samo detekcija) | da | srednji | auto uz potvrdu | TOC \c polja; smisleno tek uz Caption mehanizam |
| Naslovnica | DJELOMICNO (zaseban generator .docx, 198 predlozaka) | tesko za umetanje | visok | samo prijedlog | spajanje dva docx-a (stilovi, sectPr, rels konflikti) |
| Izjava o izvornosti | DJELOMICNO (zaseban generator) | da | srednji | samo prijedlog | umetanje u rad; obvezni obrazac fakulteta ima prednost |
| Formatiranje literature | DJELOMICNO (zaseban alat s .docx izvozom) | tesko u radu | visok | samo prijedlog | parsiranje referenci iz tijela rada nepouzdano, auto-zamjena opasna |
| Finalni PDF iz preglednika | NE | tesko (ne vjerno) | visok | samo prijedlog | bez Word layout enginea PDF laze o izgledu; NE GRADITI lokalno |
| PDF/A | NE (samo detekcija oznake) | tesko | visok | samo prijedlog | nema zrele browser JS konverzije; serverska usluga ili uputa za Word izvoz |
| Imenovanje datoteka | NE | da | nizak | auto uz potvrdu | trivijalan kod; blokira nedostatak verificiranih pravila imenovanja po fakultetu |
| ZIP submission paket | NE | da | nizak | auto uz potvrdu | writeZip vec postoji (zip-codec.ts:185); komponente vec u memoriji (selectedDocx/Pdf/Metadata) |

Zakljucak matrice: sljedeci sloj AutoFixa s najboljim omjerom vrijednosti i rizika je
"sekcijsko-numeracijski paket" (sectPr + pgNumType + footer PAGE + rimsko/arapsko + TOC
polje), sve lokalno izvedivo bez novih biblioteka, uz prosirenje apply-fixers politike na
footere/rels. Heading/numbering/captions ostaju "predlozi s potvrdom po stavci" ili ljudska
usluga. PDF/A i finalni PDF se NE grade lokalno: to je uputa + validator, dugorocno eventualno
serverska opt-in usluga.

## 4. Deset najvaznijih nalaza

1. AutoFix POSTOJI, a javna komunikacija ga negira: FAQ + JSON-LD kazu "bit ce zaseban modul"
   (index.html:29,1489) dok repair s preuzimanjem .docx radi i besplatan je. Najjeftiniji
   veliki dobitak u cijelom auditu.
2. Naplata je kompletno izgradjena (klijent + Edge + migracije + katalog + Thesis Pass SKU) i
   ceka SAMO vlasnicke korake (GO_LIVE_NAPLATA.md); "free tier daje sve" nije kodna rupa nego
   nedeployan backend.
3. Strukturni AutoFix (numeriranje od Uvoda, sectPr, TOC) je najvece stvarno gradiliste:
   detekcija postoji, popravak ne; sve je lokalno izvedivo bez biblioteka.
4. Rules engine s 344 profila / 1212 scored pravila / snapshotiranim izvorima je stvarni moat,
   ali effectiveRules kompajler NIJE u zivom engineu (CLAUDE.md zastario): migracija rules ->
   ruleEntries smije krenuti tek nakon wiringa.
5. Privatnosna prica je sada ISTINITA (sanitize + lokalna analiza + saniran Edge sloj):
   prednost koju konkurencija (Plag.hr/Plagramme, PaperCheck) strukturno ne moze kopirati.
6. Besplatni alati su pravi alati (3 vracaju .docx) sa 160 SEO URL-ova, ali 10 alata iz
   specifikacije nedostaje kao standalone stranice iako motori postoje: najveci neiskoristeni
   akvizicijski kanal.
7. Nijedan e2e/browser test: glavni tok i repair download nikad se ne testiraju u pravom
   pregledniku; redesign grana (14 commita, ukljucivo Feature B) nikad nije prosla CI.
8. lekta-pipeline (forenzika izvornosti) je funkcionalan i vrijedan, ali proturjeci fiksiranoj
   odluci "bez istojezicnog plagijata" u m3/m4 dijelu i nosi rizik laznih optuzbi i GDPR
   pitanja institucijske obrade: treba eksplicitnu strategiju pozicioniranja prije ikakve
   integracije.
9. Cijene rucnih usluga nekonzistentne (39/69/99 klijent vs 49 products seed) i stariji
   Netlify narudzbeni tok bez naplate jos postoji: pocistiti prije go-livea.
10. PDF sloj je svjesno plitak i to je ispravno; jedini dug je da PDF/A zahtjev postane
    podatkovno polje profila umjesto FPZG hardkoda, i da naknadno dodani PDF pokrene preflight.

## 5. Otvorena pitanja (nisu rjesiva iz repoa)

1. Kada vlasnik namjerava izvesti GO_LIVE_NAPLATA korake (Supabase projekt, Lemon Squeezy,
   products tablica)? O tome ovisi cijela Faza monetizacije.
2. Kome je namijenjen lekta-pipeline: studentu (samoprovjera), mentoru, instituciji, ili kao
   interni alat Expert usluge? Odgovor mijenja pravni okvir (GDPR druga kategorija ispitanika)
   i pozicioniranje.
3. Postoji li stvarni maturiraj.hr distribucijski kanal (CO_PILOT_STRATEGY pitanje 4)?
4. Pravni subjekt, Merchant of Record status i DPA s Resendom: vanjski preduvjeti naplate.
5. Hoce li se redesign-korektorski-stol grana mergeati prije ili poslije aktivacije naplate
   (CI je nikad nije vidio)?
6. Koliko fakulteta stvarno TRAZI PDF/A i pravila imenovanja datoteka? Podatkovna praznina
   koja blokira dva jeftina AutoFix zadatka.
7. Za koje profile treba prikaz izvora PO PRAVILU (specifikacija sekcija 9) umjesto po
   profilu: UI odluka s utjecajem na povjerenje.
