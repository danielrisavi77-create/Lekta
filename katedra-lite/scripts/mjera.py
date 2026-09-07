#!/usr/bin/env python3
"""Trošak lanca po fazi: sekunde, ulazni kontekst, ljudski koraci.

Zašto postoji
-------------
Prije nego se lancu odredi cijena, mora se znati što jedan rad kroz njega
stvarno košta. Do sada se to procjenjivalo. Tri brojke po fazi:

* **sekunde** — zbroj trajanja koraka; jedini trošak koji je stvarno izmjeren;
* **ulazni kontekst** — koliko teksta faza propisuje da se učita (SKILL.md plus
  reference koje `ucitavanje.py` traži za taj mod). To je **procjena** ulaznih
  tokena, ne mjerenje: broji se znakovima, a stvarni tokenizator nije ovdje.
  Označeno je kao procjena svugdje gdje se ispisuje, pa se ne može zamijeniti
  za izmjerenu brojku (pravilo 35);
* **ljudski koraci** — koliko puta lanac traži čovjeka. Dvije vrste, i razlika
  je bit ovog alata:

    - `nesmanjivo` — korak koji traži čovjeka i kad je sve zeleno (`covjek=True`
      u gateu, npr. `citanje_tijela`, pravilo 31). To je pod cijenu koja se ne
      da automatizirati bez kršenja vlastite doktrine;
    - `ovaj_put`  — blokirajući korak koji je pao ili se nije pokrenuo, pa netko
      mora intervenirati prije nego faza prođe.

`nesmanjivo` je brojka koja kaže koliko je proizvod daleko od toga da ga
korisnik vozi sam. `ovaj_put` ovisi o radu i pada kako se rad popravlja.

Naredbe
-------
    mjera.py --zabiljezi FAZA --gate .katedra/gate.json --kat .katedra
    mjera.py --izvjestaj --kat .katedra
    mjera.py --izvjestaj --kat .katedra --json out.json
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

SKRIPTE = os.path.dirname(os.path.abspath(__file__))
KORIJEN_SKILLA = os.path.dirname(SKRIPTE)
SKILL_MD = os.path.join(KORIJEN_SKILLA, "SKILL.md")
REFERENCE = os.path.join(KORIJEN_SKILLA, "references")

MOD_FAZE = {"plan": "1", "pisanje": "2", "audit": "4", "predaja": "6"}

# Znakova po tokenu. Hrvatski je dijakritički gust, pa je omjer lošiji nego za
# engleski. Broj je gruba konstanta i zato se sve izvedeno iz njega zove
# PROCJENA, nikad mjerenje.
ZNAKOVA_PO_TOKENU = 3.2


def _velicina(put: str) -> int:
    try:
        return len(open(put, encoding="utf-8", errors="replace").read())
    except OSError:
        return 0


def propisane_reference(faza: str, kat: str) -> list[str]:
    """Koje reference `ucitavanje.py` traži za ovu fazu.

    Popis je izveden iz stanja projekta, ne fiksan (pravilo 25), pa se ne
    pogađa nego pita sam alat. Ako alat ne uspije, vraća se prazan popis i to
    se u izvještaju vidi kao 0, ne kao izmišljena brojka.
    """
    argv = [sys.executable, os.path.join(SKRIPTE, "ucitavanje.py"),
            "--mod", MOD_FAZE[faza], "--kat", kat]
    try:
        r = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return []
    nadjene = []
    for redak in (r.stdout or "").splitlines():
        for komad in redak.replace("`", " ").replace(",", " ").split():
            if komad.startswith("references/") and komad.endswith(".md"):
                ime = os.path.basename(komad)
                put = os.path.join(REFERENCE, ime)
                if os.path.exists(put) and put not in nadjene:
                    nadjene.append(put)
    return nadjene


def izmjeri(faza: str, gate_json: str, kat: str) -> dict:
    with open(gate_json, encoding="utf-8") as f:
        g = json.load(f)
    koraci = g.get("koraci") or g.get("rezultati") or []

    sekunde = round(sum(float(k.get("sekunde") or 0) for k in koraci), 2)
    nesmanjivo = [k["korak"] for k in koraci if k.get("covjek")]
    ovaj_put = [k["korak"] for k in koraci
                if k.get("blokira")
                and k.get("stanje") in ("nalaz", "preskoceno", "pukao")
                and k["korak"] not in nesmanjivo]

    ref = propisane_reference(faza, kat)
    znakova = _velicina(SKILL_MD) + sum(_velicina(p) for p in ref)

    return {
        "faza": faza,
        "kada": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "koraka": len(koraci),
        "sekunde": sekunde,
        "kontekst": {
            "skill_md_znakova": _velicina(SKILL_MD),
            "referenci": len(ref),
            "reference": [os.path.basename(p) for p in ref],
            "znakova_ukupno": znakova,
            "PROCJENA_ulaznih_tokena": int(znakova / ZNAKOVA_PO_TOKENU),
            "kako": f"znakovi / {ZNAKOVA_PO_TOKENU}; procjena, ne mjerenje",
        },
        "ljudski_koraci": {
            "nesmanjivo": nesmanjivo,
            "ovaj_put": ovaj_put,
        },
    }


def _upisi(kat: str, zapis: dict) -> str:
    put = os.path.join(kat, "mjera.json")
    try:
        with open(put, encoding="utf-8") as f:
            svi = json.load(f)
        if not isinstance(svi, list):
            svi = [svi]
    except (OSError, ValueError):
        svi = []
    svi = [z for z in svi if z.get("faza") != zapis["faza"]] + [zapis]
    os.makedirs(kat, exist_ok=True)
    with open(put, "w", encoding="utf-8") as f:
        json.dump(svi, f, ensure_ascii=False, indent=2)
    return put


def izvjestaj(kat: str) -> tuple[str, dict]:
    put = os.path.join(kat, "mjera.json")
    try:
        with open(put, encoding="utf-8") as f:
            svi = json.load(f)
    except (OSError, ValueError):
        return f"nema mjerenja u {put} — pokreni gate pa mjera.py --zabiljezi", {}

    redoslijed = {"plan": 0, "pisanje": 1, "audit": 2, "predaja": 3}
    svi.sort(key=lambda z: redoslijed.get(z["faza"], 9))

    r = ["TROŠAK LANCA PO FAZI", "=" * 74, "",
         f"{'faza':<10} {'koraka':>7} {'sekundi':>9} {'~tokena ulaz':>14} "
         f"{'ljudski (nesmanjivo/ovaj put)':>32}"]
    uk_s = uk_t = 0
    uk_nes = uk_ovaj = 0
    for z in svi:
        t = z["kontekst"]["PROCJENA_ulaznih_tokena"]
        n = len(z["ljudski_koraci"]["nesmanjivo"])
        o = len(z["ljudski_koraci"]["ovaj_put"])
        uk_s += z["sekunde"]; uk_t += t; uk_nes += n; uk_ovaj += o
        r.append(f"{z['faza']:<10} {z['koraka']:>7} {z['sekunde']:>9.2f} "
                 f"{t:>14,} {f'{n} / {o}':>32}")
    r += ["-" * 74,
          f"{'ZBROJ':<10} {'':>7} {uk_s:>9.2f} {uk_t:>14,} "
          f"{f'{uk_nes} / {uk_ovaj}':>32}", ""]

    # Zbroj po fazama NIJE trošak jednog rada. SKILL.md ulazi u svaku fazu, pa
    # se u zbroju plaća onoliko puta koliko ima faza. To vrijedi samo ako se
    # svaka faza vozi u zasebnom razgovoru. Vozi li se rad u jednom razgovoru,
    # router se plaća jednom, a reference se ne ponavljaju. Obje brojke stoje
    # jedna do druge jer opisuju dva različita načina rada, a razlika između
    # njih je najveća pojedinačna stavka cijene.
    skill_zn = max((z["kontekst"]["skill_md_znakova"] for z in svi), default=0)
    unija = sorted({ime for z in svi for ime in z["kontekst"]["reference"]})
    zn_unija = skill_zn + sum(
        _velicina(os.path.join(REFERENCE, ime)) for ime in unija)
    t_unija = int(zn_unija / ZNAKOVA_PO_TOKENU)
    t_skill = int(skill_zn / ZNAKOVA_PO_TOKENU)
    r += [f"{'JEDINSTVENO':<10} {'':>7} {'':>9} {t_unija:>14,} "
          f"{'(SKILL.md jednom + unija referenci)':>32}",
          "",
          f"Razlika {uk_t - t_unija:,} tokena je ponavljanje: SKILL.md "
          f"(~{t_skill:,}) ulazi u svaku od {len(svi)} faza,",
          "a reference se dijele među fazama. Zbroj vrijedi kad se svaka faza vozi",
          "u zasebnom razgovoru; jedinstveno vrijedi kad se rad vozi u jednom.",
          "Cijena po radu leži između te dvije brojke, bliže jedinstvenoj.",
          ""]

    r += ["Kako čitati:",
          "  sekundi        izmjereno (trajanje koraka gatea)",
          "  ~tokena ulaz   PROCJENA (znakovi / 3.2), NE mjerenje; stvarni trošak",
          "                 razgovora je veći jer se kontekst nosi kroz poruke",
          "  nesmanjivo     koraci koji traže čovjeka i kad je sve zeleno",
          "  ovaj put       blokirajući koraci koji su pali na OVOM radu", ""]

    nes = sorted({k for z in svi for k in z["ljudski_koraci"]["nesmanjivo"]})
    if nes:
        r += [f"Ljudski koraci koji ne nestaju automatizacijom: {', '.join(nes)}",
              "Dok ti koraci postoje, lanac nije bez čovjeka po definiciji, nego "
              "namjerno.", ""]

    sazetak = {"sekunde": round(uk_s, 2),
               "PROCJENA_tokena_zbroj_po_fazama": uk_t,
               "PROCJENA_tokena_jedinstveno": t_unija,
               "PROCJENA_tokena_skill_md": t_skill,
               "ljudski_nesmanjivo": uk_nes, "ljudski_ovaj_put": uk_ovaj,
               "faza": len(svi),
               "upozorenje": ("zbroj po fazama broji SKILL.md jednom po fazi; "
                              "za rad vođen u jednom razgovoru vrijedi "
                              "jedinstveno")}
    return "\n".join(r), sazetak


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zabiljezi", metavar="FAZA", choices=tuple(MOD_FAZE))
    ap.add_argument("--gate", metavar="PUT", help="gate.json te faze")
    ap.add_argument("--kat", default=".katedra")
    ap.add_argument("--izvjestaj", action="store_true")
    ap.add_argument("--json", dest="kao_json", metavar="PUT")
    a = ap.parse_args(argv)

    if a.zabiljezi:
        if not a.gate or not os.path.exists(a.gate):
            print("❌ --zabiljezi traži --gate PUT do gate.json te faze",
                  file=sys.stderr)
            return 2
        z = izmjeri(a.zabiljezi, a.gate, a.kat)
        put = _upisi(a.kat, z)
        print(f"✓ {a.zabiljezi}: {z['koraka']} koraka · {z['sekunde']:.2f} s · "
              f"~{z['kontekst']['PROCJENA_ulaznih_tokena']:,} tokena ulaza "
              f"(procjena) · ljudski {len(z['ljudski_koraci']['nesmanjivo'])} "
              f"nesmanjivo / {len(z['ljudski_koraci']['ovaj_put'])} ovaj put "
              f"→ {put}")
        return 0

    if a.izvjestaj:
        tekst, sazetak = izvjestaj(a.kat)
        print(tekst)
        if a.kao_json and sazetak:
            with open(a.kao_json, "w", encoding="utf-8") as f:
                json.dump(sazetak, f, ensure_ascii=False, indent=2)
        return 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
