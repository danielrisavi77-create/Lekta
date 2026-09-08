#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Broj verzije paketa i oznaka koju kartica nosi sa sobom.

Kvar 57 je zapisao da `VERSION` piše rukom onaj tko radi commit, i ostavio
ogradu neispunjenom. Kvar 123 mjeri zašto: tvrdi uvjet „VERSION ne smije
zaostajati za izmjenama koda" bio bi crven u **28 od 32** stanja na `main`-u,
dakle provjera koja vrišti uvijek i time ne znači ništa (kvar 91).

Provediva je uža tvrdnja: **oznaka verzije u opisu skilla mora biti ista kao
`VERSION`.** Ta oznaka nije ukras — ona je jedino mjesto na kojem *instalirana
kartica* kaže iz koje je verzije. Kvar 121 se vidio upravo tako: kartica je
javljala v1.9.5 dok je repo bio na v1.9.12, šest verzija doktrine izvan
opticaja. Ako se oznaka piše rukom, i taj signal laže.

Oznaka je **zadnje** što stoji u `description:`, u obliku ` v1.9.12.` Skill koji
je nema jednostavno se ne provjerava (v. `--stanje`): `rad-orchestrator` broji
vlastite verzije i njegov `v1.2.1` nije oznaka paketa.

    python3 verzija.py --provjeri            oznake naspram VERSION; izlaz 1 ako se razilaze
    python3 verzija.py --stanje              tko nosi oznaku, a tko ne
    python3 verzija.py --sljedeca            sljedeći broj zakrpe (pita se, ne pretpostavlja)
    python3 verzija.py --postavi 1.9.13      upiši VERSION i SVE oznake u istom potezu
    python3 verzija.py --dodaj-oznaku rad-audit    daj skillu oznaku (svjestan čin, jednom)
"""
import argparse
import io
import re
import sys
from pathlib import Path

KORIJEN = Path(__file__).resolve().parent.parent.parent
VERSION = KORIJEN / "VERSION"

OPIS_RE = re.compile(r'^(description:\s*")(.*)(")\s*$', re.M)
# Oznaka je zadnji token opisa: " v1.9.12." — ne bilo koji vX.Y.Z u tekstu.
# „Od v1.9.10 i: …" u rad-auditu je povijesna rečenica, ne tvrdnja o verziji;
# uzorak koji bi nju uhvatio dao bi lažan nalaz na svakom takvom opisu.
OZNAKA_RE = re.compile(r"\sv(\d+\.\d+\.\d+)\.$")
BROJ_RE = re.compile(r"^\d+\.\d+\.\d+$")


def verzija():
    return VERSION.read_text(encoding="utf-8").strip()


def skillovi():
    return sorted(p for p in KORIJEN.glob("*/SKILL.md"))


def _opis(put):
    m = OPIS_RE.search(io.open(put, encoding="utf-8", newline="").read().replace("\r\n", "\n"))
    return m.group(2) if m else None


def oznake():
    """[(ime skilla, put, oznaka ili None)]"""
    out = []
    for p in skillovi():
        d = _opis(p)
        if d is None:
            out.append((p.parent.name, p, None))
            continue
        m = OZNAKA_RE.search(d)
        out.append((p.parent.name, p, m.group(1) if m else None))
    return out


def _zamijeni_opis(put, novi_opis):
    tekst = io.open(put, encoding="utf-8", newline="").read()
    kraj = "\r\n" if "\r\n" in tekst else "\n"
    t = tekst.replace("\r\n", "\n")
    m = OPIS_RE.search(t)
    t = t[:m.start()] + m.group(1) + novi_opis + m.group(3) + t[m.end():]
    io.open(put, "w", encoding="utf-8", newline="").write(t.replace("\n", kraj))


def provjeri():
    v = verzija()
    nalazi = []
    if not BROJ_RE.match(v):
        nalazi.append(f"❌ VERSION nije oblika X.Y.Z: {v!r}")
    s_oznakom = [(i, p, o) for i, p, o in oznake() if o]
    for ime, _p, o in s_oznakom:
        if o != v:
            nalazi.append(f"❌ {ime}/SKILL.md nosi oznaku v{o}, a VERSION je {v} — "
                          f"kartica bi tvrdila krivu verziju")
    print("=" * 62)
    print(f"VERZIJA PAKETA — {v}")
    print("=" * 62)
    print(f"oznaku nosi {len(s_oznakom)} od {len(oznake())} skillova: "
          + ", ".join(i for i, _p, _o in s_oznakom))
    for n in nalazi:
        print(" ", n)
    print("\nREZULTAT:", "✓ sve oznake se slažu s VERSION"
          if not nalazi else f"❌ {len(nalazi)} neslaganja")
    return 1 if nalazi else 0


def stanje():
    v = verzija()
    for ime, _p, o in oznake():
        if o is None:
            print(f"  —      {ime}  (nema oznaku; ne provjerava se)")
        else:
            print(f"  {'✓' if o == v else '❌'}      {ime}  v{o}")
    print(f"\nVERSION: {v}")
    return 0


def postavi(nova):
    if not BROJ_RE.match(nova):
        print(f"❌ {nova!r} nije oblika X.Y.Z")
        return 2
    VERSION.write_text(nova + "\n", encoding="utf-8")
    n = 0
    for ime, p, o in oznake():
        if o is None:
            continue
        d = _opis(p)
        _zamijeni_opis(p, OZNAKA_RE.sub(f" v{nova}.", d))
        n += 1
        print(f"  {ime}: v{o} → v{nova}")
    print(f"✔ VERSION {nova}, oznaka osvježeno: {n}")
    return 0


def dodaj_oznaku(ime):
    p = KORIJEN / ime / "SKILL.md"
    if not p.exists():
        print(f"❌ nema {p}")
        return 2
    d = _opis(p)
    if d is None:
        print(f"❌ {ime}/SKILL.md nema description:")
        return 2
    if OZNAKA_RE.search(d):
        print(f"{ime} već nosi oznaku")
        return 0
    _zamijeni_opis(p, d.rstrip() + f" v{verzija()}.")
    print(f"✔ {ime} nosi oznaku v{verzija()}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--provjeri", action="store_true")
    ap.add_argument("--stanje", action="store_true")
    ap.add_argument("--sljedeca", action="store_true",
                    help="sljedeći broj zakrpe — za onoga tko tek piše zakrpu")
    ap.add_argument("--postavi", metavar="X.Y.Z")
    ap.add_argument("--dodaj-oznaku", dest="dodaj_oznaku", metavar="SKILL")
    a = ap.parse_args()

    if a.sljedeca:
        g, s, z = verzija().split(".")
        print(f"{g}.{s}.{int(z) + 1}")
        return 0
    if a.stanje:
        return stanje()
    if a.postavi:
        return postavi(a.postavi)
    if a.dodaj_oznaku:
        return dodaj_oznaku(a.dodaj_oznaku)
    return provjeri()


if __name__ == "__main__":
    for _tok in (sys.stdout, sys.stderr):
        try:
            _tok.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass
    sys.exit(main())
