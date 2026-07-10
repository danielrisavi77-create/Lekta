# UX audit: glavni tok korisnika (Lekta)

Datum: 2026-07-10
Opseg: glavni tok "pocetna, odabir profila, upload, analiza, rezultat, repair/izvjestaj".
Metoda: staticki pregled koda (READ-ONLY), bez pokretanja builda ili testova.
Kljucne datoteke: `index.html`, `src/ui/app.ts`, `src/shared/ui-boot.ts`, `src/scoring/checks.ts`, `landing_usporedba.html`.

## Mapa podrucja (kako tok stvarno tece)

1. Pocetna je jedan dugacki marketinski landing s ugradjenom cijelom aplikacijom (nije zasebna ruta ni korak). Redoslijed sekcija: navigacija, hero, "Kako radi" (3 koraka), "Automatski audit" (mreza provjera), analizator (`#analyzer`), paketi/cjenik, FAQ, CTA, footer, modali. Vidi `index.html:236` do `index.html:356`.
2. Dominantni CTA postoji i jasan je: nav gumb "Provjeri rad" i hero "Besplatno provjeri rad", oba vode na `#analyzer` (`index.html:243`, `index.html:265`). Analizator je ipak fizicki nize od tri pune sekcije.
3. Analizator je dvostupacni "wizard": lijevo "1. Ucitaj Word dokument" (dropzone), desno "2. Odaberi profil" (Sveuciliste, Fakultet, Studij, Vrsta rada). Napredne opcije (PDF, stil citiranja, jezik, strogost, faza, upute mentora) skrivene su u `<details>` "Zelim precizniju provjeru" (`index.html:303`).
4. Default profil je tvrdo postavljen na FPZG, Politologija, Diplomski rad (`src/ui/app.ts:278`). Auto-detekcija iz naslovnice radi samo za unizg jedinice (`src/ui/app.ts:164`).
5. Klik "Analiziraj dokument" pokrece analizu u Web Workeru (lokalno), s progress ekranom (`index.html:329`, `src/ui/app.ts:449`).
6. Rezultat: prsten ocjene + pecat "Spremno", metrike, "Sto dalje?" kartice, kartice kategorija, tabovi (Sazetak, Plan ispravaka, Svi problemi, Spremnost za predaju + "Vise detalja" otkriva jos 4 taba), teaser/paywall (aktivan samo ako je konfiguriran), repair panel, waitlist traka.
7. Monetizacija: u soft-launchu su placene tarife oznacene "USKORO", narudzba i puni izvjestaj su iskljuceni (`src/ui/app.ts:227`, `src/ui/app.ts:125`, `src/ui/app.ts:711`), pa je cijeli automatski tok besplatan.

Opci dojam: informacija o privatnosti (lokalna obrada) je izvrsno komunicirana i ponovljena na vise mjesta. Disclaimeri o tome da rezultat nije sluzbena potvrda postoje u FAQ-u, footeru i cjeniku. Glavne slabosti su: (a) nedostatak eksplicitne izjave da Lekta nije provjera plagijata, (b) jak default profil uz analizu koja se pokrece bez potvrde profila, (c) nekoliko formulacija i vizualnih signala koji obecavaju vise nego sto proizvod jamci.

## Tablica nalaza

| ID | Prioritet | Nalaz | Lokacija |
|----|-----------|-------|----------|
| ux-01 | P1 | Nigdje se ne kaze da Lekta NIJE provjera plagijata ni originalnosti sadrzaja | `index.html:341`, `index.html:281` |
| ux-02 | P2 | Jak default profil (FPZG) + analiza se pokrece bez potvrde profila; auto-detekcija samo za unizg | `src/ui/app.ts:278`, `src/ui/app.ts:164`, `src/ui/app.ts:149` |
| ux-03 | P2 | Pecat "Spremno" i okvir "spreman za predaju" preobecavaju spremnost na temelju samo tehnicke ocjene | `index.html:230`, `src/ui/app.ts:566`, `index.html:263` |
| ux-04 | P2 | Formulacija "potvrduje tehnicku uskladjenost" (potvrduje = certificira) proturjeci pozicioniranju "nije sluzbena potvrda" | `index.html:340`, `src/ui/app.ts:128` |
| ux-05 | P2 | Prijava pogresne provjere koristi native `window.prompt()` (neostilizirano, blokirljivo, lose na mobitelu) | `src/ui/app.ts:546` |
| ux-06 | P2 | Pocetna je gusta: cijela app + marketing + cjenik na jednom scrollu; analizator ispod tri sekcije, nema fokusiranog prikaza | `index.html:258` do `index.html:342` |
| ux-07 | P2 | Nesklad limita uploada na mobitelu: tekst oglasava "najvise 50 MB", stvarni limit je 20 MB | `index.html:288`, `src/ui/app.ts:208`, `src/ui/app.ts:534` |
| ux-08 | P3 | Redundantne tocke ulaza (dva "Pogledaj primjer", "Preuzmi" na vise mjesta) | `index.html:265`, `index.html:327`, `src/ui/app.ts:503` |
| ux-09 | P3 | Tab "Spremnost za predaju" je gotovo prazan u zadanoj fazi "Samo dokument"; PDF preflight zakopan u naprednim opcijama | `src/ui/app.ts:664`, `src/ui/app.ts:442`, `index.html:307` |
| ux-10 | P3 | Placene tarife "USKORO" uz besplatni tok stvaraju cjenovni sum tijekom soft-launcha | `src/ui/app.ts:123`, `index.html:340` |

## Detaljni nalazi

### ux-01 (P1): Nedostaje eksplicitna izjava da Lekta nije provjera plagijata

- Problem: U hrvatskom studentskom kontekstu "provjera rada" gotovo se automatski povezuje s provjerom plagijata ili slicnosti (Turnitin, PlagScan). Lekta nigdje ne razjasnjava da NE radi provjeru plagijata, originalnosti ni slicnosti sadrzaja. Rijec "plagijat" ne postoji na pocetnoj; jedini pogodak za "izvornost" je alat "Izjava o izvornosti" (generira potpisanu izjavu, sto je nesto sasvim drugo).
- Lokacija: FAQ `index.html:341` (pet pitanja, nijedno o plagijatu), sekcija "Automatski audit" `index.html:281`, footer `index.html:344`.
- Dokaz: Grep po `index.html` za `plagijat|originalnost|slicnost` vraca samo navigacijske/footer poveznice na alat "Izjava o izvornosti" (`index.html:240`, `index.html:252`, `index.html:344`); nema disclaimera. Hero i podnaslov opisuju "oblikovanje, strukturu, citatnice, literaturu" (`index.html:264`), sto korisnik lako procita kao "provjerava je li rad u redu za predaju", ukljucujuci plagijat.
- Posljedica: Dio korisnika ucita rad ocekujuci izvjestaj o slicnosti, dobije tehnicki audit i osjeti se prevarenim; raste podrska, loše recenzije i nepovjerenje. Kod placenih tarifa to je i rizik povrata ("nisam dobio ono sto sam mislio da kupujem").
- Preporuceno rjesenje: Dodati kratku, vidljivu izjavu u hero ili u prvi red FAQ-a, npr. "Lekta provjerava oblikovanje, strukturu i citiranje. Nije provjera plagijata ni slicnosti i ne provjerava originalnost sadrzaja." Idealno i jedno FAQ pitanje "Provjerava li Lekta plagijat?" s jasnim "Ne". Uskladiti s postojecim FAQ tonom.
- Acceptance kriteriji: Na pocetnoj (bez skrolanja u FAQ) i u FAQ-u postoji eksplicitna recenica da alat nije provjera plagijata/slicnosti/originalnosti; tekst je vidljiv prije uploada; nema kontradikcije s ostalim disclaimerima.
- Rizik regresije: Vrlo nizak (dodavanje statickog teksta, bez logike).

### ux-02 (P2): Jak default profil uz analizu koja se pokrece bez potvrde profila

- Problem: Pri prvom ucitavanju profil je tvrdo postavljen na FPZG, Politologija, Diplomski rad. Auto-detekcija iz naslovnice pretrazuje samo unizg jedinice, pa korisnik izvan Zagreba (ostalih ~90+ ustanova u katalogu) ostaje na FPZG defaultu ako ga rucno ne promijeni. Gumb "Analiziraj dokument" omogucuje se cim je datoteka odabrana, neovisno o tome je li korisnik pogledao ili potvrdio profil.
- Lokacija: Default `src/ui/app.ts:278` (`$('#programSelect').value='Diplomski studij Politologija';$('#workType').value='graduate'`), detekcija ogranicena na unizg `src/ui/app.ts:164` (`ZAGREB_CATALOG.find(g=>g.id==='unizg')`), omogucavanje gumba `src/ui/app.ts:149` (`$('#analyzeBtn').disabled=!file`).
- Dokaz: `detectDocxContext` iterira samo `unizg` jedinice; za non-unizg dokument vraca `null` i profil ostaje FPZG. `runAnalysis` (`src/ui/app.ts:449`) uzima `currentProfile()` bez ikakve potvrde da je korisnik provjerio odabir.
- Posljedica: Korisnik izvan FPZG-a moze dobiti rezultat i "moguce probleme" izracunate prema FPZG Politologija pravilima (margine, citatni stil, opseg), sto je pogresno i podriva povjerenje; kod placenih tarifa to je izravan uzrok reklamacije.
- Preporuceno rjesenje: Ublaziti default (npr. neutralni "Odaberi ustanovu" placeholder dok korisnik ne izabere, ili "Opci akademski profil" kao polazna tocka), ILI prije pokretanja analize prikazati kratku potvrdu odabranog profila ("Provjeravas kao: FPZG, Politologija, Diplomski. Promijeni?"). Prosiriti auto-detekciju na sve institucije u katalogu, ne samo unizg.
- Acceptance kriteriji: Korisnik koji nije mijenjao izbornike ne dobiva tiho FPZG-specifican rezultat; profil koji ce se koristiti jasno je istaknut neposredno uz gumb analize; auto-detekcija pokusava sve institucije.
- Rizik regresije: Srednji (dira default selekciju i detekciju; potrebni golden/regresijski testovi za populaciju izbornika i za analizu s promijenjenim defaultom).

### ux-03 (P2): Pecat "Spremno" i okvir "spreman za predaju" preobecavaju

- Problem: Za ocjenu >= 90 bez blokirajucih gresaka prikazuje se istaknut pecat "Spremno" (Ready) u kartici ocjene. U kombinaciji s hero pitanjem "Je li tvoj rad spreman za predaju?" korisnik lako zakljuci da alat potvrdjuje spremnost za predaju, iako ocjena odrazava samo automatski provjerljiva tehnicka i citatna pravila (ne sadrzaj, ne sluzbeno prihvacanje).
- Lokacija: Pecat DOM/CSS `index.html:230` i logika `src/ui/app.ts:566` (`_ready=r.score!=null&&r.score>=90&&!(r.issues||[]).some(...==='error')`); hero naslov `index.html:263`.
- Dokaz: `scoreMeta` za >= 90 vraca oprezniji tekst "visoko uskladjen s automatski provjerljivim pravilima" (`src/scoring/checks.ts:70`), ali vizualni pecat kaze samo "Spremno", sto je jaca tvrdnja od popratnog teksta.
- Posljedica: Lazni osjecaj sigurnosti; korisnik preda rad vjerujuci da ga je Lekta "proglasila spremnim", a referada ga vrati zbog sadrzaja ili pravila koje alat ne pokriva. Reputacijski i (kod garancije) financijski rizik.
- Preporuceno rjesenje: Precizirati tekst pecata u tehnicki okvir, npr. "Tehnicki uredno" ili "Oblikovno spremno", te uz njega zadrzati postojeci caveat da se odnosi na automatske provjere, ne na sadrzaj ni sluzbeno prihvacanje.
- Acceptance kriteriji: Pecat i njegov susjedni tekst ne tvrde bezuvjetnu spremnost za predaju; jasno je da se odnosi na automatski provjerljiva pravila; disclaimer je vidljiv u istom vidnom polju.
- Rizik regresije: Nizak (promjena teksta/labela; bez promjene bodovne logike).

### ux-04 (P2): "potvrduje tehnicku uskladjenost" proturjeci pozicioniranju

- Problem: Cjenovni disclaimer glasi "Usluga potvrduje tehnicku uskladjenost prema dostupnim pravilima." Glagol "potvrduje" znaci certificira/jamci, sto je u napetosti s ostatkom proizvoda koji dosljedno ponavlja da rezultat "nije sluzbena potvrda". Zadatak izrijekom oznacava upravo taj obrazac ("potvrdjuje uskladjenost" umjesto "procjenjuje tehnicku uskladjenost").
- Lokacija: Staticki HTML `index.html:340` (`#pricingDisclaimer`) i identican tekst koji se postavlja kad naplata prorada `src/ui/app.ts:128`.
- Dokaz: Isti disclaimer se u `init()` (`src/ui/app.ts:128`) ponovno upisuje istim tekstom za placeni scenarij; drugdje app koristi ispravniji ton (analyze-row: "Heuristicka pomoc, ne sluzbena potvrda ustanove", `index.html:327`), pa je formulacija nedosljedna.
- Posljedica: Slabi pravnu i komunikacijsku obranu ("vi ste potvrdili uskladjenost"); daje korisniku jace jamstvo nego sto proizvod stvarno pruza.
- Preporuceno rjesenje: Zamijeniti "potvrduje" s "procjenjuje" ili "provjerava" na oba mjesta: "Usluga procjenjuje tehnicku uskladjenost prema dostupnim pravilima." Provuci isti izraz kroz sve varijante disclaimera.
- Acceptance kriteriji: Nijedan javni disclaimer ne koristi "potvrduje uskladjenost"; koristi se "procjenjuje/provjerava"; tekst u `index.html` i onaj u `app.ts` su uskladjeni.
- Rizik regresije: Vrlo nizak (zamjena rijeci na dva mjesta; paziti da oba budu uskladjena).

### ux-05 (P2): Prijava pogresne provjere koristi native window.prompt()

- Problem: Kanal "Prijavi pogresnu provjeru" otvara native `window.prompt()` za unos opisa. Native prompt je neostiliziran, ne postuje temu, na nekim preglednicima nudi "sprijeci daljnje dijaloge", moze biti blokiran i losa je mobilna UX; takodjer prekida tok bez konteksta.
- Lokacija: `src/ui/app.ts:546` (`const note=window.prompt('Ukratko opisi...')`), okidac gumb `#reportWrongCheck` u rezultatu `index.html:332`.
- Dokaz: Funkcija `reportWrongCheck` izravno zove `window.prompt`, zatim gradi mailto ili preuzima JSON; nema ugradjenog modala iako aplikacija vec ima obrazac/modal infrastrukturu (npr. `#legalModal`, `trapModal`).
- Posljedica: Vrijedan feedback kanal djeluje neprofesionalno i moze se izgubiti (blokirani dijalozi), sto smanjuje broj prijava i kvalitetu podataka o gresci profila.
- Preporuceno rjesenje: Zamijeniti prompt malim modalom (textarea + gumb) uz postojeci `trapModal`/`releaseModal` obrazac, ili barem inline poljem u kartici rezultata. Zadrzati postojecu mailto/JSON logiku slanja.
- Acceptance kriteriji: Prijava se unosi kroz stilizirani, tematizirani element unutar stranice (ne native prompt); radi na mobitelu; fokus se hvata i vraca; ponasanje slanja (mailto/JSON) ostaje isto.
- Rizik regresije: Nizak do srednji (novi mali UI element; ponovna upotreba postojece modal infrastrukture smanjuje rizik).

### ux-06 (P2): Gustoca pocetne (cijela app + marketing + cjenik na jednom scrollu)

- Problem: Pocetna istovremeno servira marketinski landing, cijeli konfigurabilni analizator, cjenik s tri tarife i FAQ. Analizator je fizicki ispod hero, "Kako radi" i "Automatski audit" sekcija, pa prvi dojam nosi puno prije nego sto korisnik dodje do zadatka. Dominantni CTA postoji, no ne postoji fokusirani prikaz same provjere.
- Lokacija: `index.html:258` (hero) do `index.html:342` (CTA), analizator na `index.html:282`, cjenik `index.html:340`.
- Dokaz: Sekcije `hero`, `#how`, `#checks` prethode `#analyzer`; klik na "Provjeri rad" skrola na sredinu stranice (`href="#analyzer"`), ali korisnik i dalje dolazi u kontekst pun okolnog sadrzaja (cjenik, FAQ, footer i modali su na istoj stranici).
- Posljedica: Kognitivno opterecenje na prvom dojmu; dio korisnika ne prepozna odmah da je alat besplatan i odmah upotrebljiv; konfiguracija profila (cak i s progressive disclosure) djeluje kao "puno toga za ispuniti".
- Preporuceno rjesenje: Zadrzati landing, ali ponuditi i fokusirani ulaz: npr. da primarni CTA vodi u laksi, gotovo prazan "provjeri sada" kontekst (skraceni hero + analizator vrhu), ili barem podici analizator vise (odmah nakon hero) i vizualno ga jasnije odvojiti kao glavni proizvod. Cjenik i FAQ ostaju nize.
- Acceptance kriteriji: Nakon klika na primarni CTA korisnik je u kontekstu gdje je upload + profil glavni fokus bez okolnog marketinga u vidnom polju; mjerljivo krace do prvog uploada.
- Rizik regresije: Srednji (preraspored sekcija moze utjecati na sidra `#analyzer`, SEO i responzivne breakpointe; treba provjeriti sve `href="#analyzer"` i print stilove).

### ux-07 (P2): Nesklad limita uploada na mobitelu (50 MB vs 20 MB)

- Problem: Opis dropzone i naprednih opcija tvrdi "najvise 50 MB", no stvarni limit na mobilnim uredjajima je 20 MB. Korisnik na mobitelu koji vidi "50 MB" i ucita 30 MB dobije odbijanje, sto djeluje kao greska aplikacije, iako poruka odbijanja objasnjava nizu granicu.
- Lokacija: Staticki opis `index.html:288` ("...najvise 50 MB"), dinamicko postavljanje istog teksta `src/ui/app.ts:208`, stvarni limit `src/ui/app.ts:534` (`effectiveUploadCap` vraca 20 MB na mobilnom), poruka odbijanja `src/ui/app.ts:147`.
- Dokaz: `effectiveUploadCap()` vraca `20*1024*1024` kad `isLikelyMobile()`; opis (`wordUploadDescription`) je uvijek "...najvise 50 MB" i u HTML-u i u `updatePackageUi`.
- Posljedica: Zbunjenost i percepcija bug-a na mobitelu; korisnik ne zna unaprijed pravi limit; potencijalno napusta tok.
- Preporuceno rjesenje: Prikazati stvarni efektivni limit u opisu ovisno o uredjaju (npr. `${Math.round(effectiveUploadCap()/1024/1024)} MB`), tako da tekst i validacija koriste isti izvor istine.
- Acceptance kriteriji: Na mobilnom uredjaju opis dropzone prikazuje 20 MB (ili tocnu efektivnu vrijednost); na desktopu 50 MB; nema neslaganja izmedju oglasenog i stvarnog limita.
- Rizik regresije: Nizak (tekstualna vrijednost izvedena iz postojece funkcije; paziti da se opis osvjezi na promjenu konteksta uredjaja).

### ux-08 (P3): Redundantne tocke ulaza i preuzimanja

- Problem: Ista radnja nudi se na vise mjesta: "Pogledaj primjer izvjestaja" postoji u hero (`#heroDemoBtn`) i u analyze-row (`#demoBtn`); "Preuzmi izvjestaj" postoji kao kartica u "Sto dalje?" i kao stavka u dropdownu "Preuzmi" u akcijama rezultata. Umnazanje istih akcija povecava sum bez nove vrijednosti.
- Lokacija: Hero demo `index.html:265`, analyze-row demo `index.html:327`, next-step "download" `src/ui/app.ts:503`, dropdown preuzimanja `index.html:332`.
- Dokaz: Oba demo gumba pozivaju `runDemo('fpzg')` (`src/ui/app.ts:139`); next-step "download" poziva istu `downloadHtmlReport` kao stavka u dropdownu (`src/ui/app.ts:509`, `src/ui/app.ts:574`).
- Posljedica: Blagi kognitivni sum; korisnik se pita jesu li to razlicite radnje.
- Preporuceno rjesenje: Zadrzati po jedan jasan primarni ulaz po radnji i procijeniti uklanjanje duplikata (npr. demo samo u hero ili samo uz gumb analize; download primarno kroz dropdown, kartica u "Sto dalje?" moze voditi na isti izbornik).
- Acceptance kriteriji: Svaka kljucna radnja (demo, preuzimanje) ima jasan primarni ulaz; nema dva vidljiva gumba iste funkcije u istom vidnom polju bez razloga.
- Rizik regresije: Nizak (uklanjanje/spajanje gumba; provjeriti da handleri ostanu vezani).

### ux-09 (P3): Tab "Spremnost za predaju" je gotovo prazan u zadanoj fazi

- Problem: U zadanoj fazi "Samo dokument" tab "Spremnost za predaju" prikazuje uglavnom "PDF nije ucitan" i "Za nacin Samo dokument nema administrativne checkliste", jer je PDF (koji hrani preflight i gate) zakopan u naprednim opcijama i faza je po defaultu "document". Korisnik koji zeli bas provjeru spremnosti nailazi na prazno stanje.
- Lokacija: Checklista `src/ui/app.ts:664` (prazno stanje "Za nacin Samo dokument..."), PDF preflight prazno stanje `src/ui/app.ts:442`, PDF unos u naprednim opcijama `index.html:307`.
- Dokaz: `renderPdfPreflight` bez `selectedPdf` prikazuje "PDF nije ucitan"; `renderSubmissionChecklist` u fazi document ne generira grupe (`groups||'...nema administrativne checkliste'`).
- Posljedica: Percepcija da tab "ne radi nista"; slaba otkrivljivost PDF preflighta i faza predaje, iako je to jedna od diferencirajucih funkcija.
- Preporuceno rjesenje: U praznom stanju taba ponuditi jasan poziv na akciju ("Dodaj konacni PDF i odaberi fazu predaje da vidis provjeru spremnosti") s gumbom koji otvara napredne opcije i fokusira polje faze/PDF-a (slicno postojecem `#openPhaseFromHint`, `src/ui/app.ts:140`).
- Acceptance kriteriji: U zadanoj fazi tab "Spremnost za predaju" jasno objasnjava sto nedostaje i nudi jedan klik do dodavanja PDF-a i odabira faze; nema "mrtvog" praznog taba.
- Rizik regresije: Nizak (dodatak u prazno stanje + reupotreba postojeceg otkrivanja naprednih opcija).

### ux-10 (P3): Placene tarife "USKORO" uz besplatni tok stvaraju cjenovni sum

- Problem: Tijekom soft-launcha cjenik prikazuje "Provjera po radu (od 3,99 EUR)" i "Rucno uredjivanje (od 39 EUR)" s bedzem "USKORO", dok je zapravo sve besplatno. To moze sugerirati da je besplatna provjera ograniena ili da ce se ubrzo naplacivati, iako besplatni tier jasno stoji "0 EUR".
- Lokacija: Render cjenika `src/ui/app.ts:123` (`soon=p.id!=='free'&&!paidOffersLive()`), disclaimer `index.html:340`, jamstvena napomena `src/ui/app.ts:128`.
- Dokaz: U `init()` se za ne-free tarife postavlja bedz "USKORO" i onemogucen CTA "Uskoro"; `guaranteeNote` u soft-launchu nosi besplatnu poruku, ali tri kartice i dalje prikazuju cijene.
- Posljedica: Blagi sum i moguca sumnja "hoce li me naplatiti"; dio korisnika mozda odustane misleci da je prava vrijednost iza placenog zida.
- Preporuceno rjesenje: U soft-launchu jasnije istaknuti da je trenutno sve besplatno (npr. skupiti placene tarife u jednu diskretnu "uskoro" najavu ili dodati mikro-copy "trenutno besplatno" na free karticu iznad ostalih), umjesto ravnopravnog prikaza tri cjenovne kartice.
- Acceptance kriteriji: U soft-launchu je na prvi pogled jasno da je automatska provjera besplatna i neogranicena; "uskoro" tarife ne dominiraju vizualno nad besplatnom.
- Rizik regresije: Nizak (copy/vizualni naglasak; logika `paidOffersLive` ostaje nepromijenjena).

## Pozitivno (zadrzati)

- Privatnost/lokalna obrada iznimno je dobro komunicirana: hero eyebrow, trust-row (`index.html:266`), "Lokalna obrada" pill (`index.html:285`), FAQ, footer, secure-order-note. Ovo je snazan diferencijator.
- Progressive disclosure naprednih opcija ("Zelim precizniju provjeru") drzi pocetni oblik jednostavnim.
- Poruke gresaka pri uploadu su ljudske i korisne (`src/ui/app.ts:147`, `src/ui/app.ts:461`), ukljucujuci uputu za stari `.doc` i mobilni memorijski caveat.
- Prazna stanja (npr. lista problema, `src/ui/app.ts:705`) su topla i pozitivna.
- Pristupacnost je solidna: dropzone kao gumb s tipkovnickom podrskom, hvatanje fokusa u modalima (`trapModal`), strelice na tabovima, `aria` atributi.
- Auto-detekcija profila iz naslovnice (kad radi) i "Prepoznato iz dokumenta" bedz smanjuju rucni unos.
- Demo tok (uzorak izvjestaja) jasno je oznacen kao primjer, ne kao stvarna analiza (`src/ui/app.ts:483`).
