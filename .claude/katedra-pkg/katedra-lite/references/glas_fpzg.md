# GLAS FPZG — kako se piše rad na Fakultetu političkih znanosti

> Preseljeno iz skilla `fpzg-skill-pisanje` (v1.9). Ovdje je samo ono što je
> **sadržajno specifično za FPZG**: disciplina, citatni dijalekt, pravni izvori,
> šablone koje se ne pišu i kućni tipografski pragovi. Sve što vrijedi za svaki
> rad — struktura odlomka, struktura rada, radni modovi, self-check, `[TREBA IZVOR]`,
> snapshot i gate — ostaje u `references/pisanje.md` i u željeznim pravilima
> `SKILL.md`; ovdje se na to samo upućuje, ne ponavlja.

## Kad se učitava

* **Mod 2 (pisanje)** i **mod 3 (poboljšanje)**, samo kad je profil rada `fpzg`
  (`stanje.json` → `fakultet.slug`, odnosno `resolved_profile.json` → `slug`).
  `scripts/ucitavanje.py --mod 2|3` to razrješava uvjetom `fakultet:fpzg`; na radu za
  drugi fakultet datoteka se ne otvara.
* Čita se **poslije** `pisanje.md` i `stil_autora.md`: kućni stil fakulteta je jači od
  glasa autora (`stil_autora.md`, pravilo 3), ali glas autora je konkretniji od ove
  reference, pa se sudar rješava izrijekom, ne tiho.
* Ne učitava se u modu 1 (plan nema prozu), 4 (audit ima svoj adapter), 5, 6 ni 7.

Izrada dokumenta po kućnom stilu (font, margine, natpisi, polja) **nije ovdje** — to je
satelit `fpzg-diplomski` (`references/kucni-stil.md`), koji katedra-lite zove u modu 2/6
(`vjestine.py --sposobnost izrada.docx --fakultet fpzg`).

---

## 1. Disciplina i registar

Rad na FPZG-u piše se iz **politologije, međunarodnih odnosa i javnih politika**, s
metodologijom društvenih znanosti kao okvirom. To određuje rječnik i ono što se od
teksta traži:

| Traži se | Što to znači u tekstu |
|---|---|
| precizni pojmovi struke | „politički akteri", „institucionalni okvir", „normativni okvir", „javna politika", „policy ciklus", „veto-igrač" — ne „vlast", „sustav", „stvari" |
| teorija spojena s analizom | teorijski okvir se ne izlaže u jednom bloku pa zaboravi; svaki analitički odlomak imenuje pojam iz okvira kroz koji čita građu |
| iznad definicije | uz svaku definiciju idu implikacije, ograničenja teorije, kritički osvrt ili usporedba s konkurentskim pristupom (v. `pisanje.md` §1.3) |
| „studentsko-akademski" registar | formalno, treće lice, bez kolokvijalizama — ali ne birokratski; rečenica koju bi mentor na FPZG-u prepoznao kao studentovu, ne kao prijevod priručnika |

Zabranjene prazne fraze i prazni šavovi: `pisanje.md` §3. Struktura uvoda, razrade i
zaključka: `pisanje.md` §1.4. Radni modovi (SEMINAR / DIPLOMSKI / BRUTAL PRECISION):
`pisanje.md` §3.1.

## 2. Citatni dijalekt FPZG-a

Oblik dolazi iz profila (`references/fakulteti/fpzg.json` → `citiranje`), ne iz
navike. Provjeren u službenim Uputama i obranjenom radu:

| Element | FPZG | Napomena |
|---|---|---|
| u tekstu | `(Becker, 2007: 9)`, `(Swanson i Mancini, 1996: 9)` | **dvotočka** pred stranicom, bez „str.", godina bez točke |
| dva autora | `(Prezime i Prezime, godina: str)` | veznik „i", ne „&" |
| isti autor, ista godina | `2013a`, `2013b` | sufiks je dio identiteta i u tekstu i u popisu |
| u popisu | `Šiber, Ivan (2003) Politički marketing. Zagreb: Politička kultura.` | puno ime, godina u zagradi, s uvlakom |
| fusnote | **samo objašnjenja, nikad citati** | Upute izrijekom zabranjuju miješanje fusnota i citiranja u tekstu |

Stariji skill `fpzg-skill-pisanje` propisivao je `(Lindblom, 1959, str. 81)`; taj oblik
**nije** FPZG-ov nego opći autor-godina i ne koristi se kad je profil `fpzg`.

Pravila koja vrijede za svaki dijalekt — točan lokator uz specifičnu tvrdnju, citat odmah
uz tvrdnju, bez `(ibid.)` u tekstu, `[PROVJERI STR.]` i `[TREBA IZVOR]` — su u
`pisanje.md` §2 i u željeznim pravilima 2 i 3. Ovdje se ne ponavljaju.

## 3. Pravni izvori i propisi (radovi iz javnih politika)

Rad iz javnih politika redovito citira zakone, strategije i akte EU-a. Pravila koja
mentori na FPZG-u očekuju:

| Ne piši | Piši | Zašto |
|---|---|---|
| „Zakon o porezu na dobit" deset puta u punom obliku | prvi put: puni naziv + NN brojevi + kratica — `(Zakon o porezu na dobit, NN 177/04–151/25, čl. 5.; u nastavku: ZPD)`; dalje samo `(ZPD, čl. 7.)` | ponavljanje pune fraze čini tekst nečitljivim, a kratica bez uvođenja nerazumljivim |
| NN broj „iz sjećanja" | `[PROVJERI NN BR.]` dok se ne potvrdi na zakon.hr / narodne-novine.nn.hr (`intake.md` §0.7b) | propisi se noveliraju svake godine; krivi NN broj zvuči provjerljivo, a nije |
| izvor tablice „ZPD" | puni naziv propisa u retku `Izvor:` | tablica mora biti samorazumljiva bez teksta |
| „(Ministarstvo, s. a.)" | `(Institucija, godina)`; u popisu pod imenom institucije | institucionalni autori (Europska komisija, Porezna uprava, IFAC) su ravnopravne bibliografske jedinice |

Popis literature i citati u tekstu moraju se poklapati 1:1 u oba smjera; to se ne
provjerava čitanjem nego alatom (rad-audit faza B kroz `engine.py`, mod 4).

## 4. Vlastiti izračuni i ilustrativni primjeri

Ilustrativni primjer obračuna (porez, proračun, indeks, koalicijski potencijal) izrazito
podiže rad iz javnih politika. Dva pravila:

* ispod prikaza ide `Izvor: vlastiti izračun prema [propis/izvor]`, ne samo „vlastiti izračun";
* brojka se ne upisuje rukom nego iz jednog izvora, a aritmetika se potvrđuje programski —
  željezno pravilo 13 i `references/izracuni.md`. Jedna kriva brojka ruši kredibilitet
  cijelog rada, i to je u praksi uhvaćeno (v. `replikacija-pspp`: KR-20 0,743 → 0,740).

## 5. Izvori koje FPZG ne prihvaća

Dozvoljeni izvori su u `pisanje.md` §2 (recenzirani članci — HRČAK, JSTOR — knjige,
službeni dokumenti institucija, Eurostat/World Bank/OECD). Ono što se na FPZG-u
**odbija**, a studenti redovito pokušaju:

* Wikipedia — ni kao primarna ni kao sekundarna referenca;
* blogovi i portali bez jasnog autorstva;
* novinski članci kao **primarni akademski izvor** — dopušteni su samo kao empirijska
  ilustracija (npr. analiza medijskog okvira), i tada se tako i imenuju;
* nerecenzirani online materijali (skripte, prezentacije, seminarski radovi drugih).

## 6. Šablone iz prethodnih radova autora

Kad student da stariji rad kao predložak, iz njega se preuzimaju **isključivo formalna
pravila** — naslovnica, izjava o akademskoj čestitosti, font, prored, margine, citatni
stil, redoslijed obveznih dijelova (željezno pravilo 17, `references/primjerci.md`).
Rečenični obrasci nikad. Konstrukcije koje se prepisuju iz rada u rad i koje mentor
prepoznaje na prvi pogled:

| Ne piši | Piši |
|---|---|
| „Predmet ovoga rada čine/jest…" | rečenica koja imenuje pojavu i pitanje bez formule o „predmetu" |
| „Cilj rada je sistematizirati…" | cilj kao tvrdnja o tome što će rad pokazati ili osporiti |
| „Pri izradi rada primijenjeno je nekoliko komplementarnih znanstvenih metoda…" | imenovana metoda, građa i razlog zašto baš ona |
| „Rad je strukturiran u X poglavlja. Nakon uvodnoga poglavlja…" | pregled strukture kao slijed argumenta, ne kao popis |
| „U odgovoru na istraživačko pitanje postavljeno u uvodnom poglavlju može se zaključiti…" | odgovor izravno, prvom rečenicom zaključka |

Za svaki obvezni sadržaj (predmet, cilj, metode, struktura, odgovor na pitanje) svaki put
se gradi drukčija rečenica. Razbija se i **strukturna simetrija**: ako predložak ima
shemu potpoglavlja 3-3-3, barem jedno poglavlje neka odstupa (npr. dodatno potpoglavlje s
ilustrativnim primjerom).

Verifikacija, ne dojam: n-gram usporedba novog rada protiv starog (rad-audit,
`check_overlap.py`, 8-grami; zove se kroz mod 4). Jedino dopušteno preklapanje jest
službeni fakultetski boilerplate (izjava o čestitosti). Preklapa li se ijedan odlomak
proze — prepiši ga.

## 7. Tipografski pragovi kućnog stila

Opći pragovi ritma i kohezije su u `references/stil_pipeline.md` §1 i mjeri ih
`scripts/check_ai_style.py` (interpunkcijski tik kao ponovljena konstrukcija: provjera
zamki proze iz `SKILL.md`). FPZG uz to ima dva **brojčana** praga naslijeđena iz
obranjenih radova:

| Znak | Prag | Što ostaje dopušteno |
|---|---|---|
| dvotočka u prozi | ≤ ~3 na 1.000 riječi (`fpzg-diplomski/provjeri_stil.py` mjeri: 4 na 100 rečenica) | uvod u nabrajanje, uvođenje kratice („u nastavku: ZPD"), definicija iz propisa, završni odgovor na istraživačko pitanje |
| spojna crtica (—) za umetke | ≤ 1–2 u **cijelom** radu | retorički ključno mjesto, npr. klimaks zaključka; umetci inače u zagrade ili zareze |
| en-crtica (–) | bez ograničenja | rasponi: 2019–2024, NN 177/04–151/25, str. 627–650 — to je ispravna hrvatska tipografija, ne tik |

Svaku konstrukciju „rečenica: objašnjenje" prepiši kao dvije rečenice, zavisnu surečenicu
(„jer", „pa", „pri čemu", „u kojem") ili veznik. Nakon pisanja oba znaka **prebroji
programski**, ne odokativno, pa tek onda isporuči. Izvor ispod prikaza piše se običnim
pismom, ne kurzivom (`fpzg-diplomski/references/kucni-stil.md`).

## 8. Dodatak self-checku (uz `pisanje.md` §4)

Za rad s profilom `fpzg` prije nego što potpoglavlje proglasiš napisanim:

- [ ] Citati u obliku `(Prezime, godina: str)` — dvotočka, bez „str.", nijedna specifična tvrdnja bez stranice?
- [ ] Fusnote samo objasnidbene, nijedan citat u fusnoti?
- [ ] Dvotočke ≤ ~3/1.000 riječi, spojne crtice ≤ 2 u cijelom radu — prebrojano programski?
- [ ] Nula šablonskih konstrukcija iz §6 (n-gram provjera ako predložak postoji)?
- [ ] Propisi: prvi citat puni naziv + NN + kratica; NN brojevi potvrđeni ili pod `[PROVJERI NN BR.]`?
- [ ] Nijedan izvor iz §5?
