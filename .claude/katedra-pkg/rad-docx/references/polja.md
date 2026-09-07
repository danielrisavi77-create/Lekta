# Wordova polja: sadržaj, popisi prikaza, unakrsne reference

Pravilo iznad svih: **ono što Word može izračunati, Word i računa.** Ručno prepisan broj
stranice ili broj tablice zastari pri prvoj izmjeni, i to tiho.

---

## Koje polje za što

| Zadatak | Polje | Napomena |
|---|---|---|
| Sadržaj | `TOC \o "1-2" \h \z \u` | razine 1–2; prednji dio ne smije biti Heading |
| Popis tablica | `TOC \h \z \c "Tablica"` | veže se na identifikator `SEQ`, ne na tekst |
| Popis grafikona | `TOC \h \z \c "Grafikon"` | zato su to **dva** naslova prve razine |
| Broj prikaza u natpisu | `SEQ Tablica \* ARABIC` | automatska numeracija |
| Upućivanje u tekstu | `REF <zabilješka> \h` | v. deklinacija niže |
| Stranica prikaza | `PAGEREF <zabilješka> \h` | za popise i za „v. str." |
| Broj stranice u podnožju | `PAGE` | po sekciji |

Uz to, u `word/settings.xml` obavezno:

```xml
<w:updateFields w:val="true"/>
```

Bez toga polja u Wordu stoje kao `[Update Field]` dok ih netko ručno ne osvježi.

---

## Unakrsne reference i hrvatska deklinacija

Wordova unakrsna referenca vraća sadržaj zabilješke, a **ne zna deklinirati**. Ako
zabilješka obuhvaća „Tablica 3", u lokativu izlazi „u Tablica 3." — negramatično.

**Rješenje: zabilješka obuhvaća samo broj.**

```
natpis:  "Tablica " + ⟦zabilješka tablica3: "3"⟧ + ". Razredi vjerojatnosti…"
tekst:   "…kako je prikazano u tablici " + ⟦REF tablica3⟧ + "."
```

Time „u tablici 3.", „iz tablice 3.", „tablicama 3. i 4." svi ostaju ispravni, jer se
riječ piše kao tekst, a polje daje samo brojku.

Ako se koristi `SEQ` za numeraciju, zabilješka obuhvaća polje `SEQ`, pa i numeracija i
upućivanje ostaju automatski.

**Ograničenje:** polje ubačeno kao `fldSimple` ne nosi svojstva runa i renderira se u
zadanom oblikovanju. Zato reference idu samo u tekst, nikad u kurzivni redak „Izvor:" ni u
natpis. Vidi `zamke.md`, kvar 4.

---

## Dvije varijante iz istog izvora

**LibreOffice ne popunjava `TOC` pri `--convert-to pdf`.** Posljedica nije kozmetička: bez
popunjenog sadržaja ne može se izmjeriti ni paginacija ni ispravnost brojeva, pa je svaka
vizualna provjera slijepa. Makro se zabija (`zamke.md`, kvar 3).

Zato izgradnja proizvodi dvije datoteke iz istog rukopisa:

| | predajna | `_pregled.docx` |
|---|---|---|
| sadržaj | živo polje `TOC` | statičan popis s izmjerenim brojevima |
| namjena | mentoru | mjerenje prijeloma + PDF za oko |
| prekidač | zadano | `SADRZAJ=staticni` |

**Assert koji se ne preskače:**

```python
if stranica(predajna) != stranica(pregled):
    sys.exit("❌ različit broj stranica — brojevi u sadržaju ne bi valjali")
```

Razlog: statični popis smije zauzeti **točno onoliko stranica** koliko i prazno polje.
Ako se prelije na drugu stranicu, cijela paginacija se pomakne za jedan i svi izmjereni
brojevi su pogrešni. Assert to hvata odmah.

Statični popis se stoga drži na jednoj stranici: samo razine 1–2, prored 1,0, veličina
11–11,5 pt.

---

## Numeracija stranica po sekcijama

Zahtjev „brojevi kreću od Uvoda" znači **dvije sekcije**:

| Sekcija | Sadrži | Podnožje | `pgNumType` |
|---|---|---|---|
| 1 | naslovnica, sadržaj, sažetak, summary | **nema** | — |
| 2 | uvod → popis prikaza | `PAGE` | `w:start="1"` |

Provjera je strojna, jer se lako pokvari:

```python
sekcije = re.findall(r"<w:sectPr.*?</w:sectPr>", document_xml, re.S)
assert len(sekcije) == 2
assert "footerReference" not in sekcije[0]      # prednji dio nije numeriran
assert 'w:pgNumType w:start="1"' in sekcije[1]  # tijelo kreće od 1
assert "footerReference" in sekcije[1]
```

Alternativa koju neki fakulteti propisuju — rimski brojevi u prednjem dijelu, arapski od
Uvoda — mijenja samo `pgNumType` prve sekcije (`w:fmt="lowerRoman"`), ne strukturu.

**Posljedica za sadržaj:** naslovi u nenumeriranoj sekciji ne smiju biti `Heading 1/2`,
inače u sadržaju dobiju stranicu koja ne postoji. Koristi se izgledom jednak stil bez
`outlineLvl`. Vidi `zamke.md`, kvar 6.

---

## Provjera uravnoteženosti polja

Nedovršeno polje (`begin` bez `end`) Word prikaže kao sirovi tekst instrukcije. Broji se u
`document.xml`:

```python
b = len(re.findall(r'w:fldCharType="begin"', dxml))
e = len(re.findall(r'w:fldCharType="end"',   dxml))
assert b == e, f"neuravnotežena polja: {b} begin, {e} end"
```

Uz to, na svaku zabilješku prikaza treba postojati barem jedna referenca, i obrnuto —
referenca na nepostojeću zabilješku u Wordu daje `Error! Reference source not found.`

```python
zabiljeske = set(re.findall(r'w:bookmarkStart[^>]*w:name="((?:tablica|grafikon)\d+)"', dxml))
reference  = set(re.findall(r'REF ((?:tablica|grafikon)\d+)', dxml))
assert not (reference - zabiljeske), f"referenca bez zabilješke: {reference - zabiljeske}"
```

---

## Sadržaj kao polje sa spremljenim rezultatom

Ključ za assert „obje varijante imaju isti broj stranica" nije da su varijante slične nego
da im je **sadržaj jednake dužine**. Polje `TOC` u OOXML-u ima spremljeni rezultat, i on se
piše ručno — Word ga prikazuje dok ga ne osvježi, a LibreOffice **samo njega** i renderira:

```
w:p[1]  fldChar begin · instrText ` TOC \o "1-2" \h \z \u ` · fldChar separate · „1. Uvod⇥1"
w:p[2]  „2. Teorijsko-konceptualni okvir⇥4"
…
w:p[N]  „Literatura⇥48" · fldChar end
```

Polje **prelazi preko odlomaka**: `begin` je u prvom, `end` u zadnjem. To Word i sam radi.
Statična varijanta su isti odlomci bez triju polja-runova.

```bash
python3 scripts/sadrzaj.py rad.docx --toc toc.json --oblik staticni   # mjerenje
python3 scripts/sadrzaj.py rad.docx --toc toc.json --oblik zivi       # predaja
```

Dvije stvari koje se pri tome lako promaše, obje zapisane u `zamke.md`:

- novi odlomci idu **ispred** nosača, jer nosač obično drži prijelom sekcije (kvar 17)
- `updateFields` postavlja se **samo** u živoj varijanti; u statičnoj bi bio besmislen


---

## Sadržaj: `w:sdt` omotač i zašto se emitira odmah

Word pravi sadržaj drži unutar strukturiranog dijela dokumenta:

```xml
<w:sdt>
  <w:sdtPr><w:docPartObj>
    <w:docPartGallery w:val="Table of Contents"/><w:docPartUnique/>
  </w:docPartObj></w:sdtPr>
  <w:sdtContent>
    …odlomci TOC1/TOC2 s w:hyperlink i PAGEREF poljima…
  </w:sdtContent>
</w:sdt>
```

Generator koji izostavi omotač i dalje proizvodi ispravan TOC — Word ga prihvaća i pri prvom
otvaranju **sam ga omota**. Provjereno: dokument predan bez `w:sdt` vratio se iz Worda s
`docPartGallery="Table of Contents"` i netaknutim unosima.

Praktična posljedica: dokument prije i poslije otvaranja u Wordu nisu bajt-jednaki, pa svaka
provjera koja uspoređuje generirani i vraćeni paket prijavljuje lažnu razliku. Zato se omotač
emitira odmah.

### Jedan unos sadržaja, potpuna struktura

```
w:p (pStyle TOC1|TOC2, tabs: right + dot leader na širinu teksta)
  └ w:hyperlink w:anchor="_TocNNN" w:history="1"
      ├ w:r (rStyle Hyperlink)  → tekst naslova
      ├ w:r (webHidden)         → w:tab
      ├ w:r (webHidden)         → fldChar begin
      ├ w:r (webHidden)         → instrText „ PAGEREF _TocNNN \h "
      ├ w:r (webHidden)         → fldChar separate
      ├ w:r (webHidden)         → w:t s POHRANJENIM brojem stranice
      └ w:r (webHidden)         → fldChar end
```

Polje `TOC` (begin/instrText/separate) stoji u **prvom** unosu, `fldChar end` u **zadnjem**.
Knjižna oznaka `_TocNNN` ide oko teksta naslova u tijelu rada.

**Stilovi `TOC1`–`TOC3` i `TableofFigures` ne smiju nositi `w:customStyle="1"`.** Taj atribut
kaže potrošaču da to nije ugrađeni stil, pa Word pri osvježavanju polja primjenjuje vlastite
zadane stilove i pomno postavljeni font, prored i tabulator otpadaju. Vezanje na ugrađeni stil
ide preko `w:name` („toc 1", „table of figures"), ne preko `w:styleId`.
