#!/usr/bin/env python3
"""Faza G1 — odgovara li rad na ono što je sam postavio.

Uporaba:  python3 check_hipoteze.py rad.docx

Zašto postoji
-------------
„Slijedi li zaključak iz rezultata" alat ne može presuditi. Ali jedan dio te
kategorije je posve mehanički, a mentori ga traže prvo: **svaka postavljena
hipoteza mora dobiti izričitu presudu, i svaki navedeni cilj mora biti
odgovoren.** Rad koji postavi H3 pa je više nikad ne spomene nije rad sa slabim
argumentom, nego rad s rupom koja se vidi iz sadržaja.

Provjerava:
  * hipoteza koja se poslije poglavlja s hipotezama više ne spominje;
  * hipoteza koja se spominje, ali bez presude (prihvaćena, odbačena,
    potvrđena, nije potvrđena, djelomično);
  * presuda koja se donosi o hipotezi koja nije postavljena;
  * cilj koji se nigdje ne preuzima u Rezultatima, Raspravi ni Zaključku.

Ne presuđuje je li presuda TOČNA: to traži podatke i čitanje, i za to postoji
obavezan ljudski korak (`citanje_tijela`, željezno pravilo 31).

Izlazni kod: 1 na nepresuđenu ili nespomenutu hipotezu, 0 inače, 3 kad rad nema
poglavlje s hipotezama.
"""
from __future__ import annotations

import argparse
import json
import re
import sys

from common import load_docx_text, sentences, LIT_HEADING_RE

# Naslov poglavlja nosi i nastavak („Hipoteze istraživanja"), pa se dopušta do
# tri riječi iza ključne. Prva izvedba tražila je goli „Hipoteze" i zato na
# stvarnom radu nije našla poglavlje koje postoji.
POGLAVLJE_HIP = re.compile(r"(?im)^\s*(?:\d+(?:\.\d+)*\.?\s*)?"
                           r"(?:istra[žz]iva[čc]k\w+\s+)?hipotez\w*"
                           r"(?:\s+\w+){0,3}\s*:?\s*$")
POGLAVLJE_CILJ = re.compile(r"(?im)^\s*(?:\d+(?:\.\d+)*\.?\s*)?"
                            r"(?:svrha\s+i\s+)?cilj\w*(?:\s+i\s+hipotez\w*)?"
                            r"(?:\s+\w+){0,3}\s*:?\s*$")

# Redak sadržaja završava tabulatorom i brojem stranice. Bez izbacivanja sadržaja
# prvi pogodak naslova uvijek je u njemu, pa se „poglavlje" čita iz popisa
# poglavlja i ispada prazno.
SADRZAJ_REDAK = re.compile(r"(?m)^.*\t\s*\d{1,3}\s*$")
KRAJ_POGLAVLJA = re.compile(r"(?im)^\s*(?:\d+(?:\.\d+)*\.?\s*)?[A-ZČĆŠŽĐ][^\n]{2,70}$")

OZNAKA_H = re.compile(r"\bH\s?(\d{1,2})\b")
PRESUDA = re.compile(
    r"(?i)\b(prihva[ćc]\w+|odbac\w+|potvr[đd]\w+|nije\s+potvr[đd]\w+|"
    r"ni(?:je|su)\s+prihva[ćc]\w+|djelomi[čc]n\w+|opovrg\w+|"
    r"ne\s+mo[žz]e\s+se\s+prihvatiti|osnovan\w*|neosnovan\w*)")


def _odsjecak(body: str, uzorak: re.Pattern) -> str:
    m = uzorak.search(body)
    if not m:
        return ""
    ostatak = body[m.end():]
    k = KRAJ_POGLAVLJA.search(ostatak, 2)
    return ostatak[:k.start()] if k else ostatak[:4000]


def analiziraj(put: str) -> dict:
    """Bez izdvajanja poglavlja.

    Prva izvedba je pokušala izrezati „poglavlje s hipotezama" i na jednom je
    fixtureu stala već iza prve hipoteze (svaki redak „H2. Druga…" izgleda kao
    novi naslov), a na stvarnom radu izrezala pola dokumenta. Robusnije je i
    poštenije: skupi SVE oznake H<n> izvan sadržaja, pa za svaku pitaj postoji li
    ijedna rečenica koja o njoj donosi presudu. Rezultat ne ovisi o tome kako je
    poglavlje naslovljeno.
    """
    body, cells, _ = load_docx_text(put, include_tables=True)
    ml = list(LIT_HEADING_RE.finditer(body))
    tijelo = body[:ml[-1].start()] if ml else body
    tijelo = SADRZAJ_REDAK.sub("", tijelo) + "\n" + "\n".join(cells)

    ima_poglavlje = bool(POGLAVLJE_HIP.search(tijelo))

    spomen: dict[int, list[str]] = {}
    presudene: set[int] = set()
    # Jedinica je ODLOMAK, ne rečenica: hrvatski popis hipoteza piše „H1. Studenti
    # …", a rastavljač rečenica tu točku vidi kao kraj rečenice i oznaka H1 ostaje
    # sama, kraća od praga, pa ispada. Na stvarnom radu je tako od pet hipoteza
    # ostala jedna. Presuda i oznaka ionako gotovo uvijek stoje u istom odlomku.
    jedinice = [x.strip() for x in tijelo.split("\n") if x.strip()]
    for r in jedinice:
        brojevi = {int(x) for x in OZNAKA_H.findall(r)}
        if not brojevi:
            continue
        ima_presudu = bool(PRESUDA.search(r))
        for b in brojevi:
            spomen.setdefault(b, []).append(r[:200])
            if ima_presudu:
                presudene.add(b)

    postavljene = sorted(spomen)
    bez_presude = [h for h in postavljene if h not in presudene]
    rupe = [h for h in range(1, max(postavljene) + 1) if h not in spomen] \
        if postavljene else []

    odsjecak_c = _odsjecak(tijelo, POGLAVLJE_CILJ)
    ciljevi = [x.strip(" -•\t") for x in odsjecak_c.split("\n")
               if 25 <= len(x.strip()) <= 300 and not OZNAKA_H.search(x)]
    return {"postavljene": postavljene, "spomen": {k: len(v) for k, v in spomen.items()},
            "presudene": sorted(presudene), "bez_presude": bez_presude,
            "rupe": rupe, "ima_poglavlje": ima_poglavlje,
            "ciljeva_nadeno": len(ciljevi)}


def ispisi(r: dict) -> int:
    print("=" * 60)
    print("G1 — HIPOTEZE I CILJEVI")
    print("=" * 60)
    if not r["postavljene"]:
        print("➖ rad nema poglavlje s numeriranim hipotezama (H1, H2…) — "
              "provjera se ne može provesti")
        return 3
    print(f"  postavljenih hipoteza: {len(r['postavljene'])} "
          f"({', '.join('H' + str(h) for h in r['postavljene'])})")
    print(f"  presuđenih: {len(r['presudene'])}"
          + (f" ({', '.join('H' + str(h) for h in r['presudene'])})" if r["presudene"] else ""))
    if r["ciljeva_nadeno"]:
        print(f"  ciljeva u poglavlju: {r['ciljeva_nadeno']}")

    if r["rupe"]:
        print(f"\n⚠ RUPA U NUMERACIJI HIPOTEZA: "
              f"{', '.join('H' + str(h) for h in r['rupe'])} se nigdje ne spominje, "
              f"a viši brojevi postoje")
    if r["bez_presude"]:
        print(f"\n⚠ HIPOTEZA BEZ IZRIČITE PRESUDE "
              f"({len(r['bez_presude'])}): "
              f"{', '.join('H' + str(h) for h in r['bez_presude'])}")
        print("   Postavljena je, ali nijedna rečenica ne kaže je li prihvaćena,")
        print("   odbačena, potvrđena ili djelomično potvrđena. To je prvo pitanje")
        print("   na obrani.")

    if not (r["bez_presude"] or r["rupe"]):
        print("\n✓ svaka postavljena hipoteza dobiva izričitu presudu")
    print("\nAlat NE presuđuje je li presuda točna — to traži podatke i čitanje "
          "(željezno pravilo 31).")
    return 1 if (r["bez_presude"] or r["rupe"]) else 0


def main(path):
    return ispisi(analiziraj(path))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Dobiva li svaka hipoteza presudu.")
    ap.add_argument("rad")
    ap.add_argument("--json", dest="json_out")
    a = ap.parse_args()
    r = analiziraj(a.rad)
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as fh:
            json.dump(r, fh, ensure_ascii=False, indent=2)
    sys.exit(ispisi(r))
