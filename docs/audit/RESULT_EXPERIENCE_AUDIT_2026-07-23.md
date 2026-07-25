# Audit iskustva nakon analize dokumenta

Datum: 23. srpnja 2026.

## Opseg i metoda

Audit je napravljen nad stvarnom lokalnom analizom datoteke `fer-diplomski-prazni-odlomci.docx` u Chromiumu, na desktop prikazu 1440 x 1000 i mobilnom prikazu 390 x 844.

Pregledani su:

- vrh rezultata, ocjena, sažetak i profil
- prioriteti, sve kartice nalaza i plan ispravaka
- ručni statusi, skok na odlomak i automatski popravak
- predajni prikaz i prijelaz s lokalne analize na serverski popravak
- čitljivi pregled i faksimil
- mobilna hijerarhija, čitljivost i pristupačnost kontrola
- povjerenje, izvori, ograničenja i marketinški prijelaz prema plaćenoj akciji

Nisu testirani Safari, Firefox, čitač zaslona ni stvarno izvršenje serverskog popravka. Audit procjenjuje iskustvo rezultata, ne točnost cijelog parsera na svim profilima.

## Izvršni zaključak

Rezultat izgleda ozbiljno i daje znatno više dokaza od tipičnog automatskog checkera. Najveći problem više nije nedostatak informacija, nego hijerarhija i značenje informacija.

Korisnik trenutačno može pogrešno zaključiti da je rad gotovo spreman zato što vidi `86/100` i `Dobra usklađenost s profilom`, iako isti ekran prijavljuje kritičan problem, moguće obvezne dijelove koji nedostaju, samo 1 izvor prema profilnom minimumu 15 i više ručnih provjera. Ocjena, spremnost za predaju i pouzdanost nalaza moraju biti tri odvojena pojma.

Drugi veliki problem je ponavljanje. Korisnik prvo vidi četiri najvažnija problema, zatim tri najvažnija koraka, zatim plan ispravaka i zatim sve probleme. Isti naslovi postoje dva ili tri puta. To povećava duljinu rezultata, ali ne povećava razumijevanje.

Treći problem je neusklađenost obećanja akcija i njihova ponašanja. `Automatski popravi` na pojedinom nalazu ne popravlja taj nalaz, nego otvara opći serverski panel `Popravi sve`. Ručno označen nalaz nestaje iz prioriteta i nema mogućnost poništavanja.

## P0, popraviti prije javnog oslanjanja na rezultat

### 1. Ocjena izgleda kao spremnost za predaju, iako to nije

Dokaz:

- rezultat prikazuje `86/100` i `Dobra usklađenost s profilom`
- istodobno postoji kartica `Kritično`
- prepoznat je 1 izvor, a profil traži najmanje 15
- nedostaju mogući obvezni dijelovi
- tek sitni tekst ispod objašnjava da informativne i predajne stavke ne utječu na ocjenu

Rizik:

Korisnik može predati rad jer je glavna poruka optimističnija od stvarnog nalaza. To je problem povjerenja i sadržajne točnosti, čak i ako je matematički score ispravno izračunat.

Preporuka:

- odvojiti `Automatska tehnička ocjena: 86/100` od `Spremnost za predaju: Nije spremno`
- odmah prikazati: `1 blokator`, `7 dorada`, `3 ručne provjere`
- uz score dodati `Kako je izračunato` i jasno navesti što nije bodovano
- optimističnu poruku koristiti samo ako nema otvorenog blokatora

### 2. Ručna akcija može sakriti kritičan problem bez mogućnosti povratka

Dokaz:

- klik na `Označi provjereno` uklanja `Nisu pronađeni automatski brojevi stranica` iz tri prioriteta
- kartica u planu dobiva status `Provjereno`, ali i dalje tvrdi da PAGE polje nije pronađeno
- kartica nakon toga nema nijednu akciju i nema `Poništi`

Rizik:

`Provjereno` se može protumačiti kao riješeno. Kritičan problem postaje vizualno slabiji bez dokaza da je dokument promijenjen.

Preporuka:

- razdvojiti `Ručno potvrđeno da problem postoji`, `Nije problem` i `Riješeno u dokumentu`
- ne mijenjati status u `Riješeno` bez nove analize ili eksplicitne potvrde korisnika
- uvijek ponuditi `Poništi`
- nakon statusne promjene prikazati kratku potvrdu i objasniti utjecaj na spremnost i score

### 3. `Automatski popravi` ne radi ono što tekst gumba obećava

Dokaz:

- gumb na nalazu `Provjeri rimsku i arapsku numeraciju` prebacuje korisnika na karticu Predaja
- otvara opći panel `Popravi sve jednim klikom`
- ne bira niti potvrđuje popravak upravo tog nalaza
- fokus nakon prijelaza ostaje na tijelu stranice, a ne na ciljnoj kontroli

Rizik:

Korisnik ne zna što će se promijeniti, šalje li se dokument na server i hoće li se popraviti odabrani problem ili širi skup stavki.

Preporuka:

- ako je akcija specifična, otvoriti panel s unaprijed odabranim popravkom i njegovim prije-poslije opisom
- ako je akcija samo navigacija, nazvati je `Otvori mogućnosti popravka`
- prije serverskog koraka prikazati opseg, cijenu, podatkovni tok i trajanje čuvanja
- fokus premjestiti na naslov ciljnog panela i najaviti promjenu čitaču zaslona

### 4. Desktop faksimil gubi prekidač prikaza

Dokaz:

- nakon prijelaza na faksimil `.preview-modes` ostaje u DOM-u, ali mu je izmjerena visina 2 px
- korisnik praktično ne može odabrati `Čitljivo` bez zatvaranja modala

Uzrok na razini prikaza:

Modal je flex stupac s ograničenom visinom. Dodavanje zoom trake omogućuje smanjivanje `.preview-modes` elementa gotovo do nule.

Preporuka:

- kontrole moda, caption, legenda i zoom traka moraju imati `flex-shrink: 0`
- zaglavlje s načinom prikaza i zoomom držati ljepljivim
- dodati browser test koji nakon `Faksimil` ponovno klikne `Čitljivo`

### 5. Profilni izvor vizualno izgleda kao dokaz svakog pojedinog nalaza

Dokaz:

Isti link `Odluka o rokovima prijave i obrane diplomskih radova 2025./2026.` ponavlja se na karticama za brojeve stranica, citatnice, opseg, naslovnicu i terensku validaciju. Oznaka kaže `Kontekst profila`, ali položaj unutar svake kartice sugerira izravnu vezu s pravilom.

Rizik:

Korisnik može zaključiti da odluka o rokovima propisuje citatni stil, opseg ili format brojeva stranica. Time se slabi povjerenje u verificirani profil.

Preporuka:

- izravni izvor prikazati na nalazu samo kada je veza pravila stvarno poznata
- profilni kontekst prikazati jednom iznad popisa, ne na svakoj kartici
- ako nema izravnog izvora, napisati `Izvor ovog pravila nije povezan s pojedinim nalazom`

## P1, glavni problemi razumljivosti i korisničkog toka

### 6. Četiri sloja prikazuju isti sadržaj

Trenutačni redoslijed je:

1. `Najvažnije za popraviti`, četiri retka
2. `Tri najvažnija koraka`, tri pune kartice
3. `Plan ispravaka`, sve pune kartice
4. `Svi problemi`, ponovno sve pune kartice

U DOM-u se isti prioritetni naslovi pojavljuju do tri puta. `Plan ispravaka` i `Svi problemi` vizualno su gotovo isti.

Preporuka:

- zadržati jedan kompaktan prioritetni sažetak i jedan jedinstveni popis nalaza
- `Plan` treba biti redoslijed rada, ne kopija problema
- `Svi nalazi` treba imati filtere, grupiranje i sažete retke s otvaranjem detalja
- na mobilnom prikazati samo prvi otvoreni blokator i sažetak preostalih

### 7. Mobilni prvi ekran rezultata nema jasnu sljedeću akciju

Na 390 x 844 velik dio prvog ekrana zauzimaju score, rukopisni status, višeredni naziv datoteke, opis i četiri metrike. Primarna akcija `Otvori označeni pregled` dolazi tek nakon dodatnog skrolanja.

Preporuka:

- naziv datoteke prikazati malim, skraćenim tekstom
- vrh svesti na score, status spremnosti i broj blokatora
- odmah dodati primarni CTA `Pregledaj prvi blokator`
- `Nova provjera`, dijeljenje i download premjestiti u sekundarni izbornik

### 8. `Otvori označeni pregled` zvuči kao da su svi nalazi označeni

U testiranom rezultatu postoji 11 problema, ali samo 1 točno locirani odlomak. Preview to pošteno prikazuje kao `Označeno u tekstu (1)`, no korisnik tu informaciju dobiva tek nakon otvaranja.

Preporuka:

- CTA preimenovati u `Otvori 1 označeno mjesto u dokumentu`
- uz rezultat prikazati `1 točna lokacija`, `10 nalaza za cijeli dokument ili ručnu provjeru`
- za nelocirane nalaze koristiti jasan scope, bez očekivanja da će se pojaviti kao marker u tekstu

### 9. Metapodaci provjere pomiješani su s greškama dokumenta

`Profil ograničeno terenski testiran` i `Ručna završna provjera verificiranog profila` ulaze u isti broj mogućih problema i isti popis kao stvarne greške dokumenta.

Rizik:

Broj problema izgleda veći, a korisnik ne razlikuje pogrešku u radu od ograničenja alata.

Preporuka:

- odvojiti `Problemi dokumenta`, `Treba ručno provjeriti` i `Ograničenja analize`
- samo prvi skup uključiti u glavni broj problema
- ograničenja prikazati jednom, u sažetom trust bloku

### 10. Statusi i score nemaju jasan odnos

Nakon ručnog označavanja status se mijenja, prioriteti se preraspoređuju, ali score ostaje isti. Korisnik ne dobiva objašnjenje je li to očekivano.

Preporuka:

- prikazati dvije metrike: score automatskih pravila i broj otvorenih odluka
- nakon promjene statusa napisati `Ova ručna odluka ne mijenja automatsku ocjenu`
- ponuditi `Ponovno analiziraj` kao jedini pouzdan način potvrde promjene dokumenta

### 11. Serverski popravak dolazi nakon snažne poruke o lokalnoj privatnosti

Dokaz lokalne analize je dobar i konkretan: prikazuje 0 vanjskih zahtjeva. Međutim, CTA `Popravi sve` ne navodi odmah da je to drugi podatkovni tok. Tek u predajnom panelu piše da se dokument šalje na server i čuva do brisanja.

Preporuka:

- na samom CTA-u napisati `Popravak na serveru, traži privolu`
- prije klika prikazati što se šalje, koliko dugo se čuva i što se može obrisati
- besplatni lokalni nalaz i serverski proizvod vizualno razlikovati

## P2, vizualne, sadržajne i marketinške dorade

### Vizualna hijerarhija

- Rukopisni status na desktopu puca u dva reda i izgleda manje profesionalno od ostatka izvještaja.
- Tri kartice u stupcima imaju jako različite visine i akcije na različitim vertikalnim pozicijama.
- Dugi popis bijelih kartica postaje zid sadržaja bez orijentira.
- Oznake poput `KRITIČNO`, `OTVORENO`, `IZMJERENO` i `KONTEKST PROFILA` imaju oko 10 px i presitne su za ključne informacije.
- Marketinška crna navigacija ostaje ljepljiva tijekom rada s rezultatom i zauzima prostor koji bi bolje služio statusu dokumenta.

Preporuka:

- koristiti sans-serif statusnu rečenicu, a rukopis samo kao dekoraciju
- kartice sažeti u redove koji se otvaraju
- uvesti ljepljivi result header: spremnost, otvoreni blokatori i `Ponovno analiziraj`
- ključne oznake držati na najmanje 12 do 14 px uz dovoljan kontrast

### Sadržaj i mikrocopy

- `Nedostaju mogući obvezni dijelovi verificiranog profila` je apstraktno. Jasnije je `Nije prepoznata izjava o autorstvu`.
- `Lokacija nije pouzdano dostupna` ponavlja se gotovo na svakoj kartici. Scope treba biti kratka oznaka, a objašnjenje dostupno na zahtjev.
- `Preuzmi` ne govori preuzima li se sažetak, HTML, JSON ili popravljeni Word.
- `Popravi sve` obećava više nego što korisnik može zaključiti iz podržanih popravaka.
- `Podijeli ocjenu` odvlači pažnju prije nego što je korisnik riješio probleme i slabo odgovara ozbiljnom akademskom kontekstu.

### Marketing i konverzija

Post-result ekran treba prvo isporučiti sigurnost i smjer, a tek onda prodavati. Trenutačno se natječu preview, dijeljenje, download, nova analiza, automatski popravak i ručne odluke.

Bolji prijelaz prema konverziji:

1. `Pronašli smo 1 blokator i 7 dorada.`
2. `Jedno mjesto možemo točno pokazati u tekstu.`
3. `Lekta može automatski popraviti X od Y stavki.`
4. `Za automatski popravak dokument se šalje na server uz tvoju privolu.`
5. Prikazati cijenu, opseg i očekivani izlaz prije glavnog CTA-a.

Ne koristiti `Popravi sve` ako dio nalaza ostaje ručan. Bolje: `Automatski popravi 3 podržane stavke`.

## Pozitivni nalazi koje treba zadržati

- Desktop i mobilni rezultat nakon završetka animacije prikazuju isti score 86.
- Mobilni prikaz nema vidljivo horizontalno rezanje kartica.
- Skok na `odlomak 172` otvara preview, centrira i označava cilj.
- Preview jasno razlikuje čitljivi prikaz od približnog Word faksimila.
- Točan broj lociranih nalaza prikazan je u sidebaru.
- Svi vidljivi gumbi u testiranom stanju imaju pristupačan naziv.
- Modal ima imenovanu gornju kontrolu za zatvaranje i blokira pozadinski kontekst.
- Akcije na mobilnim karticama imaju odgovarajuću minimalnu visinu.
- Dokaz lokalne obrade s brojem mrežnih zahtjeva je konkretan i uvjerljiv.
- Profil, datum provjere i poveznica na službeni izvor postoje.
- Sustav ne izmišlja lokaciju kada je ne može pouzdano odrediti.

## Predložena nova struktura rezultata

### 1. Što je zaključak

- `Spremnost za predaju: Nije spremno`
- `Automatska tehnička ocjena: 86/100`
- `1 blokator, 7 dorada, 3 ručne provjere`
- jedna rečenica što score uključuje i što ne uključuje

### 2. Zašto je rezultat takav

- aktivni profil i datum pravila
- bodovane kategorije i njihov doprinos scoreu
- problemi dokumenta odvojeni od ograničenja alata

### 3. Što prvo napraviti

- jedna otvorena kartica najvažnijeg blokatora
- sljedeća dva prioriteta kao sažeti retci
- jasne akcije: `Prikaži mjesto`, `Otvori upute`, `Potvrdi ručno`, `Automatski popravi ako je podržano`

### 4. Svi nalazi

- jedan popis, bez zasebne kopije plana i problema
- filteri: blokatori, dorade, ručno, ograničenja, riješeno
- grupiranje po statusu ili kategoriji
- detalji i izvor otvaraju se po potrebi

### 5. Završetak

- `Ponovno analiziraj dokument`
- `Preuzmi izvještaj`
- zaseban, transparentan serverski popravak s opsegom, cijenom i privolom

## Redoslijed popravaka

1. Razdvojiti score od spremnosti za predaju.
2. Ispraviti desktop prekidač čitljivo/faksimil.
3. Uvesti ispravne ručne statuse i `Poništi`.
4. Uskladiti naziv i ponašanje `Automatski popravi`.
5. Prekinuti prikaz istog profilnog izvora kao konteksta svake kartice.
6. Ukloniti duplikaciju prioriteta, plana i svih problema.
7. Odvojiti probleme dokumenta od ograničenja analize.
8. Skratiti mobilni vrh i iznijeti prvi sljedeći korak u prvi ekran.
9. Jasno označiti lokalni i serverski podatkovni tok.
10. Doraditi mikrocopy, tipografiju, fokus i povratne informacije statusa.

## Kriterij uspjeha nakon dorade

Novi korisnik bi nakon pet sekundi trebao moći odgovoriti na četiri pitanja:

1. Je li dokument spreman za predaju?
2. Zašto je dobio baš ovu ocjenu?
3. Koju jednu stvar treba napraviti prvo?
4. Koja akcija ostaje lokalna, a koja šalje dokument na server?

Ako odgovor na bilo koje pitanje traži otvaranje više tabova ili čitanje sitnog disclaimera, rezultat još nije dovoljno jasan.
