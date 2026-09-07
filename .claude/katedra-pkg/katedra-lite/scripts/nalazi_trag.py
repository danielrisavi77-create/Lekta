#!/usr/bin/env python3
"""Koji se nalazi popravljaju, a koji se preskaču — mjereno kroz krugove.

Zašto postoji
-------------
Nakon sedam verzija paket ima 25 pravila, 27 dijelova, 13 kriterija i 15 koraka u
`gate.py`. Veći rizik više nije provjera koja fali nego **izvještaj koji se
prestane čitati**. Ako se na stvarnom radu preskoči pola nalaza jer ih je previše,
svaka sljedeća dodana provjera čini štetu, ne korist.

To se ne dade procijeniti iz koda — samo mjerenjem. `gate.py` već piše
`gate.json` pri svakom prolazu. Ovaj alat bilježi svaki prolaz u
`.katedra/gate_povijest.jsonl` i uspoređuje ih:

* **popravljeno** — korak koji je bio `nalaz`, a u sljedećem prolazu je `ok`;
* **preživjelo N krugova** — korak koji je `nalaz` u N uzastopnih prolaza, a
  ništa se u međuvremenu nije promijenilo.

Kako se čita
------------
**Nalaz koji tri kruga stoji netaknut nije nalaz nego šum.** Ili je kriv, ili je
nerazumljiv, ili je nevažan — i pripada iz blokirajućeg u savjetodavno, ili van.
To je jedini podatak koji može reći što OTKLONITI, a nijedna procjena ga ne
zamjenjuje.

Što ovo NE MOŽE
---------------
Ne zna **zašto** je nalaz preskočen. Neriješen nalaz može značiti „nerazumljiv”,
„nevažan”, ali i „težak, radim na njemu”. Alat mjeri učestalost, ne razlog —
razlog dolazi iz razgovora s korisnikom.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
if SKRIPTE not in sys.path:
    sys.path.insert(0, SKRIPTE)

import context  # noqa: E402

POVIJEST = "gate_povijest.jsonl"
PRAG_SUM = 3   # koliko uzastopnih krugova čini nalaz šumom


def _ucitaj_povijest(put):
    if not os.path.exists(put):
        return []
    out = []
    with open(put, encoding="utf-8") as f:
        for red in f:
            red = red.strip()
            if not red:
                continue
            try:
                out.append(json.loads(red))
            except json.JSONDecodeError:
                continue
    return out


def zabiljezi(gate_put, povijest_put):
    """Dodaj jedan prolaz u povijest. Bilježi se STANJE po koraku, ne cijeli izlaz."""
    try:
        with open(gate_put, encoding="utf-8") as f:
            g = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        raise SystemExit(f"❌ gate.json se ne da pročitati: {e}")
    zapis = {
        "kad": g.get("kad") or datetime.now().isoformat(timespec="seconds"),
        "faza": g.get("faza"),
        "koraci": {k["korak"]: k["stanje"] for k in (g.get("koraci") or [])},
        "blokira": (g.get("sazetak") or {}).get("blokira") or [],
    }
    with open(povijest_put, "a", encoding="utf-8") as f:
        f.write(json.dumps(zapis, ensure_ascii=False) + "\n")
    return zapis


def analiza(povijest, faza=None):
    prolazi = [p for p in povijest if not faza or p.get("faza") == faza]
    if len(prolazi) < 2:
        return {"prolaza": len(prolazi), "dovoljno": False,
                "popravljeno": [], "prezivjelo": [], "novo": []}

    koraci = sorted({k for p in prolazi for k in p["koraci"]})
    popravljeno, prezivjelo, novo = [], [], []
    for k in koraci:
        niz = [p["koraci"].get(k) for p in prolazi]
        # uzastopni „nalaz"/"pukao" na kraju niza = koliko krugova stoji
        rep = 0
        for st in reversed(niz):
            if st in ("nalaz", "pukao"):
                rep += 1
            else:
                break
        if rep >= 2:
            prezivjelo.append({"korak": k, "krugova": rep,
                               "sum": rep >= PRAG_SUM})
        # bio nalaz pa postao ok
        for i in range(1, len(niz)):
            if niz[i - 1] in ("nalaz", "pukao") and niz[i] == "ok":
                popravljeno.append({"korak": k, "u_prolazu": i + 1})
                break
        # pojavio se tek kasnije
        if niz[0] in (None, "preskoceno") and niz[-1] in ("nalaz", "pukao"):
            novo.append({"korak": k})

    prezivjelo.sort(key=lambda x: -x["krugova"])
    return {"prolaza": len(prolazi), "dovoljno": True,
            "faza": faza, "popravljeno": popravljeno,
            "prezivjelo": prezivjelo, "novo": novo,
            "prvi": prolazi[0].get("kad"), "zadnji": prolazi[-1].get("kad")}


def ispisi(a):
    print("TRAG NALAZA — što se popravlja, a što stoji")
    print("=" * 43)
    if not a["dovoljno"]:
        print(f"  {a['prolaza']} prolaz(a) u povijesti — za usporedbu trebaju "
              f"barem dva.")
        print("  Pokreni gate.py --json .katedra/gate.json pa "
              "`nalazi_trag.py zabiljezi`\n  nakon svakog kruga.")
        return
    print(f"  {a['prolaza']} prolaza"
          + (f" (faza {a['faza']})" if a.get("faza") else "")
          + f" · od {a['prvi']} do {a['zadnji']}\n")

    if a["popravljeno"]:
        print("  ✅ POPRAVLJENO — nalaz je nestao između krugova")
        for x in a["popravljeno"]:
            print(f"       {x['korak']} (u {x['u_prolazu']}. prolazu)")
    else:
        print("  ➖ nijedan nalaz nije nestao između krugova")

    sum_ = [x for x in a["prezivjelo"] if x["sum"]]
    ostalo = [x for x in a["prezivjelo"] if not x["sum"]]
    if sum_:
        print(f"\n  ❗ ŠUM — stoji {PRAG_SUM}+ krugova netaknut")
        for x in sum_:
            print(f"       {x['korak']}: {x['krugova']} krugova")
        print("\n     Nalaz koji toliko dugo stoji nije nalaz nego šum: ili je "
              "kriv, ili\n     nerazumljiv, ili nevažan. Spusti ga iz "
              "blokirajućeg u savjetodavno,\n     ili ga makni. Alat NE zna "
              "zašto je preskočen — pitaj korisnika.")
    if ostalo:
        print("\n  ⚠️  stoji 2 kruga — prati, još nije šum")
        for x in ostalo:
            print(f"       {x['korak']}: {x['krugova']} kruga")
    if a["novo"]:
        print("\n  🆕 pojavilo se tek u kasnijim krugovima")
        for x in a["novo"]:
            print(f"       {x['korak']}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Koji se nalazi popravljaju, a koji stoje kroz krugove.")
    ap.add_argument("naredba", choices=("zabiljezi", "analiza"))
    ap.add_argument("--gate", default=None, help="put do gate.json (za zabiljezi)")
    ap.add_argument("--faza", help="ograniči analizu na jednu fazu")
    ap.add_argument("--project-root", dest="project_root")
    ap.add_argument("--kat")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    args = ap.parse_args(argv)

    kat = context.resolve_state_dir(args.kat, args.project_root)
    povijest_put = os.path.join(kat, POVIJEST)

    if args.naredba == "zabiljezi":
        g = args.gate or os.path.join(kat, "gate.json")
        z = zabiljezi(g, povijest_put)
        n = len(_ucitaj_povijest(povijest_put))
        print(f"✅ prolaz zabilježen ({z['faza']}, {len(z['koraci'])} koraka) — "
              f"{n} u povijesti")
        if n < 2:
            print("   Za usporedbu treba barem dva prolaza iste faze.")
        return 0

    a = analiza(_ucitaj_povijest(povijest_put), args.faza)
    ispisi(a)
    if args.kao_json:
        context.atomic_write_json(os.path.abspath(args.kao_json), a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
