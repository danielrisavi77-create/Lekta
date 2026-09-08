# Prikazi: sustav, a ne ukras

Redoslijed je uvijek isti: **forma → posao boje → provjera validatorom → oznake →
render pa pogledaj**. Boja ide pretposljednja. Većina loših prikaza počne od boje.

Za opću metodu vrijedi skill `dataviz`. Ovdje su odluke specifične za tiskani
diplomski rad.

---

## Paleta: tihi tisak s jednim naglaskom

```python
SURFACE   = "#ffffff"   # papir
INK       = "#111111"   # osi, brojevi
INK_SOFT  = "#55524d"   # sporedni tekst
GRID      = "#e7e4de"   # mreža, jedva vidljiva

NAGLASAK  = "#7c1f2e"   # bordo — nosi nalaz
NAGL_SVIJ = "#b06a74"
GRAFIT    = "#25262a"
SIVA      = "#8f8a82"
SIVA_SVIJ = "#e0dbd3"
PLAVA     = "#2f4a5c"   # hladni pol divergentne skale
PLAVA_SVIJ= "#7f97a8"
```

**Podloga je bijela kao papir.** Obojena podloga u tiskanom radu pravi pravokutnik
koji lebdi na stranici. Bijela se stapa. Krem tonovi tipa `#fcfcfb` su k tome
prepoznatljiv trag generiranog predloška.

**Bordo se pojavljuje samo ondje gdje je nalaz.** Ne kao ukras, ne na svakom
prikazu jednako. Na prikazu izvora bordo su institucije, jer je poanta da su na
dnu. Na prikazu znanja bordo je točan odgovor. Ostalo je grafit i siva.

## Provjera palete se pokreće, ne procjenjuje

```
node dataviz/scripts/validate_palette.js "#7c1f2e,#e0dbd3,#8f8a82" --mode light
```

Za tiskani rad presudne su **dvije** provjere:

| Provjera | Prag | Zašto |
|---|---|---|
| Normal-vision floor | ΔE ≥ 15 | ispod toga ni čitatelj s punim vidom ne razlikuje par |
| CVD separation | ΔE ≥ 8 | daltonizam |

Palete ovog sustava prolaze obje s velikom rezervom (ΔE 21–34).

**Lightness band i chroma floor namjerno padaju.** Te su provjere kalibrirane za
šarene palete na ekranu. Gotovo bezbojna tiskana paleta pada na njima po definiciji
— to je smisao stila, ne greška. Contrast WARN traži „relief": vidljive oznake
vrijednosti, koje ovdje postoje na svakom stupcu.

## Forma po poslu

| Podaci | Forma | Boja |
|---|---|---|
| magnituda po kategorijama | vodoravni stupci, sortirano | jedan ton; naglasak na skupini koja nosi nalaz |
| dio cjeline po stavkama | slagani stupci do 100 % | naglasak + dva neutrala |
| Likertova ljestvica | **divergentno**, centrirano na neutralnu sredinu | bordo ↔ hladna plava, siva sredina |
| koeficijent uz interval | forest plot | boja **i oblik biljega** po ishodu |
| uređene kategorije | stupci | ordinalni ramp jednog tona, svjetlije → tamnije |

**Divergentni prikaz.** Sredina mora čitati kao „ništa", polovi kao suprotnosti.
Dva hladna tona ne rade. Lijeva strana **nije negativan broj** nego udio neslaganja,
pa oznake na osi idu bez predznaka.

**Forest plot dobiva i oblik biljega** (puni kružić / romb / križić) uz boju. Boja
ne smije biti jedini nositelj informacije.

## Zamke koje su se doista dogodile

**Formatter pregazi ručno postavljene oznake osi.** Ako se hrvatski decimalni
formatter primijeni nakon `set_xticklabels`, oznake se preračunaju iz vrijednosti i
predznak se vrati. Rješenje: vlastiti formatter s `abs()` i zastavica koja spremanju
kaže da tu os ne dira.

**Formatter na tekstualnoj osi.** Isti formatter primijenjen na os s nazivima
kategorija zamijeni ih rednim brojevima. Prije primjene provjeri jesu li sve oznake
brojčane.

**Mrtav prostor na osi.** Granice postavljene „za svaki slučaj" šire nego što podaci
sežu ostave četvrtinu širine praznu. Granice se računaju iz podataka.

**Bijeli tekst na svijetlom stupcu.** Kod ordinalnog rampa boja oznake mora se birati
prema svjetlini stupca:

```python
r_, g_, b_ = stupac.get_facecolor()[:3]
svjetlina = 0.2126*r_ + 0.7152*g_ + 0.0722*b_
boja = "#ffffff" if svjetlina < 0.45 else INK
```

**Predug natpis.** Natpis koji se u popisu prikaza lomi u dva retka razvuče
obostrano poravnanje. Skratiti natpis, ne mijenjati poravnanje.

## Tehnički zahtjevi

| Stavka | Vrijednost |
|---|---|
| Rezolucija | **600 dpi** |
| Font | Liberation Serif — metrički istovjetan Times New Romanu |
| Širina u dokumentu | 15,5 cm |
| Osi | tanke crne (0,7 pt), vanjske crtice **samo na brojčanoj osi** |
| Mreža | samo na osi s koje se vrijednost očitava, `#e7e4de` |
| Legenda | za ≥ 2 niza uvijek; bez okvira |
| Oznake vrijednosti | izravno na stupcu, ne na svakoj točki linije |

Crtice na osi s tekstualnim oznakama su šum i uklanjaju se.
