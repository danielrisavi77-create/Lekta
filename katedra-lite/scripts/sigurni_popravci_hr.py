#!/usr/bin/env python3
"""Sigurni tipografski popravci u tijelu .docx-a — unutar <w:t>, bez kolabiranja runova.

Što radi (samo u tijelu, PRIJE naslova popisa literature; popis se ne dira):
  • (NE radi rasponi brojeva: spojnica među znamenkama hvata i klase/urbrojeve/DOI — ručno)
  • datum: „12.9.2026." → „12. 9. 2026." (dan.mjesec.godina bez razmaka)
  • dvostruki razmak → jedan; razmak ispred , ; : . → uklonjen
  • Vancouver citat bez razmaka: „(67,68)" → „(67, 68)" (dva cijela broja ≤ 3 znamenke, ne decimala x,y)
  • upućivanje na tablicu u tekstu: „u Tablici 2. prikazani" → „u Tablici 2 prikazani" — SAMO kad iza točke
    slijedi razmak + malo slovo (točka nije kraj rečenice); natpisi „Tablica 2. Naslov" ostaju.
Sve što prelazi granicu runa (uzorak razlomljen u dva <w:t>) NE dira i broji kao „preskočeno".

Uporaba: python3 sigurni_popravci_hr.py ulaz.docx izlaz.docx [--od-naslova "POPIS CITIRANE LITERATURE"] [--dry-run] [--json PUT]
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import tempfile
import zipfile

RE_T = re.compile(r"(<w:t\b[^>]*>)(.*?)(</w:t>)", re.S)
RE_P = re.compile(r"<w:p\b.*?</w:p>", re.S)

PRAVILA = [
    # „raspon en-crtica" NAMJERNO NIJE ovdje: znamenka-spojnica-znamenka hvata i klase/urbrojeve
    # („602-04/25-11/40"), ISBN, DOI i telefonske brojeve — to nije raspon. Ide ručno ili s popisom iznimaka.
    ("datum razmaci", re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\."), r"\1. \2. \3."),
    # samo TOČNO dva razmaka: 3+ je namjerno poravnanje (potpisni redci, tablice u tekstu)
    ("dvostruki razmak", re.compile(r"(?<=[^\s_])  (?=[^\s_])"), " "),
    ("razmak ispred interpunkcije", re.compile(r" +([,;:.])(?!\d)"), r"\1"),
    ("citat bez razmaka", re.compile(r"\((\d{1,3}),(\d{2,3})\)"), r"(\1, \2)"),
    ("Tablica N. u tekstu", re.compile(r"\b(Tablic[ai]\s+\d+)\.(?=\s+[a-zčćžšđ])"), r"\1"),
    ("(Tablica N.)", re.compile(r"\((Tablic[ai]\s+\d+)\.\)"), r"(\1)"),
]


def popravi_xml(xml, granica_txt):
    """Vrati (novi_xml, brojaci). Popis literature: od odlomka čiji je tekst == granica_txt nadalje se ne dira."""
    brojaci = {ime: 0 for ime, _, _ in PRAVILA}
    out, last, u_popisu = [], 0, False
    for pm in RE_P.finditer(xml):
        out.append(xml[last:pm.start()])
        p = pm.group(0)
        tekst = "".join(m.group(2) for m in RE_T.finditer(p))
        if granica_txt and tekst.strip().upper().endswith(granica_txt.upper()):
            u_popisu = True
        if u_popisu or re.match(r"^\s*Tablica\s+\d+\.\s", tekst) or "____" in tekst:  # popis, natpisi, potpisni redci: ne dirati
            out.append(p)
        else:
            def tr(m):
                t = m.group(2)
                for ime, rx, zam in PRAVILA:
                    novi, n = rx.subn(zam, t)
                    if n:
                        brojaci[ime] += n
                        t = novi
                return m.group(1) + t + m.group(3)
            out.append(RE_T.sub(tr, p))
        last = pm.end()
    out.append(xml[last:])
    return "".join(out), brojaci


def preostalo(xml, granica_txt):
    """Koliko uzoraka ostaje (razlomljeni preko runova) — mjeri se na spojenom tekstu odlomka."""
    ostaci = {ime: 0 for ime, _, _ in PRAVILA}
    u_popisu = False
    for pm in RE_P.finditer(xml):
        tekst = "".join(m.group(2) for m in RE_T.finditer(pm.group(0)))
        if granica_txt and tekst.strip().upper().endswith(granica_txt.upper()):
            u_popisu = True
        if u_popisu or re.match(r"^\s*Tablica\s+\d+\.\s", tekst):
            continue
        for ime, rx, _ in PRAVILA:
            ostaci[ime] += len(rx.findall(tekst))
    return ostaci


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("ulaz"); ap.add_argument("izlaz")
    ap.add_argument("--od-naslova", default="POPIS CITIRANE LITERATURE")
    ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--json")
    a = ap.parse_args(argv)
    with zipfile.ZipFile(a.ulaz) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    novi, brojaci = popravi_xml(xml, a.od_naslova)
    ost = preostalo(novi, a.od_naslova)
    print("SIGURNI POPRAVCI (tijelo, bez popisa literature)")
    for ime, n in brojaci.items():
        print(f"  {n:4d}  {ime}" + (f"   (preskočeno preko runova: {ost[ime]})" if ost[ime] else ""))
    if not a.dry_run:
        tmp = tempfile.mkdtemp()
        with zipfile.ZipFile(a.ulaz) as zin, zipfile.ZipFile(a.izlaz, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename == "word/document.xml":
                    data = novi.encode("utf-8")
                zout.writestr(item, data)
        shutil.rmtree(tmp, ignore_errors=True)
        print(f"[→ {a.izlaz}]")
    if a.json:
        json.dump({"popravljeno": brojaci, "preskoceno_preko_runova": ost}, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
