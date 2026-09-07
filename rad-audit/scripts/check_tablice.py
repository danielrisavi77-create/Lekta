#!/usr/bin/env python3
"""Faza C4 — aritmetika unutar tablice.

Uporaba:  python3 check_tablice.py rad.docx [--tolerancija 0.6]

Zašto postoji
-------------
Brojke se dosad provjeravalo u tekstu (inventar, sukobi, brojke iz Rasprave) i
naspram izvora. Unutar same tablice nije ih provjeravao nitko, a ondje su
najlakše provjerive i najlakše pogrešne:

  * redak ili stupac „Ukupno" koji ne odgovara zbroju,
  * stupac postotaka koji ne daje 100,
  * `n` iz natpisa tablice koji se ne slaže sa zbrojem u stupcu.

Recenzent to izračuna u glavi za pola minute. Tolerancija postoji jer se udjeli
po pravilu računaju iz zaokruženih vrijednosti (v. rad-docx/references/brojke.md),
pa zbroj od 99,9 ili 100,1 nije greška.

Izlazni kod: 1 na nesklad, 0 kad je sve u redu, 3 kad rad nema brojčanih tablica.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

BROJ = re.compile(r"^\(?-?\d{1,3}(?:[ .]\d{3})*(?:[,.]\d+)?\)?\s*%?$")
UKUPNO = re.compile(r"(?i)^\s*(ukupno|sveukupno|svega|total|zbroj|Σ)\b")
POSTOTAK_ZAGLAVLJE = re.compile(r"(?i)(%|postotak|udio|udjel)")
N_IZ_NATPISA = re.compile(r"(?i)\bn\s*=\s*(\d{1,6})")
# Stupac koji nosi prosjek, medijan ili raspršenje nije stupac brojanja i ne
# uspoređuje se s n iz natpisa. Na stvarnom radu je „Prosječan broj točnih
# odgovora" (zbroj 133,7) uspoređen s n = 203 i prijavljen kao nesklad.
PROSJEK_ZAGLAVLJE = re.compile(
    r"(?i)(prosje[čc]|\bM\b|\bSD\b|medijan|aritmeti[čc]k|sr\.\s*vrij|raspon|"
    r"min\b|max\b|standardn)")


def _broj(t: str):
    t = t.strip().strip("()").replace("%", "").strip()
    t = t.replace(" ", "").replace(" ", "")
    if t.count(".") and t.count(","):
        t = t.replace(".", "")
    t = t.replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def _matrica(tbl):
    out = []
    for red in tbl.rows:
        out.append([c.text.strip() for c in red.cells])
    return out


def analiziraj(put: str, tol: float = 0.6) -> dict:
    from docx import Document
    from docx.oxml.ns import qn
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    d = Document(put)
    # natpis je odlomak neposredno PRIJE tablice
    elementi = []
    for dijete in d.element.body.iterchildren():
        if dijete.tag == qn("w:p"):
            elementi.append(Paragraph(dijete, d))
        elif dijete.tag == qn("w:tbl"):
            elementi.append(Table(dijete, d))

    nalazi, pregled, brojcanih = [], [], 0
    redni = 0
    for i, el in enumerate(elementi):
        if not isinstance(el, Table):
            continue
        redni += 1
        natpis = ""
        for j in range(i - 1, max(-1, i - 4), -1):
            if not isinstance(elementi[j], Table) and elementi[j].text.strip():
                natpis = elementi[j].text.strip()
                break
        m = _matrica(el)
        if len(m) < 3:
            continue
        zaglavlje = m[0]
        tijelo = m[1:]
        n_stup = max(len(r) for r in m)

        # koji su stupci brojčani
        stupci = {}
        for c in range(n_stup):
            vrijednosti = []
            for r in tijelo:
                if c < len(r) and BROJ.match(r[c]):
                    v = _broj(r[c])
                    if v is not None:
                        vrijednosti.append((r, v))
            if len(vrijednosti) >= 3:
                stupci[c] = vrijednosti
        if not stupci:
            continue
        brojcanih += 1
        pregled.append(f"Tablica {redni}: {len(m)}×{n_stup}, brojčanih stupaca "
                       f"{len(stupci)}")

        for c, vrijednosti in stupci.items():
            ime = zaglavlje[c] if c < len(zaglavlje) else f"stupac {c + 1}"
            # Kvarovi nađeni odmah na stvarnim radovima:
            #  (a) „Ukupno suspendirana sredstva" je NAZIV pojave, ne redak
            #      zbroja; stajao je kao drugi od četiri retka. Redak zbroja je
            #      zadnji redak tablice.
            #  (b) postotak koji je udio od ukupnog rezultata („54,1 % od 25
            #      bodova") nikad ne zbraja stupac; taj stupac ima svoje pravilo.
            zadnji_indeks = len(tijelo) - 1
            ukupni = [(r, v) for r, v in vrijednosti
                      if r and UKUPNO.match(r[0] or "") and tijelo.index(r) >= zadnji_indeks]
            ostali = [v for r, v in vrijednosti
                      if not (r and UKUPNO.match(r[0] or ""))]

            je_postotak_rano = bool(POSTOTAK_ZAGLAVLJE.search(ime or ""))

            # 1) redak „Ukupno" naspram zbroja. Vrijedi i za postotke: udjeli
            # dijelova cjeline se zbrajaju. Slučaj „udio od najvišeg rezultata"
            # (54,1 % uz pojedinačne 73,6 %) hvata zaštita ispod, jer zbroj ne
            # može biti manji od najvećeg pribrojnika.
            if ukupni and ostali:
                zbroj = sum(ostali)
                for _r, uk in ukupni:
                    # Zbroj ne može biti manji od najvećeg pribrojnika: ako jest,
                    # „Ukupno" je prosjek ili medijan, ne zbroj.
                    if ostali and uk < max(ostali):
                        continue
                    if abs(uk - zbroj) > max(tol, abs(zbroj) * 0.005):
                        nalazi.append({
                            "tablica": redni, "stupac": ime, "vrsta": "ukupno_ne_zbraja",
                            "prijavljeno": uk, "zbroj": round(zbroj, 3),
                            "razlika": round(uk - zbroj, 3), "natpis": natpis[:90]})

            # 2) postoci moraju dati 100
            je_postotak = (je_postotak_rano
                           or all("%" in r[c] for r, _v in vrijednosti if c < len(r)))
            if je_postotak and ostali and len(ostali) >= 3:
                zbroj = ukupni[0][1] if ukupni else sum(ostali)
                if 85 <= zbroj <= 115 and abs(zbroj - 100) > tol:
                    nalazi.append({
                        "tablica": redni, "stupac": ime, "vrsta": "postoci_ne_daju_sto",
                        "zbroj": round(zbroj, 2), "natpis": natpis[:90]})

            # 3) n iz natpisa naspram zbroja stupca
            mn = N_IZ_NATPISA.search(natpis)
            if mn and ostali and not je_postotak and not PROSJEK_ZAGLAVLJE.search(ime or ""):
                n_natpis = int(mn.group(1))
                zbroj = sum(ostali)
                # Tablica koja slaže DVIJE podjele istoga uzorka (spol, pa dob)
                # zbraja na 2N, tri podjele na 3N. To nije nesklad nego oblik
                # tablice: na stvarnom radu je 406 = 2 × 203.
                visekratnik = any(abs(zbroj - k * n_natpis) <= max(tol, n_natpis * 0.01)
                                  for k in range(1, 6))
                if not visekratnik and \
                        abs(zbroj - n_natpis) > max(tol, n_natpis * 0.01) and \
                        0.5 * n_natpis <= zbroj <= 2 * n_natpis:
                    nalazi.append({
                        "tablica": redni, "stupac": ime, "vrsta": "n_ne_odgovara",
                        "n_natpis": n_natpis, "zbroj": round(zbroj, 2),
                        "natpis": natpis[:90]})
    return {"tablica_ukupno": redni, "brojcanih": brojcanih,
            "pregled": pregled, "nalazi": nalazi}


def ispisi(r: dict) -> int:
    print("=" * 60)
    print("C4 — ARITMETIKA UNUTAR TABLICE")
    print("=" * 60)
    print(f"  tablica: {r['tablica_ukupno']} · s brojčanim stupcima: {r['brojcanih']}")
    if not r["brojcanih"]:
        print("➖ rad nema brojčanih tablica — provjera se ne može provesti")
        return 3
    for x in r["pregled"][:12]:
        print("   " + x)

    if r["nalazi"]:
        print(f"\n⚠ NESKLAD U TABLICI ({len(r['nalazi'])}):")
        for n in r["nalazi"]:
            if n["vrsta"] == "ukupno_ne_zbraja":
                print(f"   • T{n['tablica']}, „{n['stupac']}”: redak Ukupno kaže "
                      f"{n['prijavljeno']}, a stupac zbraja {n['zbroj']} "
                      f"(razlika {n['razlika']})")
            elif n["vrsta"] == "postoci_ne_daju_sto":
                print(f"   • T{n['tablica']}, „{n['stupac']}”: postoci daju "
                      f"{n['zbroj']}, ne 100")
            else:
                print(f"   • T{n['tablica']}, „{n['stupac']}”: natpis kaže n = "
                      f"{n['n_natpis']}, stupac zbraja {n['zbroj']}")
            if n.get("natpis"):
                print(f"       {n['natpis']}")
    else:
        print("\n✓ zbrojevi, postoci i n se slažu u svim brojčanim tablicama")
    return 1 if r["nalazi"] else 0


def main(path, tol=0.6):
    return ispisi(analiziraj(path, tol))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Aritmetika unutar tablica.")
    ap.add_argument("rad")
    ap.add_argument("--tolerancija", type=float, default=0.6)
    ap.add_argument("--json", dest="json_out")
    a = ap.parse_args()
    r = analiziraj(a.rad, a.tolerancija)
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as fh:
            json.dump(r, fh, ensure_ascii=False, indent=2)
    sys.exit(ispisi(r))
