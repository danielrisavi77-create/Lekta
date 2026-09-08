# MOD 6 — PREFLIGHT PRED PREDAJU

> Zadnja provjera prije nego rad ode mentoru ili u referadu. Sve se izvodi iz profila
> fakulteta — ovo nije generička checklista nego provjera **tvojih** pravila.


## Datoteke koje trebam (mod 6)

📄 finalna verzija .docx (**OBAVEZNO**) · 📜 upute s hodogramom · 📄 PDF konačne
verzije za provjeru referenci stranica

---

---

## 1. Hodogram unatrag od roka

Uzmi `rok` iz `stanje.json` i `predaja.administrativni_rep_dana` iz profila (tipično 14).

| korak | trajanje | kad najkasnije |
|---|---|---|
| finalna verzija mentoru | — | rok − 21 dan |
| mentorovi komentari | 2–3 dana | |
| ugradnja komentara | 2 dana | |
| provjera podudarnosti (Turnitin) | 1–3 dana | rok − 14 |
| ispravci nakon izvještaja | 1–2 dana | |
| uvez | 2–3 dana | rok − 7 |
| unos u repozitorij | 1 dan | |
| predaja u referadi | — | rok |

Ako je rok bliži od zbroja, reci to **odmah i brojkom**: „do roka je 9 dana, sam
administrativni rep traži 14 — realno je pomaknuti rok ili skratiti krug s mentorom".
Nemoj to ublažavati.

---

## 2. Formalni preflight

**Prvo jedna naredba, pa ono što ostaje čovjeku.** Popis niže je i dalje mjerodavan, ali se
ne izvodi ručno naredbu po naredbu — preskočena naredba ne proizvodi nikakvu poruku, pa
faza izgleda čista zato što polovica provjera nije ni pokušala (pravilo 20):

```bash
python3 <KATEDRA_SKILL>/scripts/gate.py --faza predaja \
    --rad ./rad.docx --pdf ./rad.pdf \
    --profil ./.katedra/resolved_profile.json --tip <tip> \
    --json ./.katedra/gate.json
```

Čitanje izvještaja: `ok` prošlo · `nalaz` treba popraviti · `preskočeno` je **ograničenje
projekta** i upisuje se u stanje · `alat pukao` **nije provjera koja je prošla** i rješava se
prije nego se zaključi da je faza čista. Izlazni kod 1 = rad ne ide dalje.

Pojedinačne naredbe ispod ostaju za slučaj kad treba samo jedna provjera:

```bash
python3 <KATEDRA_SKILL>/scripts/check_rules.py ./rad.docx --fakultet <slug> --tip <tip>
python3 <KATEDRA_SKILL>/scripts/engine.py --audit ./rad.docx --sources ./izvori/ --json ./.katedra/nalazi.json
python3 <KATEDRA_SKILL>/scripts/check_argument.py ./rad.docx --profil ./.katedra/resolved_profile.json
```

`check_argument.py` citatni dialect uzima iz istog resolved profila; IEEE i legal-footnote ne provjeravaju se author–year regexom.

Blokirajuće (rad ne ide dalje dok se ne riješi):

- [ ] svi obavezni dijelovi iz profila postoje, u propisanom redoslijedu
- [ ] naslovnica: točno ime, JMBAG, **točno zvanje mentora**, ustanova, mjesto i godina
- [ ] engleska naslovnica i sažetak ako ih profil traži
- [ ] izjava o akademskoj čestitosti — potpisana
- [ ] sadržaj je TOC **polje**, ne ručno tipkan popis, i osvježen je
- [ ] numeracija stranica po profilu (rimski do Uvoda, zatim arapski od 1)
- [ ] font, veličina, prored, margine, poravnanje po profilu
- [ ] prijelom pred svakim poglavljem ako ga profil traži
- [ ] svaki prikaz ima natpis, izvor i **spomen u tekstu**
- [ ] nijedan prikaz se ne lomi preko dvije stranice
- [ ] popis izvora abecedno po hrvatskoj kolaciji, u formatu iz profila
- [ ] svaki izvor citiran barem jednom, svaki citat ima izvor
- [ ] nijedan `[TREBA IZVOR]`, `[PROVJERI STR.]`, `[PROVJERI ČL.]` ni `[PROVJERI NN BR.]` nije ostao u tekstu (vokabular: `references/intake.md` § 0.7b)
- [ ] sve zamjerke mentora zatvorene, izlazni kod 0 (`zamjerke.py provjeri`, v. `references/pisanje.md` §4)
- [ ] originality provjera pregledana i svaki nalaz razriješen (v. §4)
- [ ] **svi obavezni dijelovi rada su `napravljeno` ili `provjereno`** (`dijelovi.py --provjeri --faza predaja`)
- [ ] **engleski summary i ključne riječi provjereni protiv hrvatskog sažetka** (v. §2d)

**„Osvježen je" nije provjerljivo automatski dok student stvarno ne pritisne Update Field u
Wordu** — keširani TOC redak ostaje star čak i kad se naslovi ili opseg poglavlja promijene, a
to se lako zaboravi baš u zadnjem krugu prije predaje. Ako se preflight radi na verziji koja
još nije prošla ručni Update Field (npr. rad se šalje na brzu provjeru prije zadnjeg otvaranja
u Wordu), procjena brojeva stranica pomaže da Sadržaj ne bude očito zastario u međuvremenu:

```bash
python3 <KATEDRA_SKILL>/scripts/revizije.py toc ./rad.docx ./rad_toc_procjena.docx
```

Ovo je procjena (LibreOffice paginacija), **ne zamjena** za Wordov stvarni Update Field —
razlika je tipično ±1 stranica zbog razlike u metrici fonta. Zadnji korak prije predaje ostaje
isti: otvoriti u Wordu, desni klik na Sadržaj → Update Field, ručno potvrditi.

```bash
python3 <KATEDRA_SKILL>/scripts/verify_sources.py ./rad.docx --pokrivenost
python3 <KATEDRA_SKILL>/scripts/extract_comments.py --otvorene .katedra/zamjerke.json
python3 <KATEDRA_SKILL>/scripts/check_placeholders.py ./rad.docx --json .katedra/placeholders.json
python3 <KATEDRA_SKILL>/scripts/originality_check.py ./rad.docx --json .katedra/originality.json
```

`check_placeholders.py` provjerava i tablične ćelije i fusnote, ne samo odlomke —
`[PROVJERI STR.]` uz brojku u tablici je tipičan preživjeli slučaj. Izlazni kod 1
znači da rad nije spreman za predaju.

Originality nalaz je dodan na ovaj popis nakon audita: alat je postojao i §4 ga je
opisivao, ali nijedan blokirajući popis ni sažetak nije tražio da ga student
pogleda, pa je visok nalaz mogao proći do predaje a da ga nitko ne otvori.

---

## 2a. Popis literature i prikazi

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_literaturu.py ./rad.docx --profil ./.katedra/resolved_profile.json
python3 <KATEDRA_SKILL>/scripts/provjeri_prikaze.py ./rad.docx
```

- [ ] oblik bibliografske jedinice po profilu — ime (inicijal ili puno), godina, završna točka
- [ ] uvlaka i razmak između jedinica po profilu
- [ ] abecedni red po **hrvatskoj** kolaciji (C < Č < Ć, S < Š, Z < Ž, D < Đ)
- [ ] jedinice u skupini „nije provjereno" (propisi, mrežni izvori) pregledane rukom
- [ ] nijedna slika ispod 150 dpi u dokumentu; nijedna preko širine teksta
- [ ] nijedna slika razvučena (omjer) ni kolabirana u traku
- [ ] grafikoni umetnuti 1:1 — skaliranje mijenja veličinu pisma **u** grafikonu

Do v1.4 se od svega ovoga provjeravalo samo je li prikaz spomenut u tekstu i lomi li se
preko stranica. Oblik jedinice i sama slika nisu bili ničiji posao.

## 2a2. Hrvatski jezik

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_jezik.py ./rad.docx --json .katedra/jezik.json
```

- [ ] nijedan ❌ nalaz (pravopis i gramatika — norma, ne ukus)
- [ ] ⚠️ nalazi (administrativizmi: „od strane”, „vršiti”, „isti”) pregledani
- [ ] ako imaš hunspell hr rječnik, pokrenut i rječnički prolaz (`--rjecnik`) i
      pregledan — stručni termini u njemu su **očekivani**, ne ispravljaj slijepo

Do v1.5 cijeli lanac nije vidio nijednu pravopisnu pogrešku. Rad je mogao imati pojas 5 i
vratiti se zbog tri „sa” umjesto „s”.

## 2a3. Izračuni — izbor formule

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_izracune.py ./rad.docx --model .katedra/model.json
```

- [ ] nijedna razlika dvaju udjela nije izražena u postocima umjesto u postotnim bodovima
- [ ] svaki rast ima navedenu osnovicu
- [ ] svaki indeks ima oznaku je li bazni ili lančani
- [ ] rast novčane veličine ima oznaku je li nominalan ili realan
- [ ] udjeli u tablicama zbrajaju se u 100 iz **prikazanih** vrijednosti

## 2b. Sažetak protiv rada (kvar 30)

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_sazetak.py ./rad.docx --tablica
```

- [ ] broj poglavlja koji sažetak navodi odgovara broju naslova prve razine
- [ ] svaki pojam i svaka brojka iz sažetka pojavljuju se u tijelu
- [ ] svaka ključna riječ pojavljuje se u tijelu
- [ ] svaki nalaz iz sažetka ima parnjaka u zaključku
- [ ] **paritetna tablica pročitana** — proturječje alat ne vidi

Sažetak nastaje rano i poslije se ne dira, a rad se mijenja. Na jednom je eseju sažetak
tvrdio da se argument izlaže „u pet cjelina koje zauzimaju šest poglavlja" — rad ih je imao
osam; isti je sažetak nudio terminal za ukapljeni prirodni plin kao dokaz da anticipacija
nije bila nemoguća, dok ga je šesto poglavlje razložilo u suprotno. Obje su pogreške stajale
na prvoj stranici, koju mentor čita prvu.

## 2d. Engleski sloj — dio koji poslije predaje ostaje javan

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_engleski.py ./rad.docx \
    --profil ./.katedra/resolved_profile.json --json ./.katedra/engleski.json
```

- [ ] brojke u summaryju iste kao u hrvatskom sažetku
- [ ] isti broj ključnih riječi na obje strane, nijedna s hrvatskim dijakritikom
- [ ] engleski naslov **isti niz** na naslovnici, u sažetku i u obrascu repozitorija
- [ ] engleski naslov se slaže s **prijavljenim** naslovom teme
- [ ] blok metapodataka za Dabar sastavljen i predan studentu

Puni postupak, uključujući licenciju i embargo: `references/engleski.md`. Ovo je jedini dio
rada koji nakon predaje ostaje javan i nepromjenjiv, a do v1.3 ga nije dodirivao nijedan
alat.

## 2e. Svi dijelovi rada

```bash
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --provjeri --faza predaja
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --status --opsirno
```

Izlazni kod 1 dok god ijedan obavezan dio stoji na `nije-napravljeno` ili `u-izradi`.
Dijelovi razine `nepokriveno` **uvijek** idu u tablicu RUČNO PROVJERI (§5, točka 3) — ne
zato što su manje važni, nego zato što ih nitko ne provjerava. Popis i postupak za svaki:
`references/dijelovi.md`.

## 2c. Reference stranica protiv stvarnog prijeloma

```bash
python3 <RAD_DOCX_SKILL>/scripts/provjeri_reference.py ./rad.pdf
```

Sadržaj, popisi prikaza i unakrsne reference mjere se protiv otiska, ne protiv dokumenta.
Rad koji je sam sa sobom dosljedan i dalje može imati sve brojeve krive. Izlazni kod 1 =
ne predaje se.

## 3. Tehnički preflight

- [ ] dokument otvoren i pregledan **kao PDF** — render otkriva ono što XML ne pokazuje
- [ ] slike nisu kolabirane u tanku traku (klasičan simptom krivog proreda u generiranom .docx-u)
- [ ] tablice ne prelaze desnu marginu
- [ ] nema praznih stranica ni zaostalih prisilnih prijeloma usred poglavlja
- [ ] fusnote (ako ih ima) numerirane redom i vidljive na svojoj stranici
- [ ] datoteka imenovana po pravilu fakulteta (najčešće `Prezime_Ime_tip_godina.docx`)
- [ ] snimljen snapshot finalne verzije:

```bash
python3 <KATEDRA_SKILL>/scripts/diff_versions.py --snapshot rad.docx --biljeska "finalna, pred predaju"
```

**Mehanička kršenja ispravlja alat, ne student klik po klik.** Font, veličina,
prored, poravnanje, margine i prijelom pred poglavljem izvode se iz profila:

```bash
python3 <KATEDRA_SKILL>/scripts/fix_rules.py ./rad.docx --fakultet <slug> --tip <tip>
```

Zadano piše u `rad_popravljen.docx` i **ne dira izvornik**. Pisanje preko
izvornika (`--u-mjestu`) traži valjan snapshot — isti uvjet kao faza G, i
provjerava se hash trenutnog dokumenta, ne ime datoteke.

Što alat NE dira: nedostajuće poglavlje, natpis prikaza, izvor ispod tablice i
oblik citata. To je autorstvo, ne oblik, i odbija se izrijekom s obrazloženjem.
Poslije zahvata tekst rada mora biti znak po znak isti — to se provjerava, a ne
obećava: ako se razlikuje, zapis se odbija i izlazna datoteka briše.

Ako je stigla nova verzija od mentora, usporedi je prije nego je prihvatiš:

```bash
python3 <KATEDRA_SKILL>/scripts/diff_versions.py rad_v3.docx rad_v4.docx
```

Izgubljen citat je najčešća tiha šteta: tekst izgleda bolje, a tvrdnja je ostala bez potpore.

### 3a. Brojke i zadatak — dva artefakta koja gate čita

Ako rad ima **vlastiti izračun**, izradu i provjeru vodi sposobnost `izrada.docx`
(`references/vjestine.md`), a Katedra samo predaje artefakte stanja:

```bash
python3 <RAD_DOCX>/scripts/provjeri_predaju.py rad.docx \
    --profil .katedra/resolved_profile.json \
    --model .katedra/model.json --model-prije .katedra/model.prije.json \
    --zadatak .katedra/zadatak.json
```

- **`model.json`** — jedini izvor izvedenih brojki (željezno pravilo 13). `model.prije.json`
  je prethodna verzija i bez nje **nema crne liste**: vrijednost koja je promijenjena, a
  ostala negdje u tekstu, prolazi nezapaženo. To je najskuplja tiha greška u ovom modu.
- **`zadatak.json`** — komponente koje uputa predmeta izrijekom traži, zapisane u modu 1
  (pravilo 14). Provjera je prisutnost igala u dokumentu, ne ocjena kvalitete.

Nema `model.json` jer rad nema vlastiti izračun → preskoči i **zapiši kao ograničenje**, ne
prešuti. Nema `zadatak.json` a uputa postoji → prvo ga napravi; retroaktivno je jeftinije od
pada na sadržaju.

---

## 3b. Statistički prilog (empirijski rad)

Ako rad iznosi vlastite izračune, prilog s ispisom nije ukras nego dokaz. Radi ga
`replikacija-pspp`, ne Katedra:

```bash
python3 <KATEDRA_SKILL>/scripts/vjestine.py --sposobnost audit.brojke
python3 <REPLIKACIJA_SKILL>/scripts/prilog_replikacija.py --conf replikacija.json --dokument rad.docx
```

- [ ] tablica usporedbe je **potpuna** — svaka brojka iz rada ima „da" ili obrazloženo
      „ne ispisuje se"
- [ ] snimka koja u radu stoji kao ispis programa doista **jest** iz programa
- [ ] nijedno neslaganje u prvoj decimali nije ostalo neobrazloženo

Ako satelita nema (`vjestine.py` izlaz 3), rad se **ne predaje kao da je replikacija
napravljena** — izostanak se upisuje kao ograničenje u `.katedra/stanje.json`.

---

## 4. Turnitin

- Prag podudarnosti uzmi iz profila (`predaja.prag_podudarnosti`); nema ga → pitaj mentora, ne pretpostavljaj.
- Popis izvora i doslovni citati redovito dižu postotak — gledaj **strukturu izvještaja**, ne samo broj.
- Podudarnost s vlastitim ranijim radom je stvarna kategorija (samoplagijat) i traži citiranje.
- Visok postotak na jednom izvoru je ozbiljniji nalaz od istog postotka raspršenog po dvadeset njih.

Prije stvarnog Turnitin/iThenticate kruga, `originality_check.py` (v1.1, advisory) može
dati raniji signal na odlomcima koji se preklapaju s već ingestiranim izvorima
(`.katedra/evidence.jsonl`) — to NIJE zamjena za institucionalnu provjeru, samo jeftiniji
prvi prolaz prije nego rad uđe u stvarni krug:

```bash
python3 <KATEDRA_SKILL>/scripts/originality_check.py rad.docx --json .katedra/originality.json
```

---

## 4b. Gdje rad stoji — pojas, ne „spreman je"

```bash
python3 <KATEDRA_SKILL>/scripts/rubrika.py --opsirno --json ./.katedra/rubrika.json
```

Pokreće se **zadnji**, nakon što su ostali koraci napisali svoje artefakte — rubrika ih
samo agregira. Studentu se kaže **pojas i što ga drži**, ne „rad je spreman":

```
POJAS: 4   (ključni kriterij je na pola)
drži ga: Odgovor na zadatak predmeta, Vlastiti doprinos i analitičnost
```

- [ ] pojas nije `nepoznato` — ako jest, ključnom kriteriju fali artefakt, ne rad
- [ ] popis „drži ga" prenesen studentu doslovno, s onim što se radi (`--opsirno`)
- [ ] rečeno je izrijekom da ovo **nije predviđanje mentorove ocjene**
- [ ] ono što rubrika ne vidi (`references/rubrika.md` §zadnji) navedeno uz nalaz

Rad koji prođe sve formalne provjere, a stoji na pojasu 3, nije spreman za predaju nego za
razgovor o tome što mu nedostaje — i taj je razgovor jeftiniji sada nego nakon mentorove
ocjene.

## 5. Isporuka moda 6

1. Popunjena checklista s ✅/❌ i konkretnim mjestom za svaki ❌
2. Hodogram s datumima, uz jasnu oznaku ako rok nije realan
3. Tablica **„RUČNO PROVJERI"** — sve što Katedra ne može potvrditi sama: zvanje mentora, potpis izjave, pravila iz profila sa `status: nepotvrdeno`, **svi dijelovi razine `nepokriveno`** i svaki korak koji je `gate.py` javio kao `preskočeno` ili `alat pukao`
4. Finalni `.docx` + snapshot u `.katedra/verzije/`
5. **Pojas iz rubrike s popisom „drži ga"** — i izrijekom rečeno da to nije ocjena mentora
6. Ako fakultet traži formalnu bibliografiju u zasebnom formatu (BibTeX/RIS), ponudi
   `export_bibliography.py .katedra/izvori.json --bibtex literatura.bib --ris literatura.ris` (v1.1)

Na kraju upiši u stanje:

```bash
python3 <KATEDRA_SKILL>/scripts/stanje_init.py --set mod=predaja
```

Ako ijedna blokirajuća stavka nije riješena, **reci da rad nije spreman** i navedi
točno koje su. Preflight koji propušta rad da ne bi razočarao nikome ne pomaže.


---

## Tijek moda — sažeto

> Ovo je bilo u routeru (`SKILL.md` § 2) do v1.7.
> Tijek jednog moda ne treba biti u datoteci koja se učitava u svakoj poruci.

`predaja.md`: `gate.py --faza predaja` prvo, pa ono što ostaje čovjeku.
  Preflight izveden iz profila + hodogram unatrag od roka. Zadnji korak gatea je
  `rubrika.py` — pojas i popis onoga što ga drži; to je ono što se kaže studentu, ne „rad je
  spreman". Ako fakultet traži formalnu bibliografiju u zasebnom formatu, ponudi `export_bibliography.py` (v1.1) za BibTeX/RIS izvoz iz `.katedra/izvori.json`. **Obavezno prije predaje: `scripts/provjeri_sazetak.py rad.docx --tablica`** — sažetak se piše rano i poslije se ne dira, a rad se mijenja; mentor ga čita prvi. **Obavezno nad konačnim PDF-om: `rad-docx/scripts/provjeri_reference.py`** — svaka tvrdnja o stranici (sadržaj, popisi prikaza, unakrsne reference) mjeri se protiv stvarnog prijeloma. Dokument koji je sam sa sobom dosljedan i dalje može imati sve brojeve krive.

---

## Opseg se MJERI, ne procjenjuje

Nastalo iz stvarnog kvara (audit Znahor). Rad je imao 79 stranica, Naputak
dopušta 50. Prva pretpostavka, i autorova i moja, bila je da prostor jedu tablice
i slike.

**Izmjereno:** dokument bez ijedne tablice i slike ima 63 stranice, s njima 68.
Prikazi koštaju **5 stranica**; ostatak je dvostruko prorezan tekst. Skraćivanje
prikaza dalo bi 5 od potrebnih 29 stranica i potrošilo dan.

Postupak prije svake odluke o skraćivanju:

1. Konvertiraj u PDF i prebroji stranice
   (`soffice --headless --convert-to pdf`, pa prebroji `/Type /Page`).
2. Napravi verziju **bez prikaza** i prebroji ponovno.
   Razlika je stvarna cijena prikaza.
3. Tek onda odluči što se krati.

**Nasljedno pravilo: prije svake odluke o skraćivanju stoji jedno mjerenje.**
Na tom je radu teorijski dio otišao sa 7 026 na 3 581 riječ uz zadržanih svih 40
citata, i to je provjereno programski, ne okom.

---

## Rad koji se ne može poslati nije predan

Predaja nije samo „je li rad ispravan" nego i „može li fizički otići". Rad od
1,5 MB ne prolazi kroz alate za e-poštu jer se privitak predaje kao base64 unutar
poziva.

`provjeri_predaju.py` zato ispisuje redak `težina:` s udjelom medija i mrtvih
dijelova. Verzija za slanje se radi zasebno:

```bash
python3 <RAD_DOCX>/scripts/priprema_slanja.py rad.docx --izlaz rad-za-slanje.docx
```

Arhivska verzija ostaje netaknuta. Poslije pripreme se **provjeri broj stranica**:
mora biti isti kao u izvorniku.

---

## Metapodaci putuju s radom, a u Wordu se ne vide

Do v1.9.7 nijedan alat u lancu nije pogledao `docProps/`. Izmjereno na šest
stvarnih radova, i **nijedan nije bio čist**:

| Rad | Što je nosio |
|---|---|
| MEDRI diplomski | `lastModifiedBy` = „Provenance Test Generator", `TotalTime` = 21 474 min (358 h), `Pages` = 1 u radu od 67 stranica |
| PFZG seminarski | `dc:creator` = „Student", `lastModifiedBy` = „PC", `app.Company` = „HT" |
| HKS diplomski | `[upisati vrijednost]` u gotovu tekstu, `TotalTime` = 0 |
| TVZ završni | `dc:title` = „Uvod i teorija završnog rada – poglavlja 1–3" u gotovu radu |

To su podaci koji idu u repozitorij, na provjeru podudarnosti i u mentorov inbox.
Naziv poslodavca u studentskom seminarskom radu nema što tražiti; `dc:creator`
koji imenuje nekoga drugoga od naslovnice je proturječje u samom dokumentu.

```bash
python3 <RAD_AUDIT>/scripts/provjeri_metapodatke.py rad.docx
python3 <RAD_AUDIT>/scripts/provjeri_metapodatke.py rad.docx \
    --autor "Ime Prezime" --naslov "Naslov rada" --postavi --ocisti-curenje \
    --izlaz rad-final.docx
```

**Granica koju alat drži.** `--postavi` upisuje polja koja mu se izrijekom zadaju
i uklanja ono što curi (naziv tvrtke, upravitelj, tuđi predložak, lokalne
putanje). **Ne dira `w:rsid` oznake, povijest praćenih izmjena ni autore
komentara.** Te se stavke prijavljuju da autor zna da postoje, a uklanjaju se
prihvaćanjem izmjena (`revizije.py prihvati`), ne brisanjem tragova: alat koji bi
ih brisao služio bi jednoj svrsi, onemogućavanju provjere podrijetla dokumenta.
Vrijednost koja se upisuje u `dc:creator` je ona koju rad **sam navodi na
naslovnici**, i alat prijavlja kad se to dvoje razilazi.

