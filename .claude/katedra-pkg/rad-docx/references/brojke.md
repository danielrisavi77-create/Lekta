# Brojke: jedan izvor istine

Nastalo iz stvarnog kvara. Tablica očekivanoga godišnjeg gubitka napisana je prije
neovisnog izračuna. Kad je izračun napisan, **dvije vrijednosti u tablici bile su
matematički pogrešne**, a udjeli su se razlikovali u prvoj decimali. Rad je do tada bio
„gotov" i prošao vizualnu provjeru.

---

## Lanac

```
model.py  ──►  model.json  ──►  rukopis ({{model.kljuc}})
                          ├──►  tablice
                          └──►  grafikoni
```

`model.py` definira **ulazne pretpostavke** i **izvodi** sve ostalo. Nijedna izvedena
vrijednost ne postoji nigdje drugdje. Promjena jedne pretpostavke prolazi kroz cijeli
dokument u jednom prolazu.

Minimalni oblik:

```python
PRIHOD = 140.0          # ulazna pretpostavka — samo ovakve stoje kao literal
RADNI_DANI = 250
DNEVNI = PRIHOD / RADNI_DANI          # izvedeno, nikad prepisano

def izracun():
    ...
    return {"dnevni_prihod": r2(DNEVNI), "struktura": [...], ...}

if __name__ == "__main__":
    json.dump(izracun(), open("model.json", "w"), ensure_ascii=False, indent=1)
```

U rukopisu se piše `{{model.dnevni_prihod}}`, nikad `0,56`.

---

## Osnovica zaokruživanja — zamka koju recenzent nađe u dvije minute

Udio izračunan iz **punih** vrijednosti ne poklapa se s onim što čitatelj dobije dijeljenjem
brojki **iz tablice**.

```
puni iznosi:      2,156 / 6,856 = 31,4 %
prikazane brojke: 2,16  / 6,86  = 31,5 %   ← ovo čitatelj izračuna
```

**Pravilo:** svaki izvedeni udio i zbroj računa se iz **prikazanih** (zaokruženih)
vrijednosti.

```python
udio = round(r2(komponenta) / r2(ukupno) * 100, 1)
```

Isto za zbroj stupca: prikaži zbroj **zaokruženih** doprinosa, ne točan zbroj. Stupac koji
se ne može provjeriti sabiranjem izgleda kao greška čak i kad je točniji.

```python
ukupno_prikazano = r3(sum(r3(f * r2(g)) for f, g in scenariji))   # 1,816
# točna vrijednost je 1,8151 — ali nju nitko ne može provjeriti iz tablice
```

Ako se razlika ne može izbjeći, **navedi je u izvoru pod tablicom**: „razlika u trećoj
decimali posljedica je zaokruživanja prikazanih doprinosa".

---

## Neovisna provjera aritmetike

Model se ne provjerava čitanjem. Ponovi izračun drugim putem i usporedi:

- ručno, na papiru, za jedan scenarij — hvata pogrešnu formulu
- u tablici (`.xlsx`) s **formulama**, ne s upisanim rezultatima — hvata pogrešnu osnovicu
  i daje prilog kojim se rezultat može pokazati na obrani
- za empirijski rad: `replikacija-pspp`

Tablica s formulama je jeftina i dvostruko korisna: `=B7/B$14` u proračunskoj tablici
pokazuje **koja** je osnovica upotrijebljena, što je najčešće mjesto pogreške.

---

## Crna lista zastarjelih vrijednosti

Nakon svake promjene brojki dokument se pretražuje za **starima**. Pola ažuriranog
dokumenta gore je od neažuriranog, jer izgleda točno.

```python
def zastarjele(stari_model, novi_model):
    """Vrijednosti koje su se promijenile — ako ijedna ostane u tekstu, to je greška."""
    crna = {}
    for kljuc, staro in ravno(stari_model).items():
        novo = ravno(novi_model).get(kljuc)
        if novo is not None and staro != novo:
            crna[hr(staro)] = f"stara vrijednost {kljuc} (sada {hr(novo)})"
    return crna
```

Popis se **generira iz razlike dvaju `model.json`**, ne piše rukom. Uz brojke, na listu
idu i riječima izražene vrijednosti („dvadeset pet puta", „46 posto"), jer se one pri
izmjeni najlakše zaboravljaju.

Zato `model.json` treba biti u gitu uz rad: bez prethodne verzije nema razlike.

---

## Komponente zadatka — provjera protiv upute, ne protiv kućnog stila

Formalna pravila fakulteta i **zadatak predmeta** dvije su različite stvari. Rad koji
prođe sve formalne provjere a izostavi ono što uputa izrijekom traži — pada na sadržaju.

Uputa u pravilu ima popis koji „se ne može izostaviti". On se prepiše u `zadatak.json`:

```json
{
  "predmet": "Upravljanje poslovnim rizicima",
  "izvor_upute": "uputa nositelja predmeta, listopad 2022.",
  "komponente": [
    { "naziv": "kvantitativna analiza rizika",
      "igle": ["KVANTITATIVNA ANALIZA", "kvantitativna analiza"] },
    { "naziv": "osiguranje",
      "igle": ["OSIGURANJE I PRIJENOS RIZIKA", "polica osiguranja"] },
    { "naziv": "kontrola provođenja",
      "igle": ["KONTROLA PROVOĐENJA", "katalog kontrola"] },
    { "naziv": "obvezna literatura kolegija", "igle": ["Andrijanić"] }
  ]
}
```

Provjera je trivijalna, a hvata najtežu vrstu propusta:

```python
for k in zadatak["komponente"]:
    if not any(igla in tekst for igla in k["igle"]):
        greska(f"zadatak traži, a u radu nema: {k['naziv']}")
```

Popis se izvlači u modu planiranja, dok je uputa pred očima, a provjerava se u modu
predaje. Između njih prođu tjedni i uputa se zaboravi — zato je zapisana, ne
zapamćena.

---

## Lokatori: stranica, poglavlje, odjeljak

**Broj stranice koji nije viđen u izvoru ne upisuje se. Nikad.** Izostavljen lokator je
sitna zamjerka; izmišljen je pitanje poštenja.

Kad stranica nije dostupna, postoji stupnjevanje — i **bolje je istražiti niži lokator
nego ostaviti oznaku `[PROVJERI STR.]`**:

| Vrsta izvora | Lokator |
|---|---|
| paginirani PDF, knjiga s dostupnim izdanjem | **broj stranice** |
| knjiga bez javno provjerljive paginacije | **broj poglavlja** — naslovi poglavlja provjeravaju se kod izdavača ili u katalogu |
| mrežni izvor bez paginacije | **naziv odjeljka** |
| propis | **članak, stavak, točka** (u bilješci) |

Poglavlje kao lokator ima dodatnu korist: pokazuje da su poglavlja izvora preslikana na
poglavlja rada, što je često i sam zahtjev upute („obradi sve aspekte udžbenikom").

Politika se **deklarira u uvodu rada**, u jednoj rečenici, pa mješovito citiranje prestaje
izgledati kao nedosljednost.
