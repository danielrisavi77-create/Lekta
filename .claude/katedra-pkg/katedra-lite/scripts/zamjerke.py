#!/usr/bin/env python3
"""Zatvaranje i pregled `.katedra/zamjerke.json` — druga polovica koju je nedostajalo.

`extract_comments.py` zamjerke OTVARA (svaka nova dobiva `status: otvoreno`).
Do sada nije postojao CLI da se zamjerka dokumentirano ZATVORI — zatvaranje se
radilo ručno, izravnim pisanjem u JSON, bez traga zašto je nešto proglašeno
riješenim i bez sigurnosne mreže koja bi upozorila na zaboravljenu stavku prije
isporuke. `references/intake.md` (0.7) izrijekom kaže da je "komentar mentora
koji se spomene u intakeu pa zaboravi... najskuplja greška u procesu" — ovaj
skript postoji da ta greška bude teže moguća, ne samo teorijski zabranjena.

Status vokabular ostaje kompatibilan s postojećim (`otvoreno`/`rijeseno`, v.
`mentor_feedback_state.py`), uz jedan dodatak koji se u praksi pokazao
potrebnim: `djelomicno` — zamjerka je adresirana, ali dio zahtijeva korisnikovu
odluku koju alat ne smije donijeti umjesto njega (npr. "jeste li stvarno čitali
ovo djelo, ili treba sekundarno referiranje?"). `djelomicno` se u `--provjeri`
prijavljuje odvojeno od `otvoreno`, ne skriva se pod "riješeno".

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/zamjerke.py resolve z23 --status rijeseno \
      --napomena "Dodan odlomak o posljedicama tjelesnog zlostavljanja."
  python3 <KATEDRA_SKILL>/scripts/zamjerke.py provjeri
  python3 <KATEDRA_SKILL>/scripts/zamjerke.py grupiraj --po tip
  python3 <KATEDRA_SKILL>/scripts/zamjerke.py grupiraj --po mjesto

Izlazni kodovi (`provjeri`):
  0  sve zamjerke riješene ili djelomično riješene s napomenom
  1  postoji barem jedna zamjerka statusa `otvoreno`
  2  `zamjerke.json` ne postoji ili se ne može pročitati
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from context import atomic_write_json, resolve_state_file  # noqa: E402

STATUSI = ("otvoreno", "rijeseno", "djelomicno")


def _now() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


def _load(path):
    if not os.path.isfile(path):
        print(f"❌ nema {path} — pokreni prvo extract_comments.py", file=sys.stderr)
        sys.exit(2)
    import json
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as exc:
        print(f"❌ ne mogu pročitati {path}: {exc}", file=sys.stderr)
        sys.exit(2)


def cmd_resolve(a) -> int:
    path = resolve_state_file("zamjerke.json", kat=a.kat, project_root=a.project_root)
    data = _load(path)
    zs = data.get("zamjerke", [])
    match = next((z for z in zs if z.get("id") == a.id), None)
    if match is None:
        print(f"❌ nema zamjerke s id={a.id!r} u {path}", file=sys.stderr)
        return 2
    if a.status not in STATUSI:
        print(f"❌ status mora biti jedan od: {', '.join(STATUSI)}", file=sys.stderr)
        return 2
    prijasnji = match.get("status")
    match["status"] = a.status
    match["rijeseno_gdje"] = a.napomena
    match.setdefault("history", []).append({
        "event": "resolved", "at": _now(), "status": a.status,
        "prijasnji_status": prijasnji, "napomena": a.napomena,
    })
    atomic_write_json(path, data, sidro=resolve_state_file("", kat=a.kat, project_root=a.project_root).rstrip(os.sep))
    print(f"✅ {a.id} → {a.status}")
    return 0


def cmd_provjeri(a) -> int:
    path = resolve_state_file("zamjerke.json", kat=a.kat, project_root=a.project_root)
    data = _load(path)
    zs = data.get("zamjerke", [])
    # samo prave komentare (ne praćene izmjene) osim ako je --sve zatraženo
    if not a.sve:
        zs = [z for z in zs if str(z.get("izvor_id", "")).startswith("komentar:")]
    otvorene = [z for z in zs if z.get("status") == "otvoreno"]
    djelomicne = [z for z in zs if z.get("status") == "djelomicno"]
    rijesene = [z for z in zs if z.get("status") == "rijeseno"]
    print(f"riješeno {len(rijesene)} · djelomično {len(djelomicne)} · otvoreno {len(otvorene)} (od {len(zs)})")
    if djelomicne:
        print()
        print("DJELOMIČNO — provjeri napomenu prije predaje:")
        for z in djelomicne:
            print(f"  · [{z.get('id')}] {z.get('rijeseno_gdje') or '(nema napomene)'}")
    if otvorene:
        print()
        print("OTVORENO — nije ni dotaknuto:")
        for z in otvorene:
            tekst = (z.get("tekst") or "")[:80].replace("\n", " ")
            print(f"  · [{z.get('id')}] {z.get('mjesto')}: {tekst}")
        return 1
    return 0


def cmd_grupiraj(a) -> int:
    path = resolve_state_file("zamjerke.json", kat=a.kat, project_root=a.project_root)
    data = _load(path)
    zs = [z for z in data.get("zamjerke", []) if str(z.get("izvor_id", "")).startswith("komentar:")]
    kljuc = a.po
    grupe: dict[str, list] = {}
    for z in zs:
        v = z.get(kljuc) or "(nepoznato)"
        if kljuc == "mjesto":
            v = str(v).split(" · ")[0].strip() or "(nepoznato)"
        grupe.setdefault(v, []).append(z)
    for naziv, stavke in grupe.items():
        print(f"\n### {naziv} ({len(stavke)})")
        for z in stavke:
            tekst = (z.get("tekst") or "")[:90].replace("\n", " ")
            znak = {"otvoreno": "☐", "rijeseno": "☑", "djelomicno": "◐"}.get(z.get("status"), "?")
            print(f"  {znak} [{z.get('id')}] {tekst}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kat", help="eksplicitna putanja do .katedra/")
    ap.add_argument("--project-root", help="korijen rada (zadano: cwd)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_resolve = sub.add_parser("resolve", help="zatvori jednu zamjerku uz napomenu")
    p_resolve.add_argument("id")
    p_resolve.add_argument("--status", required=True, choices=STATUSI)
    p_resolve.add_argument("--napomena", required=True, help="gdje/kako je riješeno, ili što ostaje otvoreno")

    p_provjeri = sub.add_parser("provjeri", help="ispiši sve što nije riješeno (blokirajuće za otvoreno)")
    p_provjeri.add_argument("--sve", action="store_true",
                             help="uključi i praćene izmjene, ne samo komentare")

    p_grupiraj = sub.add_parser("grupiraj", help="grupiraj otvorene komentare radi planiranja")
    p_grupiraj.add_argument("--po", choices=("tip", "mjesto", "autor"), default="tip")

    a = ap.parse_args()
    if a.cmd == "resolve":
        return cmd_resolve(a)
    if a.cmd == "provjeri":
        return cmd_provjeri(a)
    if a.cmd == "grupiraj":
        return cmd_grupiraj(a)
    return 2


if __name__ == "__main__":
    sys.exit(main())
