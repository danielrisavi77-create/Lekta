# Konfiguracija

Sve je u `replikacija.json`. Skripta ne zna ništa o pojedinom radu.

```json
{
  "naslov": "naslov rada, ide u zaglavlje sintakse",
  "baza": "podaci/baza.csv",
  "izlaz": "replikacija",
  "oznake":          { "FL": "Fin. pism. (0-8)" },
  "oznake_izvedene": { "RES1": "FL bez dobi" },
  "priprema": "REGRESSION ... SAVE OUTFILE='reziduali.sav'.",
  "analize":   [ ... ],
  "ocekivano": [ ... ],
  "prilog":    { ... }
}
```

## oznake i oznake_izvedene

`oznake` su varijable koje u bazi postoje; upisuju se odmah nakon učitavanja i
spremaju u `.sav`. `oznake_izvedene` su one koje nastaju tijekom analize
(reziduali, izračunate varijable) — one se **ne smiju** naći u početnom bloku
jer u tom trenutku ne postoje i PSPP javlja grešku. Služe samo za prepoznavanje
vrijednosti u ispisu.

Svaka riječ u oznaci najviše sedam znakova, inače je sučelje odsiječe.

## analize

Redoslijed u popisu je redoslijed u ispisu i u prilogu.

```json
{
  "ime": "05_korelacije",
  "natpis": "Korelacije indeksa financijske pismenosti s ostalim varijablama",
  "sirina": 1460,
  "sintaksa": "CORRELATIONS /VARIABLES=FL WITH planira dob /PRINT=TWOTAIL SIG.",
  "sintaksa_snimka": "GET FILE='reziduali.sav'.\nCORRELATIONS ...",
  "bez_snimke": false
}
```

`sirina` je širina prozora pri snimanju, u pikselima. Uže tablice trebaju uži
prozor, inače snimka nosi prazan prostor.

`sintaksa_snimka` postoji jer analiza u ispisu i analiza na snimci ne moraju
biti ista stvar. Parcijalne korelacije traže pet regresija koje u prilogu ništa
ne znače: one idu u `priprema`, a snima se samo tablica zbog koje se sve radi.

## ocekivano

Jedan redak po tvrdnji iz rada.

```json
{
  "oznaka": "H5a",
  "gdje": "4.5",
  "statistika": "F (ANOVA po obrazovanju)",
  "u_radu": "4,84",
  "naredba": "ONEWAY, uz filtar",
  "decimala": 2,
  "tolerancija": 0.01,
  "izvor": { "tip": "anova", "sto": "F" }
}
```

`decimala` je broj decimala na koliko se ispisuje dobivena vrijednost.
`tolerancija` se navodi samo iznimno; inače se računa iz grublje od dviju
zapisanih točnosti. Ako `u_radu` počinje znakom `<`, provjerava se je li
dobivena vrijednost manja.

### Tipovi izvora

| tip | polja | vraća |
|---|---|---|
| `deskriptiva` | `varijabla`, `stupac` (N, Mean, Std Dev, Minimum, Maximum) | ćeliju iz DESCRIPTIVES |
| `statistike` | `mjera` (Median…) | vrijednost iz FREQUENCIES /STATISTICS |
| `frekvencije` | `varijabla`, `vrijednost`, `stupac` (frekvencija, postotak, vazeci, kumulativno) | udio ili broj |
| `pouzdanost` | `redom` (koja je po redu RELIABILITY naredba) | Cronbachovu alfu |
| `korelacija` | `a`, `b`, `sto` (r, p, N) | koeficijent iz bilo koje tablice korelacija |
| `t_nezavisni` | `sto` (t, df, p, razlika), `welch` | redak Welchov ili Studentov |
| `t_upareni` | `sto`, `par` | iz PAIRED testa |
| `upareni_prosjek` | `varijabla`, `u_postotak` | prosjek iz uparenih statistika |
| `skupna` | `skupina`, `stupac` (N, M, SD) | iz Group Statistics |
| `cohen_d` | — | računa iz skupnih statistika, jer PSPP d ne ispisuje |
| `anova` | `sto` (F, p, df) | redak Between Groups |
| `komponente` | `sto` (broj, kumulativno, svojstvena), `redni`, `prag` | iz Total Variance Explained |

Svi tipovi primaju i `redom`, kad ista naredba u ispisu stoji više puta.

## prilog

Tekstovi i mjere za umetanje u dokument. Sve ima zadanu vrijednost, pa se
navodi samo ono što se mijenja.

```json
{
  "dokument": "rad.docx",
  "sidro": "Sažetak",
  "uvod_prilog2": ["odlomak", "odlomak"],
  "zakljucak_prilog2": "Od {ukupno} vrijednosti poklapa se {slaze}.",
  "uvod_prilog3": "odlomak",
  "sirina_teksta_cm": 15.92,
  "dpi_min": 200
}
```

Prilozi se umeću **ispred sidra**, dakle ispred odlomka čiji je tekst točno
`sidro`. `{ukupno}` i `{slaze}` popunjava skripta iz stvarne usporedbe, pa
brojka u tekstu ne može zastarjeti.
