#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testovi za katedra-lite/scripts/indeks_zamki.py.

Kvar 122: indeks je čitao tuđi oblik naslova (`## Kvar 58 — X`), a ne kanonski
raspon (`## 80–86. X`) koji `kvar.py --popravi-naslove` upravo proizvodi. Zbog
toga je jedanaest unosa ostajalo bez broja, a zaglavlje je javljalo 69 unosa
ondje gdje `kvar.py` javlja 64. Dva alata, ista datoteka, dva broja.
"""
import importlib.util
import io
import os
import sys
import tempfile
from pathlib import Path

TU = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(TU)
KORIJEN = os.path.dirname(SCRIPTS)
PAKET = os.path.dirname(KORIJEN)

_spec = importlib.util.spec_from_file_location(
    "indeks_zamki", os.path.join(SCRIPTS, "indeks_zamki.py"))
indeks = importlib.util.module_from_spec(_spec)
sys.path.insert(0, SCRIPTS)
_spec.loader.exec_module(indeks)

NLZ = chr(10)

PALO = []
SVE = []


def check(naziv, uvjet, detalj=""):
    # Kvar 125: broj u izvještaju mora se BROJATI, ne tvrditi. Ukovana
    # konstanta („%d/%d" % (6 - len(PALO), 6)) razmakne se čim se doda
    # provjera, i onda suite javlja 6/6 dok ih je pokrenuo sedam. Taj broj
    # čita `zakrpa.py --provjeri-tvrdnje`, pa laž putuje dalje.
    SVE.append(naziv)
    print("  %-8s %s" % ("✓" if uvjet else "✗ FAIL", naziv))
    if not uvjet:
        PALO.append(naziv)
        if detalj:
            print("           detalj: %r" % (detalj,))


TIJELO = "\ntekst unosa s brojkom 5.\n\n```\nizlaz\n```\n"


def s_katalogom(sadrzaj):
    """Postavi indeks_zamki na privremeni katalog i vrati njegove unose."""
    p = Path(tempfile.mkdtemp()) / "zamke.md"
    p.write_text(sadrzaj, encoding="utf-8")
    stari = indeks.ZAMKE
    indeks.ZAMKE = p
    try:
        return indeks.unosi()
    finally:
        indeks.ZAMKE = stari


def main():
    print("=" * 70)
    print("TESTOVI indeks_zamki.py")
    print("=" * 70)

    # R50: kanonski raspon je jedan unos i nosi svoj broj
    u = s_katalogom("# K\n\n## 80–86. tri stavke" + TIJELO)
    check("R50: kanonski raspon nosi broj", len(u) == 1 and u[0]["broj"] == "80–86",
          [(x["broj"], x["naslov"]) for x in u])
    check("R50: naslov ne nosi broj u sebi", u and u[0]["naslov"] == "tri stavke",
          u[0]["naslov"] if u else None)

    # R51: kanonski pojedinačni broj i tuđi oblik i dalje se čitaju
    u = s_katalogom("# K\n\n## 27. prvi" + TIJELO + "\n## Kvar 58 — drugi" + TIJELO
                    + "\n## Kvarovi 61–63 — treći" + TIJELO)
    check("R51: sva tri oblika naslova nose broj",
          [x["broj"] for x in u] == ["27", "58", "61–63"], [x["broj"] for x in u])

    # R52: nenumerirani odjeljak nije unos kataloga
    u = s_katalogom("# K\n\n## 27. prvi" + TIJELO + "\n## Korpus na kojem je mjereno" + TIJELO)
    numerirani = [x for x in u if x["broj"]]
    check("R52: odjeljak bez broja se ne broji kao unos",
          len(u) == 2 and len(numerirani) == 1, [(x["broj"], x["naslov"]) for x in u])

    # R53: nad stvarnim katalogom indeks i kvar.py moraju dati isti broj
    kvar_py = os.path.join(PAKET, "katedra", "scripts", "kvar.py")
    if os.path.exists(kvar_py):
        _s = importlib.util.spec_from_file_location("kvar", kvar_py)
        kvar = importlib.util.module_from_spec(_s)
        _s.loader.exec_module(kvar)
        tekst = Path(indeks.ZAMKE).read_text(encoding="utf-8")
        a = len(kvar.unosi(tekst))
        b = len([x for x in indeks.unosi() if x["broj"]])
        check("R53: indeks i kvar.py broje isto (%d)" % a, a == b, (a, b))
    else:
        # Kartica se instalira bez satelita; tada je R53 neprovediv i to se kaže
        # naglas umjesto da se prešuti kao prolaz.
        print("  (preskočeno) R53: kvar.py nije uz karticu — usporedba se ne može izvesti")

    # R70: ograda se prepoznaje i usred rečenice (kvar 132). Uzorak usidren
    #      na početak retka propuštao je „…na krivca. Ograda: test_drift.py"
    #      i „12. Ograda po pravilu 34: …", pa popis --bez-ograde nije mjerio
    #      dug nego oblikovanje: 47 od 79 naspram izmjerenih 34.
    def ograda(tijelo):
        return indeks._ima_ogradu(tijelo)

    check("R70: ograda usred rečenice se prepoznaje",
          ograda("tekst i tekst. Ograda: `test_drift.py` — fixture nosi navodnike."))
    check("R70: ograda u nabrajanju se prepoznaje",
          ograda("12. Ograda po pravilu 34: `## 71.` prepisan u `## 75.` obara skupinu"))
    check("R70: ograda na početku retka i dalje vrijedi",
          ograda("prvi redak" + chr(10) + "Ograda: `test_kvar.py` (sedam provjera)"))
    check("R70: „Ograda koje nema” nije ograda",
          not ograda("Popravak stoji. Ograda koje nema: nitko to ne mjeri."))
    check("R70: proza o nedostatku ograde nije ograda",
          not ograda("Nalaz bez ograde je bilješka, i tako je ostalo."))

    # R72: brojka mora značiti isto u svakoj naredbi (kvar 137). Katalog s
    #      dva numerirana unosa i jednim nenumeriranim odjeljkom mora u
    #      --bez-ograde dijeliti s 2, ne s 3.
    import contextlib
    KAT = ("# Katalog" + NLZ + NLZ + "## 1. prvi" + NLZ + NLZ + "tekst 5" + NLZ + NLZ
           + "## 2. drugi" + NLZ + NLZ + "tekst 5" + NLZ + NLZ
           + "## Korpus na kojem je mjereno" + NLZ + NLZ + "tekst 5" + NLZ)
    p = Path(tempfile.mkdtemp()) / "zamke.md"
    p.write_text(KAT, encoding="utf-8")
    stari_z, stari_argv = indeks.ZAMKE, sys.argv
    indeks.ZAMKE = p
    izlaz = io.StringIO()
    try:
        sys.argv = ["indeks_zamki.py", "--bez-ograde"]
        with contextlib.redirect_stdout(izlaz):
            indeks.main()
    finally:
        indeks.ZAMKE, sys.argv = stari_z, stari_argv
    tekst = izlaz.getvalue()
    check("R72: --bez-ograde dijeli brojem UNOSA, ne redaka",
          "od 2 unosa bez ograde" in tekst, tekst.strip().splitlines()[-1:])
    check("R72: nenumerirani odjeljak se izriče odvojeno",
          "1 nenumeriranih odjeljaka" in tekst, tekst.strip().splitlines()[-1:])

    # R74: „bez ograde" je bio jedan pretinac za tri stanja (kvar 139).
    #      Deklaracija bez razloga NE smije proći kao deklaracija — inače je
    #      to način da se dug sakrije, isti mehanizam kao preskočena provjera.
    check("R74: ograda koja postoji je „ima”",
          indeks._stanje_ograde("tekst. Ograda: `test_x.py` pada bez toga.") == "ima")
    check("R74: „Ograda: nema — razlog” je deklaracija",
          indeks._stanje_ograde("Ograda: nema — unos je mjerenje, ne kvar.")
          == "deklarirano")
    check("R74: „Ograda: nema.” bez razloga ostaje dug",
          indeks._stanje_ograde("Ograda: nema.") == "nema")
    check("R74: proza o nedostatku ograde ostaje dug",
          indeks._stanje_ograde("Nalaz bez ograde je bilješka.") == "nema")

    # R75: citat tokena nije ograda (kvar 143). Unos koji o ogradi GOVORI
    #      ne smije time ispasti iz popisa duga.
    check("R75: „Ograda: …” kao citat nije ograda",
          indeks._stanje_ograde("rečenica „Ograda: …” ovdje bi ga maknula")
          == "nema")
    check("R75: „Ograda: ...” s tri točke isto",
          indeks._stanje_ograde("Ograda: ... popuni poslije") == "nema")
    check("R75: prava ograda i dalje vrijedi",
          indeks._stanje_ograde("Ograda: `test_x.py` R9 pada bez toga.") == "ima")

    print("=" * 70)
    print("REZULTATI TESTOVA: %d/%d prošlo"
          % (len(SVE) - len(PALO), len(SVE)))
    print("=" * 70)
    return 1 if PALO else 0


if __name__ == "__main__":
    sys.exit(main())
