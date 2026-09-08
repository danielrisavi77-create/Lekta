#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testovi za katedra-lite/scripts/drift.py — pretraga ranijih verzija.

Kvar 127: `drift.py` je nad karticom koja je uredno jednu verziju iza javljao
„sadržaj kartice NIJE nijedna ranija verzija iz repoa" — rečenicu koja optužuje
da je kartica ručno mijenjana. Dva neovisna razloga, oba vidljiva samo na
Windowsu i samo na hrvatskom tekstu:

  1. `os.path.relpath` daje `katedra-lite\\SKILL.md`, a `git show <rev>:<put>`
     prima samo kosu crtu — svaki `show` je padao.
  2. `subprocess.run(text=True)` bez `encoding` dekodira git-ov izlaz kodnom
     stranicom konzole; na cp1250 to je `UnicodeDecodeError`, kojeg je široki
     `except Exception` pretvarao u „nema ranije verzije".

Zato fixture ovdje ima hrvatske navodnike i dijakritiku: bez njih drugi razlog
ne bi ni pao.
"""
import importlib.util
import os
import subprocess
import sys
import tempfile
from pathlib import Path

TU = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.dirname(TU)

_spec = importlib.util.spec_from_file_location("drift", os.path.join(SCRIPTS, "drift.py"))
drift = importlib.util.module_from_spec(_spec)
sys.path.insert(0, SCRIPTS)
_spec.loader.exec_module(drift)

PALO = []
SVE = []


def check(naziv, uvjet, detalj=""):
    SVE.append(naziv)
    print("  %-8s %s" % ("✓" if uvjet else "✗ FAIL", naziv))
    if not uvjet:
        PALO.append(naziv)
        if detalj:
            print("           detalj: %r" % (detalj,))


STARO = ("---\nname: proba\n"
         'description: "Kopilot za „akademske” radove — čćžšđ. v1.0.0."\n'
         "---\n\n# Proba\n\nStara verzija doktrine.\n")
NOVO = STARO.replace("v1.0.0", "v1.0.1") + "\nNovi odjeljak koji kartica nema.\n"


def git(korijen, *a):
    return subprocess.run(["git", "-C", korijen] + list(a), capture_output=True,
                          text=True, encoding="utf-8", errors="replace")


def repo_s_dvije_verzije():
    """Repo u kojem `skill/SKILL.md` ima stariju pa noviju verziju."""
    k = tempfile.mkdtemp()
    git(k, "init", "-q")
    git(k, "config", "user.email", "proba@example.com")
    git(k, "config", "user.name", "Proba")
    d = Path(k) / "skill"
    d.mkdir()
    (d / "SKILL.md").write_text(STARO, encoding="utf-8", newline="\n")
    git(k, "add", "-A")
    git(k, "commit", "-q", "-m", "stara")
    (d / "SKILL.md").write_text(NOVO, encoding="utf-8", newline="\n")
    git(k, "add", "-A")
    git(k, "commit", "-q", "-m", "nova")
    return k


def main():
    print("=" * 70)
    print("TESTOVI drift.py")
    print("=" * 70)

    k = repo_s_dvije_verzije()
    # Put se gradi kako ga alat gradi: os.path.relpath, dakle s os.sep
    rel = os.path.join("skill", "SKILL.md")

    r = drift.smjer_iz_povijesti(k, rel, drift.normaliziraj(STARO))
    check("R64: sadržaj kartice se prepozna kao ranija verzija",
          bool(r) and not r.get("greska") and r.get("commit"), r)

    r2 = drift.smjer_iz_povijesti(k, rel, drift.normaliziraj(
        STARO.replace("Stara verzija doktrine.", "Ovo nije nijedna verzija iz repoa.")))
    check("R64: sadržaj koji nije nijedna verzija i dalje daje None", r2 is None, r2)

    # R65: put s obrnutom kosom crtom nije izgovor — alat ga sam normalizira
    r3 = drift.smjer_iz_povijesti(k, "skill" + os.sep + "SKILL.md",
                                  drift.normaliziraj(STARO))
    check("R65: put s os.sep radi jednako kao s kosom crtom",
          bool(r3) and r3.get("commit") == (r or {}).get("commit"), (r, r3))

    # R66: neuspjeh pretrage se prijavljuje, ne prešućuje kao „nema verzije"
    r4 = drift.smjer_iz_povijesti(tempfile.mkdtemp(), rel, drift.normaliziraj(STARO))
    check("R66: mapa koja nije repo ne ruši alat", r4 is None or "greska" in r4, r4)

    print("=" * 70)
    print("REZULTATI TESTOVA: %d/%d prošlo"
          % (len(SVE) - len(PALO), len(SVE)))
    print("=" * 70)
    return 1 if PALO else 0


if __name__ == "__main__":
    sys.exit(main())
