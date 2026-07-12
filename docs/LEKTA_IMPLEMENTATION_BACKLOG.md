# LEKTA_IMPLEMENTATION_BACKLOG.md

Izvedbeni backlog uz [LEKTA_PRODUCT_ROADMAP.md](LEKTA_PRODUCT_ROADMAP.md). Datum: 2026-07-13.

Polja po zadatku: problem, korisnicka vrijednost (KV), poslovna vrijednost (PV), tehnicki
opis, datoteke, ovisnosti, acceptance criteria (AC), testovi, slozenost (S/M/L/XL),
prioritet (P0 najvisi), tehnicki rizik (TR), privatnosni rizik (PR), ocekivani ucinak (OU).

Tvrda pravila za sve zadatke: `npm run check` zelen prije commita; parser/repair izmjene
NIKAD bez golden testa koji prvo dokazuje zateceno ponasanje (CLAUDE.md); nijedan zadatak ne
smije oslabiti postojece sigurnosne maske repair enginea; hrvatski copy bez em/en crtica.

NAPOMENA: nista od ovoga nije implementirano; ovo je plan za odobrenje. Prva tri zadatka
(oznaka PRVA TRI) imaju detaljan plan implementacije u poglavlju 2.

---

## 1. Backlog

### BL-01. FAQ i JSON-LD prestaju negirati AutoFix (Faza 0) : PRVA TRI (paket A)
- Problem: index.html:29 (JSON-LD FAQPage) i index.html:1489 (FAQ) tvrde da automatsko
  formatiranje "bit ce zaseban modul", a Repair Engine s downloadom radi.
- KV: korisnik sazna da postoji popravak, ne samo dijagnoza. PV: jaca ponuda = veca
  konverzija upload i kasnije naplata.
- Tehnicki: prepisati FAQ odgovor + JSON-LD unos; dodati recenicu o AutoFixu u hero lead i
  "Kako radi"; repair panel dobiva sidro/isticanje u rezultatu.
- Datoteke: index.html (JSON-LD blok, FAQ sekcija, hero), src/ui/app.ts NE dirati (git-race
  pravilo; isticanje panela rijesiti u repair-panel.ts ili CSS-om).
- Ovisnosti: nema. AC: nijedan javni tekst ne negira postojeci popravak; JSON-LD validan
  (Rich Results test); FAQ i vidljivi tekst identicni po sadrzaju. Testovi: postojeci
  seo/head regresijski test prosiren na novi FAQ sadrzaj.
- Slozenost: S. Prioritet: P0. TR: nizak. PR: nema. OU: izravan rast upload konverzije.

### BL-02. "Nije provjera plagijata" u prvi ekran (Faza 0)
- Problem: distinkcija postoji na 4 mjesta ali ne u prvih 30 s (ux-01 nastavak).
- KV: ispravna ocekivanja, manje razocaranja. PV: manje refundova nakon aktivacije naplate.
- Tehnicki: jedna recenica u hero/trust-row: "Nije provjera plagijata: izvornost provjerava
  fakultet kroz Turnitin. Lekta priprema rad za predaju."
- Datoteke: index.html. Ovisnosti: nema. AC: recenica vidljiva bez skrolanja na 375px i
  1440px. Testovi: smoke na prisutnost stringa. Slozenost: S. Prioritet: P0. TR/PR: nema.
- OU: kvalificiraniji promet, manji refund rate.

### BL-03. Meta/OG pokrivenost + KS nav regresija (Faza 0)
- Problem: meta tvrdi "FPZG i Pravni" umjesto 33 institucije; KS nav izgubio Usporedbu i
  Alati dropdown (regresija a4bdec2).
- Tehnicki: azurirati meta description/OG; vratiti nav linkove u KS chrome (index.html).
- AC: meta odrazava stvarnu pokrivenost; nav sadrzi Usporedbu i Alati na desktopu i mobitelu.
- Slozenost: S. Prioritet: P1. TR: nizak. PR: nema. OU: SEO CTR + interni linkovi.

### BL-04. Repair re-check petlja: score prije -> poslije (Faza 1) : PRVA TRI (paket B)
- Problem: nakon popravka korisnik dobiva uputu "ucitaj ponovno"; vrijednost popravka nije
  dokazana brojkom.
- KV: trenutan dokaz "score je skocio s 68 na 84". PV: srce konverzije za placeni AutoFix i
  retencijska petlja (VISION re-check).
- Tehnicki: nakon applyFixers uspjeha, pokrenuti analizu popravljenih bajtova kroz POSTOJECI
  analyze-docx-client (worker, iste sigurnosne granice), usporediti score i kategorije,
  renderirati "prije -> poslije" u repair panelu; bez novog parsiranja koda.
- Datoteke: src/ui/repair-panel.ts (glavnina), src/analysis/analyze-docx-client.ts (bez
  izmjene ili minimalni export), app.ts izbjegavati (git-race; ako treba hook, jedan poziv).
- Ovisnosti: nema. AC: nakon "Popravi", panel prikazuje stari i novi score i po kategorijama
  delta; analiza popravljenog NE pise u povijest kao novi dokument (isti fingerprint slot);
  prekid analize radi; golden netaknut. Testovi: unit za usporedbu rezultata; panel test
  (postojeci repair-panel.test.ts obrazac); rucni docx-smoke.
- Slozenost: L. Prioritet: P0. TR: srednji (dvostruka analiza na slabom uredjaju; rijesiti
  istim memorijskim capovima). PR: nema (sve lokalno). OU: kljucni prodajni argument.

### BL-05. Fixer: razmak odlomaka i uvlaka prvog retka (Faza 1)
- Problem: auditZeroParagraphSpacing samo detektira; profili traze vrijednosti.
- Tehnicki: novi fixer u fixers.ts (w:spacing before/after, w:ind firstLine u Normal +
  deep skidanje overridea uz maske); ciljne vrijednosti iz repair-map (prosiriti gen
  skriptu ako pravilo postoji u ruleEntries).
- Datoteke: src/repair/fixers.ts, apply-fixers.ts, repair-items.ts, scripts/gen-*maps.
- Ovisnosti: BL-08 (golden repair harness) prije zahvata. AC: fixer iskljucivo gdje profil
  ima verificirano pravilo; tablice/naslovi zasticeni; backstop no-op na sumnju. Testovi:
  unit + golden repair fixture. Slozenost: M. Prioritet: P1. TR: srednji. PR: nema.
- OU: siri "popravljeno" listu, jaca paket.

### BL-06. Sekcijsko-numeracijski paket a: pgNumType nad postojecim sekcijama (Faza 1) : PRVA TRI (paket B)
- Problem: numeriranje od Uvoda je najtrazenija operacija (specifikacija je zove prvim
  prioritetom); danas samo detekcija (checkPageNumberStartAtIntro, analyze-docx.ts:62).
- KV: najbolniji Word zadatak studenta rijesen klikom. PV: nosiva stavka placenog AutoFixa;
  SEO magnet ("numeriranje stranica od uvoda" upiti).
- Tehnicki (korak a, najsigurniji): kad dokument VEC ima sekcije, krpati w:pgNumType
  (start, fmt lowerRoman/decimal) po sekcijama prema profilu; postojeca xml-patch
  infrastruktura (patchSectPr vec krpa atribute sekcija).
- Datoteke: src/repair/fixers.ts, xml-patch.ts, repair-items.ts.
- Ovisnosti: BL-08. AC: dokument s naslovnicom+uvodom u odvojenim sekcijama dobiva rimske
  brojeve do Uvoda i arapske od Uvoda s start=1, bit-identican no-op kad sekcija nema;
  Word otvara bez upozorenja. Testovi: unit + 2 golden repair fixture (s i bez sekcija).
- Slozenost: M. Prioritet: P0 (u paketu B). TR: srednji. PR: nema. OU: vidi BL-04.

### BL-07. Sekcijsko-numeracijski paket b i c: footer PAGE polje + umetanje sekcije (Faza 1)
- Problem: vecina studentskih dokumenata NEMA sekcije ni footere; korak a im ne pomaze.
- Tehnicki: (b) umetanje footer parta (footerN.xml + rels + ContentTypes + w:footerReference)
  s PAGE poljem: prosirenje apply-fixers politike izvan document.xml/styles.xml, nove maske
  i backstop pravila; (c) umetanje w:p/w:pPr/w:sectPr prije odlomka Uvoda (sidro iz postojece
  detekcije) uz eksplicitnu korisnikovu potvrdu lokacije u panelu.
- Datoteke: src/repair/{apply-fixers,xml-patch,zip-codec}.ts (novi part flow),
  repair-panel.ts (potvrda lokacije).
- Ovisnosti: BL-06, BL-08; NE krece bez odobrenja jer mijenja politiku enginea. AC: izlaz
  otvara Word i LibreOffice bez upozorenja; numeracija pocinje od Uvoda; original s vec
  ispravnom numeracijom = bit-identican no-op; svaka izmjena u changelogu. Testovi: golden
  repair fixtures (min 4 realna dokumenta), docx-smoke, rucna matrica Word/LibreOffice.
- Slozenost: L+L. Prioritet: P1 (odmah nakon paketa B). TR: visok (zato potvrda + backstop).
  PR: nema. OU: kompletira najvazniju AutoFix ponudu.

### BL-08. Golden repair harness nad realnim fixturama (Faza 1, preduvjet)
- Problem: repair ima 66 unit testova ali nijedan golden test nad realnim .docx; svaki novi
  fixer povecava rizik tihog ostecenja.
- Tehnicki: prosiriti tests/docx-golden obrazac: za svaku realnu fixturu snapshot (1) izlaznih
  bajtova svojstava (ne cijeli binarni), (2) changeloga, (3) rezultata ponovne analize
  popravljenog dokumenta.
- Datoteke: tests/ (nova suite), tests/fixtures/docx/ (postojece fixture + 1-2 nove s
  sekcijama). Ovisnosti: nema (ide PRIJE BL-05/06/07). AC: suite pada ako se promijeni
  ponasanje bilo kojeg postojeceg fixera; dokumentirano kako snimiti novi baseline.
- Slozenost: M. Prioritet: P0 (gate za sve repair zadatke). TR: nizak. PR: nema.
- OU: omogucuje sve ostalo bez regresija.

### BL-09. TOC polje s dirty flagom (Faza 1)
- Tehnicki: umetanje w:sdt/TOC ili fldSimple "TOC \\o 1-3 \\h" s w:dirty na mjesto postojeceg
  naslova Sadrzaj (detekcija postoji); rucno tipkani sadrzaj se ne dira, samo preporuka.
- Ovisnosti: BL-08. AC: Word pri otvaranju nudi/izracuna TOC; no-op ako TOC polje postoji.
- Slozenost: M. Prioritet: P1. TR: srednji. PR: nema. OU: jedna od "top 3" studentskih muka.

### BL-10. Cistac teksta: dvostruki razmaci + prazni odlomci (Faza 1)
- Tehnicki: prvi fixer koji dira w:t i brise w:p; zastite: ne unutar tablica/sdt/naslova,
  prag za "previse praznih", sve u changelog s brojem izmjena.
- Ovisnosti: BL-08 + nova klasa zastita. AC: tekstualni sadrzaj se ne mijenja osim ciljanih
  razmaka; word count identican; golden diff pregledan rucno na 6 fixtura.
- Slozenost: M. Prioritet: P2. TR: srednji-visok (prvi tekstualni zahvat). PR: nema.

### BL-11. Imenovanje datoteke po pravilu profila (Faza 1/3)
- Tehnicki: polje namingRule u profilu (data sloj, verificirano gdje postoji); download
  imena u repair-panel/ZIP builderu; check u submission gateu.
- AC: profil s pravilom generira ispravno ime; bez pravila = danasnje ponasanje.
- Slozenost: S (kod) + podatkovni rad. Prioritet: P2. TR: nizak. PR: nizak (ime moze nositi
  ime studenta: ne logirati). OU: mali, ali "checklist complete" dojam.

### BL-12. Konsolidacija cijena rucnih usluga (Faza 2)
- Problem: klijent 39/69/99 EUR vs products premium_human 49 EUR; PRICING_TIERS "od 39".
- Tehnicki: products tablica jedini izvor; klijentski PACKAGES se pune iz kataloga s
  fallbackom; odluka o stvarnim cijenama je vlasnikova.
- Datoteke: src/catalog/products-catalog.ts, app.ts (pricing render), supabase seed.
- AC: nijedna cijena hardkodirana na dva mjesta; promjena cijene = set_product_price bez
  deploya. Slozenost: S. Prioritet: P0 prije go-livea naplate. TR: nizak. OU: sprjecava
  reklamacije zbog razlicitih cijena.

### BL-13. Uklanjanje/odvajanje starog Netlify narudzbenog toka (Faza 2)
- Problem: paralelni tok bez naplate (lekta-orders forma + payment link) zbunjuje i moze
  primiti dokument izvan GDPR okvira nove naplate.
- AC: ili uklonjen ili jasno oznacen kao rucna ponuda s vlastitom privolom; nijedan javni
  CTA ne vodi u oba toka istovremeno. Slozenost: S. Prioritet: P1 uz go-live. PR: srednji
  (dokument ide na Netlify forms: navesti u privacy ili ukinuti).

### BL-14. Paywall e2e smoke na stagingu (Faza 2)
- Tehnicki: Playwright scenarij: teaser -> checkout sandbox -> webhook simulacija ->
  entitlement -> unlock -> re-check unutar slota; pokrenuti na Supabase stagingu.
- Ovisnosti: F2.1 (owner), BL-17 (Playwright temelj). AC: zeleni scenarij prije ukljucivanja
  javne naplate. Slozenost: M. Prioritet: P0 za go-live. TR: nizak. OU: sprjecava mrtvi
  checkout na produkciji.

### BL-15. ZIP submission paket (Faza 3) : PRVA TRI (paket C)
- Problem: korisnik rucno skuplja .docx, PDF, izjavu, metadata Word; "predajni paket" iz
  specifikacije ne postoji.
- KV: jedan klik = mapa spremna za upload u repozitorij/referadu. PV: opravdava Submission
  Ready cijenu; nitko to nema.
- Tehnicki: writeZip vec postoji (src/repair/zip-codec.ts:185); datoteke vec u memoriji
  (selectedDocx/selectedPdf/selectedMetadataDocx, app.ts:55); builder slaze sadrzaj po
  checklisti profila + README.txt s preostalim rucnim koracima; imena po BL-11 pravilu.
- Datoteke: novi src/submission/package-builder.ts (cista funkcija, testabilna),
  repair-panel.ts ili submission tab za gumb; app.ts minimalno (jedan mount).
- Ovisnosti: nema tvrdih (radi i s postojecih 5 fixera); BL-11 pozeljno. AC: ZIP sadrzi
  tocno datoteke koje checklista trazi i koje korisnik ima; nedostajuce = jasno navedene u
  README.txt; ZIP se otvara u Windows Exploreru i 7-zip bez gresaka; nista se ne salje
  mrezom. Testovi: unit za builder (sastav, imena, README), zip round-trip.
- Slozenost: M. Prioritet: P0 (u paketu C). TR: nizak. PR: nizak (sve lokalno). OU: temelj
  Submission Ready SKU-a.

### BL-16. PDF/A kao polje profila + preflight retrigger (Faza 3)
- Problem: PDF/A logika hardkodirana za FPZG (app.ts:411 podrucje); PDF dodan nakon analize
  ne pokrece preflight (stale prikaz).
- Tehnicki: submission.requiresPdfA u shemi profila + migracija podataka za FPZG; setAuxFile
  pokrece preflight i re-render submission taba.
- AC: profil bez PDF/A zahtjeva ne trazi PDF/A; zamjena PDF-a odmah azurira tab. Slozenost:
  S+S. Prioritet: P1. TR: nizak. OU: tocnost checkliste.

### BL-17. Playwright e2e temelj (Faza 4)
- Problem: 0 browser testova; worker, drag&drop, repair download i paywall nikad testirani u
  pravom pregledniku; redesign grana bez CI-ja.
- Tehnicki: playwright config + 3 scenarija: (1) upload fixture -> rezultat -> score,
  (2) repair -> download -> bytes valjani zip, (3) demo primjer bez uploada; CI job na PR.
- AC: scenariji zeleni lokalno i u CI; flaky rate < 1/20. Slozenost: M. Prioritet: P1.
  TR: nizak. OU: sigurnost isporuke za sve buduce faze.

### BL-18. SEO alati val 2 (Faza 4)
- Tehnicki: standalone stranice koje koriste postojece motore: numeriranje-stranica (uputa +
  interaktivni check), word-cistac (teaser repair-a), provjera-naslovnice (title-pages data);
  svaka s konverzijskim obrascem "popravljeno X, nadjeno jos Y, popravi sve".
- Ovisnosti: BL-06/07 za numeriranje alat; BL-01 za konzistentan copy. AC: svaka stranica
  ima canonical/OG/JSON-LD (postojeci generator obrazac), CTA na analizator, u sitemapu.
- Slozenost: M po alatu. Prioritet: P2. OU: organski promet (Scribbr free-tools model).

### BL-19. lekta-pipeline strateska odluka (Faza 4, odluka prije koda)
- Problem: funkcionalan forenzicki CLI proturjeci fiksiranoj odluci "bez istojezicnog
  plagijata" (m3/m4) i nosi rizik laznih optuzbi i GDPR pitanja institucijske obrade.
- Zadatak (dokumentacijski): odluciti poziciju (Expert interni alat / institucijski proizvod /
  odvojen brand / pauza); uskladiti pipeline roadmap s odlukom; do tada NE integrirati u web,
  ne commitati u ovaj repo, ne komunicirati javno.
- AC: odluka zapisana u VISION/CO_PILOT dopuni s pravnim okvirom. Slozenost: S (odluka).
  Prioritet: P1 (prije bilo kakve integracije). PR: visok ako se integrira bez okvira.

### BL-20. Dokumentacijska higijena (kontinuirano)
- CLAUDE.md: ispraviti "app.ts ~517 redaka" i effectiveRules wiring tvrdnju; zabiljeziti
  konvenciju "src/ je dijeljena klijent+server jezgra" (da cleanup ne obrise Edge-uvozene
  module). VISION.md: uskladiti monetizacijsku sekciju s odlukom C (nema retail pretplate);
  makniti referencu na nepostojeci lekta-strateski-plan.md u CO_PILOT_STRATEGY.
- Slozenost: S. Prioritet: P2. OU: sprjecava krive odluke buducih sesija.

### BL-21. Option A wiring: effectiveRules u zivi engine (tehnicki dug, uvjetno)
- Problem: kompajler postoji, zivi engine cita definition.rules izravno; migracija ruleEntries
  -> brisanje iz rules (CLAUDE.md backlog 2) slomila bi engine da krene prije wiringa.
- Tehnicki: currentProfile() prebaciti na definition.effectiveRules ?? definition.rules TEK
  uz dokaz nula-diffa (faithfulness test vec postoji); zatim migracija profil po profil.
- Ovisnosti: golden + faithfulness zeleni. AC: identican rezultat analize prije i poslije na
  svih 6 golden fixtura i QA health-passu. Slozenost: M. Prioritet: P2 (nije blocker nicemu
  komercijalnom, ali cuva integritet podatkovnog modela). TR: srednji.

## 2. Prva tri implementacijska zadatka: detaljni planovi

Odabir po nalogu (prednost: zajednicki DOCX engine, numeriranje od Uvoda, download popravljene
datoteke, prije/poslije, gating): zajednicki DOCX transformation engine VEC POSTOJI
(xml-patch + apply-fixers + zip-codec, 66 testova), a stvarno preuzimanje popravljenog .docx
VEC POSTOJI (repair-panel.ts:107-215). Zato prva tri paketa ciljaju ono sto od prioriteta
nedostaje: istinu o proizvodu, prije/poslije s numeracijom, i predajni paket. Premium gating
kod postoji i aktivira se u Fazi 2 (owner-gated), pa nije "implementacijski" zadatak.

### Paket A = BL-01 + BL-02 + BL-03 (istina o proizvodu; 1-2 dana)
Koraci: (1) inventar svih mjesta koja opisuju popravak (grep "automatsko formatiranje",
"zaseban modul", "ispraviti"); (2) novi FAQ odgovor: "Da. Lekta automatski popravlja
oblikovanje (margine, font, prored, poravnanje, format papira) i vraca novi Word dokument;
strukturne popravke (numeriranje stranica, sadrzaj) dodajemo postupno, a slozene slucajeve
rjesava covjek."; (3) sinkronizirati JSON-LD s vidljivim FAQ-om (postojeci obrazac vec dijeli
sadrzaj); (4) hero lead + "Kako radi" korak 3 dobivaju popravak; (5) plagijat recenica u
trust-row; (6) meta/OG pokrivenost; (7) nav linkovi. Verifikacija: check zelen; rucni pregled
na dev serveru (svjetla/tamna tema, 375px); Rich Results test JSON-LD-a.
Rizici: minimalni; jedino paznja da se ne obeca strukturni popravak koji jos ne postoji
(formulacija "dodajemo postupno").

### Paket B = BL-08 pa BL-04 pa BL-06 (dokaziv AutoFix; 1,5-2 tjedna)
Redoslijed je bitan: prvo golden repair harness (BL-08) jer CLAUDE.md zabranjuje diranje
enginea bez golden testa; zatim re-check petlja (BL-04) jer ne dira engine (koristi postojeci
klijent) a odmah dokazuje vrijednost; zatim pgNumType fixer (BL-06) kao prvi novi fixer kroz
novi harness.
Koraci BL-08: (1) nova suite tests/repair-golden.test.ts po obrascu docx-golden; (2) za svaku
od 6 fixtura pokrenuti svaki fixer (i deep varijantu) i snapshotirati changelog + kljucna
XML svojstva izlaza (sectPr, docDefaults, Normal) umjesto sirovih bajtova; (3) dodati 1-2
nove fixture s viselijecnim sekcijama (potrebne za BL-06/07); (4) npm test -- -u za baseline.
Koraci BL-04: (1) repair-panel nakon uspjesnog applyFixers poziva analyzeDocxViaClient nad
novim bajtovima; (2) render "prije -> poslije" (ukupni score + 4 kategorije, uz postojeci
changelog); (3) povijest: zapis oznacen kao repair re-check istog fingerprinta (bez novog
dokumenta u povijesti); (4) rub: analiza popravljenog pada -> prikazi changelog bez score
usporedbe, nikad ne blokiraj download.
Koraci BL-06: (1) mapiranje profila: koje pravilo daje pgNumType cilj (page-numbers checkId
vec postoji u rule-compileru); (2) fixer patcha postojece sectPr elemente; (3) backstop:
dokument bez sekcija = no-op s objasnjenjem u panelu ("dokument nema odvojene sekcije;
uskoro cemo ih znati umetnuti"); (4) golden + docx-smoke + rucna provjera u Wordu.
Rizici: dvostruka analiza na slabim mobitelima (koristiti postojece memorijske capove i
worker; ne paralelno s prvom analizom); pgNumType interakcija s postojecim footerima
(snapshot prije/poslije u harnessu).

### Paket C = BL-15 (+BL-11 light) (ZIP submission paket; 3-5 dana)
Koraci: (1) cista funkcija buildSubmissionPackage(checklist, files) u novom
src/submission/package-builder.ts: ulaz je checklista profila + mapa dostupnih datoteka
(popravljeni ili originalni docx, PDF, izjava iz generatora ako je korisnik doda, metadata
Word), izlaz ZIP bytes + manifest sto je unutra i sto fali; (2) README.txt u ZIP-u s
preostalim RUCNIM koracima (iz admin checkliste profila); (3) gumb "Preuzmi predajni paket"
u submission tabu, aktivan kad postoji barem docx; (4) imena datoteka: postojece ime +
uredni sufiksi; namingRule polje tek kad podaci postoje (BL-11); (5) unit testovi buildera
(sastav, manifest, README, prazni slucajevi) + zip round-trip test.
Rizici: niski; jedina odluka je UX mjesto gumba (submission tab, ne repair panel, jer paket
ima smisla i bez popravka).

## 3. Redoslijed i kapacitet (sazetak)

P0 lanac: Paket A -> BL-08 -> BL-04 -> BL-06 -> (owner: F2.1 paralelno) -> BL-12/13/14 ->
BL-15. Zatim P1: BL-07, BL-09, BL-16, BL-17, BL-19, BL-03. Zatim P2: BL-05, BL-10, BL-11,
BL-18, BL-20, BL-21.
