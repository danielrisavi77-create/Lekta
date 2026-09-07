#!/usr/bin/env python3
"""Jezik rada — deklarira se, i alati koji ga ne podržavaju se ISKLJUČE.

Zašto postoji
-------------
Do v1.8 nijedan profil nije imao polje `jezik`, a cijeli je lanac tiho
pretpostavljao hrvatski: `hr_text`, `provjeri_jezik`, `check_ai_style`,
`provjeri_sazetak`, hrvatska kolacija u popisu literature, citatni dijalekti.

Rad pisan **na engleskom** na hrvatskom fakultetu (dio programa na FPZG-u,
poslovne škole) time nije dobivao poruku „ne mogu”. Dobivao je **nalaze**, i svi
su bili krivi: svaka rečenica „pravopisna pogreška”, nijedna kohezijska veza
prepoznata, popis literature presložen po hrvatskoj abecedi.

To nije rupa nego **generator lažnih nalaza** — a lažni nalaz je kvar jednake
težine kao promašeni (željezno pravilo 18). Alat koji viče na uredan rad uči
korisnika da ignorira crvenu boju.

Načelo
------
Jezik se **deklarira**, kao citatni stil i razina (SKILL.md § 0.8). Ne zaključuje
se iz teksta: rad s engleskim sažetkom i hrvatskim tijelom, i rad s hrvatskim
sažetkom i engleskim tijelom, iz uzorka slova izgledaju slično.

Alat koji jezik ne podržava **ne radi ništa i to kaže** — izlazni kod 0 uz
deklarirano ograničenje, ne izlazni kod 1 uz izmišljene nalaze.
"""
from __future__ import annotations

import json
import os
import sys

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

ZADANO = "hr"
NAZIVI = {"hr": "hrvatski", "en": "engleski", "de": "njemački",
          "it": "talijanski", "fr": "francuski"}


def _json(put):
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError, TypeError):
        return None


def razrijesi(kat=None, profil=None):
    """(jezik, izvor). Redoslijed: stanje projekta → profil → zadano.

    Zadano je `hr` jer je to jezik za koji je paket građen; svaki drugi jezik
    mora biti **zadan**, da bi izostanak polja bio vidljiv kao izostanak, a ne
    kao tiha pretpostavka.
    """
    if kat:
        s = _json(os.path.join(kat, "stanje.json")) or {}
        j = (s.get("jezik") or "").strip().lower()
        if j:
            return j, "stanje.json"
    p = profil if isinstance(profil, dict) else _json(profil)
    if p:
        j = ((p.get("format") or {}).get("jezik") or p.get("jezik") or "")
        j = str(j).strip().lower()
        if j:
            return j, "profil fakulteta"
    return ZADANO, "zadano (nijedan izvor ne deklarira jezik)"


def naziv(j):
    return NAZIVI.get(j, j)


def guard(alat, podrzani=("hr",), kat=None, profil=None, tiho=False):
    """(smije_raditi, jezik, izvor). Ispiše ograničenje kad alat ne podržava jezik.

    Namjerno vraća „smije” kad je jezik ZADAN a ne deklariran — inače bi svaki
    postojeći projekt odjednom stao. Ali tada ispisuje upozorenje, da izostanak
    deklaracije ne ostane nevidljiv.
    """
    j, izvor = razrijesi(kat, profil)
    if j in podrzani:
        if izvor.startswith("zadano") and not tiho:
            print(f"⚠️  jezik rada nije deklariran — pretpostavlja se "
                  f"{naziv(ZADANO)}. Zadaj ga:\n"
                  f"    stanje_init.py --set jezik=hr|en|…", file=sys.stderr)
        return True, j, izvor
    if not tiho:
        print(f"➖ {alat} podržava {', '.join(naziv(x) for x in podrzani)}, "
              f"a rad je na jeziku „{naziv(j)}” ({izvor}).")
        print(f"   Provjera se NE izvodi. Alat bi na tekstu drugog jezika "
              f"proizveo nalaze\n   koji nisu pogreške — a lažni nalaz je kvar "
              f"jednake težine kao promašeni\n   (željezno pravilo 18). "
              f"Ograničenje upiši u projekt:")
        print(f"   stanje_init.py --ogranicenje \"{alat} ne pokriva "
              f"{naziv(j)}\"")
    return False, j, izvor


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(
        description="Jezik rada: razriješi iz stanja ili profila.")
    ap.add_argument("--profil")
    ap.add_argument("--kat")
    ap.add_argument("--project-root", dest="project_root")
    args = ap.parse_args(argv)
    import context
    kat = args.kat or context.resolve_state_dir(None, args.project_root)
    j, izvor = razrijesi(kat, args.profil)
    print(f"jezik rada: {naziv(j)} ({j}) — izvor: {izvor}")
    if izvor.startswith("zadano"):
        print("\n⚠️  Nijedan izvor ne deklarira jezik. Alati vezani uz hrvatski "
              "rade dalje,\n    ali na radu koji NIJE na hrvatskom davali bi lažne "
              "nalaze. Zadaj ga:\n    stanje_init.py --set jezik=hr|en")
    return 0


if __name__ == "__main__":
    sys.exit(main())
