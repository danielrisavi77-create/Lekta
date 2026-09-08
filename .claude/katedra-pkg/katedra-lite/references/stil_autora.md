# STIL AUTORA — što autor svaki put popravi za nama

## Čemu služi

Motor piše korektno, ali ne piše kao autor. Razlika se vidi tek kad rad dođe natrag: autor
je otvorio Word i napravio nekoliko sitnih zahvata. Ti zahvati nisu slučajni — idu u istom
smjeru i ponavljaju se iz rada u rad.

Dosad ih Katedra nije imala gdje zapamtiti, pa je svaki sljedeći rad izlazio s istim
konstrukcijama koje je autor prošli put brisao. Ovo je datoteka koja to pamti.

**Put:** `.katedra/stil_autora.json` (po autoru, ne po radu — preživljava rad)

## Kako nastaje

Ne popunjava se anketom. Popunjava se iz **stvarnih izmjena**:

```
python3 rad-docx/scripts/provjeri_povratak.py IZVORNI.docx VRACENI.docx
```

Alat razdvaja dvije vrste razlika:

| Vrsta | Primjer | Što s njom |
|---|---|---|
| **regresija** | `133–150` → `133-150` | vrati; autor je pogriješio, javi mu |
| **glas** | „Ostaje, doduše, pitanje" → „Ostaje pitanje" | zapamti; autor je u pravu, mi smo pisali njemu strano |

Granica je jednostavna: regresija krši citatni stil ili pravopis, glas ne krši ništa nego
bira drukčije. Kad nije jasno, pitaj autora jednom i upiši odgovor.

## Oblik zapisa

```json
{
  "autor": "ime i prezime",
  "zabiljezeno": "2026-08-25",
  "izbjegavaj": {
    "ograde": ["doduše", "svakako", "zapravo"],
    "konstrukcije": [
      {
        "uzorak": "apozicija između dviju en crtica",
        "primjer": "na pet sektora – vojni, politički … okolišni – od kojih",
        "umjesto": "na pet sektora: vojni, politički … i okolišni. Svaki od njih…",
        "zasto": "autor ju je zamijenio dvotočkom i time nehotice uveo pogrešku"
      }
    ]
  },
  "prednji_dio": {
    "ne_dodavaj": ["Kolegij:"],
    "napomena": "autor je redak obrisao; ne izmišljaj polja kojih nema u profilu ni u uzorku"
  },
  "potvrdene_regresije": [
    {"vrsta": "raspon stranica sa spojnicom", "odluka": "vracamo", "objasnjeno_autoru": true}
  ]
}
```

## Kada se čita

* **Mod 1 (plan)** — ništa, plan nema prozu.
* **Mod 2 (pisanje)** — prije prve rečenice. Popis `izbjegavaj` ulazi u upute za pisanje
  poglavlja, jednako obvezujuće kao kućni stil.
* **Mod 3 (stil)** — prije prepravljanja; nema smisla „poboljšavati" tekst prema pravilu
  koje je autor već dvaput odbio.
* **Mod 6 (predaja)** — samo obavijest u izvještaju: koje su postavke primijenjene.
* **Mod 7 (povratak)** — ovdje se dopunjuje.

## Pravila

1. **Glas se ne pogađa.** U datoteku ide samo ono što je autor stvarno promijenio na
   vlastitom tekstu. Zaključivanje po dojmu („čini se da voli kraće rečenice") ne ide.
2. **Regresija se ne pamti kao glas.** Ako autor upiše spojnicu umjesto en crtice, to je
   pogreška citatnog stila i vraća se — ali mu se objasni jednom i zapiše u
   `potvrdene_regresije` da se objašnjenje ne ponavlja svaki put.
3. **Kućni stil fakulteta je jači.** Ako se glas autora sudara s Uputama, Upute pobjeđuju,
   a sudar se javi autoru izrijekom.
4. **Jedna datoteka po autoru.** Vanessin stil ne vrijedi za sljedećeg studenta.

## Zašto je ovo nastalo

Na eseju iz kolovoza 2026. autorica je napravila pet izmjena. Tri su bile tipografske
regresije, jedna je obrisala redak koji smo sami izmislili, a jedna je uklonila ogradu.

Bez ove datoteke sljedeći bi rad izišao s istim „doduše", istom apozicijom među crticama i
istim izmišljenim retkom na naslovnici — pa bi ih autorica opet brisala, i opet bi pritom
pokvarila nešto drugo. Zapamtiti pet stvari jeftinije je od tri regresije po radu.
