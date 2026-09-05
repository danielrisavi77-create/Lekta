# Plan: svi profili na razini dokaza A

> Izmjereno 2026-09-05 nad `docs/generated/completion-ledger.json` (436 redaka, 407 profila, 131
> jedinica) i `data/verification/real-corpus-attestation.json` (45 stvarnih radova, 8 profila).
> Stanje: **A 9, B 329, C 8, D 42, E 48.**

## 1. Gdje je zid, brojkama

Razina A trazi DVOJE: bodovana pravila iz sluzbenog izvora i dokaz na stvarnom radu. Tri su skupine
koje nisu na A, i **ne rjesavaju se istim alatom**:

| skupina | redaka | sto ih drzi | vrsta posla |
|---|---|---|---|
| **samo dokaz** | **329** | jedini blokator: "nema dokaza na stvarnom studentskom radu"; pravila verificirana, popravak ponudjen | **nabava dokumenata** |
| podaci | ~95 | staging pravila (26), nijedna repair opcija (24), pravila nebodovana (19), samo opca higijena (18), ceka audit (8), izvan matrice (8), bez jedinice (8) | rad sesija nad `data/**` |
| bez izvora | 48 (E) | nijedno bodovano pravilo iz sluzbenog izvora | **strop**: fakultet nije objavio pravila |

Prva skupina je 75 % zida i **nije problem koda**. Stvarne radove ima 6 jedinica od 131 (fer, ffzg,
fpzg, mef, pmf, ttf). Preostalih **112 jedinica nema nijedan stvarni rad.**

## 2. Odluka 1: granularnost dokaza (vlasnik)

Koliko radova jos treba nabaviti da 329 redaka dodje na A ovisi o tome sto jedan rad dokazuje:

| granularnost | jos radova | udje ODMAH iz postojecih 45 | postenje |
|---|---|---|---|
| po profilu | **317** | 0 | najstroze; nista se ne pretpostavlja |
| po jedinica x vrsta rada | **231** | 17 | FER diplomski dokazuje FER-ove diplomske profile; pravila se po vrsti rada stvarno razlikuju, po katedri unutar iste vrste rijetko |
| po jedinici | **112** | 27 | jedan rad po fakultetu; **pretjeruje**, jer diplomski rad ne dokazuje doktorski, kojem su pravila druga |

Preporuka: **jedinica x vrsta rada**. Isti ustupak repozitorij vec ima za citatne specove
("granularnost je danas FAKULTETSKA"), a ne prelazi granicu vrste rada, gdje se pravila doista mijenjaju.
Trosak: 231 rad umjesto 317, i 17 redaka koji ulaze odmah.

Tehnicki preduvjet: `real-corpus-attestation.ts` kljuca po `profileId::workType`, ali artefakt mjerenja
ne biljezi `workType`. Prvi korak je da harness upise vrstu rada uz svaki dokument; tek onda se
granularnost moze promijeniti bez pogadjanja.

## 3. Odluka 2: odakle radovi (vlasnik), po skali

| kanal | doseg | sto treba | stanje |
|---|---|---|---|
| **A. privola u proizvodu** | jedini koji doseze 112 jedinica; raste s uporabom | opt-in pri popravku (smijem li anonimiziranu kopiju zadrzati za testiranje), pseudonimizacija, rok cuvanja, tekst u privatnosti | `repair-docx` **vec ima** consent gate s `consent_version`; `src/corpus/pseudonymize.ts` i `scripts/corpus-ingest.mts` **vec postoje** |
| B. fakultetska partnerstva | visoka kvaliteta, spor | pilot fakultet daje anonimizirane uzorke; poklapa se s B2B strategijom | pilot skup postoji (`pilot-set.json`) |
| C. javni repozitoriji | malen: repozitoriji drze PDF, popravku treba .docx | harvest infrastruktura postoji za PDF | niska iskoristivost |
| D. vlasnikova mreza | ne skalira | tako je nastalo danasnjih 38 | iscrpljeno na 6 jedinica |

Samo kanal A moze zatvoriti zid. Ali trazi tri stvari koje kod ne odlucuje: GDPR temelj (privola je
dovoljna, ali tekst i rok cuvanja su pravni), pseudonimizaciju koja ne ostavlja tragove (postojeci alat
je na 76 od 246 radova bio *vacuous*, dakle nije prepoznao nijedan pojam; to treba popraviti PRIJE
prvog prikupljenog rada), i odluku da se to uopce radi.

## 4. Sto sesije mogu odmah, bez ijedne odluke

Skupina "podaci" (~95 redaka) je rad nad `data/**`, mjerljiv postojecim gardovima:

1. **26 bez staging pravila**: `npm run gen-profile-rules-server` + deploy; dio je vec u T11/T12.
2. **24 bez ijedne repair opcije**: provjeriti zasto `repair-map` nema unos; vjerojatno pravila bez
   `autoFixable`. Presedan: `footnote-size` je 52 profila dobilo istim potezom.
3. **19 nebodovanih**: izvor ili verifikacija; ide kroz `npm run verify:claims` po profilu.
4. **8 cekaju audit**: ljudski, ali malen.
5. **Harness upisuje `workType`**: preduvjet za odluku 1.

## 5. Strop koji treba izgovoriti

48 redaka na E nema nijedno bodovano pravilo jer fakultet nije objavio nista sto se da citirati.
Oni **ne mogu** na A ni s tisucu radova. Ljestvica bi to trebala reci ("A nedostizna: nema sluzbenog
izvora") umjesto da ih prikazuje kao zaostatak. Inace brojka "svi na A" nikad nece biti 100 % i nitko
nece znati je li to kvar ili cinjenica.

## 6. Redoslijed koji pomice brojku

1. Harness biljezi `workType` (sesija, jedan dan).
2. Odluka o granularnosti (vlasnik). Uz "jedinica x vrsta": **A 9 -> 26** iz postojecih radova.
3. Skupina "podaci", redom 2, 1, 3, 4 (sesije, nekoliko dana): oko 95 redaka izlazi iz svojih
   blokatora, ali ostaju na B dok nema dokaza.
4. Kanal A: pravni tekst i popravak pseudonimizacije (vlasnik + sesija), pa opt-in u `repair-docx`.
   Od tog trenutka brojka raste s uporabom, a ne s rucnim radom.
5. Strop izgovoren u ljestvici za 48 redaka na E.

**Posteno ocekivanje:** bez kanala A, gornja granica je oko 26 profila na A uz sve sto sesije mogu
same. Sve iznad toga ovisi o odluci da proizvod smije, uz privolu, zadrzati anonimizirane radove.

## 7. Izvedeno 2026-09-05

Odluke vlasnika: granularnost dokaza = **jedinica x vrsta rada**; kanal A (privola) ide u pripremu;
strop za E redke se **imenuje** u ljestvici.

| sto | prije | poslije |
|---|---|---|
| redaka na A | 9 | **26** (24 profila) |
| redaka na B | 329 | 312 |
| E s imenovanim stropom | 0 | 45 od 48 (ostala 3 su programi bez profila, s vlastitim razlogom) |
| mjerenje | 45 radova, commit `bff502f2` | 45 radova, ponovljeno nad `b0071c86`: pass 1, review 42, fail 0, regresija 0 |

- Ovjera (`data/verification/real-corpus-attestation.json`) sada nosi unose po paru
  `(unitId, workType)` s popisom `profileIds` iz kojih dokaz dolazi; `provenUnitWorkTypes` je jedini
  ulaz u ledger, a redak dobiva A samo ako je NJEGOV par ovjeren (test: bez ovjere manje A, s ovjerom
  se mijenja iskljucivo ovjereni par).
- `measuredAt` i `measuredFromCommit` citaju se iz artefakta mjerenja (`withProvenance` u
  `scripts/repair-real-corpus.mts`), ne iz trenutka pisanja ovjere; artefakt bez provenijencije ovjera
  ODBIJA, a `attestationProblems` javlja `nema vremena mjerenja`. Do tada je `measuredAt` govorio kad je
  ovjera napisana, pa gard "potpis stariji od mjerenja" nije usporedjivao mjerenje ni s jedne strane.
- Strop je konstanta `STROP_RAZINE_A` u `completion-ledger.ts`, prva u `blockedReasons` obiju E grana
  (`none`, `advisory-only`); test tvrdi da stoji na svakom E retku profila i ni na jednom drugom.

**Posteno ocekivanje ostaje isto:** 26 je gornja granica iz postojecih radova. Dalje pomicu samo
skupina "podaci" (oko 95 redaka izlazi iz blokatora, ali ostaje na B) i kanal A.

## 8. Prosirenje korpusa 2026-09-05

Vlasnik: radovi su u Downloads, napravljena je posebna mapa `Desktop/Lekta-korpus` (izvan repozitorija, jer ingest
odbija odrediste unutar njega). Izvedeno istog dana:

| korak | broj |
|---|---|
| docx u Downloads / odabrano za korpus | 368 / 195 |
| ingest (pseudonimizacija, zapis o dopustenju `local-testing`): prihvaceno / bez profila / vacuous | 195 / 80 / 6 |
| dedupe po klasterima verzija (Jaccard >= 0,8 nad tijelom): predstavnika / odbacenih verzija | 58 / 57 |
| lokalni korpus prije / poslije (plus 7 commitanih) | 38 / 88 |
| mjerenje nad `ea15e9ce`: pass / review / fail / regresija | 7 / 86 / 0 / 0 |
| ovjerenih parova jedinica x vrsta rada | 10 -> 16 |
| redaka na A | 26 -> **34** |
| profila na A u mapi tvrdnji | 24 -> 28 |

- "Posteno ocekivanje" iz sekcije 7 (26 kao gornja granica iz postojecih radova) time je pomaknuto: granica su
  bili radovi koje sesije nisu imale, ne dokaz.
- Harness je na 15 novih radova javljao `fail` bez integriteta i regresije: prazan `word/comments.xml` iz
  ne-Wordovih alata koji `final-document-inspector-fixer` ukloni i prijavi kroz `removedPackageParts`, a mjera je
  deklarirano uklanjanje brojala kao izgubljen zapis. Popravljeno u `ea15e9ce` (`removedByFixers` imenovano,
  `droppedEntryCount` broji samo neprijavljeno, test s negativnom kontrolom). Prije popravka: fail 15.
- Pseudonimizacija: `vacuous` na 6 od 195, ne 76 od 246 kao u sekciji 3; stara brojka je iz doba prije heuristike
  naslovnice. Preostalih 6 je rucni pogled po sidecaru, ne novi mehanizam.
- 80 radova bez profila su vecinom seminari i eseji cija naslovnica imenuje program ("diplomski studij"), a ne
  vrstu rada; sirenje detektora na golu rijec "diplomski" oznacilo bi ih kao diplomske radove. Treba odluka o
  mapiranju eseja i seminara na vrste rada, pa tek onda detektor.

### Drugi val, isti dan

Otvorena pitanja iz sekcije 8 rijesena su na vlasnikovu rijec ("idemo to rijesiti sada"), commit `fc66791f`:

| sto | brojka |
|---|---|
| detektor vrste rada (padezi, umetak, esej = seminar, rad kolegija): s profilom od 195 | 115 -> 163 |
| promjena vrste na vec prepoznatih 115 | 0 |
| pseudonimizacija (uloge nositelj/voditelj, ime velikim slovima iza uloge): praznih rjecnika | 6 -> 5 |
| lokalni korpus (dopusteno u mjerenje) | 88 -> 112, ukupno 119 |
| mjerenje nad `fc66791f`: pass / review / fail / regresija | 7 / 110 / 0 / 0 |
| ovjerenih parova jedinica x vrsta rada | 16 -> 15 |
| redaka na A / profila na A | 34 -> 33 / 28 -> 27 |

- A je PAO za jedan, i to je ispravak, ne gubitak: rucni pregled praznih rjecnika pokazao je da su tri FKIT
  dokumenta popis literature i plan i program diplomskog rada, dakle nisu radovi. Nose `track: not-a-thesis` i
  ne ulaze u mjerenje, pa par `fkit x graduate` vise nema dokaz. Dokaz koji je stajao na dokumentima koji nisu
  radovi nije bio dokaz.
- Preostalih 5 praznih rjecnika: 3 su ti FKIT dokumenti, 1 ima placeholder "IME PREZIME" (prazan s pravom), 1
  ima ime velikim slovima kao samostalan odlomak, sto se namjerno ne hvata (26 od 42 takva kandidata na 195
  radova nisu imena nego imena studija).
- 32 rada i dalje bez profila: bez ikakva traga vrste rada na naslovnici (2 bez ustanove s popisa). Ostaju u
  `03-ingest` i ne ulaze u mjerenje.

### Treci val, isti dan

Preostala dva pitanja rijesena na vlasnikovu rijec ("idemo to rijesiti"), commit `cf5fe841`:

| sto | brojka |
|---|---|
| vrsta rada: rezerve iza naslovnice (izjava/sazetak u prvim stranicama, pa ime datoteke): s profilom od 195 | 163 -> 175 |
| izvor odluke o vrsti | naslovnica 163, prve stranice 10, ime datoteke 2 |
| neslaganje rezervi s naslovnicom na 163 rada s vrstom (izmjereno prije ugradnje) | prve stranice 0, ime datoteke 1 (zato NIKAD nemaju prednost) |
| pseudonimizacija: rucno potvrdjeni pojmovi (`--terms`), praznih rjecnika | 5 -> 4 (tri FKIT ne-rada i jedan placeholder) |
| lokalni korpus dopusten u mjerenje (ukupno s 7 commitanih) | 112 -> 120 (127) |
| mjerenje nad `cf5fe841`: pass / review / fail / regresija | 7 / 118 / 0 / 0 |
| ovjerenih parova / redaka na A / profila na A | 15 / 33 / 27 (nepromijenjeno: novih 8 radova pada u vec dokazane parove) |

- Rucno potvrdjen pojam ulazi u rjecnik SAMO ako doista stoji u dokumentu (`manualTermsIgnored` broji ostale):
  ime iz naziva datoteke primijenjeno je na jednoj od dvije verzije istog rada, druga ga ne sadrzi, pa ondje
  nije ni "zamijenjeno".
- Preostalih 20 radova bez profila (od 195): nema traga vrste rada ni na naslovnici, ni u prvim stranicama, ni u
  imenu datoteke (2 bez ustanove s popisa). Ostaju u `03-ingest` i ne ulaze u mjerenje; dalje samo rucno.
- Preostala 4 prazna rjecnika nisu greska: tri dokumenta nisu radovi (iskljuceni), jedan ima placeholder.

### Cetvrti val: fakulteti koje korpus nema

Vlasnik: "idemo na fakultete koji korpus nemaju". Izmjereno nad 391 docx (Downloads + izbaceni): 32 rada pripada
ustanovama bez korpusa, a detektor ih je promasio 28 jer je znao samo 25 zagrebackih imena. Commiti `8e84e8d4`
(ustanova iz kataloga, 134 jedinice, genericka imena razrjesava sveuciliste, najranije ime na naslovnici
pobjedjuje, 0 promjena na 172 prepoznatih), `91df26d6` (id dokumenta iz sadrzaja izvorne datoteke, jer je redni
broj mijenjao id vecini radova pri svakom premjestanju; 362 sidecara za 200 izvora), `237a6a9a` (spec Kanala A).

| sto | brojka |
|---|---|
| radova s novih ustanova kopirano u izvor | 28 (HKS 15, ZVU 8, Libertas 3, FZS Rijeka 2) |
| ingest (200 izvora, id po sadrzaju): sidecara / s profilom / vacuous | 187 (13 byte-identicnih kopija sazeto) / 187 / 1 |
| korpus izgradjen ispocetka istim pravilima dedupea: lokalnih + commitanih | 127 + 7 = 134 |
| mjerenje nad `91df26d6`: pass / review / fail / regresija | 7 / 125 / 0 / 0 |
| ovjerenih parova jedinica x vrsta rada | 15 -> **18** (novi: hks x graduate, libertas x graduate, zvu x final) |
| redaka na A / profila na A / jedinica na A | 33 -> **37** / 27 -> 31 / 7 -> 10 |

- Prvi put je dokaz A dosao s ustanova izvan vlasnikove pocetne mreze (HKS, ZVU, Libertas), ali iz ISTOG izvora
  (Downloads): granica ostaje ono sto vlasnik ima na disku. Dalje pomice samo Kanal A
  (`docs/superpowers/specs/2026-09-05-kanal-a-privola-korpusa.md`), koji ceka vlasnikove odluke o tekstu privole,
  roku cuvanja, anonimnim racunima i datumu ukljucivanja.
- FZS Rijeka (2 rada) nije usao u mjerenje: oba su svedena na verzije vec prisutnih radova ili nemaju par u
  registru; provjeriti pri sljedecem valu, ne pretpostavljati.
