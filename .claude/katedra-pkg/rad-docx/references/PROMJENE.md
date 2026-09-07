# PROMJENE — rad-docx

# v1.9.3 — provjera koja nije postojala i greška koja to nije

* **Kvar 25 — `str(None)` je niska „None".** Kad prored nigdje nije zadan, `_prevladava`
  vraća `None`, a `str(None)` je istinita niska bez `AUTO`/`POINT`/`MULTIPLE`, pa je grana
  za fiksni prored okidala GREŠKU „prored je fiksan (None)" i zaustavljala predaju. Poruka
  je bila obrnuta od istine, a isti ispis je paralelno nosio točan nalaz kao upozorenje.
  Mjereno: `❌ GREŠKE (1)` → `✅ nijedna greška`, uz zadržano upozorenje. Pogađa svaki
  dokument sastavljen nad tuđim predloškom, jer takav prored nasljeđuje.
* **Kvar 26 i `scripts/provjeri_reference.py`** (novo) — skripta se zove na osam mjesta u
  `katedra-lite` i vodi kao blokirajuća u `gate.py --faza predaja`, a u paketu je nije bilo;
  gate je javljao „treba ponovna instalacija", što je kriva dijagnoza nad potpunim paketom.
  Skripta uspoređuje keširane vrijednosti `PAGEREF` polja iz `.docx`-a sa stvarnim
  prijelomom iz PDF-a. Dokazano na oba smjera: 27/27 točno → izlazni kod 0; isti dokument s
  jednim namjerno pokvarenim brojem → `❌ tvrdi 7 · otisak 1` i izlazni kod 1. Izlazni kod 2
  znači „nije se dalo izmjeriti" i nije isto što i prolaz.

---

## v1.9.5 — 5. 9. 2026.

**`provjeri_povratak.py` napisan.** `katedra-lite/references/povratak.md` i
`references/stil_autora.md` opisivali su cijeli mod 7 i imenovali ovu skriptu kao njegov
motor. Skripte nije bilo, pa se usporedba radila napamet. Alat dijeli razlike na tri
hrpe kako referenca propisuje: **vraćamo** (regresije koje je autor nehotice unio:
raspon `133–150 → 133-150`, hrvatski navodnici u ravne, `×` u `x`, izgubljen citat,
nestao obvezni dio), **pamtimo** (rečenica prepisana bez diranja citata i brojki — glas
autora), **pitamo** (promijenjena brojka ili citat, dodan i obrisan sadržaj).
Izlazni kod 1 na regresiju ili nestali obvezni dio.

**`provjeri_predaju.py` je sada korak gatea**, a ne naredba koje se agent morao sjetiti
(v. `katedra-lite/references/zamke.md`, kvar 60).
