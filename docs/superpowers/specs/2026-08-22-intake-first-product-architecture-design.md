# Intake-first arhitektura Lekte i Korektorski stol

Datum: 2026-08-22  
Status: dizajn odobren u razgovoru, čeka pregled zapisane specifikacije

## 1. Sažetak odluke

Lekta prelazi na intake-first informacijsku arhitekturu. Početna stranica služi samo za novu provjeru dokumenta. Objašnjenje proizvoda, povijest radova i puni radni prostor dobivaju zasebne stranice i zasebne Vite ulaze.

Konačne javne rute su:

| Ruta | Primarna svrha |
| --- | --- |
| `/` | Minimalan ulaz i upload novog rada |
| `/rad/` | Potvrda dokumenta i profila, analiza, nalazi, popravak i predaja |
| `/saznaj-vise/` | Objašnjenje proizvoda, metodologije, privatnosti i mogućnosti |
| `/moji-radovi/` | Prijava, povijest provjera i povijest popravaka |

Rad se prvo izrađuje kao izolirani demo. Trenutačna javna stranica ostaje netaknuta dok demo, funkcionalna integracija i svi sigurnosni i izvedbeni kriteriji ne budu odobreni.

Nova arhitektura ne mijenja analitičku logiku, pravila fakulteta, parser, citation engine ili repair engine. Ona mijenja način na koji se postojeće mogućnosti učitavaju, grupiraju i objašnjavaju korisniku.

## 2. Problem koji rješavamo

Trenutačna stranica istodobno pokušava objasniti proizvod, prihvatiti dokument, voditi analizu, prikazati rezultate i ponuditi napredne mogućnosti. Time se događaju tri problema:

1. Novi korisnik prije uploada vidi više informacija nego što mu je potrebno.
2. Nakon analize tehnička ocjena, spremnost, kategorije, nalazi i akcije međusobno se natječu za pažnju.
3. Velik broj vizualnih i funkcionalnih modula učitava se u istom kontekstu, što otežava održavanje glatkog rada.

Korisnik nakon analize prvenstveno treba razumjeti:

1. Što je pogrešno?
2. Gdje se pogreška nalazi?
3. Zašto je to pogrešno?
4. Što sada treba napraviti?
5. Može li Lekta to popraviti ili je potrebna ručna provjera?

Sve ostalo ostaje dostupno, ali ulazi u kontekstualne ili napredne slojeve.

## 3. Ciljevi i granice

### 3.1. Ciljevi

- Omogućiti da novi korisnik odmah prepozna gdje učitava rad.
- Dati dokumentu i nalazima glavni vizualni prostor nakon analize.
- Zadržati svaku postojeću korisničku funkciju.
- Zadržati taktilni karakter korektorskog stola, ozbiljnost i povjerenje.
- Koristiti kratke, lokalne i smislene animacije bez stalnog kretanja cijele stranice.
- Omogućiti jednak funkcionalni tok na računalu, tabletu i mobitelu.
- Smanjiti početni bundle i učitavati teške mogućnosti tek kada postanu potrebne.
- Sačuvati sve postojeće sigurnosne, privatnosne i repair zaštite.

### 3.2. Nije cilj

- Ne izrađuje se novi analizator.
- Ne mijenjaju se profilna pravila niti način bodovanja.
- Ne dodaje se generiranje ili prepravljanje sadržaja studentskog rada.
- Ne uvodi se novi frontend framework, WebGL ili teška biblioteka samo radi dojma.
- Ne uklanja se funkcija zato što nije dio početnog prikaza.
- Ne mijenja se javna početna stranica prije odobrenja demo i beta faze.

## 4. Temeljna UX načela

### 4.1. Jedan ekran, jedan glavni zadatak

Na `/` je glavni zadatak upload. U profilu je glavni zadatak potvrda pravila. Tijekom analize glavni zadatak je razumjeti stvarnu fazu obrade. U rezultatu je glavni zadatak riješiti prvi relevantni nalaz.

### 4.2. Nalaz prije ocjene

Tehnička ocjena ne smije biti glavni naslov rezultata. Glavni naslov govori koliko stvari traži pažnju i što korisnik može napraviti. Ocjena, kategorije i metodologija ostaju u naprednim detaljima.

### 4.3. Dokaz prije tvrdnje

Svaki nalaz koristi isti lanac objašnjenja:

`Što nije u redu -> Gdje je pronađeno -> Zašto je označeno -> Što napraviti`

Kada je dostupno službeno pravilo ili izvor, korisnik ga može otvoriti uz nalaz. Kada automatska provjera nije potpuna, sučelje to mora jasno reći.

### 4.4. Jedna primarna akcija

Svako stanje ima jedan vizualno dominantan sljedeći korak. Preuzimanja, dijeljenje, nova provjera, izvještaj, metodologija i druge mogućnosti ostaju sekundarne.

### 4.5. Progresivno otkrivanje, ne uklanjanje

Informacije koje izravno objašnjavaju nalaz nikada se ne skrivaju kao napredne. Tehnički podaci, profilna validacija, metodologija, detaljne metrike i specijalizirani alati dostupni su kroz napredni sloj.

## 5. Informacijska arhitektura

### 5.1. Početna stranica `/`

Prvi viewport sadrži samo:

- Lekta identitet i diskretan ulaz u `Moji radovi`
- jednu jasnu naslovnu poruku
- veliku upload zonu za `.docx`
- format i ograničenje veličine
- kratku poruku da besplatna analiza ostaje na uređaju
- sekundarni link `Želiš saznati više?`

Na početnoj stranici nema rezultata, demonstracijskih grafikona, velikog navigacijskog izbornika, videa, popisa fakulteta ili opsežnih objašnjenja. Te se mogućnosti ne brišu, nego sele na `/saznaj-vise/`.

Upload mora raditi klikom, povlačenjem datoteke, tipkom Enter i tipkom Space. Nakon odabira odmah se pokreće postojeća lokalna intake provjera.

### 5.2. Radni prostor `/rad/`

Radni prostor vodi cijeli aktivni zadatak:

1. potvrda dokumenta
2. prepoznavanje i potvrda profila
3. transparentna lokalna analiza
4. nalazi i dokument
5. plan ispravaka ili ručna provjera
6. popravak, usporedba i isporuka
7. napredna provjera predaje

Ruta u fragmentu nosi samo nasumični identifikator lokalne sesije, primjerice `/rad/#session=<uuid>`. Fragment se ne šalje poslužitelju u HTTP zahtjevu i ne ulazi u poslužiteljske access logove. Naziv dokumenta, profil, rezultat i sadržaj nikada nisu dio URL-a.

### 5.3. Stranica `/saznaj-vise/`

Postojeći landing sadržaj seli se i poboljšava na zasebnoj stranici. Ondje se prezentiraju:

- način rada proizvoda
- podržani fakulteti, vrste radova i profili
- lokalna analiza i privatnost
- transparentnost službenih pravila
- primjeri nalaza i dokaza
- automatski popravak i njegove granice
- priprema za predaju
- vizualni demo i postojeći atraktivni sadržaji
- čekanje na nove profile, preporuke i relevantne marketinške funkcije

Svaka veća cjelina vraća korisnika prema jasnom CTA-u za novu provjeru na `/`.

### 5.4. Stranica `/moji-radovi/`

Ova stranica okuplja postojeće funkcije prijave, povijesti provjera i povijesti popravaka. Ne uvodi novu trajnu ili poslužiteljsku pohranu dokumentnog sadržaja. Privremena lokalna sesija iz odjeljka 12 zaseban je, vremenski ograničen zapis u korisnikovu pregledniku. Stranica razlikuje:

- privremene lokalne sesije na ovom uređaju
- postojeću poslužiteljsku povijest popravaka vezanu uz račun
- rezultat ili metapodatke koji se već smiju čuvati prema postojećoj logici

Ako korisnik nije prijavljen, prikazuje se objašnjenje što prijava omogućuje. Prijava nije preduvjet za besplatnu lokalnu analizu.

## 6. Tok od uploada do rezultata

### 6.1. Prihvat dokumenta

1. Korisnik odabere `.docx`.
2. Postojeći intake gate lokalno provjerava format, veličinu, strukturu i mogućnosti dokumenta.
3. Ako dokument nije prihvatljiv, korisnik ostaje na `/`, dobiva konkretan razlog i može odmah odabrati drugi dokument.
4. Ako je dokument prihvatljiv, stvara se privremena lokalna sesija.
5. Tek nakon uspješnog zapisa aplikacija prelazi na `/rad/`.

### 6.2. Potvrda dokumenta i profila

Na `/rad/` korisnik prvo vidi naziv dokumenta, njegovu lokalnu dostupnost i mogućnost zamjene. Lekta zatim lokalno pokušava prepoznati ustanovu, vrstu rada i odgovarajući profil.

- Ako je prepoznavanje dovoljno pouzdano, prikazuje se prijedlog koji korisnik potvrđuje ili mijenja.
- Ako nije dovoljno pouzdano, profil se ne odabire potajno. Korisnik ga mora odabrati.
- Izvor profila i datum njegove validacije dostupni su u informacijskom detalju.

Puna analiza ne počinje dok profil nije potvrđen.

### 6.3. Transparentna analiza

Korisnik vidi stvarne faze obrade, primjerice pripremu dokumenta, strukturu, oblikovanje, citate i sastavljanje nalaza. Faze moraju odgovarati događajima koje aplikacija stvarno može potvrditi.

Ne prikazuje se izmišljeni postotak napretka. Ako engine unutar faze nema preciznu mjeru, koristi se neodređeni indikator s jasnim nazivom aktivne faze. Završena faza označava se završenom tek nakon stvarnog završetka.

### 6.4. Rezultat

Rezultat otvara Korektorski stol. Glavna poruka ne počinje ocjenom, nego stanjem zadatka, primjerice:

- `Pronašli smo 6 stvari koje traže tvoju pažnju.`
- `Tri nalaza možemo pripremiti za automatski popravak.`
- `Ostale su dvije ručne provjere.`
- `Nema automatskih blokatora. Provjeri još ručne stavke.`

Spremnost za predaju postaje primarna tek kada korisnik uđe u fazu predaje. U osnovnom rezultatu ona je sekundarna mogućnost, ne konkurentski status.

## 7. Korektorski stol

### 7.1. Desktop raspored

Gornji status proteže se preko cijelog radnog prostora. Ispod njega je približno:

- 58 posto širine za dokument
- 42 posto širine za nalaze i sljedeći korak

Lijeva strana prikazuje dokument kao dominantan fizički objekt. Desna strana prikazuje prioritetni red nalaza i detalj trenutačno odabranog nalaza.

Dokument podržava postojeće prikaze, označena mjesta, čitač, faksimil, stranice i zumiranje. Odabir oznake na dokumentu aktivira isti nalaz u desnom panelu. Odabir nalaza dovodi dokument na odgovarajuće mjesto.

### 7.2. Prikaz nalaza

Svaki odabrani nalaz u prvom planu pokazuje:

- kratko ime problema
- težinu i prioritet
- mjesto u dokumentu
- konkretno opaženo stanje
- očekivano stanje prema profilu
- objašnjenje zašto je označeno
- mogućnost automatskog popravka ili uputu za ručnu provjeru
- poveznicu na pravilo ili izvor kada postoji

Lista ostalih nalaza ostaje kompaktna. Zadano prikazuje neriješene nalaze poredane po važnosti. Filteri težine, kategorije i statusa dostupni su bez zauzimanja stalnog prostora.

### 7.3. Dinamična glavna akcija

| Stanje rezultata | Primarna akcija |
| --- | --- |
| Postoje automatski popravljivi nalazi | `Otvori plan ispravaka` |
| Postoje samo ručni nalazi | `Prikaži ručne provjere` |
| Nema blokatora | `Provjeri spremnost za predaju` |
| Popravak je završen | `Usporedi prije i poslije` |
| Otkrivena je regresija | `Preuzmi izvorni dokument` |

Automatski popravak nikada ne počinje izravno iz općeg rezultata. Korisnik prvo otvara plan, vidi predložene zahvate, odabire ih i daje potreban pristanak.

### 7.4. Sekundarne akcije

Sljedeće funkcije ostaju dostupne, ali nisu istodobno vizualno dominantne:

- nova provjera
- preuzimanje izvještaja
- dijeljenje rezultata
- prijava pogrešnog nalaza
- pomoć
- otvaranje svih detalja
- ručna narudžba ili druga postojeća alternativa

### 7.5. Napredni sloj

Napredni sloj sadrži:

- tehničku ocjenu i kategorijske trake
- detalje oblikovanja, strukture i citiranja
- profil i validaciju pravila
- metodologiju i ograničenja automatske provjere
- metrike dokumenta
- pravopisne, gramatičke, registarske i tipografske provjere
- pravne citate i provjeru izvora
- alate za pripremu predaje

Otvara se kao stabilan drawer, panel ili zaseban prikaz unutar `/rad/`. Stateful moduli ne smiju se rušiti i ponovno stvarati pri svakom otvaranju.

## 8. Mobilni i tablet prikaz

Na mobitelu redoslijed prati korisnikov zadatak, ne desktop stupce:

1. kompaktni status
2. primarna akcija
3. prioritetni nalazi
4. detalj odabranog nalaza
5. gumb za otvaranje dokumenta preko cijelog zaslona
6. napredni detalji

Dokument se otvara kao puni pregled s jasnim povratkom na nalaz. Odabir oznake i nalaza ostaje dvosmjeran. Primarna akcija može biti ljepljiva, ali ne smije prekrivati sadržaj ili tipkovnicu.

Minimalni kriteriji su:

- interaktivne mete od najmanje 44 puta 44 CSS piksela
- bez horizontalnog overflowa cijele stranice
- čitljiv prikaz na uskim ekranima bez desktop minijature
- vidljiv fokus i potpuna tipkovnička navigacija
- podrška za `prefers-reduced-motion`
- boja nije jedini nositelj značenja

Tablet koristi prilagodljivi prijelaz između dvostupčanog i mobilnog toka, ovisno o stvarno dostupnoj širini.

## 9. Vizualni smjer i interakcije

Dominantan smjer je fizički i taktilni korektorski stol, uz uredničku ozbiljnost. Karakter dolazi iz materijala i preciznih reakcija sučelja, ne iz stalnog spektakla.

Zadržavaju se i poboljšavaju postojeći atraktivni elementi:

- papir i slojevi dokumenta
- crvene korektorske oznake
- suptilni žigovi stanja
- urednička tipografija
- indikatori dokaza i provjere
- lokalni prijelazi između faza
- vizualne veze nalaza s mjestom u dokumentu
- usporedba prije i poslije

Wow trenuci vezani su uz korisnikovu radnju:

- upload se pretvara u fizički dokument na stolu
- završena faza ostavlja kratku, smirenu oznaku provjere
- odabir nalaza povlači diskretnu korektorsku vezu prema točnom mjestu
- otvaranje dokaza slaže lanac `pravilo, mjesto, razlog, radnja`
- završeni popravak otvara kontroliranu usporedbu prije i poslije

Nema kontinuiranih page-wide animacija. Animiraju se prvenstveno `transform` i `opacity`, na malim površinama i kratko. Veliki blur, stalni filtri, pozadinske petlje i rad na svakom `scroll` događaju nisu dopušteni. Reduced-motion varijanta odmah prikazuje stabilno završno stanje.

## 10. Potpuna funkcionalna paritetnost

Redizajn koristi registar paritetnosti. Funkcija se smatra prenesenom tek kada ima novu lokaciju, dostupnu interakciju i test.

| Postojeća mogućnost | Nova lokacija |
| --- | --- |
| Upload, drag and drop, zamjena dokumenta | `/` i potvrda dokumenta u `/rad/` |
| Odabir ustanove, rada i profila | Korak profila u `/rad/` |
| Faze analize | Transparentni korak analize u `/rad/` |
| Čitač, anotirani prikaz, faksimil, stranice i zum | Glavni dokument Korektorskog stola |
| Nalazi, težine, filteri i trijaža | Desni panel nalaza |
| Vodič kroz rezultat i sljedeći koraci | Dinamična primarna akcija i plan |
| Plan ispravaka i automatski popravak | Plan unutar `/rad/` |
| Potvrde za zahvate koji diraju vidljivi tekst | Pojedinačne potvrde u planu |
| Usporedba prije i poslije | Stanje nakon popravka |
| Provjera regresija i sigurna isporuka | Obavezni završetak repair toka |
| Spremnost za predaju | Faza `Predaja` |
| PDF, metapodaci, antivirusna provjera i preflight | Napredna faza `Predaja` |
| Rokovi i podsjetnici | Faza `Predaja` i `/moji-radovi/` |
| Tehnička ocjena i kategorije | Napredni detalji |
| Oblikovanje, citiranje, struktura i profilna validacija | Napredni detalji |
| Tipografija, pravopis, gramatika i registar | Napredni detalji i povezani nalazi |
| Legal Citation Engine | Napredni detalji i povezani nalazi |
| Provjera postojanja izvora i CrossRef | Kontekstualna radnja uz relevantan nalaz |
| Metrike dokumenta | Napredni detalji |
| Dokaz lokalne obrade i privatnost | Stalni signal povjerenja i sigurnosni detalj |
| Preuzimanja, lokalni i puni izvještaj te dijeljenje | Sekundarne akcije i `Izvoz` |
| Cloud integritetska provjera | Kontekstualna napredna provjera uz vlastitu privolu |
| Paketi, entitlement, checkout i povratak s plaćanja | Kontekstualno unutar repair ili narudžbenog toka |
| Prijava pogrešnog nalaza i pomoć | Kontekstualna akcija uz nalaz |
| Povijest i prijava | `/moji-radovi/` |
| Demo, metodologija i marketinški sadržaj | `/saznaj-vise/` |
| Besplatni alati i fakultetske SEO stranice | Postojeći URL-ovi, otkrivanje kroz `/saznaj-vise/` |
| Waitlist i referral | Kontekstualno na `/saznaj-vise/` ili nakon nedostupne funkcije |
| Tema, privacy postavke i consent kontrole | Dijeljeni shell svake odgovarajuće rute |
| Pravne stranice | Postojeći generirani URL-ovi i footer poveznice |
| QA i razvojne kontrole | Isključivo razvojni build |

## 11. Tehnička arhitektura

### 11.1. Vite MPA ulazi

Svaka glavna ruta ima vlastiti tanki HTML i TypeScript bootstrap. Dijeljeni su samo moduli koje ruta stvarno koristi. Time `/` ne povlači analizator, profile, repair, preflight, faksimil, povijest, video ili napredne vizuale.

Ostaje vanilla TypeScript i postojeći build sustav. Ne uvodi se SPA router. Unutar `/rad/` faze se mijenjaju lokalnim state modelom bez ponovnog učitavanja cijele stranice.

### 11.2. Granice modula

Arhitektura odvaja sljedeće odgovornosti:

- intake shell: upload i početna validacija
- local session store: spremanje, dohvat, verzioniranje, istek i brisanje sesije
- profile controller: detekcija, potvrda i izmjena profila
- analysis controller: postojeći worker most, faze i rezultat
- workspace shell: status, dokument, nalazi i dinamična akcija
- feature panels: repair, predaja, izvori, izvještaj, povijest i napredni detalji
- route bootstrapi: učitavaju samo ono što pojedina stranica treba

Poslovna logika se ne kopira između ruta. Postojeći moduli ostaju autoritet, a UI ih poziva kroz male, tipizirane granice.

### 11.3. Stabilnost stanja

Repair, preflight, dokumentni prikaz i drugi stateful moduli dobivaju stabilne DOM mount točke. Otvaranje i zatvaranje panela mijenja vidljivost i stanje, ne prepisuje cijeli rezultat preko `innerHTML` i ne registrira iste listenere više puta.

Veći popisi renderiraju se djelomično ili po potrebi. Scroll i resize reakcije prolaze kroz postojeće mehanizme sažimanja frameova i ne izvode skupe izračune za svaki događaj.

### 11.4. Model stanja

Osnovni tok koristi eksplicitna stanja:

`empty -> validating -> sessionReady -> profile -> analyzing -> results -> repairPlan -> repairing -> comparison -> submission`

Pogreška je stanje povezano s posljednjim sigurnim korakom. Ne briše dokument ili profil ako ih nije potrebno odbaciti.

## 12. Lokalna sesija između ruta

### 12.1. Sadržaj sesije

Privremena sesija u IndexedDB-u može sadržavati:

- verziju sheme
- nasumični ID generiran s `crypto.randomUUID()`
- vrijeme nastanka i isteka
- izvorne lokalne bajtove dokumenta
- minimalne metapodatke datoteke
- rezultat `docxCapability()` provjere
- potvrđeni profil
- lokalni rezultat analize potreban za obnovu radnog prostora
- korisničko stanje poput odabranog nalaza

Sadržaj ostaje u pregledniku. Ne koristi se `localStorage` za dokument, tekst, rezultat ili identifikator koji otkriva sadržaj.

### 12.2. Životni vijek

Sesija vrijedi najviše 24 sata. Brisanje se provodi:

- pri eksplicitnoj akciji `Obriši lokalni dokument`
- pri pokretanju nove provjere ako korisnik potvrdi zamjenu
- pri svakom pokretanju aplikacije ili pristupu sesiji ako je istekla
- best-effort timerom dok je stranica otvorena

Preglednik ne može jamčiti izvršavanje koda točno u trenutku isteka dok je zatvoren. Zato su tvrdnje u sučelju precizne: istekla sesija briše se pri sljedećem pokretanju ili pristupu.

### 12.3. Nedostupna lokalna pohrana

Ako IndexedDB nije dostupan ili nema dovoljno prostora, dokument se ne smatra spremljenim. Korisniku se nudi memory-only nastavak u istom tabu. Taj iznimni tok dinamički učitava radni prostor na trenutačnoj stranici i jasno upozorava da će refresh izgubiti dokument.

Ne koristi se nesiguran ili skriveni fallback u `localStorage`.

### 12.4. Obnova i zastarjela shema

Refresh `/rad/` obnavlja valjanu sesiju. Nevažeći, istekli ili nepoznati zapis ne pokušava se protumačiti pod svaku cijenu. Korisnik dobiva mogućnost povratka na novi upload, a oštećeni zapis se sigurno uklanja.

## 13. Sigurnosne konstante

Redizajn je sigurnosno očuvanje, ne sigurnosni rewrite. Code splitting, novi entryji i novi vizualni sloj ne smiju zaobići postojeće zaštite.

### 13.1. Lokalna analiza i mrežna granica

- Besplatna analiza izvodi se lokalno, bez uploada dokumenta.
- E2E test presreće mrežu i dokazuje da lokalna analiza ne šalje dokument ili njegov sadržaj.
- Repair, puni izvještaj, source check, cloud integritetska provjera, preflight, narudžba, podsjetnici i analitika ostaju zasebne mrežne svrhe.
- Svaka svrha ima vlastiti gate i objašnjava što se šalje, zašto i koliko se čuva. Koristi izričitu privolu ondje gdje je ona pravna osnova, a jasnu korisničku potvrdu ili predaju zahtjeva u ostalim tokovima.
- Privola ili potvrda jedne svrhe ne prenosi se na drugu.
- Endpointi dolaze samo iz postojeće konfiguracije i dopuštenog CSP popisa.

Redizajn mora očuvati postojeću razliku među mrežnim tokovima:

| Svrha | Podaci i postojeća granica |
| --- | --- |
| Besplatna analiza | Dokument, tekst i nalazi ostaju na uređaju |
| Puni izvještaj | Šalju se samo potrebni izvedeni podaci nakon prijave i izričitog zahtjeva, ne cijela datoteka ni tijelo rada |
| Provjera prije predaje | Cijela datoteka šalje se uz zasebnu privolu, datoteka se briše nakon analize, a nalaz se čuva prema postojećoj politici |
| Automatski popravak | Cijela datoteka šalje se uz zaseban pristanak, a izvorni i popravljeni dokument čuvaju se prema postojećoj politici računa ili anonimne sesije |
| Provjera izvora uz popravak | Bibliografski metapodaci uspoređuju se s Lektinim korpusom, promašaj nije dokaz nepostojanja izvora |
| Cloud integritetska provjera | Tekst se smije poslati samo kroz postojeći consent gate |
| Vanjska bibliografska provjera | Vanjskim servisima šalju se samo bibliografski podaci, ne tijelo rada |
| Ručna narudžba | Dokument i kontaktni podaci šalju se tek izričitim slanjem narudžbe |
| Analitika | Anonimni događaji šalju se samo uz postojeću privolu i bez dokumentnog sadržaja |

Tekst privole i rokovi čuvanja ne smiju se prepisivati u više nepovezanih UI modula. Moraju dolaziti iz postojećeg pravnog i konfiguracijskog izvora kako se sučelje i pravna stranica ne bi razišli.

### 13.2. Siguran prihvat dokumenta

- Sve rute koriste postojeći `intake-gate` i zajedničke granice iz `docx-budget`.
- Ne uvodi se pojednostavljeni paralelni validator.
- Ostaju provjere veličine, ZIP strukture, dekomprimiranog budžeta, broja zapisa, makronaredbi, oštećenja i capability razlike između analize i popravka.
- Dokument se ne prosljeđuje analizatoru ili repair toku ako odgovarajući sigurnosni gate nije prošao.

### 13.3. Sigurno prikazivanje

- Korisnički, profilni i dokumentni tekst prolazi kroz centralizirani `escapeHtml` ili sigurne DOM API-je.
- Dokumentni sadržaj nikada se ne umeće kao neprovjereni HTML.
- Vanjske poveznice prolaze kroz `safeHref` i koriste `rel="noopener"` kada se otvaraju u novom tabu.
- Naziv datoteke tretira se kao nepouzdan unos.

### 13.4. CSP i produkcijski build

- Svaki MPA output dobiva postojeća sigurnosna zaglavlja iz `public/_headers`.
- Ostaju `default-src 'self'`, zabrana objekata, zabrana uokvirivanja i ograničen `connect-src`.
- Ostaju HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options` i postojeća `Permissions-Policy` ograničenja.
- Hash dopuštenog inline theme skripta ostaje provjeren testom.
- Razvojna i QA sučelja uklanjaju se iz javnog builda.
- Novi entry ne smije uvoditi inline skriptu, vanjski runtime ili novi origin bez zasebnog sigurnosnog pregleda.

### 13.5. Autorizacija i telemetrija

- Lokalni session ID nije autentikacija niti dokaz vlasništva nad poslužiteljskim resursom.
- Poslužiteljske funkcije zadržavaju provjeru korisnika, prava, limita i rate limitinga.
- Javni Supabase ključ nije sigurnosna granica.
- Analitika ostaje isključena bez postojeće privole. Analitika i error reporting ne primaju naziv datoteke, tekst dokumenta, citate, lokalne bajtove ili sadržaj nalaza.
- Dijeljeni rezultat ostaje saniran i ne uključuje dokumentni sadržaj.

### 13.6. Repair sigurnost i akademska granica

Ostaju obavezni:

- autoritativni parametri na poslužitelju za poznati profil i pravilo
- deterministički repair bez modela i prompta
- zabrana pisanja i prepravljanja sadržaja rada
- postojeće pojedinačne potvrde za dopuštene iznimke vidljivog teksta
- provjera integriteta DOCX paketa
- ponovna analiza i detekcija regresija prije preporuke isporuke
- izvorni dokument kao sigurna glavna ponuda kada postoji regresija
- iskren prikaz `storagePending` stanja
- tvrdnja da promašaj provjere izvora nije dokaz da izvor ne postoji

### 13.7. Privatnost lokalne sesije

- URL fragment sadrži samo nasumični session ID. Fragment se ne šalje hostingu i nije autentikacija.
- Dokument i rezultat nisu u `localStorage`, URL-u, logovima ili telemetriji.
- Lokalni zapis ima verziju i rok isteka.
- Korisnik ima vidljivu akciju za trenutno brisanje.
- Sučelje ne tvrdi da je IndexedDB aplikacijski kriptiran. Na dijeljenom uređaju korisniku se preporučuje ručno brisanje nakon rada.
- Prije produkcijskog cutovera pravna stranica i kratka privacy poruka moraju izričito opisati da se cijeli dokument može privremeno spremiti u preglednik do 24 sata radi prijelaza između ruta i obnove rada.

## 14. Pogreške i oporavak

| Situacija | Ponašanje |
| --- | --- |
| Neispravan ili nepodržan DOCX | Ostati na uploadu, objasniti razlog, omogućiti novu datoteku |
| Dokument se može analizirati, ali ne i popraviti | Dopustiti analizu i unaprijed jasno označiti repair ograničenje |
| Profil nije pouzdano prepoznat | Zaustaviti se na ručnom odabiru, bez tihog defaulta |
| Worker analiza ne uspije | Koristiti postojeći kontrolirani fallback, a zatim ponuditi ponovni pokušaj bez gubitka dokumenta |
| Sesija je istekla | Objasniti istek, ukloniti zapis i vratiti korisnika na upload |
| IndexedDB nije dostupan | Ponuditi memory-only nastavak bez lažne tvrdnje o spremanju |
| Mrežna repair ili source-check usluga ne radi | Sačuvati lokalni rezultat i dokument, prikazati ponovni pokušaj |
| Repair integritet ne prolazi | Ne isporučiti nesiguran paket, zadržati izvornik i postojeće jamstvo naplate |
| Ponovna analiza nalazi regresiju | Preporučiti izvornik, popravljeni dokument ostaviti samo kao jasno označen sekundarni izbor |
| Pohrana popravka još traje | Prikazati `spremanje u tijeku`, ne `spremljeno` |

Poruka o pogrešci uvijek govori što se dogodilo, što je ostalo sigurno i koja je sljedeća radnja.

## 15. Performanse

### 15.1. Početna stranica

Ciljani početni budžet za `/` je:

- najviše 100 kB JavaScripta gzipano
- najviše 40 kB CSS-a gzipano

Teški moduli učitavaju se tek nakon korisničke radnje ili na ruti kojoj pripadaju.

### 15.2. Radni prostor

- Shell `/rad/` prikazuje se prije učitavanja teških naprednih modula.
- Parser i analiza ostaju u Web Workeru, uz postojeći inline fallback.
- Faksimil, repair, preflight, source check i detaljne vizualizacije učitavaju se na zahtjev.
- Dokumentni prikaz ne renderira odjednom nepotrebne stranice.
- Veliki rezultati ne uzrokuju puni rerender cijelog workspacea.
- Animacije ne blokiraju unos i ne ovise o neograničenoj petlji.

Za svaki route bundle bilježi se početni baseline. Nova iteracija ne smije povećati početni bundle bez obrazloženja i mjerenog korisničkog učinka.

### 15.3. Mediji i vizualni sadržaj

Video, velike slike i dekorativni asseti ostaju na `/saznaj-vise/` ili se učitavaju tek u vidljivom dijelu. Početni upload ne čeka njihove zahtjeve. Postojeći atraktivni vizuali ponovno se koriste, ali ne ulaze automatski u svaki bundle.

## 16. Pristupačnost

- Sve akcije rade tipkovnicom i dodirom.
- Fokus nakon promjene faze dolazi na novi glavni naslov, bez neočekivanog skoka.
- Napredni paneli vraćaju fokus na element koji ih je otvorio.
- Status analize koristi pristojan `aria-live`, bez ponavljanja svake animacijske promjene.
- Nalazi imaju tekstualnu težinu i status, ne samo boju ili ikonu.
- Dokumentne oznake imaju razumljive pristupačne nazive i alternativu u listi nalaza.
- Modalni i fullscreen prikazi zadržavaju fokus i nude vidljivo zatvaranje.
- Reduced-motion ne skriva sadržaj i ne odgađa završno stanje.

## 17. Testiranje i kriteriji prihvaćanja

### 17.1. Funkcionalni testovi

- Upload, intake, lokalna sesija i prelazak na `/rad/`.
- Detekcija, promjena i potvrda profila.
- Stvarni slijed faza analize bez lažnog napretka.
- Dvosmjerna veza nalaza i dokumentne oznake.
- Matrica dinamične primarne akcije.
- Otvaranje i zatvaranje svih naprednih modula bez gubitka stanja.
- Repair plan, pristanak, rezultat, regresija i isporuka.
- Refresh, back, istek i eksplicitno brisanje sesije.
- Svaka stavka registra paritetnosti ima barem jedan test ili postojeći dokazani test koji ostaje zelen.

### 17.2. Sigurnosni testovi

- Nema prijenosa dokumenta tijekom lokalne analize.
- Svaka mrežna svrha ima zaseban consent gate.
- Svi MPA outputi dobivaju CSP i ostala sigurnosna zaglavlja.
- Zlonamjeran naziv datoteke, profilni tekst i nalaz ne mogu umetnuti HTML ili skriptu.
- Dokumentni sadržaj ne završava u URL-u, `localStorage`, analitici ili error reportingu.
- IndexedDB istek, pristup istekloj sesiji i ručno brisanje rade deterministički.
- Postojeći testovi intake budžeta, param authorityja, package integriteta, vidljivog teksta, regresija i redoslijeda isporuke ostaju zeleni.

### 17.3. Vizualni i pristupačni testovi

- Desktop, tablet i mobilni breakpointi nemaju page-wide overflow.
- Najvažniji nalaz i primarna akcija vidljivi su bez traženja kroz tehničke kartice.
- Dokument je dominantan na desktopu, a nalazi su prvi na mobitelu.
- Tipkovnička navigacija, vidljiv fokus, 44 px mete i reduced-motion prolaze ručnu i automatiziranu provjeru.
- Nema novih critical ili serious axe nalaza.

### 17.4. Izvedbeni testovi

- `/` prolazi dogovoreni gzip budžet.
- Ruta `/` ne uvozi profile, analizator, repair, preflight, faksimil, povijest ili landing medije u početni graf.
- Lokalna analiza ne blokira glavnu dretvu svojim teškim radom.
- Scroll, resize i lokalne animacije ne proizvode ponavljane duge zadatke.
- Glavni tok ostaje upotrebljiv na sporijem mobilnom uređaju i uz reduced-motion.

### 17.5. Projektni gate

Svaka implementacijska cjelina mora završiti zelenim `npm run check`. Parser, audit i citation engine ne mijenjaju se bez golden testa koji prvo dokazuje postojeće ponašanje. Produkcijski output dodatno mora proći postojeću provjeru generiranih pravnih stranica i deploy artefakata.

## 18. Demo-first uvođenje

### Faza A: izolirani vizualni demo

- Koristi zaseban demo entry bez izmjene javnog `/`.
- Prikazuje upload, profil, transparentnu analizu, rezultate, mobilni tok i napredni sloj.
- Koristi jasno označene demo podatke kada rezultat nije stvarna analiza.
- Omogućuje provjeru hijerarhije, taktilnih interakcija i količine sadržaja.

### Faza B: funkcionalna beta ruta

- Povezuje novu arhitekturu s postojećim intakeom, profilima i lokalnom analizom.
- Dodaje lokalnu sesiju i stvarne route entryje iza nepromoviranog beta URL-a.
- U ovoj fazi trenutačna javna stranica i dalje ostaje glavni proizvod.

### Faza C: potpuna paritetnost

- Prenose se repair, predaja, izvori, povijest, izvoz i ostale funkcije.
- Zatvara se registar paritetnosti.
- Provode se sigurnosni, pristupačni, mobilni i izvedbeni gateovi.

### Faza D: kontrolirani cutover

- Tek nakon korisničkog odobrenja i zelenih gateova novi minimalni intake postaje `/`.
- Postojeći landing prelazi na `/saznaj-vise/`.
- Stari tok ostaje kratko dostupan kao povratna mogućnost tijekom provjere produkcije.
- Nakon stabilizacije uklanjaju se samo dokazano neaktivni duplikati, nikada funkcije bez zamjene.

## 19. Konačni kriterij uspjeha

Redizajn je uspješan kada:

1. Novi korisnik bez objašnjenja odmah zna gdje učitati rad.
2. Nakon analize u nekoliko sekundi zna što je pogrešno, gdje, zašto i što napraviti.
3. Postoji samo jedna očita sljedeća akcija za trenutačno stanje.
4. Sve postojeće funkcije i sigurnosne zaštite imaju novu, testiranu lokaciju.
5. Početna stranica ostaje mala i brza, a teški moduli ne usporavaju prvi zadatak.
6. Desktop, tablet i mobilni tok nude iste mogućnosti uz raspored prilagođen uređaju.
7. Lekta zadržava ozbiljnost i dokazivost, ali dobiva prepoznatljiv taktilni karakter i kontrolirane wow trenutke.

## 20. Zaključane odluke

- Konačna arhitektura koristi zasebne Vite MPA ulaze.
- Početna stranica je minimalni intake.
- Nakon uploada korisnik prelazi u zaseban radni prostor.
- Korektorski stol je dominantan vizualni koncept.
- Dokument dominira desktopom, nalazi dominiraju mobitelom.
- Nalazi, razlog i ispravak imaju prednost pred ocjenom i metodologijom.
- Glavna akcija je dinamična i uvijek jedna.
- Sve postojeće funkcije ostaju dostupne kroz kontekstualne ili napredne slojeve.
- Sve postojeće sigurnosne zaštite ostaju tvrde konstante.
- Uvođenje je demo-first i ne mijenja glavnu stranicu prije odobrenja.

Ovo je krovna arhitektonska specifikacija. Opseg je namjerno podijeljen na demo, funkcionalnu betu, paritetnost i cutover kako se sigurnost i kvaliteta ne bi pokušale riješiti jednim velikim zahvatom. Nakon korisničkog pregleda sljedeći implementacijski plan obuhvaća samo Fazu A, izolirani demo. Svaka kasnija faza dobiva vlastiti plan i vlastiti approval gate.
