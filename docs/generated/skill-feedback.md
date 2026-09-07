<!-- npm run skill-feedback -- --write | 2026-09-07T07:28:46.318Z | ddf9ee8eb573b76fa5d05624b40d00a8b1332c00 -->
<!-- Fragment za <katedra-lite>/references/zamke.md. Provjera na drugoj strani: -->
<!-- python3 <katedra>/scripts/kvar.py <ovaj-fragment>.md --provjeri --nastavak-od 140 -->

nadovezuje se na unos 140

## 141. Pokrivenost izvora mjeri se samo autor-godinom, pa rad koji citira drukcije nema nijedan citat

`verify_sources.py --pokrivenost` gradi skup citata iz tijela rada preko `H.kljucevi_citata`, koji
prepoznaje oblik autor-godina. Rad koji citira numericki (Vancouver) ili u fusnotama (Chicago) ne
proizvede nijedan kljuc, pa skup citata ostane prazan. Svaka jedinica popisa literature tada nema
para i zavrsi na popisu necitiranih.

Kvar je tih, i to je najgori dio. Skripta ne pada, ne javlja upozorenje o stilu i ne kaze da citate
nije nasla; ispise dug, uredan popis necitiranih jedinica koji izgleda kao pomno mjerenje. Autor koji
taj popis dobije nad urednim radom nauci da mu crvena boja tog alata ne znaci nista, pa ce i stvaran
promasaj poslije proci neopazeno.

Ograda koja bi ga bila uhvatila stoji u samom izlazu: `citata_razlicitih` je vec u JSON-u i bio je
`0`. Nula prepoznatih citata u radu koji ima punu literaturu nije nalaz o radu nego o citacu, pa
pokrivenost uz tu vrijednost ne smije izdati popis necitiranih, nego reci da stil citiranja nije
prepoznat. Popravak zato ima dva dijela: prepoznavanje numerickog i fusnotnog citiranja u
`pokrivenost`, i tvrdu ogradu koja kod nula prepoznatih citata odbija izdati popis.

Izmjereno na 6 dokumenta (effectus--seminar--diplomski--neuredan.docx, effectus--seminar--diplomski--uskladjen.docx, effectus--seminar--diplomski--word.docx, fzsri--final--prijediplomski--neuredan.docx, fzsri--final--prijediplomski--uskladjen.docx, fzsri--final--prijediplomski--word.docx); najveci broj nalaza na jednom dokumentu je 22.

```
$ python3 scripts/verify_sources.py fzsri--final--prijediplomski--uskladjen.docx --pokrivenost --offline
   citata_razlicitih: 0 | necitiranih: 20 | bez_izvora: 0
   (rad ima 20 jedinica literature i citira ih numericki, Vancouver)

$ python3 scripts/verify_sources.py effectus--seminar--diplomski--uskladjen.docx --pokrivenost --offline
   citata_razlicitih: 0 | necitiranih: 18 | bez_izvora: 0
   (rad ima 18 jedinica i 12 fusnota; pokrivenost cita samo tijelo_rada(put))
```

## 142. Prezime u kosom padezu ne nadje svoju jedinicu, pa jedan ispravan citat da dva lazna nalaza

Kljuc citata se svodi na prezime prvog autora i godinu, ali se svodjenje radi nad DOSLOVNIM nizom iz
teksta. Hrvatski taj niz sklanja. Recenica "Prema Galtungu i Rugeu (1965)" daje kljuc
`galtungu 1965`, dok jedinica "Galtung, J. i Ruge, M. H. (1965)" daje `galtung 1965`. Kljucevi se
ne poklope.

Jedan te isti ispravno napisan citat zato proizvede DVA nalaza koji se citaju kao razliciti problemi:
citat bez izvora (jer se kljuc iz teksta ne nalazi u literaturi) i necitirana jedinica (jer se
jedinica ne nalazi u tekstu). Tko gleda samo jedan od ta dva popisa nema nacina vidjeti da su to dvije
strane iste stvari, pa ce popravljati tekst koji je bio tocan.

Lekta je isti kvar imala i popravila ga svodjenjem na korijen prije usporedbe. Recept je prenosiv i
kratak: skini padezni nastavak s popisa `ovima, evima, ima, ova, eva, om, em, ju, a, e, i, u`,
odbaci korijen kraci od cetiri znaka i uz svaki korijen ponudi i oblik s dodanim `a` zbog zenske
sklonidbe, jer "Bandure" treba dati "bandura". Granica od cetiri znaka nije ukras: bez nje "Mara"
postane "mar" i pocne se lazno vezati uz svaku jedinicu koja pocinje tim slovima, a lazan pozitiv je
gori od laznog negativa jer tiho tvrdi podudaranje kojega nema. Popravak zivi u `kljuc_prvog_autora`
i `kljuc_izvora`, dakle na obje strane usporedbe, inace se raskorak samo preseli.

Izmjereno na 3 dokumenta (fpzg--final--prijediplomski--neuredan.docx, fpzg--final--prijediplomski--uskladjen.docx, fpzg--final--prijediplomski--word.docx); najveci broj nalaza na jednom dokumentu je 2.

```
$ python3 scripts/verify_sources.py fpzg--final--prijediplomski--uskladjen.docx --pokrivenost --offline
   citata_razlicitih: 19 | necitiranih: 1 | bez_izvora: 2
   bez_izvora:  [galtungu 1965, wallacea 2018]      <- kljucevi iz TIJELA rada
   necitirani:  [galtung 1965]                      <- kljuc iste jedinice iz LITERATURE

   Ista jedinica je istovremeno na oba popisa, pa jedan kvar izgleda kao dva razlicita.
   Tijelo rada pise prezime u dativu i genitivu, sto je ispravan hrvatski; literatura ga pise u
   nominativu, sto je ispravan APA. Nijedna strana nije pogrijesila.

   (Popis necitiranih je ovdje sveden na KLJUC. Doslovna jedinica je tekst iz dokumenta i ne
    prelazi granicu izmedju dvaju proizvoda; kljuc je izvedenica i dovoljan je za mehanizam.)
```

## 143. Popis literature je nadjen, a poruka kaze da nije: brojcani prefiks jedinice odnese sva prezimena

`literatura_prezimena` u `provjeri_fusnote.py` nadje naslov popisa preko `H.NASLOV_LIT`, prodje kroz
jedinice i iz svake izvuce prezime uzorkom koji je usidren na POCETAK odlomka i trazi barem tri znaka
prije zareza ili tocke. Jedinica u numeriranom popisu pocinje brojem i tockom, pa uzorak vidi samo
znamenku, odbije ju i ne uhvati nista.

Skup prezimena time ostane prazan iako je popis uredno pronadjen i imao 18 jedinica. Poruka koju
korisnik dobije glasi da popis literature nije nadjen, jer prazan skup i nepostojeci popis prolaze
kroz istu granu. Dvije razlicite dijagnoze pod jednom porukom gore su od nijedne: poruka salje
korisnika da trazi naslov koji vec postoji i uredno je stiliziran kao `Heading1`.

Prava steta je ono sto se pritom PRESKOCI. Provjera razrjesava li se fusnotni citat u popisu
literature jedina je koja tim skupom barata, pa nad numeriranim popisom nikad ne trci. Rad prodje kao
provjeren, a cijela jedna provjera nije bila izvedena, i to uz stanje koje izgleda neutralno.
Popravak ima dva dijela i drugi je vazniji: dopusti neobavezan brojcani prefiks u uzorku za prezime,
i razdvoji dvije poruke, tako da "popis nije nadjen" i "popis nadjen, nijedna jedinica nije
procitana" budu razliciti nalazi. Drugi je ozbiljniji i mora biti vidljiv i kad prvi ne vrijedi.

Izmjereno izravno na 3 dokumenta (effectus--seminar--diplomski--uskladjen.docx, effectus--seminar--diplomski--word.docx, effectus--seminar--diplomski--neuredan.docx).

```
$ python3 scripts/provjeri_fusnote.py effectus--seminar--diplomski--uskladjen.docx --json out.json
   {"fusnota": 12, "prazno": false, "raspon": "2-13",
    "nalazi": [{"pravilo": "popis", "stanje": "neutralno",
                "poruka": "popis literature nije nadjen - razrjesavanje fusnota nije provjereno"}]}

   Trag kroz literatura_prezimena() na tom istom dokumentu:
     NASLOV_LIT.match("Literatura")          -> True   (naslov JE nadjen, stil Heading1)
     jedinica poslije naslova                -> 18
     PREZIME.match("1. <Prezime>, <Ime> ...") -> False  (uzorak vidi "1", trazi 3+ znaka)
     literatura_prezimena(...)               -> 0 prezimena

   (Jedinica je prikazana kao OBLIK, ne doslovno: doslovan redak je tekst iz dokumenta i ne
    prelazi granicu izmedju dvaju proizvoda. Za mehanizam je vazan samo brojcani prefiks.)
```
