# Lekta globalna navigacija i vizualni route shell

## Status i odluka

Korisnik je 26. kolovoza 2026. odobrio smjer "tanki header + Sve mogućnosti". Minimalni upload ostaje jedini dominantni zadatak početne stranice. Ostale funkcije postaju lako dostupne kroz mali zajednički shell, grupirani direktorij i kontekstualne ulaze, bez povratka na stari prenatrpani nav.

Ova specifikacija definira krajnju arhitekturu. Implementacija se dijeli u četiri samostalno provjerljiva plana jer zajednički shell, ručne javne stranice, generirane stranice i stvarni osobni prostor imaju različite rizike i testne granice.

## Cilj

Korisnik s bilo koje javne Lekta stranice mora moći:

- odmah pokrenuti novu provjeru
- otvoriti ili pronaći svoje radove
- u najviše dvije interakcije pronaći svaki javni alat, pravilo, dokaz ili stranicu pomoći
- razumjeti što je globalna funkcija, a što radnja nad trenutačnim dokumentom
- na mobitelu dobiti isti sadržaj bez paralelnog drugog navigacijskog sustava

Vizualni rezultat mora djelovati kao isti proizvod: korektorski stol ostaje dominantan, a ostale stranice koriste isti papir, tintu, tipografiju, crveni korektorski akcent i kratke taktilne prijelaze.

## Problem koji rješavamo

Novi root uspješno uklanja distrakcije, ali je između njega i ostatka proizvoda nastao rascjep:

- alati su skriveni duboko u stranici Saznaj više ili u starim navovima
- Pravila po fakultetu, Pokrivenost, Usporedba i Benchmark nisu vidljivi iz novog shella
- Povijest i Moji popravci postoje u workspace utility redu, dok je /moji-radovi/ još informativna najava
- dio starih stranica i dalje vodi na fragmente minimalnog index.html koji više ne postoje
- različite javne stranice koriste različite headere, mobilne menije i vizualne ritmove
- vraćanje svih stavki u ravni header ponovno bi stvorilo isti problem prenatrpanosti

## Dizajnerska načela

1. Upload je uvijek prvi zadatak na rootu.
2. Globalni header prikazuje najviše tri korisničke odluke uz brand.
3. Jedan panel nosi cijeli javni direktorij, bez hover-only ponašanja.
4. Radnje nad trenutačnim dokumentom ostaju u /rad/, ne u globalnom navu.
5. Isti vizualni jezik ne znači ista gustoća sadržaja.
6. Javni shell ne smije učitati analizu, profile, popravak, auth klijent, ikone ni landing runtime.
7. Privatnost se objašnjava na mjestu radnje, posebno kod uploada, popravka, narudžbe i prijave.
8. Animacije su kratke i potaknute interakcijom. Nema kontinuiranog motiona preko stranice.
9. Admin, verification i QA odredišta nikada nisu dio javnog direktorija.
10. Lekta ostaje provjera forme, ne sadržaja rada.

## Informacijska arhitektura

### Header na početnoj stranici

Redoslijed:

- Lekta, poveznica na /
- Moji radovi, poveznica na /moji-radovi/
- Sve, gumb koji otvara panel Sve mogućnosti

Na rootu nema gumba Nova provjera jer je korisnik već na toj radnji. Nema stalno vidljive lampe, prijave, cijena, benchmarka ni popisa alata. Ispod upload stola ostaju samo dva tiha tekstualna ulaza:

- Kako radi i privatnost, /saznaj-vise/#how
- Besplatni alati, /alati.html

### Header na workspace ruti

Redoslijed:

- Lekta
- Nova provjera, /
- Moji radovi, /moji-radovi/
- Sve

Sva tri ulaza su vizualno tiha. Workspace rail ostaje isključivo:

- Dokument
- Profil
- Nalaz

Povijest, Moji popravci, Popravi, Preflight, preuzimanja, prijava pogrešne provjere i podsjetnik na rok ostaju kontekstualne funkcije trenutačnog dokumenta. Globalni shell ih ne preseljava niti duplicira.

### Header na sadržajnim i alatnim stranicama

Redoslijed:

- Lekta
- Nova provjera, /
- Moji radovi, /moji-radovi/
- Sve

Nova provjera je jedini naglašeni CTA. Na mobitelu sadržajne i alatne stranice smiju imati jedan sticky CTA "Provjeri rad". Taj CTA ne postoji na rootu, u /rad/ ni u /moji-radovi/.

### Mobilni header

Redoslijed:

- Lekta
- Radovi
- gumb izbornika

Gumb izbornika otvara isti direktorij kao desktop. Lampa i postavke privatnosti nalaze se u utility dijelu panela, ne u headeru. Sve dodirne mete imaju najmanje 44 puta 44 CSS piksela.

## Panel Sve mogućnosti

Panel se otvara klikom ili tipkovnicom, nikada samo hoverom. Na desktopu izgleda kao podignuti papir u dva stupca. Na mobitelu je modalni sheet s jednom kolonom.

Panel ima naslov "Sve mogućnosti", vidljivi gumb Zatvori, aktivnu rutu i četiri skupine.

### Tvoj rad

- Nova provjera, /
- Nastavi trenutačni rad, /rad/, prikazuje se samo kada host ruta potvrdi valjanu lokalnu sesiju
- Moji radovi, /moji-radovi/
- Prijava i spremljeni popravci, /moji-radovi/#racun, aktivira se tek u planu za stvarni osobni prostor

Javni shell ne čita IndexedDB, dokument, auth sesiju ni Supabase. Opcionalni ulaz Nastavi rad host mu predaje kroz options objekt.

### Pravila i povjerenje

- Kako radi, /saznaj-vise/#how
- Što se provjerava, /saznaj-vise/#checks
- Metodologija i dokazi, /saznaj-vise/#trust-proof
- Pravila po fakultetu, /fakulteti/
- Pokrivenost profila, /pokrivenost.html
- Privatnost obrade, /obrada-dokumenata.html

### Besplatni alati

- Svi alati, /alati.html
- Citat generator, /citat.html
- Provjera citata i literature, /citati-i-literatura.html
- Brojač kartica, /kartice.html
- Naslovnica, /naslovnica.html
- Literatura, /literatura.html
- Izjava o izvornosti, /izjava.html

### Dokazi i pomoć

- Usporedba, /landing_usporedba.html
- Benchmark, /landing_benchmark.html
- Paketi, /saznaj-vise/#pricing
- Česta pitanja, /saznaj-vise/#faq
- Garancija, /garancija.html
- Uvjeti i povrat, /uvjeti-koristenja.html

### Utility dio

- Lampa, postojeća tema i ključ lekta.theme
- Postavke privatnosti, samo kada host ima postojeći consent runtime
- Privatnost, /privatnost.html
- Obrada dokumenata, /obrada-dokumenata.html

Na mobitelu je skupina Tvoj rad otvorena pri prvom prikazu. Ostale skupine prikazuju naslov i broj odredišta te se otvaraju kao pristupačne sklopive cjeline. Na desktopu su sve četiri skupine vidljive bez dodatnog klika.

## Vizualni sustav

Zajednički shell koristi postojeće route tokene kao kanonsku osnovu:

- topla površina stola
- svijetli papir i tanki papirnati rub
- tinta visoke čitljivosti
- korektorski crveni akcent
- zeleni status povjerenja
- serif za editorial naslove
- sans serif za kontrole
- mono detalji samo za kratke oznake

Panel dobiva jedan fizički "paper lift" pri otvaranju, najviše 180 ms, samo opacity i transform. Korektorska oznaka može napraviti jednokratni pomak ili rotaciju do 3 stupnja. Nema čestica, videopozadina, beskonačnih petlji, blur animacije ni animiranja layout svojstava.

prefers-reduced-motion uklanja prijelaz i odmah prikazuje stabilan panel. Dark tema zadržava papirnatu hijerarhiju, ali ne pretvara sadržajni papir u tamnu površinu niskog kontrasta.

### Vizualne varijante ruta

Zajednički vizualni jezik ne pretvara sve stranice u isti predložak. Svaka vrsta rute ima vlastitu gustoću:

- početna stranica je gotovo prazan korektorski stol s upload papirom kao jedinim dominantnim objektom
- workspace je najgušći radni prikaz, s procesnim railom i kontrolama vezanim uz trenutačni dokument
- Saznaj više, metodologija, pomoć i pravne stranice izgledaju kao čitljiv urednički dosje, s uskim retkom teksta i lokalnim sadržajem stranice
- besplatni alati izgledaju kao jedan fokusirani instrument: ulaz, rezultat i kratko objašnjenje, bez marketinškog zida kartica
- Usporedba, Benchmark i Pokrivenost izgledaju kao dokazna ploča, gdje tablice, izvori i mjerljivi podaci imaju prednost pred dekoracijom
- Moji radovi izgleda kao dvije jasno označene fizičke police, Na ovom uređaju i Na računu

Zajednički su im header, papirnate površine, tipografska hijerarhija, korektorski akcent, fokus stanja i ritam razmaka. Hero, gustoća kartica, pomoćna navigacija i raspored kontrola pripadaju vrsti rute.

Postojeći vizualno atraktivni elementi ostaju kada objašnjavaju stanje ili pomažu radnji. Premještaju se u odgovarajući kontekst, ne kopiraju u globalni shell. Wow trenuci su lokalni i jednokratni:

- taktilno otvaranje papira Sve mogućnosti
- kratki korektorski pečat pri dovršetku važne faze
- jednokratno podcrtavanje ključnog dokaza ili upozorenja
- prijelaz između faza Dokument, Profil i Nalaz

Nijedan od tih elemenata ne smije pokretati kontinuiranu animaciju, učitavati novu motion biblioteku ili usporiti unos, upload, skrolanje i otvaranje rezultata.

## Komponentne granice

### Kanonski direktorij

Nova javna datoteka src/routes/shared/public-route-directory.json sadrži samo:

- stabilni id skupine
- stabilni id odredišta
- hrvatski label
- root-relative href
- kratki opis
- oznaku je li odredište dostupno u prvoj isporuci ili nakon osobnog prostora

JSON ne sadrži korisničke podatke, profile fakulteta, cijene, auth stanje ni poslovnu logiku. Čitaju ga browser route shell i build generatori, pa ručne i generirane stranice ne održavaju zasebne popise.

Odredište označeno za kasniju isporuku ne prikazuje se kao onemogućena ili slijepa stavka. Selektori ga potpuno izostavljaju dok pripadajuća funkcija i testovi nisu isporučeni.

TypeScript modul src/routes/shared/public-route-directory.ts validira JSON u uski readonly tip i izvozi selektore za četiri skupine.

### Route shell

src/routes/shared/route-shell.ts ostaje jedino mjesto za:

- mount i idempotentni remount
- označavanje aktivne rute
- render direktorija
- otvaranje i zatvaranje panela
- upravljanje fokusom
- Escape i klik na backdrop
- temu
- breakpoint ponašanje
- opcionalni Nastavi rad ulaz

Predloženo javno sučelje:

RouteShellOptions:
- current: stabilni id trenutačne javne rute
- variant: intake, workspace, content ili my-work
- continuation: opcionalni objekt s href i labelom
- privacySettingsAvailable: boolean

mountRouteShell(document, options) mora biti siguran pri ponovnom pozivu. Novi mount zatvara prethodni panel i uklanja stare document listenere, primjerice preko WeakMap Document u AbortController. To je obvezno jer memory-only prijelaz mijenja root u workspace bez potpunog reloada.

### Markup

Svaka ručna ruta ima mali statički header s brandom, primarnim linkovima, gumbom Sve i praznim mountom panela. Route shell popunjava direktorij iz javnog manifesta.

Ako JavaScript ne radi, brand, Nova provjera i Moji radovi ostaju obične poveznice. Footer ostaje no-JS mapa osnovnih odredišta.

### Stilovi

src/routes/shared/route-shell.css sadrži sav zajednički header, panel, dialog, focus, mobile sheet i reduced-motion CSS. Intake, workspace, learn-more, my-work i alatne stranice zadržavaju svoje route CSS datoteke za sadržaj.

Specifična ruta smije mijenjati gustoću i naglasak headera kroz variant data atribut, ali ne duplicira strukturu panela.

## Ugovor funkcionalnog pariteta

Redizajn mijenja arhitekturu prezentacije, ne opseg proizvoda. Prije migracije svake rute implementacijski plan bilježi njezine postojeće korisničke radnje i veže ih uz ponašajne testove. Sama prisutnost linka ili DOM elementa nije dokaz pariteta.

Obvezno se čuvaju najmanje sljedeći tokovi:

- upload, drag and drop, odabir dokumenta, nastavak valjane lokalne sesije i prijelaz u workspace
- odabir ustanove, programa i vrste rada te transparentne faze Dokument, Profil i Nalaz
- lokalna analiza, rezultati, detalji kategorija i sve postojeće akcije nad nalazom
- automatski popravak, potvrde, provjera regresija te isporuka izvornog i dopuštenog popravljenog dokumenta
- lokalna povijest metapodataka, prijava i serverski spremljeni Moji popravci, uz točan opis razlike
- preflight, izvještaji i preuzimanja, prijava pogrešne provjere te postojeći tokovi narudžbe, waitliste, roka i podsjetnika
- tema, postavke privatnosti i postojeće consent poruke
- svi postojeći obrasci, izračuni, kopiranje, izvoz i resetiranje na besplatnim alatima

Funkcija ne mora biti u globalnom navu. Mora ostati dosegljiva u svom prirodnom kontekstu, imati isto ili jasnije značenje i zadržati iste sigurnosne preduvjete.

Postojeća kontrola smije se ukloniti tek kada zamjenska kontrola:

1. vodi do iste korisničke mogućnosti
2. ima ponašajni test, ne samo markup test
3. čuva lokalnu ili serversku granicu podataka
4. ne uvodi dodatnu obveznu prijavu za lokalne funkcije

Ako za postojeću funkciju nije moguće dokazati paritet, odgovarajući plan ne završava i stara kontrola ostaje dostupna.

## Obuhvat ruta i faze

### Plan 1: zajednički shell i četiri temeljne rute

- /
- /rad/
- /saznaj-vise/
- /moji-radovi/

Ovaj plan uvodi manifest, panel, responsive ponašanje, idempotentni mount i performance gate. Ne pretvara /moji-radovi/ u funkcionalni hub.

### Plan 2: ručne javne stranice

- /alati.html
- /citat.html
- /kartice.html
- /naslovnica.html
- /literatura.html
- /izjava.html
- /citati-i-literatura.html
- /landing_usporedba.html
- /landing_benchmark.html

Stari ravni i hover nav uklanja se s tih stranica. Njihove postojeće funkcije, obrasci, SEO metapodaci i vlastiti entrypointi ostaju netaknuti.

### Plan 3: generirane i dokazne stranice

- /fakulteti/ i stranice pojedinih fakulteta
- /alati/citati/
- /alati/naslovnica/
- /alati/brojac-kartica.html
- /pokrivenost.html i pravne statičke stranice

Generatori čitaju isti public-route-directory.json. Generirane stranice moraju zadržati puni no-JS sadržaj, breadcrumb, canonical, JSON-LD i postojeće sigurnosne tvrdnje.

### Plan 4: stvarni osobni prostor i kontekstualni handoff

/moji-radovi/ postaje kanonski dom s dvije strogo odvojene police:

- Na ovom uređaju: lokalna povijest metapodataka i valjana privatna dokumentna sesija
- Na računu: prijava i Moji popravci sa servera

Lokalna povijest nikada se ne opisuje kao spremljeni dokument. Serverski popravci nikada se ne opisuju kao lokalni. Brisanje jasno navodi opseg i trajnost.

U rezultatu se smiju ponuditi najviše dva relevantna alata. Citatni nalaz može ponuditi Citat generator ili Literaturu. Nalaz opsega može ponuditi Brojač kartica. Ti ulazi ne postaju dio workspace raila.

Svaki plan isporučuje samo poveznice prema već postojećim odredištima. Zahtjev da su sve javne funkcije dostupne u najviše dvije interakcije odnosi se na dovršeno stanje nakon četvrtog plana, bez mrtvih ili privremeno onemogućenih stavki u međufazama.

## Link migracija

Sve javne ručne stranice i generatori koriste root-relative poveznice. Sljedeća stara odredišta mijenjaju se kanonski:

- index.html#analyzer i /#analyzer postaju /
- index.html#how i /#how postaju /saznaj-vise/#how
- index.html#checks i /#checks postaju /saznaj-vise/#checks
- index.html#pricing i /#pricing postaju /saznaj-vise/#pricing
- index.html#faq i /#faq postaju /saznaj-vise/#faq

Test skenira ručne HTML datoteke i izvore generatora. Nijedna javna poveznica ne smije ciljati nepostojeći fragment minimalnog roota.

## Privatnost i sigurnost

- Otvaranje panela ne radi mrežni zahtjev.
- Shell ne čita ni ne prikazuje naziv dokumenta.
- Shell ne učitava Supabase, auth session, analysis, profiles, repair, history, preview ili payment module.
- Nastavi trenutačni rad prikazuje se samo iz host-proslijeđenog, već potvrđenog stanja.
- Lokalna analiza i dalje se opisuje kao lokalna. Plaćeni automatski popravak, narudžbe i druge serverske funkcije zadržavaju vlastite izričite consent poruke.
- Panel ne sadrži Popravi, Preflight, Preuzmi izvještaj, Prijavi pogrešku ni druge radnje koje zahtijevaju trenutačni dokument.
- Admin, verification i QA konzola nisu javna odredišta.
- Nova manifest datoteka mora biti svjesno klasificirana kao PUBLIC i proći classification guard.
- Ne mijenjaju se parser, audit, citation engine, scoring, profili, repair recepti, migracije ni Supabase funkcije.

## Pristupačnost

- Panel ima programatski naziv "Sve mogućnosti".
- Gumb Sve ima aria-expanded i aria-controls.
- Otvaranje fokusira naslov ili prvi smisleni link.
- Escape i gumb Zatvori zatvaraju panel te vraćaju fokus otvaraču.
- Klik na backdrop zatvara panel, klik unutar papira ne zatvara.
- Dok je modalni panel otvoren, pozadina nije dostupna tipkovnici.
- Aktivna ruta koristi aria-current="page".
- Sklopive mobilne skupine koriste nativni details/summary ili semantički jednak button/region odnos.
- Fokus je jasno vidljiv u light, dark i forced-colors prikazu.
- Nema horizontalnog overflowa pri širini 320 CSS piksela.
- Touch mete imaju najmanje 44 puta 44 CSS piksela.
- Shell radi s dostavljenim Document objektom i ne pretpostavlja globalni document u testovima.

## Performance budžet

- Dodatni navigacijski JS na rootu, route shell plus manifest, smije biti najviše 8 KB gzip.
- Zajednički shell CSS smije biti najviše 12 KB gzip.
- Otvaranje panela nakon prvog painta ne smije pokrenuti mrežni zahtjev ni dinamički import.
- Route shell i manifest nemaju statički ni dinamički import prema ui-boot, lucide, premium visuals, motion, analysis, profiles, repair, auth, history, preflight, preview ili landing modulima.
- Panel animira samo opacity i transform, najviše 180 ms.
- Root ne dobiva marketinške kartice, pricing, benchmark assete ni alatne feature bundleove.
- Postojeći Vite route ulazi ostaju odvojeni.
- Build upozorenje ili postojeći veći app chunk nije dopušten razlog za podizanje budžeta shella.

Implementacija dodaje ponovljiv automatski budget test koji mjeri emitirani gzip JS i CSS shella iz produkcijskog builda. Test otvaranja panela zasebno dokazuje da interakcija ne pokreće fetch niti učitavanje feature modula. Ručna procjena iz DevTools nije završni dokaz.

## Testna strategija

### Jedinični testovi

tests/route-shell.test.ts pokriva:

- točne četiri skupine i stabilan redoslijed
- otvaranje, zatvaranje, Escape, backdrop i povrat fokusa
- active route
- mobilne sklopive skupine
- temu
- idempotentni remount bez dvostrukih listenera
- opcionalni Nastavi rad bez čitanja storagea
- privacy utility samo kada je dopušten

Novi tests/public-route-directory.test.ts pokriva:

- jedinstvene id vrijednosti
- root-relative hrefove
- obvezne javne destinacije
- zabranu admin, verification i QA odredišta
- zabranu nepostojećih root fragmenata
- JSON i TypeScript ugovor

### Route testovi

tests/intake-first-routes.test.ts čuva:

- root kao upload-first entry
- male shell import granice
- postojeće workspace mount točke
- točne header varijante
- no-JS primarne poveznice
- privatnost i lokalnu sesiju

Novi tests/public-route-shell-markup.test.ts pokriva ručne javne stranice i osigurava da nemaju stari ravni mobile nav ili hover-only Alati dropdown nakon migracije.

### Generator testovi

Postojeći testovi generatora proširuju se provjerom da:

- generator čita kanonski javni manifest
- output sadrži isti direktorij
- breadcrumb i no-JS sadržaj ostaju
- canonical i JSON-LD ostaju
- nema privatnih ili administratorskih odredišta

### Pristupačnost i vizualna provjera

- desktop: 1200 puta 800
- mobile: 390 puta 844
- minimalna širina: 320
- light i dark tema
- prefers-reduced-motion
- tipkovnica bez miša
- axe bez novih critical ili serious nalaza
- nema horizontalnog overflowa
- vizualni screenshotovi za zatvoren i otvoren panel

### Završni gate

Svaki implementacijski commit prolazi ciljane testove. Svaki plan prije završnog commita prolazi:

- npm run check
- node scripts/verify-dist-classification.mjs
- git diff --check

## Kriteriji prihvaćanja

1. Root u prvom viewportu i dalje prikazuje upload kao jedinu dominantnu radnju.
2. Svaka javna funkcija iz četiri skupine dostupna je u najviše dvije interakcije s temeljnih ruta.
3. Header nikada nema više od tri korisničke odluke uz brand.
4. /rad/ zadržava Dokument, Profil i Nalaz kao jedinu procesnu navigaciju.
5. Sve postojeće analyzer, repair, history, auth, preflight, report i submission funkcije ostaju dostupne u svom kontekstu.
6. Desktop i mobile prikazuju isti direktorij i isti redoslijed skupina.
7. Izbornik radi klikom, tipkovnicom i dodirom, ne hoverom.
8. Stare poveznice više ne vode na nepostojeće fragmente roota.
9. Panel ne učitava feature graf ni korisničke podatke.
10. Sigurnosne i privatnosne tvrdnje ostaju točne za lokalne i serverske tokove.
11. Javni bundle ne sadrži privatne profile, evidence, kanarince, never-markere ni interne konzole.
12. Puni repozitorijski gate i classification sken završavaju zeleno.

## Izvan opsega

- promjena analitičke logike ili bodovanja
- promjena repair fixera, recepta ili parametarske mjerodavnosti
- generiranje ili prepravljanje sadržaja rada
- novi backend, migracija ili Supabase funkcija
- novi pricing model ili payment tok
- novi alat
- admin ili verification navigacija
- kontinuirane animacije, WebGL, Three.js ili nova animation biblioteka
