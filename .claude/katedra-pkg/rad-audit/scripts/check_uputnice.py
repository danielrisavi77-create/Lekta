#!/usr/bin/env python3
"""Faza F2 — uputnice u tekstu naspram stvarnih prikaza.

Uporaba:  python3 check_uputnice.py rad.docx

Zašto postoji
-------------
Lanac provjerava da svaki prikaz ima natpis, da je numeracija neprekinuta i da
popis prikaza odgovara tijelu. Nitko ne provjerava **obrnuti smjer**: da rečenica
„prikazano je u Tablici 3" doista pokazuje na tablicu koja postoji, i da svaki
prikaz bude bar jednom spomenut u tekstu.

Oba su smjera stvarna: brisanje jedne tablice ostavlja uputnice na sve iza nje
pomaknute, a dodavanje prikaza koji se nigdje ne spominje je nalaz koji mentor
nađe odmah („zašto je ovo ovdje?").

Izlazni kod: 1 na uputnicu u prazno ili nespomenut prikaz, 0 inače.
"""
from __future__ import annotations

import json
import re
import sys

from common import load_docx_text, load_supplementary_text, dio_literature, LIT_HEADING_RE

VRSTE = ("Tablica", "Tablicu", "Tablici", "Tablice", "Tablicama",
         "Slika", "Sliku", "Slici", "Slike", "Slikama",
         "Grafikon", "Grafikonu", "Grafikona", "Grafikone",
         "Prikaz", "Prikazu", "Prikaza", "Shema", "Shemu", "Shemi")

# Uputnica u tekstu: „u Tablici 3", „(Tablica 3)", „v. Sliku 2", „Tablice 1 i 2"
# Hrvatska sibilarizacija: „Slika" u dativu i lokativu je „SliCi", ne „SliKi".
# Prva izvedba uzorka tražila je `Slik\w*` i zato je na stvarnom radu prijavila
# da se Slika 3 i Slika 4 nigdje ne spominju, iako je tekst uredno pisao
# „prikazana je na Slici 3". Isto vrijedi za „Ruka → ruci" tip promjene.
UPUTNICA = re.compile(
    r"\b(Tablic\w*|Sli[kc]\w*|Grafikon\w*|Prikaz\w*|Shem\w*)\s+(\d+)"
    r"(?:\s*(?:i|,|do|–|-)\s*(\d+))?",
    re.UNICODE)

# Natpis: samo na POČETKU odlomka, u nominativu, s točkom ili dvotočjem
NATPIS = re.compile(r"^(Tablica|Slika|Grafikon|Prikaz|Shema)\s+(\d+)\s*[.:]", re.UNICODE)

OSNOVA = {"tablic": "Tablica", "slik": "Slika", "slic": "Slika",
          "grafikon": "Grafikon", "prikaz": "Prikaz", "shem": "Shema"}


def _vrsta(rijec: str) -> str:
    r = rijec.lower()
    for k, v in OSNOVA.items():
        if r.startswith(k):
            return v
    return rijec.capitalize()


def analiziraj(put: str) -> dict:
    body, cells, _ = load_docx_text(put, include_tables=True)
    sup = load_supplementary_text(put)
    m = list(LIT_HEADING_RE.finditer(body))
    tijelo = body[:m[-1].start()] if m else body

    natpisi: dict[str, set[int]] = {}
    for odlomak in tijelo.split("\n"):
        mm = NATPIS.match(odlomak.strip())
        if mm:
            natpisi.setdefault(mm.group(1), set()).add(int(mm.group(2)))

    # uputnice: sve osim onih koje su i same natpis
    uputnice: dict[str, set[int]] = {}
    izvor = tijelo + "\n" + "\n".join(cells) + "\n" + sup.get("footnotes", "")
    for odlomak in izvor.split("\n"):
        t = odlomak.strip()
        pocetak = NATPIS.match(t)
        for mm in UPUTNICA.finditer(t):
            if pocetak and mm.start() == 0:
                continue                      # ovo je natpis, ne uputnica
            v = _vrsta(mm.group(1))
            for g in (mm.group(2), mm.group(3)):
                if g:
                    uputnice.setdefault(v, set()).add(int(g))

    u_prazno, nespomenuti = [], []
    for v, brojevi in sorted(uputnice.items()):
        postoje = natpisi.get(v, set())
        if not postoje:
            u_prazno.append((v, sorted(brojevi), "nijedan prikaz te vrste ne postoji"))
            continue
        fale = sorted(brojevi - postoje)
        if fale:
            u_prazno.append((v, fale, f"postoje samo {min(postoje)}–{max(postoje)}"))
    for v, brojevi in sorted(natpisi.items()):
        nikad = sorted(brojevi - uputnice.get(v, set()))
        if nikad:
            nespomenuti.append((v, nikad))
    return {"natpisi": {k: sorted(v) for k, v in natpisi.items()},
            "uputnice": {k: sorted(v) for k, v in uputnice.items()},
            "u_prazno": u_prazno, "nespomenuti": nespomenuti}


def main(path):
    r = analiziraj(path)
    print("=" * 58)
    print("F2 — UPUTNICE NA PRIKAZE —", path)
    print("=" * 58)
    for v, b in sorted(r["natpisi"].items()):
        print(f"  {v}: natpisa {len(b)} ({min(b)}–{max(b)}) · "
              f"uputnica na {len(r['uputnice'].get(v, []))}")
    if not r["natpisi"]:
        print("  nema prikaza s natpisom")

    if r["u_prazno"]:
        print(f"\n⚠ UPUTNICA U PRAZNO ({len(r['u_prazno'])}):")
        for v, b, zasto in r["u_prazno"]:
            print(f"   • tekst upućuje na {v} {', '.join(map(str, b))}, a {zasto}")
    if r["nespomenuti"]:
        print(f"\n⚠ PRIKAZ KOJI SE NIGDJE NE SPOMINJE ({len(r['nespomenuti'])}):")
        for v, b in r["nespomenuti"]:
            print(f"   • {v} {', '.join(map(str, b))} — nijedna rečenica ga ne uvodi")
    if not r["u_prazno"] and not r["nespomenuti"]:
        print("\n✓ svaka uputnica pogađa postojeći prikaz i svaki prikaz je spomenut")
    return 1 if (r["u_prazno"] or r["nespomenuti"]) else 0


if __name__ == "__main__":
    # `--help` je bez ovoga završavao kao ime datoteke: python-docx bi bacio
    # PackageNotFoundError i alat bi izgledao pokvareno umjesto da se predstavi.
    if len(sys.argv) < 2 or {"-h", "--help"} & set(sys.argv[1:]):
        print(__doc__)
        sys.exit(2 if len(sys.argv) < 2 else 0)
    if "--json" in sys.argv:
        put = sys.argv[sys.argv.index("--json") + 1]
        with open(put, "w", encoding="utf-8") as fh:
            json.dump(analiziraj(sys.argv[1]), fh, ensure_ascii=False, indent=2, default=list)
    sys.exit(main(sys.argv[1]))
