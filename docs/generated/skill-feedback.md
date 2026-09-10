<!-- npm run skill-feedback -- --write | 2026-09-10T07:29:39.342Z | 8c9f9fdbed17b7d2dd371eb1e56bf557e90133ab -->
<!-- Fragment za <katedra-lite>/references/zamke.md. Provjera na drugoj strani: -->
<!-- python3 <katedra>/scripts/kvar.py <ovaj-fragment>.md --provjeri --nastavak-od 159 -->

nadovezuje se na unos 159

## 160. Pokrivenost izvora mjeri se samo autor-godinom, pa rad koji citira drukcije nema nijedan citat

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

Izmjereno izravno na 3 dokumenta (fzsri--final--prijediplomski--uskladjen.docx, fzsri--final--prijediplomski--word.docx, effectus--seminar--diplomski--uskladjen.docx).

```
$ python3 scripts/verify_sources.py fzsri--final--prijediplomski--uskladjen.docx --pokrivenost --offline

POKRIVENOST (heuristika: sklonidba prezimena, viseclana prezimena i "i sur." mogu dati lazne
             nalaze - svaki redak provjeri okom)
  ⚠️  na popisu, a nigdje citirano (20):        <- SVE jedinice popisa, rad ih ima 20
      ...

   Ono sto se u ispisu NE vidi, a stoji u `--json` i odmah imenuje uzrok:
     fzsri     citata_razlicitih: 0 | necitiranih: 20 | bez_izvora: 0   (numericki, Vancouver)
     effectus  citata_razlicitih: 0 | necitiranih: 18 | bez_izvora: 0   (Chicago, 12 fusnota)

   Zaglavlje upozorava na sklonidbu, sto ovdje nije uzrok; ni jedna rijec ne kaze da stil
   citiranja uopce nije prepoznat, a `pokrivenost` cita samo `tijelo_rada(put)`.
```

## 161. Sklonidba je deklarirana kao moguc lazan nalaz, a isti redak svejedno nosi crveni krizic

Zaglavlje odjeljka POKRIVENOST samo kaze da sklonidba prezimena moze dati lazne nalaze i trazi da
se svaki redak provjeri okom. To je posteno i tocno. Problem je sto isti alat taj redak zatim
oznaci s `❌`, dakle najjacom ozbiljnoscu koju ima, dok susjedni odjeljak nosi `⚠️`.

Upozorenje i oznaka si proturjece. `❌` znaci "ovo je krivo", a zaglavlje istovremeno kaze "ovo
mozda nije krivo, provjeri okom". Citatelj koji vjeruje oznaci mijenja ispravan tekst; citatelj
koji vjeruje zaglavlju prelazi preko svih `❌` redaka, pa ce jednom prijeci i preko istinitog.
Deklarirana nesigurnost pripada oznaci, ne samo zaglavlju.

Mehanizam: kljuc citata svodi se na prezime prvog autora i godinu, ali nad DOSLOVNIM nizom iz teksta.
Hrvatski taj niz sklanja, pa "Prema Galtungu i Rugeu (1965)" daje `galtungu 1965`, a jedinica
"Galtung, J. i Ruge, M. H. (1965)" daje `galtung 1965`. Jedan ispravan citat zato izlazi na OBA
popisa odjednom, kao citat bez izvora i kao necitirana jedinica, sto se cita kao dva razlicita
problema.

Lekta je isti kvar imala i popravila ga svodjenjem na korijen prije usporedbe; palih citatnih i
literaturnih provjera preko istih 11 dokumenata bilo je 7, poslije 2, a preostala dva su istiniti
nalazi iz namjerno pokvarenog primjerka. Recept je prenosiv i kratak: skini padezni nastavak s popisa
`ovima, evima, ima, ova, eva, om, em, ju, a, e, i, u`, odbaci korijen kraci od cetiri znaka i uz
svaki korijen ponudi i oblik s dodanim `a` zbog zenske sklonidbe, jer "Bandure" treba dati
"bandura". Granica od cetiri znaka nije ukras: bez nje "Mara" postane "mar" i pocne se lazno vezati
uz svaku jedinicu koja pocinje tim slovima, a lazan pozitiv je gori od laznog negativa jer tiho
tvrdi podudaranje kojega nema. Popravak ide u `kljuc_prvog_autora` i `kljuc_izvora`, na obje strane
usporedbe, inace se raskorak samo preseli. Kad svodjenje radi, upozorenje u zaglavlju vise nije
potrebno na ovoj osi, pa se i ono smije suziti.

Izmjereno na 5 dokumenata (fpzg--final--prijediplomski--neuredan.docx, fpzg--final--prijediplomski--uskladjen.docx, fpzg--final--prijediplomski--word.docx, fpzg--project--diplomski--neuredan.docx, fpzg--project--diplomski--uskladjen.docx); najveci broj nalaza na jednom dokumentu je 2.

```
$ python3 scripts/verify_sources.py fpzg--final--prijediplomski--uskladjen.docx --pokrivenost --offline

POKRIVENOST (heuristika: sklonidba prezimena, viseclana prezimena i "i sur." mogu dati lazne
             nalaze - svaki redak provjeri okom)
  ⚠️  na popisu, a nigdje citirano (1):
      Galtung i Ruge 1965
  ❌ citirano u tekstu, a nema ga na popisu (2):
      (Galtungu, 1965.)
      (Wallacea, 2018.)

   Zaglavlje kaze "mozda lazno", redak kaze ❌. Ista jedinica stoji na oba popisa, jednom u
   nominativu i jednom u dativu odnosno genitivu. Tijelo rada pise ispravan hrvatski, literatura
   ispravan APA; nijedna strana nije pogrijesila.
```

## 162. Provjera koja nije izvedena ispisuje se kao "0 krsenja", uz razlog koji nije tocan

Na radu s 12 fusnota i urednim popisom literature alat ispise "0 krsenja". Iznad toga stoji redak
"popis literature nije nadjen, razrjesavanje fusnota nije provjereno", oznacen neutralno. Dvije
tvrdnje zajedno kazu suprotno od onoga sto se dogodilo: provjera NIJE izvedena, a ispis je cist.

Razlog naveden u poruci k tome nije tocan. Popis JEST nadjen: naslov "Literatura" prolazi
`H.NASLOV_LIT`, stiliziran je kao `Heading1`, i iza njega slijedi 18 jedinica. Prazan je ispao skup
PREZIMENA, jer ih `literatura_prezimena` vadi uzorkom usidrenim na pocetak odlomka koji trazi barem
tri znaka prije zareza ili tocke. Jedinica u numeriranom popisu pocinje brojem i tockom, pa uzorak
vidi samo znamenku i ne uhvati nista. Prazan skup i nepostojeci popis prolaze kroz istu granu, pa se
dvije razlicite dijagnoze ispisuju istom recenicom.

Steta je dvostruka. Poruka salje korisnika da trazi naslov koji vec postoji, a "0 krsenja" ga uvjeri
da je na tom mjestu cisto. Provjera razrjesava li se fusnotni citat u popisu literature jedina je
koja tim skupom barata, pa nad numeriranim popisom nikad ne trci; rad prodje kao provjeren, a nije.

Popravak ima tri dijela i treci je najvazniji: dopusti neobavezan brojcani prefiks u uzorku za
prezime; razdvoji poruke, tako da "popis ne postoji" i "popis postoji, nijedna jedinica nije
procitana" budu razliciti nalazi; i NE ispisuj "0 krsenja" kad je ijedna provjera preskocena, nego
reci koliko ih je izvedeno od koliko. Ograda koja bi kvar bila uhvatila je upravo ta zadnja: brojac
krsenja koji ne razlikuje "nista nije naslo" od "nista nije trazilo".

Izmjereno izravno na 3 dokumenta (effectus--seminar--diplomski--uskladjen.docx, effectus--seminar--diplomski--word.docx, effectus--seminar--diplomski--neuredan.docx).

```
$ python3 scripts/provjeri_fusnote.py effectus--seminar--diplomski--uskladjen.docx

FUSNOTE - disciplina navodjenja
  12 fusnota (2-13)

➖ popis literature nije nadjen - razrjesavanje fusnota nije provjereno

0 krsenja                                  <- cist ispis, a provjera nije izvedena

   Trag kroz literatura_prezimena() na tom istom dokumentu:
     NASLOV_LIT.match("Literatura")           -> True   (popis JE nadjen, stil Heading1)
     jedinica poslije naslova                 -> 18
     PREZIME.match("1. <Prezime>, <Ime> ...") -> False  (uzorak vidi "1", trazi 3+ znaka)
     literatura_prezimena(...)                -> 0 prezimena

   (Jedinica je prikazana kao OBLIK, ne doslovno: doslovan redak je tekst iz dokumenta i ne
    prelazi granicu izmedju dvaju proizvoda. Za mehanizam je vazan samo brojcani prefiks.)
```
