#!/usr/bin/env python3
"""Faza D2 — brojka u rečenici mora postojati u izvoru koji ta rečenica citira.

Uporaba:
  python3 check_tvrdnja_izvor.py rad.docx --izvori izvori/ [--mapa izvori/mapa.json]

Zašto postoji
-------------
`cross_check.py` traži brojku iz rada kao podniz po SVIM izvorima ZAJEDNO. Zato
prolazi najopasniji oblik pogreške u akademskom radu: brojka koja stvarno postoji,
ali u drugom izvoru od onoga kojemu je pripisana. Recenzent to nađe za dvije
minute, alat nije nalazio nikad.

Ovdje se veza gleda usmjereno. Za svaku rečenicu s citatom uzima se ključ citata,
kroz `izvori/mapa.json` razriješi u datoteku, i brojka iz te rečenice traži se
SAMO u toj datoteci. Tri ishoda:

* **potvrđeno** — brojka je u navedenom izvoru;
* **PRIPISANO KRIVOM IZVORU** — brojke nema u navedenom, ali je ima u drugom
  priloženom izvoru (najteži nalaz: tekst tvrdi krivo podrijetlo);
* **nije nađeno** — brojke nema ni u jednom priloženom izvoru.

Granice se izgovaraju, ne prešućuju: rečenice bez citata, citati bez unosa u mapi
i unosi bez priložene datoteke broje se i ispisuju kao nepokriveno. Alat ne zna
je li izvor koji nije priložen krivo citiran; zna samo da ga nije provjerio.

Izlazni kod: 1 ako ima pripisivanja krivom izvoru ili nenađenih brojki, 0 inače,
3 ako mapa ne postoji (izvori nisu priloženi — granica, ne pad).
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
import mapa_izvora  # noqa: E402

# Brojke koje nose tvrdnju. Godine i mali redni brojevi se izuzimaju: oni su
# gotovo uvijek dio citata ili nabrajanja, ne podatak iz izvora.
BROJ = re.compile(r"(?<![\w.,/])(\d{1,3}(?:[ .]\d{3})+|\d+(?:[,.]\d+)?)\s*(%|posto|"
                  r"postotnih bodova|milijardi|milijuna|tisuća|eura|€|kn|dana|godina)?"
                  r"(?![\w])")


def _citljivo(put: str) -> str:
    n = put.lower()
    try:
        if n.endswith((".txt", ".md", ".csv")):
            return open(put, encoding="utf-8", errors="ignore").read()
        if n.endswith(".docx"):
            b, c, _ = C.load_docx_text(put, include_tables=True)
            return b + "\n" + "\n".join(c)
    except Exception:
        return ""
    return ""


def _norm(s: str) -> str:
    """Usporedba otporna na razmak tisućica i decimalni separator."""
    return re.sub(r"[\s.]", "", s).replace(",", ".").lower()


def _brojke(recenica: str) -> list[str]:
    out = []
    for m in BROJ.finditer(recenica):
        cijeli = m.group(1)
        gol = _norm(cijeli)
        if len(gol.replace(".", "")) < 2:
            continue                      # jednoznamenkasti brojevi nisu tvrdnja
        if re.fullmatch(r"(19|20)\d\d", cijeli):
            continue                      # godina
        out.append(cijeli)
    return out


def _u_tekstu(broj: str, tekst: str) -> bool:
    gol = _norm(broj)
    return gol in _norm(tekst)


def provjeri(rad: str, izvori: str, mapa_put: str) -> dict:
    mapa = mapa_izvora.ucitaj(mapa_put)
    body, cells, _ = C.load_docx_text(rad, include_tables=True)
    sup = C.load_supplementary_text(rad)
    m = list(C.LIT_HEADING_RE.finditer(body))
    # tijelo je sve PRIJE popisa literature; ono iza popisa (popis prikaza,
    # sažetak, izjava) nije proza rada i ne nosi tvrdnje s citatima
    tijelo = (body[:m[-1].start()] if m else body) + "\n" + "\n".join(cells) \
        + "\n" + sup.get("footnotes", "")

    tekstovi = {}
    for k, v in mapa.items():
        d = v.get("datoteka")
        if d:
            put = os.path.join(izvori, d)
            if os.path.isfile(put):
                tekstovi[k] = _citljivo(put)

    nalazi = {"krivi_izvor": [], "nije_nadeno": [], "potvrdeno": 0,
              "nepokriveno": {"recenica_bez_citata": 0, "citat_bez_unosa": [],
                              "unos_bez_datoteke": []}}
    nalazi["nepokriveno"]["unos_bez_datoteke"] = sorted(
        k for k, v in mapa.items() if not v.get("datoteka"))

    for recenica in C.sentences(tijelo):
        kljucevi = set()
        for unutra in re.findall(r"\(([^()]{3,120})\)", recenica):
            kljucevi |= C.parse_ay_citation_group(unutra)
        kljucevi |= C.parse_ay_narrative(recenica)
        if not kljucevi:
            nalazi["nepokriveno"]["recenica_bez_citata"] += 1
            continue
        brojke = _brojke(recenica)
        if not brojke:
            continue
        imena = [f"{p}-{g}" for p, g in kljucevi]
        dostupni = [k for k in imena if k in tekstovi]
        if not dostupni:
            for k in imena:
                if k not in mapa:
                    nalazi["nepokriveno"]["citat_bez_unosa"].append(k)
            continue
        for b in brojke:
            if any(_u_tekstu(b, tekstovi[k]) for k in dostupni):
                nalazi["potvrdeno"] += 1
                continue
            drugdje = [k for k, t in tekstovi.items()
                       if k not in dostupni and _u_tekstu(b, t)]
            if drugdje:
                nalazi["krivi_izvor"].append({
                    "broj": b, "citirano": sorted(dostupni),
                    "nadeno_u": sorted(drugdje), "recenica": recenica[:220]})
            else:
                nalazi["nije_nadeno"].append({
                    "broj": b, "citirano": sorted(dostupni),
                    "recenica": recenica[:220]})
    nalazi["nepokriveno"]["citat_bez_unosa"] = sorted(
        set(nalazi["nepokriveno"]["citat_bez_unosa"]))
    return nalazi


def ispisi(n: dict) -> None:
    print("=" * 62)
    print("D2 — TVRDNJA NASPRAM IZVORA KOJI JE CITIRAN")
    print("=" * 62)
    print(f"potvrđenih brojki: {n['potvrdeno']}")

    if n["krivi_izvor"]:
        print(f"\n⚠ PRIPISANO KRIVOM IZVORU ({len(n['krivi_izvor'])}):")
        for x in n["krivi_izvor"]:
            print(f"   • {x['broj']}: citira se {', '.join(x['citirano'])}, "
                  f"a brojka je u {', '.join(x['nadeno_u'])}")
            print(f"       {x['recenica']}")

    if n["nije_nadeno"]:
        print(f"\n⚠ NEMA U NAVEDENOM IZVORU ({len(n['nije_nadeno'])}):")
        for x in n["nije_nadeno"][:20]:
            print(f"   • {x['broj']} (citira se {', '.join(x['citirano'])})")
            print(f"       {x['recenica']}")
        if len(n["nije_nadeno"]) > 20:
            print(f"   … još {len(n['nije_nadeno']) - 20}")

    np = n["nepokriveno"]
    print(f"\nNEPOKRIVENO (deklarirana granica, ne nalaz):")
    print(f"   rečenica bez citata: {np['recenica_bez_citata']}")
    if np["citat_bez_unosa"]:
        print(f"   citata bez unosa u mapi: {len(np['citat_bez_unosa'])} "
              f"({', '.join(np['citat_bez_unosa'][:8])})")
    if np["unos_bez_datoteke"]:
        print(f"   jedinica bez priložene datoteke: {len(np['unos_bez_datoteke'])} "
              f"({', '.join(np['unos_bez_datoteke'][:8])})")
    print("   Alat NE zna je li nepokriveni citat točan; zna samo da ga nije provjerio.")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Brojka mora biti u izvoru koji je citiran.")
    ap.add_argument("rad")
    ap.add_argument("--izvori", required=True)
    ap.add_argument("--mapa")
    ap.add_argument("--json", dest="json_out")
    a = ap.parse_args(argv)

    mapa_put = a.mapa or os.path.join(a.izvori, "mapa.json")
    if not os.path.isfile(mapa_put):
        print(f"❌ nema mape izvora: {mapa_put}")
        print("   Bez nje se veza tvrdnja↔izvor ne može provjeriti, samo pogađati.")
        print("   Izgradi je: mapa_izvora.py rad.docx --izvori izvori/ --izgradi izvori/mapa.json")
        # Kvar 112: nedostatak mape je DEKLARIRANA GRANICA (izvori nisu priloženi),
        # ne pad alata. Kod 2 je gate vodio kao „alat pukao" na svakom radu bez
        # priložene građe, dakle na većini.
        return 3

    n = provjeri(a.rad, a.izvori, mapa_put)
    ispisi(n)
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as fh:
            json.dump(n, fh, ensure_ascii=False, indent=2)
    return 1 if (n["krivi_izvor"] or n["nije_nadeno"]) else 0


if __name__ == "__main__":
    sys.exit(main())
