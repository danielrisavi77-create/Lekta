# METODOLOGIJA — poglavlje koje komisija prvo napadne

> Učitaj kad rad ima vlastito istraživanje. Do v1.3 Katedra je imala *policy za validator*
> (`scripts/argument_methodology.py`) i nijednu uputu **kako se poglavlje piše**.
> Teorijski rad nema metodologiju u ovom smislu — ima odjeljak o pristupu i građi (§7).

Metodologija je jedino poglavlje koje se ne može popraviti nakon što su podaci prikupljeni.
Sve ostalo se prepisuje; uzorak koji je krivo odabran ostaje krivo odabran. Zato se piše
**u modu 1, kao dio plana**, a ne u modu 2 kad se dođe do njega po redu.

---

## 1. Osam odjeljaka — svi obavezni

Redoslijed nije stvar ukusa: svaki odjeljak odgovara na pitanje koje otvara prethodni.

| # | Odjeljak | Odgovara na |
|---|---|---|
| 1 | Istraživačko pitanje i očekivanja | što se pita, i što se očekuje da će se naći |
| 2 | Istraživački dizajn | kojom se vrstom istraživanja na to može odgovoriti — **i zašto ne drugom** |
| 3 | Uzorak ili građa | tko/što je promatran, koliko ih je, kako su odabrani |
| 4 | Instrument | čime je mjereno, tko ga je izradio, gdje stoji u prilozima |
| 5 | Operacionalizacija | kako je pojam pretvoren u nešto što se da izmjeriti |
| 6 | Postupak | kad, gdje i kako je prikupljanje teklo |
| 7 | Etika i zaštita podataka | suglasnost, anonimizacija, gdje podaci stoje |
| 8 | Ograničenja metode | što ovaj dizajn **ne može** pokazati |

Poglavlje koje preskoči 5 ili 8 je najčešći oblik metodologije koja izgleda potpuno dok je
ne pročita netko tko poznaje temu.

---

## 2. Dizajn: obrazloži izbor, ne opiši metodu

Najčešća pogreška je udžbenički odlomak o tome što je anketa. Komisija zna što je anketa.

| Ne piši | Piši |
|---|---|
| „Anketa je metoda prikupljanja podataka kojom se…" | „Anketa je odabrana jer pitanje traži raspodjelu stavova u populaciji koju nije moguće promatrati izravno; intervju bi dao dubinu, ali ne i usporedivost među skupinama." |
| „Korištena je kvalitativna metodologija." | „Dizajn je kvalitativan jer je predmet proces odlučivanja, a ne njegov ishod: ishod se dade prebrojati, put do njega ne." |

Pravilo: **izbor dizajna piše se kao odbacivanje alternative.** Ako se ne može napisati što
je odbačeno i zašto, dizajn nije izabran nego naslijeđen.

Tip metodologije upiši i strojno, da ga validator argumenta zna:

```bash
python3 <KATEDRA_SKILL>/scripts/check_argument.py ./rad.docx \
    --profil ./.katedra/resolved_profile.json \
    --metodologija quantitative|qualitative|mixed_methods|case_study|doctrinal_legal|theoretical|historical|review|systematic_review
```

Bez toga validator koristi neutralni `generic` policy i **ne pretpostavlja empirijski
dizajn** (B09). „Deskriptivnost" je tada najviše ⚠️, nikad presuda.

---

## 3. Uzorak: tri broja i jedno priznanje

Svaki uzorak nosi četiri stvari, i sve četiri stoje u tekstu, ne u prilogu:

1. **Koliko ih je** — poslanih, vraćenih, upotrebljivih. Tri broja, ne jedan.
2. **Kako su odabrani** — slučajno, prigodno, namjerno, snowball. Prigodni uzorak je
   legitiman; prigodni uzorak predstavljen kao slučajan nije.
3. **Tko je ispao i zašto** — nepotpuni odgovori, odbijanja, kriteriji isključenja.
4. **Na koga se nalazi smiju poopćiti** — i, izrijekom, na koga ne smiju.

> Uzorak od 87 studenata jednog fakulteta je uzorak od 87 studenata jednog fakulteta. Ako
> u zaključku piše „studenti u Hrvatskoj", to nije stilska nepreciznost nego pogreška
> zaključivanja i tako se i brani na obrani — loše.

---

## 4. Instrument: napravljen, posuđen ili prilagođen

Reci koje je od tri, i za svako drugo:

| Slučaj | Što mora stajati |
|---|---|
| **posuđen** | izvorni autor, godina, gdje je objavljen, je li validiran |
| **prilagođen** | isto + **što je promijenjeno i zašto**; prilagodba poništava tuđu validaciju |
| **vlastiti** | kako je nastao, je li testiran na nekome prije primjene |

Instrument u cijelosti ide u **priloge** (v. `references/dijelovi.json`, dio `prilozi`).
Empirijski rad bez priloženog instrumenta nije replikabilan — to je nalaz, ne kozmetika.

---

## 5. Operacionalizacija: pojam → varijabla → mjera

Ovo je odjeljak koji najčešće fali, a koji odvaja rad koji mjeri od rada koji priča.
Piše se kao tablica, i to je jedina tablica u radu za koju se lista dopušta:

| Pojam | Kako je definiran | Kako je mjeren | Vrijednosti |
|---|---|---|---|
| institucionalno povjerenje | Rothstein (2011), str. 43 | tri čestice, Likert | 1–5, prosjek |
| energetska ovisnost | udio uvoza u bruto potrošnji | Eurostat `nrg_bal_c` | % |

Test: **može li netko drugi s ovom tablicom ponoviti mjerenje?** Ako ne može, tablica
nije operacionalizacija nego popis pojmova.

---

## 6. Etika i zaštita podataka

Kratko, ali obavezno — i za studentska istraživanja.

- [ ] sudionici su **prije** sudjelovanja znali svrhu, tko istražuje i što biva s podacima
- [ ] suglasnost je pribavljena; obrazac ide u priloge
- [ ] odgovori su anonimni ili pseudonimizirani, i **rečeno je koje od toga**
- [ ] podaci se ne objavljuju u obliku iz kojeg se pojedinac dade prepoznati (mala skupina
      + tri demografske varijable prepoznaje osobu i kad nema imena)
- [ ] ako je istraživanje trebalo odobrenje etičkog povjerenstva — navedi ga s brojem
- [ ] osjetljive kategorije (zdravlje, politički stav, vjera) traže izričitu privolu i
      obrazloženje zašto su uopće prikupljene

Anonimno i povjerljivo nisu isto. Anonimno znači da ni istraživač ne zna tko je odgovorio.
Ako postoji šifra koja vodi natrag do osobe, istraživanje je **povjerljivo**, ne anonimno,
i tako se piše.

---

## 7. Teorijski rad: umjesto metodologije, odjeljak o pristupu i građi

Teorijski, pravni i povijesni radovi nemaju uzorak, ali imaju isto pitanje: **zašto ova
građa, a ne druga.** Tri stavke:

1. **Korpus** — koji su izvori uzeti, u kojem razdoblju, po kojem kriteriju.
2. **Postupak čitanja** — komparativno, kronološki, po pojmu, doktrinarno.
3. **Granice korpusa** — što je izostavljeno i kako to mijenja doseg zaključka.

Rad koji ovo preskoči izgleda kao da je literatura odabrana po dostupnosti — što je često i
istina, ali se onda tako i piše, u ograničenjima.

---

## 8. Ograničenja: napiši ih prije nego ih komisija nađe

Priznata granica je jača od obranjene slabosti. Komisija koja ograničenje nađe sama pita
drukčijim tonom nego komisija kojoj si ga rekao.

Za svako ograničenje dvije rečenice: **što je granica** i **kako je ublažena ili zašto
nije mogla biti**. Tipična, po redu učestalosti:

- prigodni uzorak → nalaz opisuje skupinu, ne populaciju
- samoiskaz → mjeri se izjavljeno ponašanje, ne ponašanje
- jedan trenutak mjerenja → nema uzročnosti, samo povezanost
- promjena definicije pokazatelja kroz razdoblje → serija nije usporediva bez ograde
- podatak iz jednog izvora → nalaz stoji dok ga netko ne opovrgne drugim

Ista lista je materijal za mod 5 (`references/obrana.md` §4) — piši ju tako da se može
prekopirati u `slabe_tocke.md` bez ijedne izmjene.

---

## 9. Prije nego poglavlje proglasiš gotovim

- [ ] svih osam odjeljaka postoji, i nijedan nije jedna rečenica
- [ ] dizajn je obrazložen odbacivanjem alternative, ne opisan iz udžbenika
- [ ] uzorak nosi tri broja i granicu poopćavanja
- [ ] instrument je u prilozima i spomenut u tekstu
- [ ] operacionalizacijska tablica omogućuje ponavljanje mjerenja
- [ ] etički odjeljak razlikuje anonimno od povjerljivog
- [ ] ograničenja su napisana kao par „granica + što s njom"
- [ ] `--metodologija` je predana `check_argument.py` i upisana u profil ili stanje
- [ ] `dijelovi.py --set metodologija=napravljeno`

Zatim, prije nego se na tim podacima išta tvrdi, brojke prolaze replikaciju
(`references/vjestine.md`, sposobnost `audit.brojke`) — redak koji se ne poklapa je nalaz
razine A, jednako težak kao izmišljen izvor.
