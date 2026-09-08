#!/usr/bin/env python3
"""Brojke koje rad sam izvodi iz vlastitih prikaza — slažu li se međusobno.

Kvar 48. `consistency_check.py` uspoređuje tvrdnje iz `claims.jsonl`, a ondje su
tvrdnje koje se oslanjaju na izvore. Brojka koju rad izvodi iz vlastite tablice
(„pet od sedam koraka", „šest od sedam") ondje ne postoji, pa je nitko ne
uspoređuje sa sobom. Na jednom je radu potpoglavlje 4.3 tvrdilo „posljednja tri
koraka", a 4.4 i zaključak „šest od sedam", i to je prošlo `findings=0`.

Alat ne odlučuje koja je vrijednost točna. Imenuje obje i mjesto na kojem stoje;
presuđuje čovjek, jer izvor istine je prikaz, a ne tekst.

    python3 provjeri_brojke_u_tekstu.py rad.docx --json .katedra/brojke_teksta.json

Izlazni kod je 0 i kad proturječje postoji — alat pita, ne presuđuje, i zato
u `gate.py` stoji kao savjet. Uz `--strogo` proturječje daje 1.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

try:
    from docx import Document
except ImportError:  # pragma: no cover
    print("python-docx nije dostupan", file=sys.stderr)
    sys.exit(2)

BROJEVI = {
    "jedan": 1, "jedna": 1, "jedno": 1, "jednoga": 1, "jednog": 1,
    "dva": 2, "dvije": 2, "dvaju": 2, "dviju": 2,
    "tri": 3, "triju": 3, "četiri": 4, "četiriju": 4,
    "pet": 5, "šest": 6, "sedam": 7, "osam": 8, "devet": 9, "deset": 10,
    "jedanaest": 11, "dvanaest": 12, "trinaest": 13, "četrnaest": 14,
}
REDNI = {
    "prvom": 1, "prvome": 1, "drugom": 2, "drugome": 2, "trećem": 3, "trećemu": 3,
    "četvrtom": 4, "četvrtome": 4, "petom": 5, "petome": 5, "šestom": 6, "šestome": 6,
    "sedmom": 7, "sedmome": 7,
}

#: „pet od sedam koraka", „6 od 7 mjesta"
UZORAK_OD = re.compile(
    r"\b(" + "|".join(BROJEVI) + r"|\d{1,2})\s+od\s+(" + "|".join(BROJEVI) + r"|\d{1,2})\s+"
    r"(\w+?)(?:a|i|e|ā)?\b", re.I)
#: „posljednja tri koraka", „posljednja dva koraka"
UZORAK_POSLJEDNJA = re.compile(
    r"\bposljedn\w+\s+(" + "|".join(BROJEVI) + r"|\d{1,2})\s+(\w+)", re.I)
#: „na četvrtome koraku"
UZORAK_REDNI = re.compile(
    r"\bna\s+(" + "|".join(REDNI) + r")\s+(\w+)", re.I)

PRESKOCI = re.compile(r"^\s*(Slika|Tablica|Izvor:|Rb\.)", re.I)


def _broj(s: str):
    s = s.strip().lower()
    if s.isdigit():
        return int(s)
    return BROJEVI.get(s) or REDNI.get(s)


def _koren(rijec: str) -> str:
    """Grubi korijen: dovoljno da se „koraka" i „koracima" spoje."""
    r = rijec.strip().lower()
    for nastavak in ("ovima", "evima", "ima", "ama", "ova", "eva", "a", "e", "i", "u", "o"):
        if len(r) > 4 and r.endswith(nastavak):
            return r[: -len(nastavak)]
    return r


def _poglavlja(doc):
    """(oznaka poglavlja, tekst odlomka) za tijelo rada."""
    trenutno, van = "—", []
    for p in doc.paragraphs:
        t = (p.text or "").strip()
        if not t:
            continue
        if re.match(r"^\d+(\.\d+)*\.?\s+\S", t) and len(t) < 90:
            trenutno = t.split()[0].rstrip(".")
            continue
        if t.upper().startswith(("POPIS LITERATURE", "POPIS SLIKA", "POPIS TABLICA")):
            break
        if PRESKOCI.match(t):
            continue
        van.append((trenutno, t))
    return van


def skupi(doc):
    """Tvrdnje oblika (pojam, vrsta, vrijednost, ukupno, poglavlje, rečenica)."""
    nalazi = []
    for pogl, odlomak in _poglavlja(doc):
        for rec in re.split(r"(?<=[.!?])\s+", odlomak):
            for m in UZORAK_OD.finditer(rec):
                a, b, pojam = _broj(m.group(1)), _broj(m.group(2)), _koren(m.group(3))
                if a and b:
                    nalazi.append((pojam, "od", a, b, pogl, rec.strip()))
            for m in UZORAK_POSLJEDNJA.finditer(rec):
                a, pojam = _broj(m.group(1)), _koren(m.group(2))
                if a:
                    nalazi.append((pojam, "posljednjih", a, None, pogl, rec.strip()))
            for m in UZORAK_REDNI.finditer(rec):
                a, pojam = _broj(m.group(1)), _koren(m.group(2))
                if a:
                    nalazi.append((pojam, "na mjestu", a, None, pogl, rec.strip()))
    return nalazi


def proturjecja(nalazi):
    """Isti pojam i ista vrsta tvrdnje, a različita vrijednost."""
    skupine = {}
    for pojam, vrsta, a, b, pogl, rec in nalazi:
        skupine.setdefault((pojam, vrsta), []).append((a, b, pogl, rec))
    out = []
    for (pojam, vrsta), stavke in sorted(skupine.items()):
        vrijednosti = {(a, b) for a, b, _, _ in stavke}
        if len(vrijednosti) > 1:
            out.append({"pojam": pojam, "vrsta": vrsta,
                        "vrijednosti": [{"vrijednost": a, "od": b, "poglavlje": p,
                                         "recenica": r[:200]} for a, b, p, r in stavke]})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rad")
    ap.add_argument("--json", dest="json_put")
    ap.add_argument("--strogo", action="store_true",
                    help="izlazni kod 1 kad postoji pitanje; zadano je 0 jer alat pita, "
                         "a ne presuđuje")
    a = ap.parse_args()
    doc = Document(a.rad)
    nalazi = skupi(doc)
    sporni = proturjecja(nalazi)

    print("=" * 74)
    print(f"BROJKE KOJE RAD SAM IZVODI — {os.path.basename(a.rad)}")
    print("=" * 74)
    print(f"pronađenih tvrdnji s brojkom: {len(nalazi)}")
    if not sporni:
        print("\n✅ nijedan pojam ne nosi dvije različite vrijednosti")
    for s in sporni:
        print(f"\n⚠️  „{s['pojam']}” ({s['vrsta']}) nosi {len(s['vrijednosti'])} navoda "
              f"s različitim vrijednostima:")
        for v in s["vrijednosti"]:
            koliko = f"{v['vrijednost']} od {v['od']}" if v["od"] else str(v["vrijednost"])
            print(f"   · {v['poglavlje']:>5}  {koliko:<10} {v['recenica'][:100]}")
    if sporni:
        # Različite vrijednosti uz isti pojam nisu same po sebi pogreška: dva
        # ciklusa uredno mogu imati „pet od sedam" i „dva od sedam". Alat zato
        # pita, ne presuđuje — lažni nalaz uči korisnika da preskoči i pravi
        # (željezno pravilo 3 skilla `katedra`).
        print("\nOvo je pitanje, ne nalaz. Različite vrijednosti mogu opisivati različite")
        print("stvari; provjeri opisuju li. Ako opisuju istu, izvor istine je prikaz, a ne")
        print("tekst — prebroji u prikazu pa uskladi sva mjesta.")

    if a.json_put:
        os.makedirs(os.path.dirname(os.path.abspath(a.json_put)), exist_ok=True)
        with open(a.json_put, "w", encoding="utf-8") as f:
            json.dump({"schema_version": 1, "tvrdnji": len(nalazi),
                       "proturjecja": sporni}, f, ensure_ascii=False, indent=2)
        print(f"\n[brojke → {a.json_put}]")
    return 1 if (sporni and a.strogo) else 0


if __name__ == "__main__":
    sys.exit(main())
