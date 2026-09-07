# -*- coding: utf-8 -*-
"""Sastavlja rad_predaja.md po redoslijedu uzornog rada.

Redoslijed: naslovnice → izjava → [prijelom sekcije] → Sadržaj → poglavlja →
Literatura → Popis tablica → Popis grafikona → Prilog → Sažetak → Summary.
Sadržaj i popisi prikaza ubacuje build3.py kao živa Word polja.
"""
import json, pathlib
KONF = json.loads(pathlib.Path("rad.json").read_text(encoding="utf-8")) \
    if pathlib.Path("rad.json").exists() else {}

DIJELOVI = KONF.get("dijelovi") or [
    "predtekst.md",
    "[[SEC]]",                       # prijelom sekcije: odavde kreće numeracija
    "pog1_uvod.md",
    "pog2_teorija.md",
    "pog3_metodologija.md",
    "pog4_rezultati.md",
    "pog5_rasprava.md",
    "pog6_zakljucak.md",
    "literatura.md",
    "prilog.md",
    "zatekst.md",
]

out = []
for dio in DIJELOVI:
    if dio == "[[SEC]]":
        out.append("[[SEC]]\n")
        continue
    t = open(dio, encoding="utf-8").read().strip()
    if dio == "literatura.md":
        t = t.replace("# POPIS IZVORA", "# Literatura", 1)
        t = "[[PB]]\n\n" + t
    elif dio.startswith("pog") and not t.startswith("[[PB]]"):
        t = t  # poglavlja teku bez prijeloma, kao u uzoru
    out.append(t + "\n")

tekst = "\n".join(out)
open("rad_predaja.md", "w", encoding="utf-8").write(tekst)

import re
print("riječi ukupno:", len(tekst.split()))
print("naslovi 1. razine:", re.findall(r"^# (.+)$", tekst, flags=re.M))
