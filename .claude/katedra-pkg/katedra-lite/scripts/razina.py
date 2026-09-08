#!/usr/bin/env python3
"""Razina rada i predznanje čitatelja — zadaje se, ne zaključuje.

Zašto postoji
-------------
Do v1.4 Katedra je skalirala samo po TIPU rada: opseg, broj poglavlja,
`izvori_min`, plus tri radna moda u `pisanje.md`. Nije postojalo nijedno polje
za ono što zapravo odlučuje kako rečenica izgleda — **koliko čitatelj već zna**.
Isti pojam za studenta prve godine traži definiciju, izvor i primjer; za
povjerenstvo koje tim pojmom radi dvadeset godina ista je definicija gubitak
prostora i signal da autor ne zna kome piše.

Načelo koje se ne smije izokrenuti
----------------------------------
**Niža razina ne znači lošiji rad.** Znači rad koji više objašnjava i manje
tvrdi. Ovaj modul zato nigdje ne spušta zahtjeve na točnost, izvore ni argument
— mijenja dubinu objašnjavanja, očekivani doprinos i omjer teorije i analize.

Kao i citatni stil, razina se **deklarira** (SKILL.md § 0.8). Iz teksta se ne
zaključuje: rad koji mnogo objašnjava može biti prvi semestar ili loš diplomski,
a alat tu razliku ne vidi.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(SKRIPTE)
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402

REGISTAR = os.path.join(KORIJEN, "references", "razina.json")
STANJE_IME = "razina.json"
SHEMA = 1

# Tip rada → predložena razina. Prijedlog, ne odluka: student na diplomskom piše
# i seminarske, a završni na stručnom studiju nije isto što i na sveučilišnom.
PRIJEDLOG_PO_TIPU = {
    "seminarski": "preddiplomski-1-2",
    "esej": "preddiplomski-1-2",
    "zavrsni": "preddiplomski-3",
    "diplomski": "diplomski",
}


class RazinaError(RuntimeError):
    """Registar razina je neispravan ili nedostupan."""


def ucitaj_registar(put: str = REGISTAR) -> dict:
    try:
        with open(put, encoding="utf-8") as f:
            reg = json.load(f)
    except FileNotFoundError as e:
        raise RazinaError(f"registar razina nije nađen: {put}") from e
    except json.JSONDecodeError as e:
        raise RazinaError(f"registar razina nije valjan JSON: {e}") from e
    for kljuc in ("razine", "citatelji"):
        if not isinstance(reg.get(kljuc), dict) or not reg[kljuc]:
            raise RazinaError(f"registar nema ključ '{kljuc}'")
    return reg


def _put(args) -> str:
    return context.resolve_state_file(
        STANJE_IME, kat=getattr(args, "kat", None),
        project_root=getattr(args, "project_root", None))


def ucitaj_stanje(put: str) -> dict | None:
    try:
        with open(put, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as e:
        raise RazinaError(f"{put} nije valjan JSON: {e}") from e


def upute(reg: dict, stanje: dict) -> dict:
    """Iz razine i čitatelja izvedi ono što obvezuje pisanje.

    Vraća strukturu koju mod 2 čita prije prve rečenice, jednako obvezujuću kao
    kućni stil fakulteta. Ništa se ne izmišlja — sve stoji u registru.
    """
    rid = stanje.get("razina")
    cid = stanje.get("citatelj")
    r = (reg["razine"] or {}).get(rid)
    if not r:
        raise RazinaError(f"nepoznata razina: {rid!r}; "
                          f"dostupne: {', '.join(reg['razine'])}")
    c = (reg["citatelji"] or {}).get(cid) if cid else None

    tp = r.get("omjer_teorija_analiza") or [None, None]
    out = {
        "razina": rid,
        "razina_naziv": r.get("naziv"),
        "smije_se_pretpostaviti": r.get("smije_se_pretpostaviti"),
        "definiraj": (r.get("pojmovi") or {}).get("definiraj"),
        "pretpostavi": (r.get("pojmovi") or {}).get("pretpostavi"),
        "omjer_teorija_analiza": tp,
        "doprinos": r.get("doprinos"),
        "izvori_tipicno": (r.get("izvori") or {}).get("tipicno") or [],
        "izvori_minimalna_kvaliteta": (r.get("izvori") or {}).get("minimalna_kvaliteta"),
        "recenica": r.get("rečenica") or r.get("recenica"),
        "citatelj": cid,
        "citatelj_naziv": (c or {}).get("naziv"),
        "citatelj_zna": (c or {}).get("zna"),
        "citatelj_posljedica": (c or {}).get("posljedica"),
        "tema_poznata_citatelju": stanje.get("tema_poznata_citatelju"),
        "napomene": stanje.get("napomene") or [],
    }
    return out


def _ispis(u: dict) -> None:
    print("RAZINA RADA — što se smije pretpostaviti, a što se objašnjava")
    print("=" * 62)
    print(f"  razina:    {u['razina_naziv']}  ({u['razina']})")
    if u["citatelj_naziv"]:
        print(f"  čitatelj:  {u['citatelj_naziv']} — {u['citatelj_zna']}")
    tema = u.get("tema_poznata_citatelju")
    if tema is not None:
        print(f"  temu poznaje: {'da' if tema else 'ne'}")
    print()
    print(f"  SMIJE SE PRETPOSTAVITI  {u['smije_se_pretpostaviti']}")
    print(f"  DEFINIRAJ               {u['definiraj']}")
    print(f"  PRETPOSTAVI             {u['pretpostavi']}")
    t, a = u["omjer_teorija_analiza"]
    if t is not None:
        print(f"  OMJER teorija:analiza   {t:.0%} : {a:.0%}")
    print(f"  OČEKIVAN DOPRINOS       {u['doprinos']}")
    print(f"  IZVORI                  {', '.join(u['izvori_tipicno'])}"
          f"  (min. kvaliteta {u['izvori_minimalna_kvaliteta']})")
    print(f"  REČENICA                {u['recenica']}")
    if u["citatelj_posljedica"]:
        print(f"\n  IZ ČITATELJA SLIJEDI    {u['citatelj_posljedica']}")
    if u["tema_poznata_citatelju"] is False:
        print("  Tema je čitatelju izvan uže specijalnosti: kontekst ide PRIJE "
              "tvrdnje,\n  a uži pojmovi se definiraju i na višoj razini.")
    for n in u["napomene"]:
        print(f"  · {n}")
    print("\nNiža razina NIJE lošiji rad — rad koji više objašnjava i manje tvrdi.")
    print("Kad se razina sudari s Uputama fakulteta, Upute pobjeđuju, a sudar se")
    print("javi izrijekom (željezna pravila 16 i 17).")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Razina rada i predznanje čitatelja — zadaje se, ne zaključuje.")
    ap.add_argument("--postavi", metavar="RAZINA",
                    help="preddiplomski-1-2 | preddiplomski-3 | diplomski | poslijediplomski")
    ap.add_argument("--citatelj", help="nositelj | mentor | komisija | sira-publika")
    ap.add_argument("--tema-poznata", dest="tema_poznata",
                    choices=("da", "ne"),
                    help="poznaje li čitatelj ovu užu temu")
    ap.add_argument("--napomena", action="append", default=None,
                    help="dodatna obveza koju je zadao mentor ili nositelj")
    ap.add_argument("--tip", help="predloži razinu iz tipa rada (ne zapisuje)")
    ap.add_argument("--popis", action="store_true", help="ispiši sve razine i čitatelje")
    ap.add_argument("--registar", default=REGISTAR)
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--json", dest="kao_json", action="store_true")
    args = ap.parse_args(argv)

    try:
        reg = ucitaj_registar(args.registar)
    except RazinaError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2

    if args.popis:
        print("RAZINE:")
        for k, v in reg["razine"].items():
            print(f"  {k:<20} {v['naziv']} — tipično: {', '.join(v.get('tipicno') or [])}")
        print("\nČITATELJI:")
        for k, v in reg["citatelji"].items():
            print(f"  {k:<20} {v['naziv']} — zna: {v['zna']}")
        return 0

    if args.tip:
        prijedlog = PRIJEDLOG_PO_TIPU.get(args.tip)
        if not prijedlog:
            print(f"❌ nepoznat tip: {args.tip}", file=sys.stderr)
            return 2
        print(f"prijedlog za tip „{args.tip}”: {prijedlog} "
              f"({reg['razine'][prijedlog]['naziv']})")
        print("Prijedlog, ne odluka — student diplomskog piše i seminarske, a "
              "završni na\nstručnom studiju nije isto što i na sveučilišnom. "
              "Potvrdi s --postavi.")
        return 0

    put = _put(args)
    try:
        stanje = ucitaj_stanje(put)

        if args.postavi or args.citatelj or args.tema_poznata or args.napomena:
            stanje = stanje or {"schema_version": SHEMA,
                                "zabiljezeno": date.today().isoformat()}
            if args.postavi:
                if args.postavi not in reg["razine"]:
                    print(f"❌ nepoznata razina: {args.postavi}; dostupne: "
                          f"{', '.join(reg['razine'])}", file=sys.stderr)
                    return 2
                stanje["razina"] = args.postavi
            if args.citatelj:
                if args.citatelj not in reg["citatelji"]:
                    print(f"❌ nepoznat čitatelj: {args.citatelj}; dostupni: "
                          f"{', '.join(reg['citatelji'])}", file=sys.stderr)
                    return 2
                stanje["citatelj"] = args.citatelj
            if args.tema_poznata:
                stanje["tema_poznata_citatelju"] = (args.tema_poznata == "da")
            if args.napomena:
                stanje["napomene"] = sorted(
                    set(stanje.get("napomene") or []) | set(args.napomena))
            stanje["azurirano"] = date.today().isoformat()
            context.atomic_write_json(put, stanje)
            print(f"✅ zapisano: {put}")

        if stanje is None:
            print("❌ nema .katedra/razina.json — postavi ju u modu 1:\n"
                  "   razina.py --postavi <razina> --citatelj <tko> "
                  "[--tema-poznata da|ne]\n"
                  "   (prijedlog iz tipa rada: razina.py --tip <tip>)",
                  file=sys.stderr)
            return 2

        u = upute(reg, stanje)
        if args.kao_json:
            print(json.dumps(u, ensure_ascii=False, indent=1))
        else:
            _ispis(u)
        return 0
    except RazinaError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
