# Kućni stil FPZG-a — izveden iz obranjenog rada

Svaka vrijednost dolje potvrđena je u **obranjenom diplomskom radu** s diplomskog
studija politologije FPZG-a. To je jači dokaz od čitanja Uputa: Upute su na više
mjesta nepotpune, a rad koji je prošao pokazuje što se doista prihvaća.

Gdje se Upute i obranjeni rad razilaze, to je izrijekom označeno.

---

## Stranica i osnovni tekst

| Stavka | Vrijednost | Napomena |
|---|---|---|
| Format | A4 | |
| Margine | **2,54 cm sa sve četiri strane** | Upute margine **ne propisuju**; profil katedre traži lijevo 3 cm, ali sam priznaje da taj podatak nije iz Uputa. Obranjeni rad ima 2,54. |
| Font | Times New Roman | u **sva četiri sloja**: theme, docDefaults, stil Normal, runovi |
| Veličina tijela | 12 pt | |
| Prored | 1,5 | |
| Poravnanje | obostrano | |
| Odvajanje odlomaka | **razmak 6 pt, bez uvlake** | Upute dopuštaju i uvlaku prvog retka; obranjeni rad je nema nigdje |
| Rastavljanje na slogove | uključeno | inače obostrano poravnanje pravi rupe |

**Font u sva četiri sloja.** Word razrješava font kroz theme → docDefaults → stil →
run. Pandocov predložak ostavlja Cambriju u temi, pa stil Normal to prekriva samo
za postojeći tekst. Sve što student naknadno utipka pada na Cambriju. Zakrpiti
treba `word/theme/theme1.xml` i `docDefaults` u `word/styles.xml`.

## Naslovi

| Razina | Oblik |
|---|---|
| 1. razina | **14 pt, podebljano**, 18 pt prije / 12 pt poslije |
| 2. razina | **12 pt, podebljano**, 12 pt prije / 6 pt poslije |
| Pisanje | **rečenično, ne verzal** — „1. Uvod", ne „1. UVOD" |
| Numeracija podnaslova | **s točkom iza broja** — „2.1. Naslov" |

**Poglavlje ne počinje na novoj stranici.** Upute to ne propisuju, a obranjeni rad
tekst pušta da teče. Prijelom ide samo pred: Sadržaj, Literatura, Popis tablica,
Popis grafikona, Prilog.

## Prikazi

| Stavka | Vrijednost |
|---|---|
| Natpis | **iznad** prikaza, podebljano, **11 pt** |
| Oblik natpisa | `Tablica 1. Naslov` — **točka**, ne dvotočka |
| Izvor | **ispod**, **obično pismo** (bez kurziva), **10 pt**, puna rečenica s točkom |
| Tekst u tablicama | 11 pt, jednostruki prored |
| Poziv u tekstu | **malim slovom** — „u tablici 5", „na grafikonu 3" |
| Spominjanje | svaki prikaz mora biti spomenut u tekstu |

**Oprez oko natpisa.** Upute na jednom mjestu daju dvotočku, obranjeni rad koristi
točku. Alati katedre moraju prihvaćati oba (`hr_text.py`, regex `NATPIS`).

**Izvor se ne piše kurzivom.** Redak je već odvojen manjim stupnjem i položajem
ispod prikaza; kurziv povrh toga ne razlikuje ništa nego samo zamara. Kurziv u
radu ostaje rezerviran za naslove djela i za istaknute pojmove pri prvom
spominjanju.

**Izvor nije jedna riječ.** Ne „Izvor: autor" nego „Izvor: izradio autor prema
podacima provedenog istraživanja." Kad je prikaz autorski nacrt, a ne rezultat
mjerenja: „Izvor: izradio autor."

## Prikazi se ne smiju lomiti

Kombinacija koja to jamči:

- `w:cantSplit` na **svakom** retku — redak se ne lomi
- `keep_with_next` na odlomcima u **svim** retcima, uključujući zadnji — lanac drži
  cijelu tablicu i lijepi je uz „Izvor:" ispod
- `keep_with_next` na natpisu — natpis ide uz tablicu
- `keep_with_next = False` na „Izvor:" — ondje lanac završava
- `w:tblHeader` na prvom retku — osigurač ako tablica ipak preraste stranicu

**Kako se to provjerava.** Ako se tablica lomi, ponovljeno zaglavlje pojavi se na
**dvije** stranice PDF-a. Broj stranica na kojima se pojavi tekst zaglavlja je
točan pokazatelj: 1 = uredno, 2+ = lomi se. To je pouzdanije od traženja teksta
zadnjeg retka, koji se u PDF-u prelama i rastavlja.

## Fusnote

| Stavka | Vrijednost |
|---|---|
| Vrsta | prave Wordove fusnote (`word/footnotes.xml`), ne ručno tipkane |
| Stil odlomka | `FootnoteText`: **10 pt, jednostruki prored, bez razmaka**, obostrano |
| Stil znaka | `FootnoteReference`, eksponent |
| Numeracija | 1, 2, 3 kroz cijeli rad, na dnu stranice |
| Sadržaj | **samo objašnjenja, nikad citati** |

**Kvar koji pandoc uvijek napravi.** `FootnoteText` ostaje potpuno prazan —
`basedOn Normal` bez ijedne postavke. Fusnote zato naslijede Normal i ispišu se u
12 pt s proredom 1,5, dakle identično tijelu teksta. Ispod crte stoji odlomak koji
izgleda kao svaki drugi. Stil se mora postaviti izrijekom.

**Položaj oznake.** Chicago i većina hrvatskih priručnika traže oznaku **iza**
interpunkcije. Vezanje uz pojam koji se objašnjava (dakle prije zareza) obranjivo
je za objasnidbene fusnote, ali mora biti dosljedno kroz cijeli rad.

## Interpunkcija: dvotočka je rijetka

Dvotočka je najčešći tik dugog akademskog teksta. Pojedinačno je bezazlena, a na
pedeset stranica postane manir po kojemu se tekst prepoznaje.

**Pravilo.** Dvotočka se zadržava samo kad **uvodi nabrajanje ili definiciju**.
Kad iza nje slijedi **cjelovita samostalna rečenica** koja prethodnu tvrdnju samo
razrađuje, dolazi točka i nova rečenica.

| Ostaje | Postaje točka |
|---|---|
| „Materijalni položaj mjeren je trima varijablama: prihodom, samoprocjenom i sposobnošću pokrivanja troška." | ~~„Willis ide korak dalje: obrazovni pristup ne promašuje samo mjerom."~~ → „Willis ide korak dalje. Obrazovni pristup ne promašuje samo mjerom." |
| „Upitnik ima pet cjelina: sociodemografska obilježja, znanje, …" | ~~„Razlika je bitna: pristup tržištu i sigurnost nisu ista stvar."~~ → „Razlika je bitna. Pristup tržištu i sigurnost nisu ista stvar." |

**Prag:** najviše **4 dvotočke na 100 rečenica**. Mjeri `scripts/provjeri_stil.py`.
U radu na kojemu je ovo pravilo nastalo bilo ih je 9,8 na 100 — jedna na svakih
dvanaest rečenica. Nakon primjene pravila 2,2.

**Nusproizvod.** Brojanje dvotočaka otkriva i **ponovljene konstrukcije**: ista
formulacija („Razlika je bitna", „Njihov je položaj utoliko dijagnostički")
pojavila se dvaput u različitim poglavljima. Kad se dvotočke slože u popis, takva
se ponavljanja vide odmah.

## Duga crtica se ne koristi

Em crtica (—) u hrvatskom akademskom tekstu ne stoji. Umjesto nje: zarez, točka,
zagrada ili dvotočka ako doista uvodi nabrajanje. En crtica (–) ostaje samo za
raspone brojeva i stranica.

Iznimka je doslovan prijenos tuđeg teksta (ponuđeni odgovor iz upitnika u prilogu),
gdje se zadržava izvorni oblik uz napomenu koja to objašnjava.

## Citiranje

| Stavka | Oblik |
|---|---|
| U tekstu | `(Prezime, godina: 45)` — **dvotočka**, bez „str." |
| Bez stranice | dopušteno kad se upućuje na djelo u cjelini |
| Popis, knjiga | `Prezime, Ime (godina) Naslov. Mjesto: Izdavač.` |
| Popis, članak | `Prezime, Ime (godina) Naslov članka. Naziv časopisa volumen/broj: stranice.` |
| Ime autora | **puno**, ne inicijal |
| Iza godine | **nema točke** |
| Institucionalni autor | `AKRONIM (Puni naziv) (godina)` |
| Više radova iste godine | `2013a`, `2013b` |
| Mrežni izvor | obavezan datum pristupa |
| Redanje | abecedno po prezimenu, potom kronološki |
| Najmanje | 15 izvora, od toga 3 knjige |

Viseća uvlaka u popisu literature **nije propisana**; obranjeni rad je nema. Uvlaka
od 1,25 cm ipak se preporučuje jer popis od 40 jedinica bez nje nije pregledan.

## Opseg

| Vrsta | Riječi |
|---|---|
| Diplomski | 10.000–15.000 |

**Mjeri se tijelo rada**, od „1. Uvod" do „Literatura". Predtekst, popis literature,
prilozi, natpisi prikaza i sadržaj tablica **ne ulaze** u taj broj. Alat koji broji
sve odlomke napuhne opseg za cijelu bibliografiju i prilog.

## Numeracija stranica

- Podnožje, **središnje**
- Predtekst (naslovnice, izjava, sadržaj) **bez broja**
- Tijelo počinje od **1** na „1. Uvod"
- Izvedba: prijelom sekcije prije uvoda, `pgNumType w:start="1"` na drugoj sekciji,
  podnožje prve sekcije prazno i odvezano od prethodnog

## Naslovnice

Dvije, obje centrirane, prored 1,5.

**Vanjska:** Sveučilište u Zagrebu / Fakultet političkih znanosti / Diplomski studij
politologije / ime studenta / **naslov 16 pt podebljano** / „Diplomski rad" 13 pt /
Zagreb / mjesec, godina.

**Unutarnja:** isto bez imena na vrhu, a `Mentor:` i `Student:` **desno poravnati**
iznad mjesta i datuma.

**JMBAG se ne navodi** — Upute ga ne traže.

Izjava je **„Izjava o akademskoj čestitosti"**, kao samostalan podebljan redak
(ne naslov u stilu Heading), na vlastitoj stranici.
