#!/usr/bin/env python3
"""Mapa: ključ citata → datoteka izvorne građe.

Uporaba:
  python3 mapa_izvora.py rad.docx --izvori izvori/ --izgradi izvori/mapa.json
  python3 mapa_izvora.py rad.docx --izvori izvori/ --mapa izvori/mapa.json   # provjeri

Zašto postoji
-------------
`cross_check.py` traži brojku iz rada kao podniz po SVIM izvorima zajedno. Veza
„ova rečenica citira ovaj izvor" ne postoji nigdje u lancu, pa brojka koja
postoji u izvoru A, a pripisana je izvoru B, prolazi kao čista. Ta se veza ne da
pogoditi iz teksta: mora se jednom zapisati.

Mapa je namjerno plitka i čitljiva rukom:

```json
{
  "closa-2021": {"datoteka": "Closa_2021_Article7.pdf.txt", "napomena": ""},
  "thinus-2025": {"datoteka": "Thinus_2025_JCMS.txt", "napomena": ""}
}
```

`--izgradi` je PRIJEDLOG, ne istina: uparuje jedinice iz popisa literature s
datotekama po prezimenu i godini u imenu datoteke, a sve što nije uparilo
ostavlja praznim, s popisom nepridruženih datoteka. Autor mapu dovrši rukom.
Prazan `datoteka` znači „izvor nije priložen" i to je deklarirana granica, ne
propust: `check_tvrdnja_izvor.py` takve citate izrijekom preskače i prijavi
koliko ih je.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common as C  # noqa: E402
import check_citations_authoryear as AY  # noqa: E402

CITLJIVE = (".txt", ".md", ".docx")


def _jedinice_iz_popisa(rad: str) -> set[tuple[str, str]]:
    body, cells, _ = C.load_docx_text(rad, include_tables=True)
    kljucevi, _ = AY.extract_biblio_keys(C.dio_literature(body))
    return kljucevi


def _datoteke(izvori: str) -> list[str]:
    out = []
    for p in sorted(glob.glob(os.path.join(izvori, "**", "*"), recursive=True)):
        if os.path.isfile(p) and not p.endswith("mapa.json"):
            out.append(os.path.relpath(p, izvori))
    return out


def predlozi(rad: str, izvori: str) -> dict:
    jedinice = _jedinice_iz_popisa(rad)
    datoteke = _datoteke(izvori)
    mapa, iskoristene = {}, set()
    for prezime, godina in sorted(jedinice):
        kljuc = f"{prezime}-{godina}"
        pogodak = ""
        for d in datoteke:
            ime = os.path.basename(d).lower()
            if prezime[:5] in ime and godina[:4] in ime:
                pogodak = d
                iskoristene.add(d)
                break
        mapa[kljuc] = {"datoteka": pogodak, "napomena": ""}
    return {"_nepridruzene_datoteke": [d for d in datoteke if d not in iskoristene],
            **mapa}


def ucitaj(put: str) -> dict:
    if not os.path.isfile(put):
        return {}
    with open(put, encoding="utf-8") as fh:
        d = json.load(fh)
    return {k: v for k, v in d.items() if not k.startswith("_")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Mapa ključ citata → datoteka izvora.")
    ap.add_argument("rad")
    ap.add_argument("--izvori", required=True)
    ap.add_argument("--izgradi", metavar="PUT", help="zapiši prijedlog mape")
    ap.add_argument("--mapa", metavar="PUT", help="provjeri postojeću mapu")
    a = ap.parse_args(argv)

    if not os.path.isdir(a.izvori):
        print(f"❌ nema mape izvora: {a.izvori}", file=sys.stderr)
        return 2

    if a.izgradi:
        m = predlozi(a.rad, a.izvori)
        os.makedirs(os.path.dirname(os.path.abspath(a.izgradi)), exist_ok=True)
        with open(a.izgradi, "w", encoding="utf-8") as fh:
            json.dump(m, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        upareno = sum(1 for k, v in m.items()
                      if not k.startswith("_") and v["datoteka"])
        ukupno = sum(1 for k in m if not k.startswith("_"))
        print(f"✔ prijedlog mape: {a.izgradi}")
        print(f"  upareno {upareno}/{ukupno} jedinica po prezimenu i godini u imenu datoteke")
        if m["_nepridruzene_datoteke"]:
            print(f"  nepridruženih datoteka: {len(m['_nepridruzene_datoteke'])}")
        print("  DOVRŠI RUKOM: prazan „datoteka” znači da izvor nije priložen.")
        print("  To je deklarirana granica; provjera tvrdnji takve citate preskače i broji.")
        return 0

    put = a.mapa or os.path.join(a.izvori, "mapa.json")
    mapa = ucitaj(put)
    if not mapa:
        print(f"❌ mapa ne postoji ili je prazna: {put}")
        print("   Izgradi je: mapa_izvora.py rad.docx --izvori izvori/ --izgradi izvori/mapa.json")
        return 2

    jedinice = {f"{p}-{g}" for p, g in _jedinice_iz_popisa(a.rad)}
    nalazi = 0
    fale = sorted(jedinice - set(mapa))
    viska = sorted(set(mapa) - jedinice)
    bez_datoteke = sorted(k for k, v in mapa.items() if not v.get("datoteka"))
    nepostojece = sorted(k for k, v in mapa.items() if v.get("datoteka")
                         and not os.path.isfile(os.path.join(a.izvori, v["datoteka"])))

    print("=" * 60)
    print("MAPA IZVORA —", put)
    print("=" * 60)
    print(f"jedinica u popisu: {len(jedinice)} | unosa u mapi: {len(mapa)}")
    for naslov, popis, tvrdo in [
        ("u popisu literature, a nema ih u mapi", fale, True),
        ("u mapi, a nema ih u popisu literature", viska, False),
        ("u mapi bez priložene datoteke (deklarirana granica)", bez_datoteke, False),
        ("mapa pokazuje na datoteku koje nema", nepostojece, True),
    ]:
        if popis:
            print(f"\n{'❌' if tvrdo else '⚠'} {naslov} ({len(popis)}):")
            for k in popis[:15]:
                print(f"   • {k}")
            if tvrdo:
                nalazi += len(popis)
    if not (fale or viska or bez_datoteke or nepostojece):
        print("\n✅ mapa je potpuna i sve datoteke postoje")
    return 1 if nalazi else 0


if __name__ == "__main__":
    sys.exit(main())
