#!/usr/bin/env python3
"""Faza C3 — statističko izvještavanje: slaže li se opis s prijavljenim brojem.

Uporaba:  python3 check_statistika.py rad.docx [--alfa 0.05]

Zašto postoji
-------------
Lanac provjerava postoje li brojke i imaju li pokriće u izvoru. Ne provjerava
govori li tekst o njima istinu. Rečenica „razlika je statistički značajna
(p = 0,322)" ima brojku koja postoji, dolazi iz rada, i potpuno je pogrešno
opisana. To je nalaz koji mentor nađe odmah, a nijedan dosadašnji alat nije
mogao vidjeti jer gleda brojku, ne tvrdnju uz nju.

Provjerava:
  * p ≥ α opisan kao značajan, i p < α opisan kao neznačajan;
  * `p = 0,000` (nula nije vjerojatnost; piše se p < 0,001);
  * p izvan [0, 1];
  * p bez ijednog imenovanog testa u istoj ili prethodnoj rečenici (savjet);
  * razina značajnosti koja se nigdje ne deklarira (savjet).

Ne provjerava je li test dobro odabran: to traži podatke, ne tekst.

Izlazni kod: 1 na proturječje između opisa i brojke, 0 inače, 3 kad rad nema
nijednu p-vrijednost (nije empirijski, pa se ne može provjeriti).
"""
from __future__ import annotations

import argparse
import json
import re
import sys

from common import load_docx_text, load_supplementary_text, sentences, LIT_HEADING_RE

P_VRIJEDNOST = re.compile(r"\bp\s*(=|<|>|≤|≥|<=|>=)\s*(0?[,.]\d+|[01](?![,.\d]))", re.I)
ALFA_DEKLARACIJA = re.compile(r"(?i)(?:razin\w+|prag\w*|signifikantnost\w*)[^.]{0,40}?"
                              r"p\s*[<≤]\s*(0?[,.]\d+)")

ZNACAJNO = re.compile(r"(?i)\b(statistički\s+)?znača[jn]\w*")
# Hrvatska negacija ne stoji uz pridjev: „nije SE STATISTIČKI ZNAČAJNO razlikovala",
# „nije BILA statistički značajna". Prva izvedba tražila je „nije značaj…" bez
# umetnutih riječi i zato je na stvarnom radu proglasila DEVET urednih rečenica
# proturječnima: negaciju nije vidjela, a riječ „značajno" jest.
NIJE_ZNACAJNO = re.compile(
    r"(?i)(\bni(?:je|su)\b(?:\s+\w+){0,4}?\s+znača[jn]"
    r"|\bnema\b(?:\s+\w+){0,3}?\s+znača[jn]"
    r"|\bbez\b(?:\s+\w+){0,3}?\s+znača[jn]"
    r"|\bne\s+razlikuj\w*"
    r"|\bneznača[jn]\w*"
    r"|\bizostal\w+(?:\s+\w+){0,3}?\s+znača[jn]"
    r"|\bveće\s+od\s+0?[,.]0\d)")

TESTOVI = re.compile(
    r"(?i)\b(t-?test|Studentov|Mann-?Whitney|Wilcoxon|Kruskal-?Wallis|ANOVA|"
    r"analiz\w+\s+varijanc\w+|hi-?kvadrat|χ2|χ²|hi2|Fisher\w*|Pearson\w*|Spearman\w*|"
    r"korelacij\w+|regresij\w+|Shapiro-?Wilk|Kolmogorov|Levene\w*|z-?test|F-?test)")


def _broj(s: str) -> float:
    return float(s.replace(",", "."))


def analiziraj(put: str, alfa: float | None = None) -> dict:
    body, cells, _ = load_docx_text(put, include_tables=True)
    sup = load_supplementary_text(put)
    m = list(LIT_HEADING_RE.finditer(body))
    tijelo = (body[:m[-1].start()] if m else body) + "\n" + "\n".join(cells) \
        + "\n" + sup.get("footnotes", "")

    deklarirana = None
    dm = ALFA_DEKLARACIJA.search(tijelo)
    if dm:
        deklarirana = _broj(dm.group(1))
    prag = alfa if alfa is not None else (deklarirana if deklarirana else 0.05)

    recenice = sentences(tijelo)
    nalazi = {"proturjecje": [], "nemoguc_p": [], "bez_testa": [], "ukupno_p": 0}

    for i, r in enumerate(recenice):
        pogoci = list(P_VRIJEDNOST.finditer(r))
        if not pogoci:
            continue
        nalazi["ukupno_p"] += len(pogoci)
        prethodna = recenice[i - 1] if i else ""
        ima_test = bool(TESTOVI.search(r) or TESTOVI.search(prethodna))

        # Rečenica koja DEKLARIRA prag („značajnost je utvrđivana na razini
        # p < 0,05") nije tvrdnja o pojedinom rezultatu i ne smije se uspoređivati
        # s pragom: p tamo JEST jednak pragu, po definiciji.
        deklaracija = bool(ALFA_DEKLARACIJA.search(r))
        tvrdi_ne = bool(NIJE_ZNACAJNO.search(r))
        tvrdi_da = bool(ZNACAJNO.search(r)) and not tvrdi_ne and not deklaracija

        for mm in pogoci:
            op, sirovi = mm.group(1), mm.group(2)
            try:
                v = _broj(sirovi)
            except ValueError:
                continue
            if v == 0 and op in ("=", "≤", "<="):
                nalazi["nemoguc_p"].append(
                    {"p": f"p {op} {sirovi}", "recenica": r[:200],
                     "zasto": "nula nije vjerojatnost; prijavljuje se p < 0,001"})
                continue
            if not 0 <= v <= 1:
                nalazi["nemoguc_p"].append(
                    {"p": f"p {op} {sirovi}", "recenica": r[:200],
                     "zasto": "p-vrijednost je izvan raspona [0, 1]"})
                continue
            # proturječje se gleda samo za jednoznačne operatore
            if deklaracija and abs(v - prag) < 1e-9:
                continue
            if op in ("=", "<", "≤", "<=") and v < prag and tvrdi_ne:
                nalazi["proturjecje"].append(
                    {"p": f"p {op} {sirovi}", "prag": prag, "opis": "neznačajno",
                     "recenica": r[:220]})
            elif op in ("=", ">", "≥", ">=") and v >= prag and tvrdi_da:
                nalazi["proturjecje"].append(
                    {"p": f"p {op} {sirovi}", "prag": prag, "opis": "značajno",
                     "recenica": r[:220]})

        if not ima_test:
            nalazi["bez_testa"].append(r[:180])
    nalazi["test_imenovan_u_radu"] = bool(TESTOVI.search(tijelo))

    nalazi["deklarirana_alfa"] = deklarirana
    nalazi["primijenjeni_prag"] = prag
    return nalazi


def ispisi(n: dict) -> int:
    print("=" * 62)
    print("C3 — STATISTIČKO IZVJEŠTAVANJE")
    print("=" * 62)
    if not n["ukupno_p"]:
        print("➖ rad ne prijavljuje nijednu p-vrijednost — provjera se ne može provesti")
        return 3
    print(f"  p-vrijednosti: {n['ukupno_p']} | prag: {n['primijenjeni_prag']}"
          + ("" if n["deklarirana_alfa"] else "  (NIJE deklariran u radu, uzet 0,05)"))
    if not n["deklarirana_alfa"]:
        print("  ⚠ razina značajnosti se nigdje ne deklarira — čitatelj ne zna prema "
              "čemu se sudi")

    if n["proturjecje"]:
        print(f"\n⚠ OPIS PROTURJEČI BROJCI ({len(n['proturjecje'])}):")
        for x in n["proturjecje"]:
            print(f"   • {x['p']} opisano kao „{x['opis']}” uz prag {x['prag']}")
            print(f"       {x['recenica']}")
    if n["nemoguc_p"]:
        print(f"\n⚠ NEMOGUĆA p-VRIJEDNOST ({len(n['nemoguc_p'])}):")
        for x in n["nemoguc_p"]:
            print(f"   • {x['p']} — {x['zasto']}")
            print(f"       {x['recenica']}")
    # Test se u radu imenuje jednom, u Metodologiji, i to je ispravno. Prva
    # izvedba je tražila naziv testa uz SVAKU p-vrijednost i na stvarnom radu
    # ispisala 23 „nalaza" koji su svi bili uredni. Prijavljuje se samo slučaj
    # kad testa nema NIGDJE u radu.
    if not n.get("test_imenovan_u_radu"):
        print(f"\n⚠ nijedan statistički test nije imenovan u cijelom radu, a "
              f"prijavljeno je {n['ukupno_p']} p-vrijednosti — čitatelj ne zna "
              f"čime su dobivene")
    elif n["bez_testa"]:
        print(f"\nℹ️  {len(n['bez_testa'])} rečenica s p ne imenuje test u sebi; "
              f"test je imenovan drugdje u radu (uobičajeno: u Metodologiji)")

    if not n["proturjecje"] and not n["nemoguc_p"]:
        print("\n✓ nijedan opis ne proturječi prijavljenoj p-vrijednosti")
    return 1 if (n["proturjecje"] or n["nemoguc_p"]
                 or (n["ukupno_p"] and not n.get("test_imenovan_u_radu"))) else 0


def main(path, alfa=None):
    return ispisi(analiziraj(path, alfa))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Slaže li se opis s prijavljenim p.")
    ap.add_argument("rad")
    ap.add_argument("--alfa", type=float)
    ap.add_argument("--json", dest="json_out")
    a = ap.parse_args()
    r = analiziraj(a.rad, a.alfa)
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as fh:
            json.dump(r, fh, ensure_ascii=False, indent=2)
    sys.exit(ispisi(r))
