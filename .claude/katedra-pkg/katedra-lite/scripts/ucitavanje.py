#!/usr/bin/env python3
"""Što se u ovom modu, na OVOM projektu, mora pročitati — i što se ne smije.

Zašto postoji
-------------
Dva zahtjeva koja vuku na suprotne strane: učitaj samo ono što treba, i nikad ne
preskoči ono što se mora znati. Fiksan popis po modu ne rješava nijedan — ili je
prekratak pa se nešto preskoči, ili predug pa se učitava metodologija na radu
koji nema istraživanje.

Rješenje je popis **izveden iz stanja projekta**. Rad bez vlastitog istraživanja
ne treba `metodologija.md`; rad kojemu je razina već zadana ne treba `razina.md`
nego samo ispis `razina.py`; rad koji nema `model.json` ne treba `izracuni.md`.
Uvjeti se evaluiraju protiv `.katedra/`, pa je popis točan za ovaj rad, danas.

Što ovo NE MOŽE
---------------
**Ne može provjeriti je li nešto stvarno pročitano.** Nijedan alat to ne može, i
ne pretvara se da može (željezno pravilo 8). Ono što može, i što je cijela
vrijednost: ukloniti nagađanje. Popis je izračunat, imenovan i obrazložen — pa se
ne pamti nego čita. Isti odnos kao `gate.py` prema provjerama: alat ne jamči da
je posao dobro obavljen, jamči da se ne zaboravi koji je posao.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
KORIJEN = os.path.dirname(SKRIPTE)
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402

UGOVOR = os.path.join(KORIJEN, "references", "ucitavanje.json")
ZNAK_B = "●"   # obavezno
ZNAK_U = "○"   # uvjetno, uvjet ispunjen
ZNAK_N = "·"   # uvjet nije ispunjen — NE učitavaj
ZNAK_X = "✕"   # nikad tijekom rada


class UgovorError(RuntimeError):
    pass


def ucitaj_ugovor(put: str = UGOVOR) -> dict:
    try:
        with open(put, encoding="utf-8") as f:
            u = json.load(f)
    except FileNotFoundError as e:
        raise UgovorError(f"ugovor o učitavanju nije nađen: {put}") from e
    except json.JSONDecodeError as e:
        raise UgovorError(f"ugovor nije valjan JSON: {e}") from e
    if not isinstance(u.get("modovi"), dict):
        raise UgovorError("ugovor nema ključ 'modovi'")
    return u


def _json(kat, ime):
    try:
        with open(os.path.join(kat, ime), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def evaluiraj(uvjet: str, kat: str) -> tuple[bool, str]:
    """(ispunjen, objašnjenje). Nepoznat uvjet je ISPUNJEN, ne preskočen.

    Namjerno: uvjet koji se ne razumije ne smije tiho izbaciti referencu iz
    popisa. Preskočeno štivo je skuplje od suvišnog (pravilo 8).
    """
    if not uvjet or uvjet == "uvijek":
        return True, "bezuvjetno"
    if ":" not in uvjet:
        return True, f"nepoznat uvjet „{uvjet}” — učitava se za svaki slučaj"
    vrsta, arg = uvjet.split(":", 1)

    if vrsta in ("nema", "ima"):
        postoji = os.path.exists(os.path.join(kat, arg))
        if vrsta == "nema":
            return (not postoji), (f"{arg} ne postoji" if not postoji
                                   else f"{arg} postoji — ne treba")
        return postoji, (f"{arg} postoji" if postoji else f"{arg} ne postoji")

    if vrsta == "dio":
        d = _json(kat, "dijelovi.json")
        if not d:
            return True, "nema dijelovi.json — ne zna se treba li, učitava se"
        z = (d.get("dijelovi") or {}).get(arg)
        if not z:
            return True, f"dio „{arg}” nije u stanju — učitava se"
        trazi = z.get("trazi_profil")
        if trazi == "ne" or z.get("status") == "ne-primjenjuje-se":
            return False, f"dio „{arg}” se ne primjenjuje na ovaj rad"
        return True, f"dio „{arg}”: {trazi}"

    if vrsta == "tip":
        s = _json(kat, "stanje.json") or {}
        t = s.get("tip")
        if not t:
            return True, "tip rada nije zadan — učitava se"
        return (t == arg), f"tip je {t}"

    if vrsta == "fakultet":
        # slug iz stanje.json (fakultet.slug ili fakultet kao string), rezerva
        # resolved_profile.json → slug. Bez ijednog od toga se NE zna, pa se učitava.
        s = _json(kat, "stanje.json") or {}
        f = s.get("fakultet")
        slug = (f.get("slug") if isinstance(f, dict) else f) or \
            (_json(kat, "resolved_profile.json") or {}).get("slug")
        if not slug:
            return True, "fakultet nije zadan — učitava se"
        return (str(slug).lower() == arg.lower()), f"fakultet je {slug}"

    if vrsta == "prazno":
        dat, _, kljuc = arg.partition(":")
        d = _json(kat, dat)
        if d is None:
            return True, f"{dat} ne postoji"
        prazno = not (d or {}).get(kljuc)
        return prazno, (f"{dat}:{kljuc} je prazno" if prazno
                        else f"{dat}:{kljuc} je popunjeno")

    return True, f"nepoznata vrsta uvjeta „{vrsta}” — učitava se"


def popis(ugovor: dict, mod: str, kat: str) -> dict:
    m = (ugovor.get("modovi") or {}).get(str(mod))
    if not m:
        raise UgovorError(f"nepoznat mod: {mod}; "
                          f"dostupni: {', '.join(ugovor['modovi'])}")
    treba, ne_treba = [], []
    for x in ugovor.get("uvijek") or []:
        treba.append({**x, "vrsta": "uvijek", "razlog_uvjeta": "router"})
    for x in m.get("obavezno") or []:
        treba.append({**x, "vrsta": "obavezno", "razlog_uvjeta": "protokol moda"})
    for x in m.get("uvjetno") or []:
        ok, zasto_uvjet = evaluiraj(x.get("uvjet"), kat)
        (treba if ok else ne_treba).append(
            {**x, "vrsta": "uvjetno", "razlog_uvjeta": zasto_uvjet})
    return {"mod": str(mod), "naziv": m.get("naziv"), "treba": treba,
            "ne_treba": ne_treba, "na_zahtjev": m.get("na_zahtjev") or [],
            "nikad": ugovor.get("nikad_tijecom_rada")
            or ugovor.get("nikad_tijekom_rada") or []}


def _bajta(ref):
    p = os.path.join(KORIJEN, ref)
    return os.path.getsize(p) if os.path.isfile(p) else 0


def ispisi(r, opsirno=False):
    naslov = f"UČITAVANJE — mod {r['mod']} ({r['naziv']})"
    print(naslov)
    print("=" * len(naslov))
    uk = 0
    print("\nMORA SE PROČITATI")
    for x in r["treba"]:
        n = _bajta(x["ref"])
        uk += n
        znak = ZNAK_B if x["vrsta"] in ("obavezno", "uvijek") else ZNAK_U
        print(f"  {znak} {x['ref']:<34} {n:>6} B   {x['zasto']}")
        if opsirno and x["vrsta"] == "uvjetno":
            print(f"      uvjet: {x.get('uvjet')} → {x['razlog_uvjeta']}")

    if r["ne_treba"]:
        usteda = sum(_bajta(x["ref"]) for x in r["ne_treba"])
        print(f"\nNE UČITAVAJ — uvjet nije ispunjen  (ušteda {usteda} B "
              f"≈ {usteda // 3} tokena)")
        for x in r["ne_treba"]:
            print(f"  {ZNAK_N} {x['ref']:<34} {_bajta(x['ref']):>6} B   "
                  f"{x['razlog_uvjeta']}")

    if r.get("na_zahtjev"):
        print("\nNE UČITAVAJ SADA — otvori tek na okidač")
        for x in r["na_zahtjev"]:
            print(f"  {ZNAK_N} {x['ref']:<34} okidač: {x['okidac']}")
            print(f"      {x['zasto']}")

    if opsirno:
        print("\nNIKAD TIJEKOM RADA")
        for x in r["nikad"]:
            print(f"  {ZNAK_X} {x['ref']:<34} {x['zasto']}")

    print(f"\nukupno za učitati: {uk} B ≈ {uk // 3} tokena")
    print("Popis je izveden iz stanja projekta, ne fiksan. Uvjet koji se ne")
    print("razumije NE izbacuje referencu — preskočeno štivo skuplje je od suvišnog.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Što se u ovom modu i na ovom projektu mora pročitati.")
    ap.add_argument("--mod", required=True,
                    help="1–7 (novi rad, pisanje, poboljšanje, audit, obrana, "
                         "predaja, povratak)")
    ap.add_argument("--ugovor", default=UGOVOR)
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--opsirno", action="store_true",
                    help="prikaži uvjete i popis onoga što se nikad ne učitava")
    ap.add_argument("--json", dest="kao_json", action="store_true")
    args = ap.parse_args(argv)

    try:
        ugovor = ucitaj_ugovor(args.ugovor)
        kat = context.resolve_state_dir(args.kat, args.project_root)
        r = popis(ugovor, args.mod, kat)
    except UgovorError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 2

    if args.kao_json:
        print(json.dumps(r, ensure_ascii=False, indent=1))
    else:
        ispisi(r, opsirno=args.opsirno)
    return 0


if __name__ == "__main__":
    sys.exit(main())
