#!/usr/bin/env python3
"""Faza A2 — ostaci radnih oznaka u predanom tekstu.

Uporaba:  python3 check_placeholders.py rad.docx

Zašto postoji
-------------
SKILL.md je fazu A opisivao kao „provjeri placeholdere", a alat koji to radi
živio je u katedra-liteu i nijedan runner ga odavde nije zvao. Rad-audit je
tako imao opisanu fazu bez izvršitelja: `[TREBA IZVOR]`, `[DOPUNITI]` i
`[PROVJERI STR.]` prolazili su cijeli lanac do predaje.

Čita tijelo, ćelije tablica, fusnote, endnote, zaglavlja i podnožja. Placeholder
u fusnoti je najčešći, jer ga vizualni pregled preskoči.
"""
import re
import sys

from common import load_docx_text, load_supplementary_text

UZORCI = [
    (r"\[TREBA IZVOR\]", "tvrdnja bez izvora"),
    (r"\[PROVJERI\b[^\]]*\]", "nepotvrđen podatak ili stranica"),
    (r"\[DOPUNITI\]|\[DOPUNI\b[^\]]*\]", "nedovršen tekst"),
    (r"\[TODO\b[^\]]*\]|\bTODO\b", "radna bilješka"),
    (r"\[XX+\]|\bXXX+\b", "rezervirano mjesto za broj"),
    (r"\[\?\?+\]", "otvoreno pitanje"),
    (r"\bLorem ipsum\b", "tekst ispune"),
    (r"\[NAPOMENA[^\]]*\]", "interna napomena"),
    (r"\[\s*\]", "prazna uglata zagrada"),
    # Nađeno na stvarnom pravnom seminaru: naslovnica je i dalje nosila
    # „[Ime i prezime]". Prva izvedba uzorka bila je preširoka („svaka uglata
    # zagrada s riječima") i na Vancouver radu prijavila 12 lažnih nalaza, jer je
    # „[Internet]" standardna oznaka vrste izvora u tom stilu. Zato se traži
    # RIJEČ IZ PREDLOŠKA, ne oblik zagrade.
    (r"\[[^\]]{0,30}\b(?i:ime|prezime|naslov rada|datum|mentor|komentor|ustanova|"
     r"kolegij|broj indeksa|upi[šs]i|upisati|unesi|unijeti|vaše|tvoje|ovdje)"
     r"[^\]]{0,30}\]", "nepopunjeno polje predloška"),
]


def nalazi(path):
    body, cells, _ = load_docx_text(path, include_tables=True)
    sup = load_supplementary_text(path)
    dijelovi = {
        "tijelo": body,
        "tablice": "\n".join(cells),
        "fusnote": sup.get("footnotes", ""),
        "endnote": sup.get("endnotes", ""),
        "zaglavlja": sup.get("headers", ""),
        "podnožja": sup.get("footers", ""),
    }
    out = []
    for gdje, tekst in dijelovi.items():
        if not tekst:
            continue
        for uzorak, opis in UZORCI:
            for m in re.finditer(uzorak, tekst, re.IGNORECASE):
                pocetak = max(0, m.start() - 60)
                out.append({
                    "gdje": gdje,
                    "oznaka": m.group(0),
                    "opis": opis,
                    "kontekst": tekst[pocetak:m.end() + 60].replace("\n", " ").strip(),
                })
    return out


def main(path):
    print("=" * 56)
    print("A2 — RADNE OZNAKE U TEKSTU —", path)
    print("=" * 56)
    n = nalazi(path)
    if not n:
        print("  ✓ nema radnih oznaka ni u tijelu ni u fusnotama")
        return 0
    po_mjestu = {}
    for x in n:
        po_mjestu.setdefault(x["gdje"], []).append(x)
    for gdje, stavke in po_mjestu.items():
        print(f"\n{gdje} ({len(stavke)}):")
        for x in stavke:
            print(f"  ⚠ {x['oznaka']} — {x['opis']}")
            print(f"      …{x['kontekst']}…")
    print(f"\nUkupno radnih oznaka: {len(n)} — nijedna ne smije preživjeti predaju.")
    return 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
