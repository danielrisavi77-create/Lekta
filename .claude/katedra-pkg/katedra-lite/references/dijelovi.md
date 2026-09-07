# OS DIJELOVA — od čega se rad sastoji i tko što provjerava

> Modovi su os **vremena**: kad se što radi. Ovo je os **dokumenta**: od čega se rad
> sastoji. Registar je `references/dijelovi.json`, stanje rada `.katedra/dijelovi.json`,
> alat `scripts/dijelovi.py`.

## Zašto postoji

Do v1.3 pokrivenost je bila emergentna. Postojala je samo kao nuspojava toga koji je mod
odabran, pa nijedna datoteka nije mogla odgovoriti na dva pitanja koja student postavi
tjedan dana pred rok:

* *je li u radu sve što mora biti?*
* *što od toga nitko nije provjerio?*

Profil fakulteta ima `struktura.obavezni_dijelovi`, ali to je popis **imena za provjeru
prisutnosti u .docx-u**, a ne ugovor o proizvodnji. Tri fakulteta isti dio zovu trima
imenima („izjava o akademskoj čestitosti", „izjava o autorstvu", „naslovnica (vanjska)"),
a dijelovi kojih u profilu nema — rasprava, prilozi, izjava o korištenju AI alata,
unos u repozitorij — nisu postojali nigdje.

Posljedica je bila strukturna: **širenje pokrivenosti značilo je pisanje proze.** Svaki
novi uvid postajao je novi odlomak u referenci moda, pa je `SKILL.md` narastao na osamnaest
željeznih pravila. Registar to zaustavlja: novi dio je jedan zapis u JSON-u.

## Tri razine provjere

| Razina | Znači | Što s njom |
|---|---|---|
| 🔧 `strojno` | postoji naredba koja vraća izlazni kod | pokreni ju; `gate.py` to radi umjesto tebe |
| 👁 `rucno` | alat ne može zaključiti iz teksta | postupak je u registru, u polju `provjera.kako` |
| ❗ `nepokriveno` | **nitko ovaj dio ne provjerava** | ide u tablicu RUČNO PROVJERI, uvijek |

Treća razina nije propust nego **deklarirana granica**. Željezno pravilo 8 traži da se
granica kaže; registar je oblik u kojem se to može prebrojati umjesto obećati.

## Kako se koristi

**Mod 1 — zasij, čim je profil razriješen.**

```bash
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --sij \
    --profil ./.katedra/resolved_profile.json --tip <tip>
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --status --opsirno
```

Od prvog dana zna se svih dvadeset i šest dijelova, koji su obavezni, koji se tek trebaju
provjeriti s Uputama, i koji nemaju nikakvu provjeru. Tablicu pokaži studentu **u modu 1** —
to je jedini trenutak u kojem izostanak dijela stoji ništa.

**Modovi 2–5 — bilježi napredak.**

```bash
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --set uvod=napravljeno
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --set metodologija=ne-primjenjuje-se \
    --napomena "teorijski rad; umjesto metodologije odjeljak o pristupu i građi"
```

Statusi: `nije-napravljeno` · `u-izradi` · `napravljeno` · `provjereno` ·
`ne-primjenjuje-se`. Zadnji traži **napomenu** — dio koji je otpisan bez razloga je dio
koji je zaboravljen, a razlika se poslije ne vidi.

**Mod 6 — blokira.**

```bash
python3 <KATEDRA_SKILL>/scripts/dijelovi.py --provjeri --faza predaja
```

Izlazni kod 1 dok god ijedan obavezan dio stoji na `nije-napravljeno` ili `u-izradi`.
U fazi `pisanje` prag je blaži: blokira samo netaknuto, i procesni dijelovi se ne broje —
rad u pisanju po definiciji ima nedovršene dijelove.

## Kako se čita izvještaj

```
⬜ ❗ Prilozi                    provjeri  nije-napravljeno
✅ 🔧 Popis literature / izvora  obavezno  provjereno
➖ 👁 Životopis                  –         ne-primjenjuje-se
```

Prvi znak je **status dijela**, drugi je **razina provjere**, treći stupac kaže traži li ga
profil. `provjeri` znači: registar zna da dio postoji, ali profil o njemu šuti — odluka je
tvoja i donosi se s Uputama u ruci, ne pretpostavkom.

Na dnu stoji redak koji je cijela poanta:

```
pokrivenost provjerom: 11 strojno, 7 ručno, 7 nepokriveno
```

Sedam nepokrivenih nije loša vijest nego **prva istinita brojka o dosegu paketa**. Prije
v1.3 ta se brojka nije mogla izgovoriti.

## Kad profil traži nešto što registar ne poznaje

```
⚠️  profil traži dijelove koje registar ne poznaje:
      · sinteza istraživačkih nalaza
```

To je nalaz, ne šum. Ako os dijelova šuti o onome što ne pokriva, ona mjeri samu sebe.
Popravak je jedan zapis u `references/dijelovi.json` — v. niže.

## Kako se dodaje dio

Jedan zapis. Nijedna izmjena `scripts/dijelovi.py`.

```json
"popis_priloga": {
  "naziv": "Popis priloga",
  "skupina": "prednji",
  "redoslijed": 105,
  "obavezan": "uvjetno",
  "uvjet": "rad ima više od tri priloga",
  "profil_nazivi": ["popis priloga"],
  "proizvodi": {"mod": "2", "cime": "izrada.docx (rad-docx)"},
  "provjera": {"razina": "nepokriveno", "naredba": null,
               "kako": "što čovjek gleda i zašto"},
  "modovi": ["2", "6"]
}
```

Pravila zapisa:

1. **`provjera.razina` mora biti istinita.** `strojno` samo ako naredba stvarno postoji i
   vraća izlazni kod. Zapis koji tvrdi `strojno`, a naredba ne postoji, je gori od
   `nepokriveno` — proizvodi lažni osjećaj pokrivenosti.
2. **`profil_nazivi` su stvarni nizovi iz profila**, ne željene. Sinonimi iz
   `check_rules.py` dodaju se sami; ne prepisuj ih.
3. **`obavezan: "profil"`** samo za dio koji stvarno stoji u `struktura.obavezni_dijelovi`.
   Za dio koji profil propisuje drugdje koristi `profil_pokazatelj` (JSON Pointer) — tako
   je riješen Turnitin, koji nije dio dokumenta ali jest obavezan.
4. **`kako` je postupak, ne opis.** Redak koji kaže „provjeri prilog" ne pomaže nikome.

## Granica prema `check_rules.py`

Stroga i namjerna:

| | pitanje | vlasnik |
|---|---|---|
| `check_rules.py` | **je li dio prisutan u .docx-u?** | zrela sinonimika, padeži, naslov vs. proza |
| `dijelovi.py` | **koje dijelove rad uopće treba, tko ih radi, tko ih provjerava?** | os dokumenta |

`dijelovi.py` **uvozi** `norm`, `SINONIMI` i `je_neobavezan_dio` iz `check_rules.py`.
Ne prepisuje ih. Dva popisa sinonima razišla bi se unutar tjedna — to je željezno pravilo 13
primijenjeno na tekst umjesto na brojke.

## Sedam dijelova koje nitko ne provjerava

Popis se dobiva iz alata (`--status --opsirno`), a ne pamti iz ove datoteke. Na dan
uvođenja bili su to: izjava o korištenju AI alata, zahvala, popis kratica, prilozi,
prijava teme, unos u repozitorij, ispravci nakon obrane. Svaki od njih ima u registru
zapisano **što čovjek gleda** — jer nepokriveno ne smije značiti neopisano.
