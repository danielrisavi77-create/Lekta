#!/usr/bin/env python3
"""v1.1 (NEW-104) — Sokratski stress-test plana prije odobrenja (opcionalni, advisory).

Inspirirano "grill-me" obrascem iz zajednice (Socratic stress-test prije
izvršenja plana): serija teških pitanja o tezi, metodologiji, dokazima i
strukturi, odgovorena PRIJE pisanja, ne poslije. Cilj je da mentor/komisija
prvi put čuje odgovor na obrani, ne prvi put postavi pitanje.

**Ovo NIJE dio PLAN GATE-a i ne blokira `plan_state.py odobri`.** B14 plan
gate ostaje jedini machine-enforced preduvjet za odobrenje; grill-me je
preporučen, ali odvojiv korak — postojeći certificirani gate contract se ne
dira. Odgovori se spremaju u `.katedra/plan_stress_test.json` radi kasnije
pripreme obrane (mod 5).

Uporaba:
  python3 <KATEDRA_SKILL>/scripts/grill_me.py pitanja --tip diplomski
  python3 <KATEDRA_SKILL>/scripts/grill_me.py zabiljezi \
      --pitanje "Koji je najjači protuargument tvojoj tezi?" \
      --odgovor "..." --kategorija teza
  python3 <KATEDRA_SKILL>/scripts/grill_me.py status
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from context import resolve_state_file  # noqa: E402

PITANJA: list[dict[str, str]] = [
    {"kategorija": "teza", "pitanje": "Može li se s tvojom tezom NE složiti? Ako ne, to nije teza nego opis."},
    {"kategorija": "teza", "pitanje": "Koji je najjači protuargument tvojoj tezi, i zašto ga rad ipak nadglasava?"},
    {"kategorija": "teza", "pitanje": "Koji jedan podatak, kad bi se pokazao netočnim, najviše bi oslabio tvoj zaključak?"},
    {"kategorija": "metodologija", "pitanje": "Zašto baš ova metoda/pristup, a ne očita alternativa koju bi netko predložio?"},
    {"kategorija": "metodologija", "pitanje": "Koje je najveće metodološko ograničenje, i kako ga rad priznaje umjesto da ga sakriva?"},
    {"kategorija": "dokazi", "pitanje": "Koja tvrdnja u radu ima najslabiju izvornu potporu, i zašto je ipak ostala unutra?"},
    {"kategorija": "dokazi", "pitanje": "Kad bi tvoj najvažniji izvor bio povučen/osporen, koji bi dio zaključka pao s njim?"},
    {"kategorija": "struktura", "pitanje": "Koje bi se poglavlje moglo izbaciti bez da se argument sruši? Zašto ipak ostaje?"},
    {"kategorija": "struktura", "pitanje": "Gdje je prijelaz između poglavlja najslabiji — gdje čitatelj mora sam popuniti prazninu?"},
    {"kategorija": "doprinos", "pitanje": "Što je u radu stvarno novo, a što je sažetak tuđeg rada s tvojim komentarom?"},
    {"kategorija": "doprinos", "pitanje": "Kad bi netko drugi imao isti materijal, bi li došao do istog zaključka? Zašto/zašto ne?"},
    {"kategorija": "obrana", "pitanje": "Koje pitanje bi te najviše dovelo u nezgodnu poziciju na obrani, i imaš li već odgovor?"},
]

_TIP_NAPOMENA = {
    "seminarski": "Za seminarski dovoljno je odgovoriti na teza + jedno pitanje iz dokazi/struktura.",
    "esej": "Za esej dovoljno je odgovoriti na kategoriju teza.",
    "zavrsni": "Preporučeno: sve kategorije, barem jedno pitanje po kategoriji.",
    "diplomski": "Preporučeno: sve kategorije, uključujući obranu — diplomski ide pred komisiju.",
}


def _ucitaj_tezu(kat: str | None, project_root: str | None) -> str | None:
    put = resolve_state_file("plan.json", kat=kat, project_root=project_root)
    if not os.path.isfile(put):
        return None
    try:
        with open(put, encoding="utf-8") as f:
            return (json.load(f).get("teza") or "").strip() or None
    except (OSError, json.JSONDecodeError, AttributeError):
        return None


def _log_put(kat: str | None, project_root: str | None) -> str:
    return resolve_state_file("plan_stress_test.json", kat=kat, project_root=project_root)


class GreskaUlaza(Exception):
    """`plan_stress_test.json` postoji ali nije čitljiv/valjan — izlazni kod 2."""


def _ucitaj_log(put: str) -> dict[str, Any]:
    """Učitaj log; nepostojeća datoteka je normalan prazan-log slučaj, ali
    korumpirana/krivo oblikovana datoteka diže `GreskaUlaza` s uputom za
    korisnika, umjesto sirovog tracebacka.

    v1.1-advisory fix (nezavisna revizija, bug #12): prije je `json.load()`
    bio pozvan bez ikakvog error-handlinga — `{}` (prazan objekt) je na
    `zabiljezi` rušio s `KeyError: 'zapisi'`, a ne-JSON sadržaj na `status` je
    rušio s `json.decoder.JSONDecodeError`, oboje kao sirovi Python
    tracebackovi. Ostatak codebase-a (`plan_state.py ucitaj()`) ima
    utvrđenu konvenciju: uhvati `OSError`/`json.JSONDecodeError`, ispiši
    „❌ ... Što napraviti: ..." i vrati kontroliran izlazni kod, ne traceback.
    """
    if not os.path.isfile(put):
        return {"schema_version": 1, "alat": "grill_me", "zapisi": []}
    try:
        with open(put, encoding="utf-8") as f:
            podaci = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise GreskaUlaza(
            f"{put} nije čitljiv JSON: {e}\n"
            f"   Što napraviti: vrati zadnju verziju iz gita, ili obriši datoteku da "
            f"grill_me.py krene od praznog loga."
        ) from e
    if not isinstance(podaci, dict) or not isinstance(podaci.get("zapisi"), list):
        raise GreskaUlaza(
            f"{put} nema očekivan oblik (objekt s poljem \"zapisi\": [...]).\n"
            f"   Što napraviti: vrati zadnju verziju iz gita, ili obriši datoteku da "
            f"grill_me.py krene od praznog loga."
        )
    return podaci


def _spremi_log(put: str, podaci: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(put)) or ".", exist_ok=True)
    tmp = put + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(podaci, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, put)


def cmd_pitanja(args: argparse.Namespace) -> int:
    teza = args.teza or _ucitaj_tezu(args.kat, args.project_root)
    if args.json_out:
        print(json.dumps({"schema_version": 1, "teza": teza, "pitanja": PITANJA},
                          ensure_ascii=False, indent=1))
        return 0
    print("=" * 78)
    print("GRILL-ME — sokratski stress-test plana (advisory, ne blokira gate)")
    print("=" * 78)
    if teza:
        print(f"Teza: {teza}\n")
    if args.tip and args.tip in _TIP_NAPOMENA:
        print(f"({_TIP_NAPOMENA[args.tip]})\n")
    trenutna = None
    for i, p in enumerate(PITANJA, 1):
        if p["kategorija"] != trenutna:
            trenutna = p["kategorija"]
            print(f"\n[{trenutna.upper()}]")
        print(f"  {i}. {p['pitanje']}")
    print("\nOdgovore bilježi s: grill_me.py zabiljezi --pitanje \"...\" --odgovor \"...\"")
    return 0


def cmd_zabiljezi(args: argparse.Namespace) -> int:
    put = _log_put(args.kat, args.project_root)
    try:
        podaci = _ucitaj_log(put)
    except GreskaUlaza as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2
    podaci["zapisi"].append({
        "pitanje": args.pitanje,
        "odgovor": args.odgovor,
        "kategorija": args.kategorija,
        "vrijeme": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    })
    _spremi_log(put, podaci)
    print(f"[grill-me → {put}] {len(podaci['zapisi'])} zabilježen(ih) odgovora")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    put = _log_put(args.kat, args.project_root)
    try:
        podaci = _ucitaj_log(put)
    except GreskaUlaza as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2
    odgovoreno = len(podaci["zapisi"])
    ukupno = len(PITANJA)
    print(f"grill-me status: {odgovoreno} zabilježen(ih) odgovora "
          f"(bez formalnog cilja — orijentacijski nasuprot {ukupno} pitanja u banci)")
    kategorije = sorted({p["kategorija"] for p in podaci["zapisi"]})
    if kategorije:
        print(f"pokrivene kategorije: {', '.join(kategorije)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Sokratski stress-test plana prije obrane/pisanja (advisory, ne blokira PLAN GATE)."
    )
    ap.add_argument("--kat", default=None, help="eksplicitna .katedra/ mapa")
    ap.add_argument("--project-root", default=None, help="korijen projekta (default cwd)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("pitanja", help="ispiši pitanja")
    p1.add_argument("--tip", choices=["seminarski", "esej", "zavrsni", "diplomski"], default=None)
    p1.add_argument("--teza", default=None, help="override; inače se čita iz plan.json")
    p1.add_argument("--json", dest="json_out", action="store_true")
    p1.set_defaults(func=cmd_pitanja)

    p2 = sub.add_parser("zabiljezi", help="zabilježi odgovor")
    p2.add_argument("--pitanje", required=True)
    p2.add_argument("--odgovor", required=True)
    p2.add_argument("--kategorija",
                     choices=["teza", "metodologija", "dokazi", "struktura", "doprinos", "obrana"],
                     default="teza")
    p2.set_defaults(func=cmd_zabiljezi)

    p3 = sub.add_parser("status", help="pregled zabilježenih odgovora")
    p3.set_defaults(func=cmd_status)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
