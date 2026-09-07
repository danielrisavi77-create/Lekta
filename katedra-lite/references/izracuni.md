# IZRAČUNI — izbor formule, ne aritmetika

> Alat je `scripts/provjeri_izracune.py`. Aritmetiku pokrivaju pravilo 13
> (`model.json`), `rad-docx/references/brojke.md` i `replikacija-pspp`.

## Zašto postoji

Ostala je jedna kategorija koju nitko nije hvatao: **brojka je aritmetički točna, a
formula kriva.** Takva pogreška prođe svaku postojeću provjeru, jer nijedan zbroj nije
pogrešan — pogrešno je što je zbrojeno.

## Šest pogrešaka i test za svaku

| Pogreška | Test |
|---|---|
| **postotak umjesto postotnog boda** | uspoređuju li se dva udjela? Razlika je u **postotnim bodovima**. „S 20 % na 24 %” je +4 postotna boda, a +20 % relativno. Oboje je točno i znači različito. |
| **osnovica rasta** | u odnosu na koju godinu? 2019. ili 2020. mijenja predznak nalaza za cijelo pandemijsko razdoblje. Osnovica se **piše**, ne podrazumijeva. |
| **udjeli koji ne daju 100** | zbroji prikazani stupac. Ako ne daje 100, zaokruživanje je rađeno na krivoj osnovici (v. `brojke.md`). |
| **CAGR naspram prosječne godišnje stope** | aritmetički prosjek godišnjih stopa ≠ složena stopa. Za +50 % pa −50 % prosjek je 0 %, a CAGR −13,4 %. Napiši koju si upotrijebio. |
| **bazni naspram lančanog indeksa** | dva različita broja pod istim imenom. Indeks bez oznake nije podatak nego zagonetka. |
| **nominalno naspram realnog** | rast novčane veličine bez deflacioniranja dijelom je inflacija. Za razdoblje s inflacijom iznad 5 % to mijenja nalaz. |

## Uporaba

```bash
python3 <KATEDRA_SKILL>/scripts/provjeri_izracune.py ./rad.docx \
    --model ./.katedra/model.json --json ./.katedra/izracuni.json
```

❌ dobiva samo ono što se ne da drukčije protumačiti: razlika dviju stopa izražena u
postocima, i udjeli koji ne daju sto. Sve ostalo je ⚠️ — traži da se **deklarira**
osnovica, vrsta indeksa ili je li rast realan, jer alat ne zna koji je pokazatelj
trebao biti upotrijebljen.

## Granice

- Ne provjerava je li broj točno izračunat — to je `model.py` i `replikacija-pspp`.
- Ne zna koji je pokazatelj primjeren temi. To traži poznavanje područja.
- Radi nad **prozom i tablicama**; grafikon je slika i u njega ne vidi.
