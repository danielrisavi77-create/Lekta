# ZAŠTO — stvarni kvarovi iza željeznih pravila

> Router (`SKILL.md`) se učitava u **svakoj poruci**; obrazloženja se čitaju **jednom**.
> Zato ovdje stoji ono što je do v1.3 bilo utkano u sama pravila: rad, brojka i kvar koji
> su svako od njih iznudili.
>
> Ovo nije povijest izmjena — to je `docs/PROMJENE.md`. Ovdje je odgovor na pitanje koje
> se postavlja kad se pravilo čini pretjerano: **što se dogodilo kad ga nije bilo.**

---

## Pravilo 11 — forma nije argument

Rad koji prođe sve formalne provjere, a nema tezu koja se provlači kroz poglavlja, i dalje
ne nosi peticu. Zato `check_argument.py` ide uz svaki veći audit.

Ograda koja je nastala poslije (B09): validator **ne pretpostavlja empirijski dizajn**.
Metodologiju uzima iz `--metodologija` ili iz resolved profila, a bez konteksta koristi
neutralni `generic` policy. „Deskriptivnost" je od tada soft signal, najviše ⚠️, a ne
presuda samo zato što u tekstu nema uzročnih markera — teorijski i pravni radovi ih po
naravi nemaju, pa je alat prije te ograde vikao na uredne radove.

---

## Pravilo 12 — review je read-only

`consistency_check.py` i `reviewer_simulation.py` samo proizvode nalaze. Faza G traži
eksplicitni `--allow-mutation` i aktualni snapshot/hash.

Razlog je asimetrija štete: pogrešan nalaz košta jedno čitanje, pogrešna izmjena dokumenta
košta rad. Dijagnostika zato kreće bez čekanja, a mutacija ne kreće bez odobrenja.

---

## Pravilo 13 — jedna brojka, jedno mjesto

U sesiji u kojoj je pravilo nastalo, **dvije vrijednosti u tablici bile su matematički
pogrešne**, a rad je do tada prošao vizualnu provjeru — više puta, i od čovjeka i od alata.
Našlo ih je jedino neovisno prepisivanje izračuna.

Otuda tri dijela pravila:

- `model.py` je jedini izvor izvedenih brojki; tekst ih čita kroz `{{model.kljuc}}`;
- udio i zbroj računaju se iz **prikazanih** (zaokruženih) vrijednosti, da se stupac dade
  provjeriti sabiranjem — inače kolona koja je „točna" ne zbraja se u prikazani zbroj;
- prije svake izmjene modela tekući `model.json` kopira se u `model.prije.json`. **Bez
  prethodne verzije nema crne liste zastarjelih vrijednosti**: brojka koja je promijenjena
  u modelu, a ostala negdje u prozi, prolazi nezapaženo. To je najskuplja tiha greška u
  modu 6.

---

## Pravilo 14 — odgovor na zadatak, ne samo kućni stil

Uputa nositelja predmeta tražila je tri komponente. Rad ih je imao dvije, prošao je svaku
formalnu provjeru i pao na sadržaju.

Mehanizam kvara je vremenski: između moda 1 i moda 6 prođu tjedni, uputa se zaboravi, a
nijedan alat je nije čitao. Zato se `.katedra/zadatak.json` piše **dok je uputa pred
očima**, a provjerava se prisutnost igala u dokumentu — ne kvaliteta odgovora.

Isti zapis je i mjesto gdje **nedosljednost same upute** ostaje vidljiva: u toj je sesiji
subjekt e-maila iz upute navodio drugi predmet. Takvo se ne izglađuje u tišini nego iznosi
korisniku.

---

## Pravilo 15 — rad se prati i nakon isporuke

Na eseju iz kolovoza 2026. autorica je nakon isporuke napravila **pet ručnih zahvata u
Wordu**. Nastale su tri tipografske regresije i jedna netočna referenca stranice.

Cijeli je lanac nad tom datotekom proizveo **jednu jedinu poruku, i ta je bila lažna**:
`provjeri_predaju.py` blokirao je predaju zbog zastavice `updateFields`, koju je Word
potrošio jer je polja upravo bio uredno osvježio.

Razlog je strukturan i vrijedi za sve provjere u paketu: **one gledaju dokument sam za
sebe.** Kad su brojevi stranica međusobno dosljedni, a tipografija ujednačena unutar
rečenice, nema se što prijaviti. Regresija se vidi samo u odnosu na verziju koja je izišla
ispravna — pa svaka isporuka ide u `.katedra/isporuke/`, i postoji mod 7.

---

## Pravilo 16 — glas autora se pamti, ne pogađa

Od tih pet izmjena, tri su bile regresije, jedna je obrisala redak koji je Katedra sama
izmislila („Kolegij:" na naslovnici, kojega nema ni u profilu ni u uzorku), a jedna je
uklonila ogradu („doduše").

Bez `stil_autora.json` sljedeći bi rad izišao s istim „doduše", istom apozicijom među en
crticama i istim izmišljenim retkom — pa bi ih autorica opet brisala, i **opet bi pritom
pokvarila nešto drugo**. Tri od pet ručnih zahvata bile su tipografske regresije, i
nijednu autorica ne bi napravila da joj rečenica nije smetala.

Otuda i načelo iza tablice u `pisanje.md` §3.0: **konstrukcija koju autor mora popraviti
prilika je da nešto pokvari.**

---

## Pravilo 17 — uzorak mentora jači je od profila

Naslijeđena procjena bez izvora davala je ❌ za pravilo kojega u službenim Uputama nema.
Student je pritom imao rad koji mu je mentor dao kao mjerilo oblika — dokaz jači od svake
procjene, a alat ga nije mogao primiti.

Zato profil nosi **popis stvarnih primjeraka** s izvorom i datumom, ne jednu vrijednost po
svojstvu. Kad se dvije opservacije razilaze, obje ostaju zapisane, a gate javlja „odstupa
od primjerka X" — što je istina — umjesto „krši pravilo", što nije.

---

## Pravilo 18 — nepotvrđeno je žuto, ne crveno

Isti korijen kao 17. Raspon opsega sa statusom `nepotvrdeno` davao je ❌ na radu koji je
poštovao ono što je korisnik zadao.

Načelo je šire od jednog polja i vrijedi za svaki alat u paketu: **lažni nalaz je kvar
jednake težine kao promašeni nalaz.** Alat koji viče na uredan rad uči korisnika da
ignorira crvenu boju, pa promašeni nalaz poslije prođe neopaženo. Crveno je zato rezervirano
za ono što stvarno stoji u službenim Uputama.

---

## Pravilo 19 — pokrivenost se broji, ne pretpostavlja

Do v1.3 Katedra je bila organizirana isključivo po **vremenu** (sedam modova). Pokrivenost
dijelova rada postojala je samo kao nuspojava toga koji je mod odabran, pa nijedna datoteka
nije mogla odgovoriti na pitanje *„koji dio rada nitko ne provjerava"*.

Tri mjerljive posljedice, sve nađene pri uvođenju osi dijelova:

1. **Engleski sažetak nije dodirivao nijedan alat.** `provjeri_sazetak.py` radi nad
   hrvatskim, `check_rules.py` gleda samo postoji li naslov. Dio koji nakon predaje ostaje
   javan u repozitoriju bio je jedini potpuno neprovjeren.
2. **Rasprava se nije spominjala nijednom riječi** ni u jednoj referenci, iako je to
   poglavlje koje razlikuje četvorku od petice.
3. **Tri fakulteta isti dio zovu trima imenima** („izjava o akademskoj čestitosti",
   „izjava o autorstvu"; „naslovnica (hrvatska)", „naslovnica (vanjska)"), a dijelovi kojih
   u profilu nema — prilozi, izjava o korištenju AI alata, unos u repozitorij — nisu
   postojali nigdje.

Strukturna posljedica bila je najgora: **širenje pokrivenosti značilo je pisanje proze.**
Svaki novi uvid postajao je novi odlomak u referenci moda, pa je broj željeznih pravila u
routeru rastao s 12 na 18 akrecijom. Registar to zaustavlja — novi dio je jedan zapis u
`references/dijelovi.json`, isti obrazac kojim je pravilo 10 već učinjeno strojno
provjerljivim kroz `references/vjestine.json`.

Razina `nepokriveno` nije priznanje poraza nego **prva istinita brojka o dosegu paketa**.
Prije nje se nije mogla izgovoriti.

---

## Pravilo 20 — alat koji je pukao nije provjera koja je prošla

`references/predaja.md` je tražio da agent zapamti desetak naredbi, u točnom redoslijedu,
sa svojim zastavicama. **Preskočena naredba nije proizvodila nikakvu poruku.**

To je jedini kvar u paketu koji se ne vidi ni na jednom izlaznom kodu: provjera koja se nije
pokrenula izgleda identično kao provjera koja je prošla. Uz to, skripte koriste izlazni kod
1 za nalaz i 2 za odbijen ulaz — pa je `check_rules.py` nad `.md` datotekom („očekuje se
.docx") u ručnom prolazu lako izgledao kao običan nalaz umjesto kao provjera koja se nije
dogodila.

`gate.py` zato razlikuje četiri stanja i sva četiri izgovara:

| stanje | znači |
|---|---|
| `ok` | provjera je prošla |
| `nalaz` | provjera je našla problem (izlazni kod 1) |
| `preskočeno` | ulaz ne postoji ili satelit nije instaliran — **razlog se ispisuje** |
| `alat pukao` | izlazni kod ≥ 2: provjera se srušila ili je odbila ulaz |

Zadnja dva su ograničenja projekta i upisuju se u stanje, jednako kao exit 3/4 kod motora
(pravilo 8). Ono što se ne smije dogoditi jest da faza izgleda čista zato što polovica
provjera nije ni pokušala.

---

## Pravilo 21 — ciljana ocjena se mjeri, ne obećava

Sekcija 0 plana od početka traži „ciljanu ocjenu" i „3–5 razloga zašto trenutno stanje ne
nosi ciljanu ocjenu". Ta se lista pisala **iz dojma**, jer ništa u paketu nije znalo prema
čemu se ocjena mjeri.

Posljedica je bila tiha i sustavna: `gate.py` prođe, `check_rules.py` nema kršenja, os
dijelova zelena — i student čuje „rad je spreman". To znači samo da je prošao ono što se
dade izmjeriti mehanički. Rad bez teze prolazi svaku formalnu provjeru u paketu (pravilo
11 to kaže od početka, ali nijedan alat nije zbrajao posljedicu).

`rubrika.py` zato **ne uvodi nijednu novu prosudbu**. Svaki kriterij čita artefakt koji već
postoji: teza iz `arg.json`, forma iz `pravila.json`, dijelovi iz `dijelovi.json`, zamjerke
iz `zamjerke.json`. Kad bi rubrika sama ocjenjivala, ista bi vrijednost postojala na dva
mjesta — pravilo 13 primijenjeno na prosudbu umjesto na brojku.

Tri odluke koje su u njoj namjerne:

**Pojas, ne broj.** „Ocjena 4,2" je lažna preciznost. Pojas je gornja granica koju rad u
ovom stanju može doseći, uz imenovan popis onoga što ju drži — a to je jedino što se dade
obraniti pred studentom koji pita „zašto".

**Jedan pali ključni kriterij obara sve.** Nema zbrajanja bodova preko praga: nema teze,
nema petice, ma koliko uredna bila forma. Tako ocjenjuje i mentor, i zato forma nosi težinu
2 dok teza i doprinos nose 5. Forma je uvjet, ne vrlina.

**Artefakt kojega nema je `nepoznato`, nikad `ispunjeno`.** Kad `nepoznato` padne na ključni
kriterij, pojas se **ne procjenjuje uopće**. Alat koji bi u toj situaciji rekao „pojas 4"
naučio bi studenta da mu vjeruje kad za to nema razloga — isti kvar kao lažni nalaz iz
pravila 18, i isti princip po kojem `gate.py` razlikuje „alat pukao" od „provjera prošla".

Ono što rubrika **ne** vidi popisano je u `references/rubrika.md` i izgovara se uz svaki
nalaz: je li teza zanimljiva, je li literatura relevantna (a ne samo postojeća), zna li
mentor o temi više, i je li rasprava rasprava. Rad koji dosegne pojas 5 nije rad koji će
dobiti pet — to je rad kojemu se na temelju postojećih artefakata ne može prigovoriti ništa
od onoga što se dade izmjeriti.

---

## Pravilo 22 — razina se zadaje, ne pogađa

Do v1.4 Katedra je skalirala rad po **tipu**: opseg, broj poglavlja, `izvori_min`, plus tri
radna moda. Nijedno polje nije nosilo ono što zapravo odlučuje kako rečenica izgleda —
**koliko čitatelj već zna**.

Posljedica nije bila teorijska. Isti pojam za studenta prve godine traži definiciju, izvor
i primjer; za povjerenstvo koje tim pojmom radi dvadeset godina ista je definicija gubitak
prostora i signal da autor ne zna kome piše. Rad za kolegij prve godine i rad za diplomsku
komisiju izlazili su s istom razradom pojma — jedan preplitko, drugi snishodljivo, i to ne
zbog neznanja nego zato što nitko nije bio pitan.

**Načelo koje se pri ovome najlakše izokrene:** niža razina ne znači lošiji rad. Znači rad
koji više objašnjava i manje tvrdi. Registar zato nigdje ne dira zahtjeve na točnost,
izvore ni argument — željezna pravila 2, 3 i 4 vrijede na svakoj razini jednako. Alat koji
bi na nižoj razini dopustio manje izvora ne bi bio prilagođen nego pokvaren.

Razina se **deklarira**, istim načelom kojim se deklarira citatni stil (§ 0.8): rad koji
mnogo objašnjava može biti prvi semestar ili loš diplomski, a alat tu razliku ne vidi.

## Zašto provjera literature i prikaza tek sada

Dvije rupe iste vrste — profil je znao pravilo, a nitko ga nije primijenio na dokument.

**Popis literature.** Profil nosi `popis_primjer`, `uvlaka_u_popisu`,
`razmak_izmedu_jedinica` i `tocka_iza_godine`. Provjeravala su se točno dva pravila, i oba
u tekstu. Oblik same jedinice — puno ime naspram inicijala, završna točka, uvlaka, abecedni
red po hrvatskoj kolaciji — nije provjeravao nitko, iako je to prvo što mentor vidi kad
otvori zadnju stranicu.

**Prikazi.** Provjeravala se struktura (natpis, izvor, spomen u tekstu, lomljenje), nikad
sama slika. Grafikon izvezen na 6,1 in i umetnut na 12 cm ima **svako pismo u sebi manje za
23 %**: oznake osi od 9 pt izlaze kao 7 pt. `rad-docx/references/prikazi.md` to pravilo
opisuje od početka — i nijedan alat ga nije mjerio.

Obje provjere dijele nalaze na tri skupine: u skladu, odstupa, **nije provjereno**. Treća
se ispisuje, jer je popis literature najšarolikiji dio rada (propisi, mrežni izvori,
institucijski autori) i tiho preskakanje bi dalo lažno zeleno. Pri pisanju prve verzije
upravo se to i dogodilo: jedan uzorak s globalnim `(?i)` progutao je cijeli popis, svaka je
jedinica ispala „propis ili institucija", i izvještaj je izgledao uredno. Nalaz nije bio u
radu nego u alatu — pravilo 3 skilla `katedra`, doslovno.

---

## Pravilo 25 — štivo se izračuna, ne pamti

Nakon šest verzija paket je narastao na 46 referenci i 24 pravila. Router (`SKILL.md`) se
učitava u **svakoj poruci**, a nosio je i ono što vrijedi samo za jedan mod: popis datoteka
po modovima (§ 0.4) i tijek svakog pojedinog moda (§ 2). Mjereno: 25 085 B, od čega je
5 901 B bilo sadržaj koji pripada referencama modova.

Popravak ima dva dijela i oba su nužna, jer zahtjevi vuku na suprotne strane.

**Manje.** Sadržaj pojedinog moda preseljen je u referencu tog moda — ondje stiže u istom
trenutku, ali samo kad se taj mod stvarno koristi. Router je pao na 19 184 B (−24 %), a to
je ušteda **u svakoj poruci**, ne jednom.

**Ne manje nego što treba.** Fiksan popis po modu ne rješava ništa: ili je prekratak pa se
nešto preskoči, ili predug pa se učitava `metodologija.md` na radu koji nema istraživanje.
Zato je popis **izveden iz stanja projekta** (`references/ucitavanje.json` +
`scripts/ucitavanje.py`): uvjeti se evaluiraju protiv `.katedra/`, pa je popis točan za ovaj
rad, danas.

Dvije odluke unutar toga su namjerne i vrijede više od samog alata:

1. **Uvjet koji se ne razumije NE izbacuje referencu.** Nepoznat uvjet vraća „učitava se za
   svaki slučaj”. Preskočeno štivo skuplje je od suvišnog, i to je ista asimetrija na kojoj
   stoji pravilo 20: propuštena provjera izgleda kao provjera koja je prošla.
2. **Alat ne tvrdi da je išta pročitano.** Nijedan alat to ne može provjeriti. Vrijednost
   nije u prisili nego u tome što je popis izračunat, imenovan i obrazložen — pa se ne
   pamti. Isti odnos kao `gate.py` prema provjerama: ne jamči da je posao dobro obavljen,
   nego da se ne zaboravi koji je posao.

Popis „nikad tijekom rada” postoji iz istog razloga iz kojeg postoji razina `nepokriveno` u
osi dijelova: granica koja se izgovori prestaje biti rizik. `mapa.md`, `zasto.md`,
`razvoj.md`, `stanje_schema.md` i JSON registri zajedno su preko 55 KB koje agent pri radu
na radu nema razloga otvoriti — registre čitaju skripte.

---

## Pravila 26 i 27 — jezik i šum

**26.** Cijeli je lanac tiho pretpostavljao hrvatski, a nijedan profil nije imao polje
`jezik`. Na radu pisanom na engleskom to nije davalo poruku „ne mogu” nego **izvještaj
lažnih nalaza**: svaka rečenica pravopisna pogreška, nijedna kohezijska veza prepoznata,
popis literature presložen po hrvatskoj abecedi.

Razlika prema običnoj rupi je bitna. Rupa šuti; ovo je govorilo, i govorilo krivo — a to je
gore, jer se ne vidi kao izostanak nego kao nalaz. Otuda i oblik popravka: alat koji jezik ne
podržava vraća **izlazni kod 0 uz deklarirano ograničenje**, ne kod 1 uz nalaze.
Nepokrivenost nije nalaz, isto načelo po kojem izostanak satelita nije kršenje.

**27.** Nakon sedam verzija: 27 pravila, 27 dijelova, 13 kriterija, 17 koraka u gateu. Veći
rizik više nije provjera koja fali nego **izvještaj koji se prestane čitati**. Ako se na
stvarnom radu preskoči pola nalaza, svaka sljedeća dodana provjera čini štetu, ne korist.

To se ne dade procijeniti iz koda. `nalazi_trag.py` zato bilježi svaki prolaz gatea i
uspoređuje ih kroz krugove: nalaz koji nestane bio je koristan, nalaz koji tri kruga stoji
netaknut nije nalaz nego šum — kriv, nerazumljiv ili nevažan.

Dvije ograde koje pravilo čuvaju od zloupotrebe:

* **Alat ne zna ZAŠTO je nalaz preskočen.** Može značiti „nerazumljiv” i „nevažan”, ali i
  „težak, radim na njemu”. Mjeri se učestalost, razlog dolazi iz razgovora.
* **Šum se prvo spušta u savjetodavno, tek onda miče.** Brisanje provjere na temelju triju
  krugova na jednom radu je isti prenagli zaključak kao i dodavanje provjere na temelju
  jedne sesije.

Ovo je prvo pravilo u paketu koje postoji da bi paket **rastao sporije**, a ne brže.
