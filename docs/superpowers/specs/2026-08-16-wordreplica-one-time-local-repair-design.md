# WordReplica jednokratni lokalni popravak za Lektu

## Status i opseg

Ovaj dizajn je odobren 16. kolovoza 2026. Opisuje prvu integraciju opcenitog
WordReplica reconstruction enginea u placeni Lektin tok popravka.

Prva javna verzija podrzava:

- Windows racunalo
- instaliran i aktiviran Microsoft Word za desktop
- jedan placeni posao za jedan konkretan DOCX
- vidljivu rekonstrukciju u lokalnom Wordu
- novu lokalnu izlaznu datoteku, bez prepisivanja originala
- paralelnu serversku verziju za preuzimanje i fallback

Mac, Android, iPhone, iPad i Word na webu u prvoj verziji nemaju puni lokalni
WordReplica put. Na tim uredjajima Lekta isporucuje serversku verziju.

## Cilj proizvoda

Nakon sto Lekta analizira dokument, korisniku prikaze tocne predlozene popravke,
naplati ih i dobije izricitu potvrdu, korisnik preuzima jednokratni, digitalno
potpisani WordReplica runner. Runner otvara Word na korisnikovu Windows racunalu,
izradjuje novi ispravljeni dokument i ostavlja ga otvorenim i spremljenim lokalno.

Isti placeni posao paralelno proizvodi serversku verziju. Lokalna Word verzija je
primarni rezultat. Serverska verzija je sigurnosna kopija i fallback ako lokalni
Word nije dostupan ili lokalni posao trajno ne uspije.

Uspjeh nije samo stvaranje DOCX-a. Uspjeh znaci da je original ostao netaknut,
da su odobreni popravci primijenjeni, da je granica vidljivog teksta sacuvana i
da se izlaz otvara u pravom Wordu bez upozorenja o popravku dokumenta.

## Tvrde granice

- Lekta nikad ne pise niti prepravlja argumentaciju ili sadrzaj rada.
- Vidljivi tekst ostaje isti prije i poslije `Fields.Update()`, osim postojecih
  izricito dopustenih i potvrdom zasticenih formatnih iznimki.
- Originalni DOCX nikad se ne mijenja. Lokalni rezultat je nova datoteka.
- Jedna uplata daje pravo samo na jedan hash dokumenta i jedan repair job.
- Tehnicki nastavak istog posla ne trazi novu uplatu.
- Zavrsen posao ne moze se ponovno otvoriti za drugi dokument.
- Runner ne instalira Windows servis, ne dodaje se u startup i ne ostaje aktivan
  nakon zavrsetka.
- Runner ne zatvara nepovezane Word dokumente i ne prekida globalno `WINWORD.EXE`.
- Server runneru nikad ne salje proizvoljan PowerShell, VBA, COM ili drugi kod.
- WordReplica ostaje opceniti engine. Fakultetska pravila, cijene i pravo pristupa
  ne ulaze u WordReplica jezgru.

## Odabrani pristup

Odabran je serverski upravljan jednokratni runner.

Razmotrene su i odbacene dvije alternative:

1. Cijeli otkljucani WordReplica engine u lokalnom paketu. Jednostavniji je, ali
   olaksava neovlasteno ponovno pokretanje i teze provodi pravo na jedan dokument.
2. Privremeni Office.js dodatak. Laksi je za vise platformi, ali nema punu COM
   kontrolu koju trenutni WordReplica fidelity loop koristi i zahtijevao bi drugi
   engine s drukcijim mogucnostima.

Jednokratni runner je tanki, potpisani izvrsitelj. Serverska autorizacija odlucuje
smije li preuzeti i izvrsiti Repair Contract za konkretan dokument. Lokalna
datoteka runnera bez valjanog posla nema pravo pokrenuti popravak.

Nijedna klijentska zastita ne moze potpuno sprijeciti strucni reverse engineering.
Cilj je jaka prakticna zastita od ponovne uporabe i dijeljenja: atomski claim,
kratkotrajni bearer token, hash dokumenta, vezivanje uz jednokratni kljuc uredjaja,
potpisani ugovor i trajno zatvaranje zavrsenog posla.

## Odgovornosti sustava

### Lekta web aplikacija

Lekta:

- lokalno analizira dokument
- primjenjuje verificirana profilna pravila
- prikazuje popravke i trazi potrebne potvrde
- provodi prijavu, naplatu i entitlement
- stvara repair job i Repair Contract
- pokrece serversku granu
- isporucuje jednokratni runner
- prikazuje status obiju grana
- nudi serverski rezultat i povijest popravaka

### Lekta repair orchestrator

Backend:

- provjerava uplatu i aktualnu privolu
- racuna i trajno veze SHA-256 ulaznog dokumenta
- atomski upravlja stanjem posla
- izdaje kratkotrajni claim token
- veze claim uz jednokratni javni kljuc lokalnog runnera
- isporucuje potpisani Repair Contract i sifrirani ulaz
- prima heartbeat, checkpoint sazetke i zavrsni ishod
- pokrece ili prati serversku granu
- odbija replay, paralelni claim i promjenu dokumenta

Backend ne izvodi fakultetska pravila. Kao i postojeci `repair-docx`, prihvaca samo
poznate fixer identitete i sanitizirane parametre.

### WordReplica core

WordReplica:

- pretvara odobrene visoke operacije u Word COM korake
- stvara i posjeduje svoju Word sesiju
- rekonstruira novi dokument
- sprema checkpoint samo za svoj posao
- oporavlja se od Word fail-safea
- provodi G0-G9 i Word-oracle provjere
- ostavlja zavrsni lokalni dokument otvorenim
- zatvara samo privremeni izvor i vlastite pomocne resurse

WordReplica ne zna sto je FPZG, Pravni fakultet, proizvod, cijena ili uplata.

### Lokalni jednokratni runner

Runner:

- provjerava digitalni potpis vlastitih komponenti
- provodi lokalni preflight za Word i disk
- generira jednokratni par kljuceva za vezivanje posla
- claim-a posao i provjerava potpis ugovora
- preuzima sifrirani ulaz i potrebne komponente
- pokrece WordReplica core u interaktivnoj korisnickoj sesiji
- prikazuje napredak bez otkrivanja teksta u logovima
- sprema novu lokalnu izlaznu datoteku
- brise token, privatni kljuc, ulaz, ugovor i privremene komponente nakon uspjeha

Runner ne trazi administratorska prava osim ako buduca distribucijska tehnologija
to izricito zahtijeva. V1 mora preferirati portable, user-space izvrsavanje.

### Serverski izvrsitelj

Serverska grana koristi isti popis `fixerId`, `ruleId` i `params` iz Repair
Contracta. Moze koristiti postojeci deterministicki OOXML repair engine ili
WordReplica Windows worker, ali ne smije uvoditi zasebnu kopiju profilnih pravila.

Serverski rezultat ne mora biti bajt-identican lokalnom. Razlike u Word verziji,
fontovima, printer driveru, timestampovima i metapodacima su dopustene. Rezultati
moraju imati jednak vidljivi tekst, jednake odobrene promjene i proci odgovarajuce
strukturne i fidelity gateove.

## Repair Contract v1

Postojeci Lektin recept `{fixerId, ruleId, params}` temelj je ugovora. Nova omotnica
dodaje identitet, integritet, ogranicenja i ocekivane dokaze bez mijenjanja izvora
profilnih pravila.

Obavezna polja omotnice:

- `contractVersion`: tocno `1`
- `jobId`: nepredvidivi identitet posla
- `userId`: vlasnik entitlementa
- `sourceSha256`: hash originalnog DOCX-a
- `sourceSize`: ocekivani broj bajtova
- `sourceFileName`: sanitizirano prikazno ime
- `createdAt` i `expiresAt`
- `engineMinVersion` i `engineMaxVersion`
- `requests`: uredjeni niz postojecih fixer zahtjeva
- `allowedExceptions`: izricito potvrdene promjene vidljivog teksta
- `outputPolicy`: nova datoteka, bez prepisivanja originala
- `verificationPolicy`: obavezni gateovi za taj posao
- `contractSignature`: serverski potpis svih prethodnih polja

Runner odbija:

- nepoznatu verziju ugovora
- istekao ili vec dovrsen posao
- neispravan potpis
- hash ili velicinu koja ne odgovara izvoru
- nepoznati `fixerId`
- parametar izvan dozvoljene sheme
- engine verziju izvan ugovorenog raspona
- zahtjev koji pokusava promijeniti sadrzaj bez zabiljezene potvrde

Repair Contract sadrzi samo visoke, unaprijed registrirane operacije. Ne sadrzi
skripte ni sirove naredbe za lokalno izvrsavanje.

## Stanje jednokratnog posla

Kanonska stanja su:

1. `paid`: uplata i privola su potvrdene
2. `claimable`: ulaz, ugovor i serverska grana su pripremljeni
3. `claimed`: jedan lokalni javni kljuc atomski je preuzeo posao
4. `processing`: lokalna rekonstrukcija je pocela
5. `retryable`: isti uredjaj smije nastaviti isti dokument iz checkpointa
6. `completed`: lokalni rezultat je verificiran i pravo je trajno potroseno
7. `local_failed`: lokalni put je zavrsio bez rezultata nakon dopustenih pokusaja
8. `expired`: posao nije claim-an unutar roka
9. `revoked`: posao je sigurnosno ili administrativno ponisten

Samo `claimed`, `processing` i `retryable` mogu nastaviti. Nastavak mora dokazati
posjedovanje lokalnog privatnog kljuca, isti `jobId` i isti `sourceSha256`.
Drugi uredjaj ne moze preuzeti aktivan posao. Podrska moze opozvati stari claim i
izdati novi samo kroz auditirani postupak, bez promjene izvornog hasha.

`completed`, `local_failed`, `expired` i `revoked` terminalna su lokalna stanja.
Podrska moze auditirano vratiti `local_failed` u `retryable`, ali samo za isti
`jobId`, uredjaj i `sourceSha256`. Preimenovanje, kopiranje ili ponovno pokretanje
runnera ne stvara novo pravo.

Serverska grana ima zaseban status (`queued`, `processing`, `ready`, `failed`).
Lokalno terminalno stanje ne mijenja serverski status i obrnuto.

## Korisnicki tok

1. Korisnik ucita dokument i Lekta dovrsi lokalnu analizu.
2. Korisnik odabere auto-repair, pregleda tocne promjene i potvrdi iznimke.
3. Nakon uspjesne naplate Lekta uploada dokument u postojeci placeni repair tok,
   stvara posao i odmah pokrece serversku granu.
4. Lekta nudi digitalno potpisani `LektaRepair-<claim-code>.exe`.
5. Korisnik rucno pokrene runner. Nema instalacije servisa ni startup unosa.
6. Runner obavi preflight, generira jednokratni kljuc i atomski claim-a posao.
7. Runner preuzima ulaz i potpisani ugovor, zatim prije Worda ponovno provjerava hash.
8. Korisnik odabere izlazni folder. Zadano ime je `<izvor>-popravljeno.docx`.
9. Runner otvara vidljivi Word i upozorava korisnika da ne uredjuje radni dokument
   dok traje rekonstrukcija.
10. WordReplica stvara novi dokument, izvrsava ugovor i salje strukturirani napredak.
11. Runner provodi zavrsne gateove i sprema lokalni rezultat.
12. Zavrsni dokument ostaje otvoren u Wordu. Runner oznacava posao `completed`.
13. Runner uklanja sve privremene podatke i pokusava ukloniti vlastitu preuzetu
    datoteku nakon izlaska.
14. Lekta prikazuje lokalni ishod i neovisni serverski rezultat za preuzimanje.

Ako Windows ne dopusti brisanje pocetnog EXE-a, datoteka moze ostati u Downloads
folderu. To nije entitlement: claim je potrosen, ugovor je istekao, lokalni kljuc
je izbrisan i server odbija novi posao.

## Word i dokument sigurnost

- Runner radi u interaktivnoj korisnickoj Windows sesiji.
- Word se pokrece s onemogucenim makronaredbama i vanjskim aktivnim sadrzajem.
- Ulaz se otvara samo kao kontrolirani izvor. Izlaz nastaje u novom dokumentu.
- WordReplica biljezi PID i identitet samo procesa koje je sama stvorila.
- Zatvaranje, retry i cleanup smiju ciljati samo taj dokument i te procese.
- Postojeci otvoreni Word dokumenti ostaju otvoreni i netaknuti.
- Runner ne zapisuje tekst, citate, imena autora ili sadrzaj tablica u telemetriju.
- Dijagnostika sadrzi kod faze, trajanje, fixer identitet, Word HRESULT kategoriju,
  hash artefakta i rezultat gatea.
- Claim privatni kljuc lokalno je zasticen Windows DPAPI-jem samo dok je posao
  aktivan i brise se nakon terminalnog ishoda.

## Checkpoint, prekid i nastavak

Checkpoint je vezan uz `jobId`, `sourceSha256`, verziju enginea, verziju ugovora i
zadnju dokazanu fazu. Ne sadrzi reusable entitlement za novi dokument.

Ako Word zapne, prikaze blokirajuci dijalog ili prestane odgovarati:

1. runner zapisuje zadnji sigurni checkpoint
2. zatvara samo svoju Word sesiju
3. posao prelazi u `retryable`
4. ponovno pokretanje dokazuje isti lokalni kljuc
5. WordReplica nastavlja od zadnje dokazano sigurne tocke

Ako korisnik rucno zatvori Word, nestane struje ili runner padne, isti postupak
vrijedi nakon ponovnog pokretanja. Tehnicki retry ne naplacuje se ponovno.

Ako mreza nestane nakon sto je ugovor valjano claim-an i preuzet, lokalna obrada
smije zavrsiti. Runner lokalno cuva potpisani ishod i salje ga serveru kada se veza
vrati. Server ne oznacava lokalnu granu `completed` bez zavrsnog izvjestaja, ali
lokalni dokument korisniku ostaje dostupan. Nakon lokalne verifikacije runner
DPAPI-jem zapisuje completion receipt i vise ne dopusta ponovno izvrsavanje ugovora;
bez mreze smije samo ponavljati slanje istog potpisanog zavrsnog izvjestaja.

Ako lokalni put trajno ne uspije, korisnik dobiva jasnu poruku, serverski rezultat
i mogucnost podrske. Posao prelazi u `local_failed`; samo auditirana podrska smije
ga vratiti u `retryable` za isti dokument. Drugi dokument nije dopusten.

## Serverska grana i pohrana

Serverska grana pocinje nakon naplate neovisno o lokalnom runneru. Lokalni kvar,
zatvaranje preglednika ili nepodrzani Word ne smiju zaustaviti serverski rezultat.

Serverska kopija koristi postojeci Lektin consent, Storage i `repair_jobs` model.
Pohrana i brisanje slijede aktualnu politiku "Moji popravci": rezultat je dostupan
vlasniku dok ga ne obrise, uz postojeci right-to-erasure i orphan cleanup. Lokalni
privremeni podaci nisu dio te povijesti i brisu se po zavrsetku posla.

UI mora razlikovati:

- lokalna Word verzija je u obradi
- lokalna Word verzija je gotova
- lokalna Word verzija treba nastavak
- lokalna Word verzija nije dostupna
- serverska verzija se sprema
- serverska verzija je spremna
- serverska pohrana nije uspjela

Jedna grana ne smije lazno tvrditi uspjeh druge grane.

## Dokaz uspjeha

Lokalni posao moze postati `completed` samo ako dokaze:

- originalni hash i bajtovi nisu promijenjeni
- izlazna datoteka postoji i nije originalna putanja
- izlaz se otvara u Wordu s `OpenAndRepair = false`
- vidljivi tekst prolazi propisanu usporedbu prije i poslije `Fields.Update()`
- svaka odobrena stavka ugovora ima dokaz `applied` ili opravdani `no-op`
- nema neodobrenih promjena teksta
- obavezni G0-G9 gateovi prolaze
- tablice, slike, fusnote, sekcije i polja prolaze njihove strukturne provjere
- nepovezani Word dokumenti i procesi ostali su netaknuti

Lokalni i serverski izlaz ne usporedjuju se bajt po bajt. Usporedjuju se:

- spojeni vidljivi tekst
- broj i redoslijed sekcija
- stilovi i outline semantika
- numeriranje i polja
- tablice, slike, fusnote, headeri i footeri
- primijenjene stavke Repair Contracta
- paginacija i render-slicnost gdje su okruzenja usporediva

## Testna strategija

### Contract i entitlement testovi

- potpisan ugovor prolazi, izmijenjen ugovor pada
- nepoznati fixer i neispravni params padaju prije Worda
- isti token ne moze claimati dva uredjaja
- paralelni claim ima tocno jednog pobjednika
- dovrsen token se ne moze ponoviti
- drugi dokument s istim imenom, ali drugim hashom pada
- retry radi samo za isti posao, kljuc i hash
- istek i opoziv fail-closed za lokalni put

### Runner sigurnosni testovi

- runner radi bez administratorskih prava
- nema servisa, startup unosa ni trajnog protokola
- makronaredbe i vanjski sadrzaj ne izvrsavaju se
- cleanup ne dira korisnicke datoteke izvan job direktorija i odabrane izlazne putanje
- nepovezani Word dokumenti ostaju otvoreni
- globalni `WINWORD.EXE` cleanup nije moguc kroz ugovor

### Fidelity i regresijski testovi

Prvi referentni dokument je `Kalogjera - seminar Havel.docx`. On je fixture i
regresijski cilj, ne izvor akademskih pravila i ne "trening" modela. Lekta i dalje
nema model ni prompt u repair putu.

Obavezna matrica prije bete sadrzi najmanje:

- Kalogjera seminar
- WordReplica GOLDEN #1 slozeni dokument od 74 stranice
- jedan kraci rad s naslovnicom i sadrzajem
- jedan rad s velikim tablicama
- jedan rad sa slikama, fusnotama i vise sekcija
- jedan namjerno ostecen ili prekidom izazvan resume slucaj

Svaki obavezni dokument mora dva puta uzastopno proci trazene lokalne gateove na
istoj verziji enginea i istom commitu. Promjena Goldena ili izvornog korisnickog
dokumenta nije dopustena.

### End-to-end testovi

- analiza, potvrda, testna naplata, claim, lokalni rezultat i serverski rezultat
- korisnik zatvara Word usred tablice, zatim nastavlja bez nove naplate
- nestanak mreze nakon claima
- nema instaliranog Worda, serverski fallback ostaje dostupan
- server zavrsi prije lokalnog i lokalni zavrsi prije servera
- storage pohrana padne, lokalni rezultat ostaje uspjesan uz iskren UI
- lokalni Word padne, serverski rezultat ostaje uspjesan uz iskren UI

## Faze isporuke

Ovaj proizvod je prevelik za jedan implementacijski paket. Svaka faza dobiva svoj
plan, testove i review gate.

1. `Repair Contract v1`: tipovi, sheme, potpisivanje, validacija i adapter iz
   postojeceg Lektinog recepta. Bez naplate i bez lokalnog Worda.
2. Lokalni proof-of-concept: portable runner i WordReplica izvrsavanje za Kalogjera
   seminar, uz original netaknut i lokalni izlaz.
3. Entitlement i claim: backend state machine, jednokratni kljuc, replay obrana,
   retry i revoke.
4. Dvostruki rezultat: lokalna i serverska grana iz istog ugovora, neovisni statusi.
5. Lekta UX: placanje, download runnera, napredak, poruke i povijest.
6. Beta matrica: dokumenti, fail-safe, sigurnosni testovi i digitalno potpisivanje.
7. Produkcijski gate: svi hard gateovi, pravni tekstovi, operativni runbook i rollback.

WordReplica razvoj ostaje na `automation-dev` dok njegov promocijski gate nije
zadovoljen. Lekta integracija razvija se na zasebnim feature granama. Nijedna od
ovih faza ne razvija se izravno na `main` ili `master`.

## Izvan opsega v1

- puni lokalni popravak na Macu, Androidu, iOS-u ili iPadu
- Word on the web kao lokalni WordReplica executor
- trajno instaliran companion ili background servis
- automatsko prepisivanje originalne datoteke
- offline entitlement bez prethodnog serverskog claima
- generiranje ili prepravljanje sadrzaja rada
- univerzalno uklanjanje svake mogucnosti reverse engineeringa
- bajt-identicnost lokalnog i serverskog DOCX-a
- automatska promocija WordReplica promjena na glavnu granu

## Kriterij zavrsetka v1

V1 je spreman za ogranicenu placenu betu tek kada:

- korisnik na podrzanom Windows racunalu nakon jedne uplate dobije jedan lokalni
  popravljeni dokument u pravom Wordu i jednu serversku verziju
- original ostane bajt-identican
- entitlement replay, drugi dokument i paralelni drugi uredjaj budu odbijeni
- tehnicki retry istog posla radi bez nove naplate
- lokalni cleanup ne ostavlja osjetljive job podatke
- svi obavezni dokumenti prodju dva uzastopna trazena fidelity prolaza na istoj
  verziji enginea
- puni Lekta build gate, strogi DOCX gateovi i pravi Word gateovi budu zeleni
- digitalni potpis prikazuje provjerenog izdavaca
- pravni tekstovi i consent jasno opisuju lokalnu i serversku obradu
- postoji dokumentiran kill switch za lokalni put bez gasenja serverskog popravka
