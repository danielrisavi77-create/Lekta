# Sintetski korpus: stalna mreza nad fixerima i povratna veza prema skillovima

Datum: 2026-09-07. Status: petlja zatvorena i zelena; dva vala proze ostaju.

Vlasnik je pristao pisati radove za testiranje pod DVA uvjeta: da svaki prolaz provjeri radi li svaki
fixer, i da nalazi treniraju skillove za pisanje. Ovaj dokument opisuje sto od toga POSTOJI, sto je
izmjereno i sto je jos otvoreno. Namjera je u planu; ovdje je stanje.

## Sto petlja radi, redom

    npm run corpus-gen:rows -- --write   matrica jedinica x vrsta rada x razina (720 redaka)
    (proza kroz katedra-lite, izvan repozitorija)
    npm run corpus-gen:docx -- --all     LibreOffice: uskladjen + neuredan primjerak
    npm run corpus-gen:word -- --all     Word COM: polje sadrzaja i w:rsid, koje LO ne daje
    npm run repair-net                   analiza -> popravak -> ponovna analiza, po fixeru
    npm run skill-compare -- --write     Lektini nalazi protiv Katedrinih, nad ISTIM dokumentom
    npm run skill-feedback -- --write    kvar zapis u obliku koji `katedra` skill cita
    npm run skill-evals -- --write --stage <dir>   eval slucajevi + mapa za predaju

Prva, cetvrta i posljednja rade svugdje, ukljucujuci CI. Druga trosi najvise pa ide u valovima. Treca
trazi Windows s LibreOfficeom i Wordom. Peta trazi Python i Katedrin paket, pa se u CI-ju ne vrti.

## Uvjet 1: mreza nad fixerima

`repair-net` mjeri isti lanac koji korisnik izvodi i po fixeru biljezi zatrazeno, promijenjeno,
rijesene provjere i RAZLOG iz `skippedReasons`. Razlog je ono sto je novo: motor ga oduvijek zna, a
nijedan artefakt ga nije spremao, pa je "mrtav" bio zastavica umjesto dijagnoze.

Ratchet (`data/profiles/repair-net-ratchet.json`) nosi IMENOVAN popis mrtvih i smije samo padati.

Sirenje s tri na jedanaest dokumenata ozivjelo je dva fixera, i to je razlog zbog kojeg popis mora
padati a ne rasti:

| fixer | tri dokumenta | jedanaest dokumenata |
|---|---|---|
| `heading-style-fixer` | 1 zatrazen, 0 promijenio | 4 zatrazena, 3 promijenio |
| `link-doi-fixer` | 2 zatrazena, 0 promijenio | 11 zatrazenih, 7 promijenio |

Nijedan od ta dva nije bio pokvaren. Prva proza ih nije imala cime nahraniti: pilot je pisao pune
DOI poveznice, pa fixer koji kanonizira gole oblike doista nije imao metu.

### Dva preostala mrtva fixera, i proturjecnost koje NEMA

`consistency-fixer` (11 od 11) i `citation-bibliography-sync-fixer` (3 od 3) i dalje ne mijenjaju
nista. Motor za oba vraca `no-target`.

Prvo citanje ovog mjerenja bilo je da to proturjeci zakljucku iz
`2026-08-29-prazni-asistirani-fixeri.md`, gdje stoji da oba "doista cekaju covjeka": da je rijec o
cekanju, cinilo se, motor bi vratio `invalid-params`. **To citanje je bilo krivo**, i zapisuje se
zato sto je bilo na korak od toga da postane zadatak.

Lanac je provjeren u kodu i posve je dosljedan:

    repair-items.ts       skupine se grade s tvrdim `selected: false`
    buildParams           uzima samo `group.selected && zoneConsent && selectedCanonical`
                          -> `replacements` je PRAZAN dok covjek nista ne potvrdi
    default-selection.ts  `defaultSelectedItems` filtrira SAMO po `violated !== false`,
                          pa se zahtjev svejedno salje
    consistency-fixer.ts  `if (!params.replacements.length) return NO_OP(parts, 'no-target')`

Dakle `no-target` JEST nacin na koji se "ceka covjeka" ocituje kod ovog fixera; drugog koda nema.
`hasActionableParams` postoji da to u IZVJESTAJU razlikuje od stvarnog rada, a ne da zahtjev sprijeci.

Ostaje otvoreno samo uze pitanje: sto ta dva fixera rade na dokumentu koji nesuglasje doista sadrzi I
u kojem je odabir potvrden. To trazi mjerenje s potvrdom, ne zakljucivanje iz zadanog toka.

## Uvjet 2: povratna veza prema skillovima

Ispravak prve pretpostavke stoji u planu: `katedra-lite` sve tri provjere VEC IMA, pa poduka nije
mehanizam. Mehanizam je USPOREDBA dvaju alata nad istim dokumentom, jer nijedan proizvod sam ne moze
vidjeti vlastitu sljepocu.

Prvo mjerenje, 11 dokumenata, 2 osi, 22 usporedbe: 12 razilazenja, sva na Katedrinoj strani, i jedno
slaganje. Iz njih su izvedena tri kvara, svaki izmjeren prije nego zapisan:

| broj | mehanizam | izmjereno |
|---|---|---|
| 141 | pokrivenost gradi citate samo iz oblika autor-godina | fzsri 0 citata, 20 od 20 necitiranih; effectus 0 i 18 od 18 |
| 142 | sklonidba je deklarirana kao moguc lazan nalaz, a redak svejedno nosi `❌` | fpzg: 2 citata bez izvora i 1 necitirana jedinica, iz istog para |
| 143 | neizvedena provjera ispisuje se kao "0 krsenja", uz netocan razlog | effectus: naslov Heading1, 18 jedinica, 0 procitanih prezimena |

Zapis prolazi Katedrin VLASTITI validator (`kvar.py --provjeri --nastavak-od 140`, izlazni kod 0).

Mehanizam kvara 142 je isti koji je Lekta imala i popravila (`ddf9ee8e`), pa je recept prenesen: popis
padeznih nastavaka, granica korijena od cetiri znaka i dodatni kandidat na `a` zbog zenske sklonidbe.
Zbog tog popravka je fpzg os `citirano-bez-jedinice` sada `samo-katedra`: Lekta 0, Katedra 2.

## Cetvrti kvar koji nije postojao

Prva izvedba usporedbe imala je i os `fusnote`: Lektin `footnote.present` (PRISUTNOST fusnota) protiv
Katedrina `prazno: true` (nema fusnota, nema sto provjeriti). Na radu koji citira Vancouverom, dakle
posve ispravno bez ijedne fusnote, to je dalo tri "samo Katedra" retka. Bili su na korak od izvoza.

Sam alat ondje ispisuje da to NIJE njegov nalaz:

    dokument nema fusnota, nema sto provjeriti.
    Ako profil trazi fusnote kod izravnog citata, to je nalaz za check_rules, ne za ovaj alat.

Kvar je bio u NASEM preslikavanju. Pravilo koje iz toga slijedi zapisano je uz tip `Os`: os se upisuje
tek kad obje strane mjere istu stvar, a nalaz se usporedjuje s nalazom, nikad s neutralnim stanjem.

Imenovano nepokriveno, jer se precutan izostanak ne razlikuje od zaborava: `check_rules.py` je stvarno
zajednicka os (`prikazi.izvor_ispod` prema `element.source`), ali na ovom stroju odbija raditi jer
nedostaje `jsonschema`, a Katedrin registar ionako rutira samo `efzg` i `fpzg`. `provjeri_prikaze.py`
mjeri kvalitetu slike, sto Lekta ne mjeri uopce, a nad nasim rezerviranim slikama opisuje nas
graditelj a ne rad.

## Granica, i kako se dokazuje

Iz Katedre prema Lekti ne prelazi nijedno pravilo: usporedba cita njezine NALAZE nad nasim dokumentom.
Prema Katedri putuje opis kvara u njezinu alatu, dakle metapodatak o ponasanju skripte.

Tvrdnja se ne prihvaca na rijec. `tests/skill-feedback.test.ts` iz svih 11 commitanih fixtura vadi
stvaran tekst odlomaka (`document.xml` i `footnotes.xml`) i tvrdi da nijedan ne postoji u izvozu, uz
negativnu kontrolu da bi ista provjera podmetnut odlomak nasla. Zbog toga su dva bloka izlaza svedena
na kljuc odnosno oblik: doslovna jedinica literature je tekst dokumenta.

Prva izvedba tog garda gadjala je polje `titleLines`, kojega u sidecaru NEMA, pa je prolazio nad
praznim skupom i nije tvrdio nista. Obje tvrdnje sada prvo BROJE sto su procitale.

## Zasto artefakti nisu projekcije

`docs/generated/skill-compare.json` i `skill-feedback.md` nisu u `PROJECTIONS`. Usporedba trazi Python
i tudji paket kojih na runneru nema, pa bi gard svjezine obarao CI na uvjetu koji se ne moze ispuniti.

Izvoz umjesto toga cuva jaci, izravan uvjet: zapisano mora biti jednako onome sto renderer proizvede
iz kataloga i mjerenja. Uz to se potkrepa RACUNA pri svakom izvozu, pa zapis koji mjerenje vise ne
podupire ispada sam, umjesto da godinama stoji kao istinita proslost.

## Pokrivenost oblika, i sto je od nje dohvatljivo prozom

Izmjereno nad `shapes.claimed` svih 11 sidecara: od 29 imenovanih oblika pokriveno je 19, deset nije.
(Plan je u jednom trenutku zapisao pet; brojka je bila iz manjeg skupa i ne vrijedi.)

Deset nepokrivenih dijeli se na dvije skupine, i razlika je vazna jer odlucuje trosi li se na njih val
proze ili nesto drugo:

    dohvatljivo PROZOM        opseg/odlomci-preko-400, opseg/sekcije-preko-3
    trazi drugi alat ili put  zip/direktoriji, paket/bez-settings, paket/bez-png-default,
                              paket/comments-prazan, toc/ustajao-dirty, proizvodjac/google-docs,
                              proizvodjac/nepoznat, gdocs/potpis

Prva dva zatvara JEDAN dulji rad (preko 400 odlomaka, vise od tri sekcije), pa val 2 neka ih namjerno
gadja. Preostalih osam trazi Google Docs roundtrip ili rucno slozen paket i ne rjesava se pisanjem.

> Dopuna 2026-09-08: "Google Docs roundtrip" je za jedan od tih oblika bio KRIV put, i to se vidjelo
> tek kad se izmjerilo. Vidi odjeljak "Oblici bez fixture: s pet na jedan".

## Sto val 2 mora znati unaprijed

Val 1 stoji na CETIRI prozna tijela (apuri, effectus, fpzg, fzsri). Iz njih je nastalo 11 commitanih
dokumenata: tri po tijelu (uskladjen i neuredan iz LibreOfficea, plus Word), osim `apuri`, koji
Wordovu inacicu nema. Plan je za val 1 predvidio 12 tijela, pa je taj val nedovrsen.

Tri stvari koje su izmjerene i koje bi inace svih 60 tijela ponovilo:

- **Duljina odlomka se trazi vecom nego sto se zeli.** Pilot je trebao tri kruga dopisivanja da s
  3898 dodje na 5250 rijeci, jer je hrvatski odlomak izasao krace nego sto je uputa trazila. Razlika
  je izmjerena na oko 30 rijeci, pa se trazi 155 da se dobije 125.
- **Namjerno gadjaj dva oblika koje samo opseg zatvara**, `opseg/odlomci-preko-400` i
  `opseg/sekcije-preko-3`. Jedan dulji rad zatvara oba; nijedan drugi mehanizam ih ne proizvodi.
- **Alat ne pise sadrzaj**, nego se proza uzima kao PODATAK. U repozitoriju nema ni modela ni prompta,
  i ova biljeska je mjerenje o kalibraciji, ne uputa koju pipeline izvodi.

## Eval slucajevi i isporuka (dopunjeno 2026-09-07)

Vlasnik je odobrio slanje dokumenata drugom proizvodu, pa je napravljen i drugi izlaz: tri eval
slucaja (`docs/generated/skill-evals.json`, id 11 do 13) uz tri dokumenta. Zapis kvara kaze STO je
pokvareno; eval cuva da se u medjuvremenu ne laze, dakle da model krivi izlaz alata ne prenese kao
istinu o radu.

**Potkrepa se racuna, ne pamti, i to na oba izlaza.** Eval koji nadzivi svoj kvar i dalje PROLAZI, pa
izgleda kao pokrice a ne cuva nista; k tome bi zivio u tudjem repozitoriju, gdje ga nas gate nikad
vise ne vidi. Zato slucaj ispada iz izvoza cim kvara nema u katalogu ILI ga mjerenje vise ne podupire,
a to su dva razlicita razloga i imenuju se odvojeno.

**Sto je provjera isporuke nasla u nasem VLASTITOM zapisu.** Oba nalaza su iz istog poteza: pokrenuti
njihov alat i procitati ISPIS, umjesto samo JSON polja koje nam treba.

- Sklonidbu alat VEC deklarira: zaglavlje odjeljka POKRIVENOST pise da moze dati lazne nalaze i trazi
  provjeru okom. Nas zapis je tvrdio da alat to ne zna, sto nije istina. Nalaz je preformuliran u ono
  sto stvarno stoji, i time je postao jaci: zaglavlje deklarira nesigurnost, a isti redak svejedno
  nosi `❌` dok susjedni nosi `⚠️`.
- Ispis ne pokazuje `citata_razlicitih`, pa je jedno ocekivanje trazilo od modela da primijeti
  vrijednost koju bez `--json` ne moze vidjeti. Zamijenjeno onim sto se doista vidi.
- Isti prolaz dao je i bolji dokaz za kvar 143: alat ispisuje "0 krsenja" dok je cijela provjera
  preskocena, sto je jace od "poruka je zbunjujuca".

**Isporuka je uvjezbana na klonu prije nego je dirnut njihov repozitorij.** Cetiri stvari su svojstvo
NJIHOVE datoteke, ne nase isporuke, i svaka bi tiho pokvarila diff: CRLF, separator `---` medju
novijim unosima, zaglavlje fragmenta koje ne ide u katalog, i uvlaka od JEDNOG razmaka u `evals.json`
(pisanje s dva dalo bi lazan diff od 127 redaka). Vjernost pisca dokazana je round-tripom nad
neizmijenjenom datotekom.

Uz to se u istom zahvatu osvjezava `zamke_indeks.md`, jer je izvedena projekcija kataloga; bez toga
bi u njihov repozitorij usla ustajala projekcija, tocno razred protiv kojeg ovaj vodic ima alat.

**Novi unosi namjerno nemaju `Ograda:` redak.** Po njihovu kvaru 139 to znaci prvo stanje, dakle
ograda NEDOSTAJE i to je pravi dug; tako i jest, jer kvarovi nisu popravljeni. `Ograda: nema` bi
tvrdilo da ograda ne pripada, sto bi bilo netocno i sakrilo bi dug. Dug im time raste s 25 na 28.

## Val 2: tri rada, i cetiri stvari koje su se izmjerile tek na njima (2026-09-08)

Vlasnik je izabrao ciljana tri retka umjesto sirokog vala, uz izricitu odluku da se `algebra` zadrzi
i plati puna cijena njezina opsega. Iz toga su nastala tri prozna tijela i sest dokumenata:

    fsb--article--diplomski           4.994 rijeci   65 odlomaka   commit 86eff536
    arh--doctoral--poslijediplomski  15.803 rijeci  276 odlomaka   commit e62dfb4a
    algebra--specialist--poslijedip. 19.929 rijeci  372 odlomka    commit d7ec1eda

Commitanih `authored` dokumenata time je 17 (bilo 11). Oblika bez ijedne fixture je pet od 29, kao i
prije vala: val 2 nije zatvarao oblike nego opseg i dubinu, a preostalih pet trazi Google Docs
roundtrip i pakete koje ovaj stroj ne pravi.

**1. Odnos proze i dokumenta je ADITIVAN, ne multiplikativan.** Vlasniku sam rekao da ~160 proznih
odlomaka i 12.000 rijeci prelazi prag od 400 odlomaka. Netocno: graditelj dodaje priblizno stalnih
100 odlomaka (predtekst, naslovi, literatura, natpisi prikaza), pa je za prag trebalo oko 22.000
rijeci, a ne 12.000. Ista greska u drugom smjeru dala bi rad koji je platio opseg a nije dobio oblik.

**2. `scope.words` ne mjeri dokument nego GLAVNI TEKST od Uvoda do Zakljucka.** Kalibrirano je iz
`arh` para (razlika proza -> dokument ~1.150 rijeci) i po tome ciljano; provjera, medjutim, gleda uzu
populaciju. Prvi prolaz `algebre` dao je 19.622 rijeci i PROSAO SAMO KROZ TOLERANCIJU od +-10%, uz to
izrijekom napisano u detalju provjere. Dopisano je 593 rijeci; sada prolazi ravno. Fixtura koja
prolazi kroz toleranciju dokazuje slabije od one koja prolazi ravno.

**3. Vlastita proza je srusila validator, i to je bio nalaz o validatoru.** Poglavlje bez ijednog
odlomka rusilo je `validateProseBody` (`Cannot read properties of undefined`) umjesto da proizvede
imenovan nalaz. Kvar je bio latentan otkad shema postoji; nijedno tijelo iz vala 1 nije imalo taj
oblik. Popravljeno u `86eff536` (`bodyParagraphs` uz `?? []` plus nalaz po poglavlju).

**4. Moja vlastita izmjena ugasila je tudju mutaciju, a brojac je rastao.** Uvodjenje sekcija za
doktorski i specijalisticki rad ubilo je `allLevelThree`: brojac je isao 29 -> 32, a detekcija je
pala na 0. Korijen nije bio regex nego IME STILA, jer detektor oblika razinu naslova cita iz imena, a
moji su stilovi poceli s `Naslov<znamenka>`. Preimenovani su u `Sekcija*`, a mutacija sada
preusmjerava roditelje na `Heading_20_3` umjesto da ih preimenuje: preimenovanje bi skinulo
`style:master-page-name` i unistilo bas sekcije zbog kojih izmjena postoji. Popravljeno u `e62dfb4a`.

**Sitnica koja je jednom zavela:** `--messy` regenerira OBA primjerka, a goli `--row` samo usklađen.

**Mreza nakon vala, 15 -> 17 dokumenata:**

    consistency-fixer               15/0  -> 17/0   (mrtav, imenovan u ratchetu)
    croatian-typography-fixer        8/8  ->  9/9
    field-integrity-fixer           13/12 -> 14/13
    final-document-inspector-fixer  15/15 -> 17/17
    link-doi-fixer                  15/11 -> 17/13

Popis mrtvih se nije promijenio i oba i dalje nose IZMJEREN razlog `no-target`.

## Val 3: tri rada birana mjerenjem, i dva kvara proizvoda koje su nasli (2026-09-08)

Redci vise nisu birani po dojmu nego po pokrivenosti. Prije pisanja izmjereno: sedam tijela iz
valova 1 i 2 pokriva 41 od 720 redaka matrice, a razlicitih skupova pravila ima 131.

    adu--seminar--diplomski           3.012 rijeci    54 odlomka   pokriva 381 redak
    ffzg--graduate--diplomski        10.767 rijeci   203 odlomka   pokriva  61 redak
    fpzg--project--diplomski          5.020 rijeci   105 odlomaka  pokriva   5 redaka

Ishod: tijela 7 -> 10, dokumenti 17 -> 24, pokriveni redci 41 -> 488 od 720, skupovi pravila 7 -> 10.
NIJEDNA vrsta rada vise nije bez proze (`graduate` i `project` dobili su prve dokumente).

**Nesrazmjer je poanta, i vrijedi ga zapamtiti za sljedeci izbor.** Rad od 3.000 rijeci kupio je 381
redak, jer je to skup pravila na koji pada vecina redaka bez fakultetskog profila (`arts` fallback,
13 osi). Po dojmu bih izabrao bogatiji profil i dobio deset puta manje. Nakon ovog vala vise nema
velikog dobitka po radu: preostala su 232 retka na 121 razredu, najveci od 8 redaka, pa daljnje
pisanje kupuje dubinu na pojedinom profilu, ne pokrivenost.

**Ispravak usred posla.** Za drugi rad bio je odredjen `adu--final--prijediplomski` (5.500 rijeci).
Mjerenje je pokazalo da isti razred sadrzi i 14 `graduate` redaka, a `graduate` je vrsta rada sa 134
retka i nijednim tijelom. Predstavnik `graduate` pokriva istih 61 redak i uz to otvara vrstu rada.
Cijena je dvostruka (11.000 rijeci) i placena je svjesno.

### Dva kvara proizvoda koje je korpus nasao sam

**1. Citatni motor ne vidi `Kumar (2022, str. 1470)`.** Pripovjedna citatnica s lokatorom nije se
prepoznavala. Dvije grane promase istovremeno: pripovjedna je trazila zatvorenu zagradu ODMAH iza
godine, a parentetska nadje godinu ali unutar zagrade nema autora. Posljedica je bodovana:
`reference.uncited` (7 bodova) javlja ispravno citiran izvor kao NECITIRAN, `citation.recognized`
(3 boda) podbrojava. Izolirano kontrolama koje iskljucuju sufiks, autora i oblik zagrade; ostaje
tocno jedna varijabla. Popravljeno u `5c849d98`, uz deset testova od kojih je pet palo PRIJE izmjene.
Isti kvar na drugom regexu (`citation.direct-quote-locator`, max 0) popravljen zasebno u `7a540f9f`.

Golden nije dirnut ni u jednom od dva popravka, i to je ujedno objasnjenje zasto je kvar prezivio:
nijedna fixtura nije nosila taj oblik.

**2. `heading-style-fixer` nije bio pokvaren nego smo mu slali prazan zahtjev.** Mreza ga je
prijavljivala kao 7 zatrazeno / 3 promijenjeno uz `invalid-params` x4. Mjerenje na sva cetiri
pogodjena dokumenta: tocno jedan kandidat, nula odabranih, `targets` prazan, a stavka svejedno
`violated: true`. Cuvar u graditelju gleda SIROVE popise, ne odabrane. Popravljeno u `2dd22f3a`
(`violated: targets.length > 0`), uz gard siri od slucaja: nijedan fixer u mrezi ne smije vracati
`invalid-params`, jer taj razlog jedini opisuje NAS zahtjev a ne dokument.

### Sto je jos zatvoreno

- **Proza se mora slagati s retkom matrice** (`b8169693`). Do tada je tijelo moglo tvrditi bilo koji
  `unitId`, `workType`, `level` ili `family`; jedno od devet se razislo (`algebra`: proza `social`,
  matrica `mixed`) i stajalo dva dana. Ucinak je bio nikakav (graditelj `body.family` ne cita), i
  upravo je zato gard trebao: polje koje nitko ne cita ne ispravlja se samo.
- **Word trak zatvorio je os sadrzaja.** LibreOffice je za `ffzg` sam prijavio imenovano NEPOKRIVENO
  (`0 instrText/fldChar/fldSimple`), a profil trazi `requireToc: true`. Wordov primjerak nosi stvarno
  polje: provjeren je SADRZAJ uputa, ne broj (`TOC \o "1-3" \h \z`, 30 `PAGEREF _Toc...`, 360 `w:rsid`).
- **Kvar 144 izvezen Katedri**: validacijski sloj pada bez `jsonschema`, a kvar je ZAKLONJEN time sto
  registar rutira samo `efzg` i `fpzg`, pa na nerutiranom fakultetu skripta padne ranije i do
  validacije nikad ne dodje.

### Sto su alati uhvatili meni

Vrijedi zapisati i suprotan smjer, jer je cesci nego sto se prijavljuje:

- katedra-lite **plan gate pao je dvaput iz prvog pokusaja**, oba puta na potpoglavlju bez planiranih
  izvora. Treci rad je prosao iz prve, jer sam nakon dva pada izvore dao svima.
- validator proze uhvatio je dvije kose unakrsne upute umjesto tri (dvije sam napisao u nominativu) i
  opseg 2.259 umjesto 3.000.
- `reference.uncited` javio je 11 od 16 izvora bez citatnice, jer sam autore spominjao bez godine.
- skener je nasao **nevidljiv meki prijelom (U+00AD)** usred rijeci u sazetku i cirilicu u mom
  vlastitom komentaru u testu.
- `ui-module-budget` je odbio moj komentar od 17 redaka u `src/ui`; ratchet smije samo padati, pa je
  obrazlozenje preseljeno u test i u poruku commita, a u kodu je ostao jedan redak.

## Oblici bez fixture: s pet na jedan, i to mjerenjem (2026-09-08)

Popis oblika koje nijedna commitana fixtura ne nosi bio je: `zip/direktoriji`, `paket/bez-png-default`,
`paket/comments-prazan`, `proizvodjac/google-docs`, `gdocs/potpis`. Svih pet je opisano kao "trazi
Google Docs roundtrip ili rucno slozen paket". Prvo je izmjereno sto stvarni radovi doista nose, nad
457 dokumenata u `Lekta-korpus` (200 izvor, 187 ingest, 24 sintetski, 46 izbaceno):

    zip/direktoriji         130 od 457      21 od njih NIJE Google Docs
    paket/comments-prazan   135 od 457
    gdocs/potpis            129 od 457      `<Properties/>` doslovno prazan
    paket/bez-png-default     0 od 457      205 dokumenata ima png, svih 205 nosi Default
    proizvodjac/google-docs   0 od 457      nijedan `<Application>` ne sadrzi "Google"

**Mjerenje je oborilo dvije stavke popisa, i to je glavni nalaz.**

`proizvodjac/google-docs` se ne moze zatvoriti ni najboljim roundtripom, jer se s `gdocs/potpis`
MEDJUSOBNO ISKLJUCUJE: prvi trazi `<Application>` koji sadrzi "Google", drugi trazi da tog elementa
NEMA. Google Docs ga ne pise, nego ostavlja prazan `<Properties/>`, pa bi izvoz iz Google Docsa
zatvorio `gdocs/potpis`, `zip/direktoriji` i `proizvodjac/nepoznat`, a taj oblik nikad. Grana
`/Google/i` u `producerFamilyOf` bila je pogodjena, bez ijednog testa i bez ijednog dokumenta, dakle
mrtav kod, i to u funkciji koja u susjednom komentaru izricito odbija pogadjati za Apple Pages. Grana
i oblik su uklonjeni, a identitet Google Docsa ostaje ondje gdje je izmjeren, kao `gdocs/potpis`.

`paket/bez-png-default` je zapisan kao "naslo se na 1 od 246 stvarnih radova" i to se vise ne
reproducira. Ostaje imenovan i nepokriven: razred kvara je stvaran (Word takav paket odbija), ali
nositelja u korpusu nema, pa se fixtura ne izmislja da bi popis izgledao zatvoren.

Preostala tri zatvara JEDAN rucno slozen paket, `tests/fixtures/docx-packaging/gdocs-otisak.docx`,
uz novu traku `handbuilt` (izvan `ADMITTED_TRACKS`, uz `synthetic: true`, dakle oba pojasa zida).
Otisak je REPRODUCIRAN iz mjerenja, ne dobiven iz Google Docsa, i tako je i imenovan u sidecaru:
imena i redoslijed zapisa, prazan `<Properties/>` i prisutan `docProps/custom.xml` prepisani su s dva
stvarna rada koja oba imaju 22 zapisa i 4 direktorija.

**Fixtura mora zaraditi svoje mjesto**, inace samo skracuje popis. Gard je zato
`tests/corpus-packaging.test.ts`, koji paket tjera kroz motor: analiza ga cita, a popravak ga PONOVNO
NAPISE i sva tri oblika prezive (`integrityFailure` null, 4 direktorijska zapisa i poslije). Kljucna
je druga polovica tvrdnje: zadani odabir bez profila na tom dokumentu daje NULA zahtjeva, `applyFixers`
tada vrati ULAZNE bajtove, i tvrdnja o prezivljavanju bi prosla nad netaknutim originalom. Zato paket
nosi cetiri prazna odlomka, zahtjev se salje izravno, a `verifyRepairRoundTrip` uz `lost` vraca i
`vacuous`. Mutacija `oblik/popravak-izgubi-oblik-pakiranja-pri-ponovnom-pisanju` pokriva oba smjera.

Usput izmjereno: nas pisac paketa izlaz KOMPRIMIRA, pa popravljeni paket dobije `zip/deflate` kojega
ulaz nema. Nije kvar, ali je razlika ulaza i izlaza koju nijedan zapis dosad nije imenovao.

## Sedamnaest fixera nije bilo mrtvo nego NEDOSEZNO (2026-09-09)

Pitanje je bilo koje retke pisati u valu 4. Odgovor je stigao iz mjerenja, i bio je da val 4 uopce
ne pocinje prozom:

    fixera ukupno            31
    dodirnutih mrezom        14
    razlicitih palih provjera 11   na svih 24 dokumenta

Uzrok nije proza nego KATALOG MUTACIJA. Svih osam mutacija dira OBLIKE (tab u naslovu, prazni
odlomci, rucni sadrzaj, tockaste vodilice, cs-fontovi, biblio kao naslov, komentari, sve razine 3), a
nijedna ne krsi formu koju motor BODUJE. Usklađen primjerak se gradi po pravilima retka, neuredan ih
ne dira, pa `font-fixer`, `paper-size-fixer` i ostali nemaju metu ni na jednom dokumentu. Jos tri
rada s istim mutacijama dala bi istih 11 palih provjera i istih 14 fixera.

Dodane su cetiri mutacije bodovane forme: `wrongBodyFont` (Comic Sans u stilu tijela),
`singleLineSpacing` (prored 1 umjesto 1,5), `letterPaper` (Letter umjesto A4), `paragraphSpacingNoise`
(razmak iza odlomka 17 pt). Vrijednosti su birane tako da ih nijedan profil ne dopusta, pa mutacija ne
ovisi o retku.

Mjereno nad svih deset neurednih primjeraka, prije i poslije:

    pale provjere            8 -> 12
    fixeri zatrazeni        13 -> 16
    fixeri koji MIJENJAJU   11 -> 14
    novi                    font-fixer, line-spacing-fixer, paper-size-fixer
    izgubljenih             nijedan
    regresije                3 -> 3  (sve tri zatecene)

Mreza nad punim skupom sada doseze 16 fixera, a sva tri nova mijenjaju na svakom zahtjevu (6/6, 6/6,
5/5) i doista poprave svoju os, ne samo da se zatraze.

**Dvije stvari koje katalog nije imao, a mutacija forme ih trazi.**

DOKAZ U IZLAZU. Mutacije forme nemaju katalogiziran oblik: krsenje bodovane forme je vrijednost, ne
oblik, a `docx-shapes` nabraja nalaze iz stvarnog korpusa i ondje se ne dopisuje ono sto nam treba za
mjerenje. Svaka nosi predikat nad GOTOVIM paketom (`verifyOutputProofs`), jer LibreOffice zna tiho
odbaciti ono sto mu upises; taj je kvar ovaj katalog vec platio dvaput na `csOnlyFonts`. Brojac bez
dokaza obara prolaz. Mutacija: `mutacija/forma-upisana-a-alat-ju-je-tiho-odbacio`.

NEPRIMJENJIVOST ODVOJENA OD NULE. Brojac 0 znaci mrtav mehanizam i mora oboriti prolaz, ali profil
koji ne trazi prored 1,5 nema sto izgubiti. Neprimjenjiva mutacija ide u `mutationsNotApplicable` s
razlogom, ne medju brojace. Isti razred razlike koji je mreza upravo prosla s "mrtav fixer" naspram
"ceka covjeka".

**Usput nadjeno: fixtura koja se ne moze reproducirati iz vlastitog ulaza.** Regeneracija je pala na
`fzsri--final--prijediplomski`, jer validator proze trazi da SVAKO poglavlje ima odlomak, a taj rad
ima obican akademski raspored: "2. Pojmovni okvir" bez vlastitog teksta, pa 2.1, 2.2, 2.3. Dokument je
bio commitan, a njegov commitani ulaz je padao na cetiri nalaza. Pravilo sada izuzima naslov iza
kojega slijedi dublja razina, a i dalje grize na LISTU (poglavlje bez odlomaka i bez podpoglavlja, te
prazan odjeljak).

**Sto ovo NIJE zatvorilo.** `paragraphSpacingNoise` se primjenjuje i dokazuje u paketu, ali nijedan od
deset profila ne boduje tu os, pa `paragraph-spacing-fixer` i dalje nije zatrazen. Ostaje imenovan,
kao i preostalih 15 nedoseznih fixera; dio njih (`title-page-fixer`, `submission-metadata-fixer`)
trazi ulaz izvan dokumenta i mutacijom se ne doseze uopce.

## Val 4: jedanaesto tijelo, i bodovana provjera koja pada bez ijednog popravka (2026-09-09)

Redak je biran mjerenjem, kako "Sto ostaje" trazi. Od 269 kandidata s profilom i bez proze,
`mef--graduate--diplomski` je medju najbogatijima pravilima: nosi obvezne sekcije, vlastiti popis
formata i harvard, a `biomed` je uz `mixed` najtanja obitelj (jedno tijelo na 75 redaka matrice).

Napisano je 10.042 rijeci tijela u 157 odlomaka, uz 17 jedinica literature; validator proze daje
nula nalaza. Cetiri jedinice potvrdjene su kroz CrossRef uz HTTP 200 i prepisane iz odgovora, dvije
su namjerno izmisljene. Protokol katedra-lite izvrsen je u cijelosti, ukljucujuci ono sto je palo:
`profile_resolver.py` odbija `mef` (registar rutira samo efzg i fpzg), pa je stanje otvoreno s tri
imenovana ogranicenja, a PLAN GATE je iz prvog pokusaja pao (potpoglavlja bez opisa i bez planiranih
izvora) i prosao tek nakon prepisivanja plana u tablicni oblik.

    uskladjen   palo 3   zatrazeno 4   promijenili 3   regresije 0
    neuredan    palo 6   zatrazeno 8   promijenili 7   regresije 0
    mreza       26 dokumenata, 16 fixera, popis mrtvih i dalje prazan

**Nalaz koji nije bio namjera.** Dvije obvezne sekcije ostavljene su nezadovoljene namjerno
(`Summary`, jer graditelj pise `Abstract`, i `Zivotopis`, kojega nema), s ocekivanjem da ce dati metu
`required-section-fixer`-u. `structure.sections.profile` doista pada na OBA primjerka, ali fixer nije
ni zatrazen. Razlog je ispravan i dokumentiran u CLAUDE.md: taj popravak umece iskljucivo natpis koji
propisuje VERIFICIRANO pravilo (`required-section-rules` sa `sourceId`, `sourcePage` i doslovnim
citatom), a profil `mef-diplomski` obvezne sekcije nosi samo u `rules`.

Time je imenovana nova vrsta rupe, razlicita od one koja se trazila: bodovana provjera koja pada, a
za koju popravka nema jer pravilu nedostaje provenijencija. To NIJE kvar fixera i ne ide u ratchet
mrtvih; ide u popis profila kojima obvezne sekcije treba potkrijepiti izvorom prije nego se od
popravka ista ocekuje.

## Sto ostaje

1. Daljnja proza. Napisano je DESET tijela (cetiri val 1, tri val 2, tri val 3), sto pokriva 488
   od 720 redaka. Preostala 232 retka leze na 121 razredu, najveci od 8 redaka, pa daljnje pisanje
   kupuje dubinu na pojedinom profilu, a ne pokrivenost; izbor retka od sada mora nositi razlog.
2. Vlastito mjerenje za `consistency-fixer` i `citation-bibliography-sync-fixer`, s POTVRDJENIM
   odabirom, jer je to jedino stanje u kojem ta dva uopce mogu raditi.
3. `apuri` nema Wordovu inacicu, a ostala tri je imaju. Nije zapisano je li izostala namjerno ili je
   pokusaj pao; utvrditi prije nego se broj dokumenata negdje navede kao ujednacen.
4. Popravci na njihovoj strani, i skidanje eval slucaja tek kad kvar doista nestane iz mjerenja.
5. ~~Odluka vlasnika o `paket/bez-png-default`.~~ ODLUCENO 2026-09-09: **ostaje imenovan**. Oblik
   se ne brise iz kataloga i ne dobiva izmisljenu fixturu, nego stoji kao jedini nepokriven, s
   provenijencijom koja se vise ne reproducira (0 od 457; 205 dokumenata s png-om, svih 205 nosi
   `Default`). Ako ga ijedan buduci ingest donese, zatvara se tim dokumentom, ne rucnim paketom.
