# Prikazi: natpis, prikaz i izvor kao nedjeljiv blok

Hrvatska fakultetska pravila u pravilu traže: **natpis iznad prikaza, izvor ispod, sve
numerirano, i prikaz se ne lomi preko stranica.** Zadnje se ne rješava jednim potezom.

---

## Blok je jedinica, ne tablica

```
┌─ natpis      Tablica 3. Razredi vjerojatnosti…      keepNext, keepLines
├─ prikaz      ⟦tablica ili slika⟧                    cantSplit, keepNext u svim ćelijama
└─ izvor       Izvor: sistematizacija autorice.       keepLines
```

Sva tri dijela idu na istu stranicu ili nijedan. Iz toga slijedi da se blok tretira kao
jedan objekt u svim koracima — u pisanju, u mjerenju i u provjeri.

---

## Dvije razine, jer nijedna sama nije dovoljna

### Deklarativna

| Element | Svojstvo | Zašto |
|---|---|---|
| natpis | `keepNext` + `keepLines` | drži natpis uz prikaz i ne lomi ga na dva retka |
| svaki red tablice | `cantSplit` | red se ne lomi preko stranica |
| **svaka ćelija** | `keepNext` | ovo drži tablicu uz **redak s izvorom** |
| odlomak sa slikom | `keepNext` + `keepLines` | isto, za slike |
| izvor | `keepLines` | ne lomi se |

`keepNext` na ćelijama **zadnjeg reda** je ono što veže tablicu s izvorom. Bez toga izvor
ostane sam na sljedećoj stranici, što je najčešći oblik ovog kvara.

### Mjerena

Deklaracija je Wordu **preporuka**. Ako blok ne stane u ostatak stranice, Word ju
prekrši. Zato se nakon izgradnje mjeri, pa se pred blok koji se ipak prelomio umeće
prijelom stranice.

```python
prelomi = []                      # ključevi blokova pred kojima ide prijelom
for blok in blokovi:
    s1 = stranica_natpisa(blok)
    s2 = stranica_prvog_izvora_nakon(blok)
    if s1 != s2:
        prelomi.append(blok["kljuc"])
```

`prelomi.json` ulazi u sljedeći krug izgradnje. **Zato je potrebna petlja, ne dva
prolaza:** umetanje prijeloma mijenja paginaciju svega ispod, pa i sljedeći blok može
ispasti prelomljen.

---

## Detekcija bez oslanjanja na jedinstvenost teksta

Redaka „Izvor:" ima onoliko koliko i prikaza, pa nisu jedinstveni. Natpis jest. Postupak:

1. spoji tekst svih stranica PDF-a uz zabilježene granice `(od, do, broj_stranice)`
2. nađi natpis (prvih ~70 znakova, normalizirani razmaci)
3. nađi **prvi** `„Izvor:"` **nakon** te pozicije
4. preslikaj oba pomaka u brojeve stranica

Normalizacija razmaka je obavezna jer `pdftotext -layout` ubacuje razmake i prelome
prema stupcima.

---

## Cijena koju treba deklarirati

Blok koji ne stane ostavlja **poluprazu stranicu** prije sebe. To je posljedica pravila, a
ne greška, i korisniku se kaže unaprijed. Alternative kad je praznina prevelika:

- suziti prikaz (uži stupci, manje pismo natpisa) da uđe u ostatak stranice
- premjestiti odlomak koji uvodi prikaz **ispod** njega
- za tablicu preko pola stranice: dopustiti lomljenje uz **ponavljanje zaglavlja**
  (`tableHeader` na prvom redu), ako to pravila fakulteta dopuštaju

Treća opcija je jedini ispravan izlaz za tablicu koja objektivno ne stane na jednu
stranicu. Tada se izrijekom bilježi kao odstupanje.

---

## Numeracija i popisi

Broj u natpisu je polje `SEQ`, ne prepisan broj, pa umetanje nove tablice u sredinu
preslaže sve ostale. Popisi prikaza su polja `TOC \c "Tablica"`, pa se generiraju sami.

Iz toga slijedi da **popis prikaza nikad nije rukom pisan**. Ako ga alat gradi, gradi ga iz
stvarnih natpisa, ne iz odvojenog popisa koji može zastariti:

```python
popis = [b["natpis"] for b in blokovi if b["natpis"].startswith("Tablica")]
```

---

## Širina i mjerilo slika

Slika se umeće u **zadanoj širini iz profila** (tipično širina teksta), a visina se
izvodi iz stvarnih piksela, da se ne razvuče:

```python
w_px, h_px = Image.open(put).size
visina_cm = sirina_cm * h_px / w_px
```

Ako se koristi `bbox_inches="tight"` pri izvozu grafikona, konačne dimenzije **nisu** one
zadane u `figsize`, pa se moraju pročitati iz gotovog PNG-a i zapisati (`grafikoni.json`).
Umetanje po `figsize` daje pogrešan omjer.

Pismo u grafikonu izlazi u pravoj veličini samo ako je PNG umetnut **1:1** — širina u
inčima pri izvozu jednaka širini umetanja. Grafikon izvezen na 6,1 in i umetnut na 15,5 cm
(= 6,1 in) prikazuje pismo od 9 pt kao 9 pt. Svako skaliranje mijenja i veličinu pisma.
