#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testovi za katedra/scripts/zakrpa.py — provjera tvrdnji.

Kvar 117: provjera je gledala samo jedan smjer („SKILL.md zove skriptu koje
nema"). Zrcalni smjer — alat koji postoji, a dokumentacija ga nikad ne spominje
— nije gledao nitko, pa je rad-audit nosio devet nedokumentiranih provjera.
Ovdje stoji ograda da oba smjera i dalje mogu pasti; provjera koja ne može
pasti nije provjera (pravilo 34).
"""
import importlib.util
import re
import os
import sys
import tempfile

TU = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(TU)

_spec = importlib.util.spec_from_file_location("zakrpa", os.path.join(SCRIPTS, "zakrpa.py"))
zakrpa = importlib.util.module_from_spec(_spec)
sys.path.insert(0, SCRIPTS)
_spec.loader.exec_module(zakrpa)

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


def skill(skripte, md="# Skill\n", reference=None, katalog=None, drugdje=None, katalog_tekst=None):
    """Napravi minimalan korijen skilla i vrati mu put."""
    korijen = os.path.join(tempfile.mkdtemp(), "proba-skill")
    os.makedirs(os.path.join(korijen, "scripts"))
    with open(os.path.join(korijen, "SKILL.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write(md)
    for ime in skripte:
        with open(os.path.join(korijen, "scripts", ime), "w", encoding="utf-8", newline="\n") as f:
            f.write("# proba\n")
    for staza in (drugdje or []):
        q = os.path.join(korijen, *staza.split("/"))
        os.makedirs(os.path.dirname(q), exist_ok=True)
        with open(q, "w", encoding="utf-8", newline="\n") as f:
            f.write("# proba\n")
    if reference or katalog is not None:
        os.makedirs(os.path.join(korijen, "references"))
        for ime, tekst in (reference or {}).items():
            with open(os.path.join(korijen, "references", ime), "w",
                      encoding="utf-8", newline="\n") as f:
                f.write(tekst)
    if katalog_tekst is not None:
        os.makedirs(os.path.join(korijen, "references"), exist_ok=True)
        with open(os.path.join(korijen, "references", "zamke.md"), "w",
                  encoding="utf-8", newline="\n") as f:
            f.write(katalog_tekst)
    if katalog is not None:
        tijelo = "".join("\n## %d. unos %d\n\ntekst\n" % (i, i)
                         for i in range(1, katalog + 1))
        with open(os.path.join(korijen, "references", "zamke.md"), "w",
                  encoding="utf-8", newline="\n") as f:
            f.write("# Katalog\n" + tijelo)
    return korijen


def nedokumentirani(nalazi):
    return [n for n in nalazi if "ne spominje ga ni" in n]


def main():
    print("=" * 70)
    print("TESTOVI zakrpa.py — provjera tvrdnji")
    print("=" * 70)

    # R44: alat koji postoji, a nitko ga ne spominje — zrcalni smjer
    n = zakrpa.provjeri_tvrdnje(skill(["check_hipoteze.py"]))
    check("R44: nedokumentiran alat je nalaz", len(nedokumentirani(n)) == 1, n)

    # R45: isti alat spomenut u SKILL.md-u više nije nalaz
    n = zakrpa.provjeri_tvrdnje(
        skill(["check_hipoteze.py"], md="# Skill\n\n`python3 check_hipoteze.py rad.docx`\n"))
    check("R45: spominjanje u SKILL.md gasi nalaz", nedokumentirani(n) == [], n)

    # R45b: i referenca vrijedi kao dokumentacija
    n = zakrpa.provjeri_tvrdnje(
        skill(["check_hipoteze.py"], reference={"audit.md": "zove se check_hipoteze.py\n"}))
    check("R45: spominjanje u references/ gasi nalaz", nedokumentirani(n) == [], n)

    # R46: pomoćne datoteke nisu alati
    n = zakrpa.provjeri_tvrdnje(skill(["__init__.py", "common.py", "_pomocno.py"]))
    check("R46: __init__, common i _* se ne traže u dokumentaciji",
          nedokumentirani(n) == [], n)

    # R47: prvi smjer nije izgubljen — SKILL.md koji zove skriptu koje nema
    n = zakrpa.provjeri_tvrdnje(skill([], md="# Skill\n\n`python3 nema_me.py rad.docx`\n"))
    check("R47: prvi smjer i dalje pada", any("nema ni u paketu" in x for x in n), n)

    # R48: oba smjera se prijavljuju istovremeno, ne jedan umjesto drugoga
    n = zakrpa.provjeri_tvrdnje(
        skill(["check_hipoteze.py"], md="# Skill\n\n`python3 nema_me.py rad.docx`\n"))
    check("R48: oba smjera zajedno",
          len(nedokumentirani(n)) == 1 and any("nema ni u paketu" in x for x in n), n)

    # R49: brojka o veličini kataloga mora se slagati s katalogom
    md_kriv = "# Skill\n\n| `references/zamke.md` | 31 stvarni kvar |\n"
    n = zakrpa.provjeri_tvrdnje(skill([], md=md_kriv, katalog=26))
    check("R49: kriva brojka o katalogu je nalaz",
          any("katalog nosi 26 unosa" in x for x in n), n)

    md_tocan = "# Skill\n\n| `references/zamke.md` | 26 stvarnih kvarova |\n"
    n = zakrpa.provjeri_tvrdnje(skill([], md=md_tocan, katalog=26))
    check("R49: točna brojka nije nalaz", not any("katalog nosi" in x for x in n), n)

    # R49b: katalozi citiraju tuđe brojke — citat u references/ nije tvrdnja
    n = zakrpa.provjeri_tvrdnje(
        skill([], md="# Skill\n", katalog=26,
              reference={"drugo.md": "dokaz: `31 stvarni kvar` u tuđem zamke.md\n"}))
    check("R49: citat u referenci se ne broji kao tvrdnja",
          not any("katalog nosi" in x for x in n), n)

    # R63: alat koji živi izvan scripts/ (npr. evals/) postoji jednako kao
    #      onaj u scripts/ — inače alat koji lovi lažne tvrdnje sam daje
    #      lažan nalaz (kvar 126).
    n = zakrpa.provjeri_tvrdnje(
        skill([], md="# Skill\n\n`python3 pokreni_trigger.py`\n",
              drugdje=["evals/pokreni_trigger.py"]))
    check("R63: skripta izvan scripts/ postoji za provjeru",
          not any("nema ni u paketu" in x for x in n), n)

    n = zakrpa.provjeri_tvrdnje(skill([], md="# Skill\n\n`python3 nema_me.py`\n"))
    check("R63: skripte koje doista nema i dalje pada",
          any("nema ni u paketu" in x for x in n), n)

    # R71: katalog koji ZAVRŠAVA kanonskim rasponom. Uzorak koji raspon čita
    #      samo u tuđem obliku ovdje daje premali max, pa uredan lokator
    #      postaje fantom — u alatu koji lovi lokatore koji ne pogađaju
    #      (kvar 135).
    KAT = "# Katalog\n\n## 1. prvi\n\ntekst\n\n## 80–86. rasponski\n\ntekst\n"
    n = zakrpa.provjeri_tvrdnje(
        skill([], md="# Skill\n\nv. kvar 85 u katalogu.\n",
              katalog_tekst=KAT))
    check("R71: lokator unutar kanonskog raspona nije fantom",
          not any("poziva na kvar" in x for x in n), n)

    n = zakrpa.provjeri_tvrdnje(
        skill([], md="# Skill\n\nv. kvar 99 u katalogu.\n",
              katalog_tekst=KAT))
    check("R71: lokator iznad zadnjeg unosa i dalje je fantom",
          any("poziva na kvar" in x for x in n), n)

    # R73: ograda za kvar 125 — broj u izvještaju mora se brojati, ne tvrditi.
    #      Ukovana konstanta se razmakne čim se doda provjera, a taj redak
    #      čita `--provjeri-tvrdnje`, pa laž putuje dalje. Provjerava se nad
    #      SVIM test-datotekama paketa, ne nad ovom.
    import glob
    PAKET = os.path.dirname(os.path.dirname(SCRIPTS))
    UKOVANO = re.compile(r"len\(PALO\)\s*,\s*\d+\)")
    krivci = []
    for put in glob.glob(os.path.join(PAKET, "*", "scripts", "tests", "test_*.py")):
        with open(put, encoding="utf-8") as f:
            # komentar koji kvar OPISUJE nije kvar: gledaju se samo redci koda
            kod = [x for x in f.read().splitlines() if not x.lstrip().startswith("#")]
        if any(UKOVANO.search(x) for x in kod):
            krivci.append(os.path.basename(put))
    check("R73: nijedan test ne ukiva vlastiti zbroj", not krivci, krivci)

    print("=" * 70)
    print("REZULTATI TESTOVA: %d/%d prošlo"
          % (len(SVE) - len(PALO), len(SVE)))
    print("=" * 70)
    return 1 if PALO else 0


if __name__ == "__main__":
    sys.exit(main())
