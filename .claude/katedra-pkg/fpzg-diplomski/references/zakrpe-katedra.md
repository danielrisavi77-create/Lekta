# Kvarovi nađeni u katedri i rad-auditu

Sve dolje su **prave greške**, ne stvar ukusa. Svaka je nađena tako što je alat
prijavio nalaz na radu koji je bio ispravan, ili prešutio nalaz koji je postojao.
Redoslijed je po težini.

---

## 1. Opseg rada mjeri se nad krivim skupom odlomaka

**Datoteka:** `katedra/scripts/check_rules.py`

Funkcija ispravno izdvoji tijelo rada u `odlomci`, sastavi ga u `tijelo`, a onda
broji riječi nad `svi` — svim odlomcima dokumenta.

```python
    tijelo = " ".join(odlomci)
    broj_rijeci = len(H.rijeci(" ".join(svi)))     # ← greška
```

**Posljedica.** U opseg ulaze naslovnice, izjava, cijeli popis literature, prilog i
sadržaj tablica. Rad od 10.700 riječi prijavljuje se kao 12.400 i pada na gornjoj
granici. Student reže dobar tekst zbog mjerenja koje je krivo.

**Ispravak:**

```python
    tijelo = " ".join(odlomci)
    # Opseg se mjeri po TIJELU rada (uvod -> zakljucak). Predtekst, popis
    # literature i prilozi ne ulaze u propisani raspon rijeci.
    broj_rijeci = len(H.rijeci(tijelo))
```

---

## 2. Provjera citata ne prepoznaje oblik koji FPZG propisuje

**Datoteka:** `rad-audit/scripts/common.py`

Oba regeksa traže zatvorenu zagradu neposredno iza godine, pa `(Becker, 2007: 45)`
i `Krippner (2005: 174)` **nisu citat**.

**Posljedica.** Svaki citat sa stranicom ispada neprepoznat. Referenca postaje
„siroče", a izvještaj prijavi 14 nepostojećih grešaka. To je najgora vrsta kvara:
alat kažnjava rad zato što je **bolje** napisan.

**Ispravak:**

```python
# Lokator stranice iza godine: "(Becker, 2007: 45)", "(Streeck, 2014: xiv)".
# FPZG Upute propisuju bas taj oblik s dvotockom.
LOKATOR = r"(?:\s*:\s*[\dxivlcdmXIVLCDM]+(?:\s*[-–]\s*[\dxivlcdmXIVLCDM]+)?)?"

CITE_AY_RE = re.compile(
    r"\(([^()]{2,160}?,\s*\d{4}\.?[a-z]?" + LOKATOR +
    r"(?:\s*;\s*[^()]{2,160}?,\s*\d{4}\.?[a-z]?" + LOKATOR + r")*)\)"
)

CITE_AY_NARRATIVE_RE = re.compile(
    r"\b([A-ZČĆŽŠĐ][\wÀ-ɏ'’\-]+"
    r"(?:[\s,]+(?:i|te|sur\.|suradnici|dr\.|van|von|de|del|di|da"
    r"|[A-ZČĆŽŠĐ][\wÀ-ɏ'’\-]+))*)"
    r"\s*\((\d{4})\.?([a-z]?)" + LOKATOR + r"\)"
)
```

---

## 3. Sufiks 2013a / 2013b gubi se pri raščlambi

**Datoteka:** `rad-audit/scripts/common.py`, `parse_ay_segment`

Funkcija uhvati sufiks u trećoj skupini pa ga odbaci:

```python
    author_part, year = m.group(1), m.group(2)     # ← sufiks ispada
```

**Posljedica.** Dva rada istog autora iz iste godine slijevaju se u jedan ključ, pa
jedan uvijek ispada siroče. Narativni oblik sufiks zadržava, zagradni ne — dvije
funkcije istog alata daju različite ključeve.

**Ispravak:**

```python
    m = re.match(r"\s*(.+?),\s*(\d{4})\.?([a-z]?)" + LOKATOR + r"\s*$", seg.strip())
    ...
    author_part, year = m.group(1), m.group(2) + m.group(3)
```

---

## 4. Natpis prikaza priznaje samo jedan razdjelnik

**Datoteka:** `katedra/scripts/hr_text.py`

Regeks `NATPIS` traži točku iza broja, a Upute na jednom mjestu daju dvotočku.
Obranjeni rad koristi točku. Alat mora prihvatiti oba, inače natpisi ostaju
neprepoznati i rad „nema nijedan prikaz".

```python
NATPIS = re.compile(r"^\s*(Tablica|Grafikon|Slika|Shema|Prilog)\s+\d+\s*[.:]")
_NATPIS_PUNI = re.compile(
    r"^\s*(Tablica|Slika|Grafikon|Shema|Prilog)\s*(\d+)\s*[.:]\s*(.*)$", re.S)
```

---

## 5. Popis izvora prikaza ne poznaje hrvatski oblik

**Datoteka:** `katedra/scripts/check_argument.py`

Popis `VLASTITI` nije sadržavao `"izvor: autor"`, pa je alat tvrdio da rad nema
nijedan vlastiti prikaz iako su svi bili autorski.

---

## 6. Popis literature u FPZG obliku ne prolazi raščlambu

**Datoteka:** `rad-audit/scripts/check_citations_authoryear.py`

`BIBLIO_LINE_RE` je tražio inicijal (`Prezime, I. (2007)`), a FPZG traži **puno
ime** (`Prezime, Ime (2007)`). Uz to nije prepoznavao čestice u prezimenu
(`Van der Zwan`) ni institucionalne autore (`HNB (Hrvatska narodna banka) (2023)`).

Potrebni su i: popis čestica `CESTICE` te `_kljuc_prezimena()` koji ključ gradi iz
**zadnje** riječi višečlanog prezimena.

---

## Profil fpzg.json

**Margine.** Profil traži lijevo 3 cm, a u vlastitoj bilješci piše: *„Margine… NISU
u Uputama — te vrijednosti ostaju prenesene iz ranijeg skilla."* Obranjeni rad ima
2,54 cm sa sve četiri strane. Vrijednost treba postaviti na `null` (nije propisano)
umjesto izmišljene.

**Prijelom pred poglavljem.** Ključ `prijelom_pred_poglavljem` treba **izostati**,
ne biti `false` — provjera preskače ključeve kojih nema. Upute prijelom ne
propisuju, obranjeni rad ga nema.

**Obavezni dijelovi.** Popis traži doslovne nazive koji se u praksi ne koriste:
„izjava o autorstvu" (u praksi *Izjava o akademskoj čestitosti*), „popis ilustracija"
(u praksi *Popis tablica* i *Popis grafikona*), „prilozi" (u praksi *Prilog 1. …*),
„tijelo teksta" (nema vlastiti naslov ni u jednom radu). Usporedbu treba proširiti
sinonimima, inače svaki ispravno složen rad prijavljuje pet nepostojećih nedostataka.

---

## Kako izbjeći ovu klasu kvarova

Svih šest gore ima isti oblik: **alat je kalibriran na jedan citatni dijalekt i jedan
raspored, pa rad koji radi nešto drukčije, ali ispravno, prijavljuje kao pogrešan.**

Pravilo: prije nego se prijavi nalaz na radu, provjeri može li ga alat uopće
prepoznati. Kad se nalazi broje u desecima, a rad izgleda uredno, uzrok je gotovo
uvijek u alatu.

---

## Kvarovi nađeni u OVOM skillu (prihvatni test, kolovoz 2026.)

Isti rukopis pušten je kroz ovaj lanac i kroz motor izrade (`rad-docx`), pa su PDF-ovi
usporeni stranicu po stranicu. Test je našao tri kvara **ovdje**, uz sedam u motoru.

### 1. `build_docx.py` — `StopIteration` na radu bez priloga

```python
sidro = next(p for p in d.paragraphs if p.text.strip().startswith("Prilog 1"))
```

Rad bez priloga ne postoji za tu liniju, a `references/struktura.md` **ovog istog skilla**
priloge navodi kao „prilozi (ako postoje)" — dakle neobvezne. Izgradnja je padala u
cijelosti, bez ijedne razumljive poruke.

Ispravljeno funkcijom `_sidro(dok)`: prilozi → sažetak → summary → kraj dokumenta. Iste
vrste je i linija 218, koja je zadanu vrijednost imala od početka — što je i dokaz da je
418 bila omaška, ne odluka.

### 2. Graditelj ne poznaje `RAD_SADRZAJ`

Sadržaj se ubacivao **isključivo** kao živo polje `TOC` s tekstom-zamjenom. LibreOffice
polje pri pretvorbi ne popunjava, pa u PDF-u sadržaj zauzima **jedan redak** umjesto pune
stranice: svaki izmjereni broj stranice je pomaknut i lanac ne može provjeriti vlastitu
paginaciju. U prihvatnom testu je zato završio s **neispunjenim sadržajem u isporuci** —
točno stanje u kojemu je bio i predani rad koji je poslužio kao ulaz.

Riješeno prilagodnikom `scripts/graditelj.sh`, koji nakon `build_docx.py` pusti
`rad-docx/scripts/sadrzaj.py --oblik staticni|zivi`. Kućni stil se ne mijenja.

Uz to: `updateFields` sada se postavlja u svakoj izgradnji. Bez njega Word sadržaj ne
osvježi pri otvaranju — a to je najčešći uzrok zastarjelog sadržaja u predanom radu.

### 3. Prolaz po arhivi živio je u `gradi.sh`, ne u `build_docx.py`

```xml
<w:autoHyphenation w:val="true"/> <w:hyphenationZone w:val="357"/>
<!-- theme1.xml: Cambria/Calibri → Times New Roman -->
<!-- styles.xml: docDefaults rFonts minorHAnsi → Times New Roman -->
```

**Prijelom riječi mijenja lom redaka, znači i paginaciju.** Motor koji je pozvao samo
`build_docx.py` dobio je dokument bajt po bajt jednak u `document.xml` a drukčije
prelomljen — razlika od jedne stranice koja se u prozoru od 25 stranica dva puta otvorila i
zatvorila, pa ukupan broj stranica nije odao ništa.

Dijagnostika koja to nalazi: kad dva dokumenta imaju jednako tijelo a različitu paginaciju,
ne gleda se `document.xml` nego se **diffa arhiva po članovima** (`styles.xml`,
`settings.xml`, `theme1.xml`, `fontTable.xml`, `footer*.xml`).

Prolaz je izdvojen u `rad-docx/scripts/arhiva.py` i ovaj skill ga **poziva**, ne kopira —
dvije kopije istog posla su ono što željezno pravilo 10 zabranjuje.

### Što od ovoga mijenja granicu skilla

Ovaj skill nosi **kućni stil** (sposobnost `stil.kucni`). Motor izrade (`izrada.docx`) je
neutralan na fakultet i nije više njegov posao. Praktično: drugi fakultet je novi zapis o
stilu, ne kopija motora.
