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
| 142 | prezime u kosom padezu ne nadje svoju jedinicu | fpzg: 2 citata bez izvora i 1 necitirana jedinica, iz istog para |
| 143 | popis literature nadjen, a poruka kaze da nije | effectus: naslov Heading1, 18 jedinica, 0 procitanih prezimena |

Zapis prolazi Katedrin VLASTITI validator (`kvar.py --provjeri --nastavak-od 140`, izlazni kod 0).

Kvar 142 je isti koji je Lekta imala i popravila (`ddf9ee8e`), pa je recept prenesen doslovno: popis
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

## Sto ostaje

1. Val 2 proze, prema 60 tijela, uz mjerenje nakon svakog vala.
2. Vlastito mjerenje za `consistency-fixer` i `citation-bibliography-sync-fixer`, s POTVRDJENIM
   odabirom, jer je to jedino stanje u kojem ta dva uopce mogu raditi.
3. `apuri` nema Wordovu inacicu, a ostala tri je imaju. Nije zapisano je li izostala namjerno ili je
   pokusaj pao; utvrditi prije nego se broj dokumenata negdje navede kao ujednacen.
4. Eval slucaj za `katedra-lite/evals/evals.json`. NIJE napravljen jer trazi odluku vlasnika: eval
   treba dokument, a slanje `.docx`-a drugom proizvodu je pitanje granice koje nitko nije presudio.
   Zapis kvara je samostalno upotrebljiv i bez toga.
