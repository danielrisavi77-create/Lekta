#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testovi za katedra/scripts/verzija.py.

Kvar 123: tvrdi uvjet „VERSION ne smije zaostajati za kodom" izmjeren je i
odbačen (bio bi crven u 28 od 32 stanja na main-u). Provediva je uža tvrdnja —
oznaka verzije u opisu skilla mora biti ista kao VERSION — a ona ima dva ruba
na kojima se lako pokvari: oznaka koja NIJE oznaka (povijesna rečenica
„Od v1.9.10 i: …") i skill koji oznaku uopće ne nosi.
"""
import importlib.util
import os
import sys
import tempfile
from pathlib import Path

TU = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(TU)

_spec = importlib.util.spec_from_file_location("verzija", os.path.join(SCRIPTS, "verzija.py"))
verzija = importlib.util.module_from_spec(_spec)
sys.path.insert(0, SCRIPTS)
_spec.loader.exec_module(verzija)

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


def paket(v, opisi):
    """Napravi lažan korijen paketa i usmjeri alat na njega."""
    k = Path(tempfile.mkdtemp()) / "paket"
    k.mkdir()
    (k / "VERSION").write_text(v + "\n", encoding="utf-8")
    for ime, opis in opisi.items():
        (k / ime).mkdir()
        (k / ime / "SKILL.md").write_text(
            '---\nname: %s\ndescription: "%s"\n---\n\n# %s\n' % (ime, opis, ime),
            encoding="utf-8", newline="\n")
    verzija.KORIJEN = k
    verzija.VERSION = k / "VERSION"
    return k


def main():
    print("=" * 70)
    print("TESTOVI verzija.py")
    print("=" * 70)

    # R54: oznaka koja se slaže s VERSION ne daje nalaz
    paket("1.9.12", {"katedra-lite": "Kopilot. v1.9.12."})
    check("R54: oznaka jednaka VERSION prolazi", verzija.provjeri() == 0)

    # R55: oznaka koja se ne slaže je tvrdi nalaz
    paket("1.9.13", {"katedra-lite": "Kopilot. v1.9.12."})
    check("R55: oznaka različita od VERSION pada", verzija.provjeri() == 1)

    # R56: povijesna rečenica usred opisa NIJE oznaka — inače lažan nalaz na
    #      svakom opisu koji spominje prošlu verziju
    paket("1.9.12", {"rad-audit": "Motor audita. Od v1.9.10 i: metapodaci, uputnice."})
    check("R56: „Od v1.9.10 i:” se ne čita kao oznaka", verzija.provjeri() == 0)
    check("R56: takav skill nema oznaku",
          [o for _i, _p, o in verzija.oznake()] == [None])

    # R57: --postavi mijenja VERSION i SVE oznake u jednom potezu
    k = paket("1.9.12", {"a": "Prvi. v1.9.12.", "b": "Drugi. v1.9.12.",
                         "c": "Treći bez oznake."})
    verzija.postavi("1.9.13")
    check("R57: VERSION je upisan", (k / "VERSION").read_text(encoding="utf-8").strip() == "1.9.13")
    check("R57: sve oznake su osvježene",
          sorted(o for _i, _p, o in verzija.oznake() if o) == ["1.9.13", "1.9.13"],
          [o for _i, _p, o in verzija.oznake()])
    check("R57: skill bez oznake nije dobio oznaku",
          "v1.9.13" not in (k / "c" / "SKILL.md").read_text(encoding="utf-8"))
    check("R57: nakon postavljanja provjera prolazi", verzija.provjeri() == 0)

    # R58: neispravan VERSION je nalaz sam po sebi
    paket("v1.9.12", {"a": "Prvi."})
    check("R58: VERSION koji nije X.Y.Z pada", verzija.provjeri() == 1)

    print("=" * 70)
    print("REZULTATI TESTOVA: %d/%d prošlo"
          % (len(SVE) - len(PALO), len(SVE)))
    print("=" * 70)
    return 1 if PALO else 0


if __name__ == "__main__":
    sys.exit(main())
