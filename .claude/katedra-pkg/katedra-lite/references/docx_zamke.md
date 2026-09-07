# Zamke .docx i grafikona — što ruši dokument, a ne vidi se iz koda

Nastalo iz audita rada Znahor (5. 9. 2026.). Sve četiri zamke srušile su ili
iskrivile stvarni dokument, i nijedna nije bila vidljiva iz koda koji ju uzrokuje.
Ovo nije popis dobrih praksi nego popis stvari koje su se dogodile.

---

## 1. `python-docx`: identitet odlomka se ne provjerava s `is`

`doc.paragraphs` gradi **nove** `Paragraph` omotače pri svakom pristupu. Zato

```python
if p is sadrzaj:      # NIKAD nije istina
    continue
```

nikad ne pogodi, a kod pisan da nešto **preskoči** obriše sve. U stvarnoj sesiji
to je obrisalo **svih 489 odlomaka** dokumenta. To je najskuplja pojedinačna
greška te sesije.

Ispravno:

```python
odlomci = list(doc.paragraphs)     # jedan snimak, ne ponovni pristup
if p._p is sadrzaj._p:             # usporedba XML elemenata
    continue
```

Vrijedi za `build_docx.py`, `prikazi.py` i `sadrzaj.py` — svi rade nad istim
modelom, pa je zamka zajednička.

---

## 2. Izvoz grafikona mora biti 1:1 sa širinom umetanja

`figsize` u inčima = širina umetanja u inčima, uvijek.

Uzrok je neintuitivan: pismo u grafikonu skalira se **zajedno sa slikom**. Pismo
od 8 pt izvezeno na 10 in i umetnuto na 6,3 in izlazi kao 5 pt, i to se u
dokumentu vidi tek kad je prekasno.

`provjeri_prikaze.py` ovo već mjeri i upozorava; to je jedina od četiri zamke koju
paket pokriva alatom.

---

## 3. `matplotlib`, polarna os: kutovi ≥ 2π sažimaju krug u isječak

`ax.set_xticks()` s kutovima koji nisu svedeni u `[0, 2π)` proširuje kutne granice
osi, pa se ružica nacrta kao četvrtina kruga. Nema ni greške ni upozorenja, samo
krivi grafikon.

```python
ax.set_xticks(kutovi % (2 * np.pi))
```

---

## 4. `matplotlib` odsijeca sadržaj tiho

Legenda ili naslov osi dulji od platna izlaze izvan njega bez ijednog upozorenja.
Na stvarnom radu je „zeleno: unutar sigurnog prostora" u dokumentu glasilo
„zeleno: unutar sigurnog pros".

Uvijek `savefig(..., bbox_inches="tight")` ili izmjeren `subplots_adjust`.
Od v1.9.5 `provjeri_prikaze.py` ovo hvata (nalaz „sadržaj dodiruje rub platna");
prije toga nije ga hvatao nijedan alat u lancu, ni ovdje ni u rad-auditu.

---

## 5. Širina tablice u Wordu

Tablica bez `w:tblLayout w:type="fixed"` i bez eksplicitnog `w:tblW` širi se preko
margine čim sadržaj to zatraži. Postavlja se oboje, ne jedno.

---

## 6. Mrtvi medijski dijelovi

Zamjena slike novim grafikonom ostavlja stari PNG u `word/media/`: relacija ostaje
u `document.xml.rels`, a `document.xml` je više ne referencira. Na stvarnom radu
to je bilo **749 kB, 49 % datoteke**.

Nije samo težina. U mrtvom dijelu ostaje **stara verzija grafikona**, dostupna
svakome tko raspakira .docx — što za rad koji ide na provjeru podudarnosti i u
repozitorij nije higijena nego sadržaj.

`inventar_paketa.mrtvi_mediji()` ih nalazi, `priprema_slanja.py` ih uklanja.
Uklanjanje ide u **zasebnu izlaznu datoteku**: arhivska verzija ostaje netaknuta.

## 7. `python-docx`: `add_section()` vraća sekciju nad sentinel `sectPr`-om

`s2 = d.add_section(); …; s3 = d.add_section()` — `s2` i `s3` omataju ISTI element:
`add_section()` klonira zadnji (sentinel) `sectPr` u odlomak i vraća sekciju nad
sentinelom, koji nakon sljedećeg poziva postane zadnja sekcija. Sve što se poslije
upiše u `s2` (numeracija, podnožje) završi u ZADNJOJ sekciji. Nađeno pri ograđivanju
kvara 100: fixture „restart u srednjoj sekciji” imao je restart u prilogu, a mutacija
je preživjela. Sekcije se uzimaju po indeksu **nakon** što su sve dodane:
`d.sections[1]`.

