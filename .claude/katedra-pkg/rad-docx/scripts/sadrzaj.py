#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Sadržaj: ista lista, dva oblika — mjerljiv i predajni.

Zašto uopće postoji. Motor mjeri paginaciju nad PDF-om, a LibreOffice **ne popunjava**
polje `TOC` pri pretvorbi (references/zamke.md, kvar 3). Graditelj koji ubaci prazno polje
`TOC` daje pregled u kojemu sadržaj zauzima **jedan redak** umjesto dvije stranice, pa je
svaki izmjereni broj stranice pogrešan, a nitko to ne prijavi.

Rješenje je jedno mjesto s dva izlaza iz istog `toc.json`:

  `--oblik staticni`  → obični odlomci, bez polja. Za mjerenje.
  `--oblik zivi`      → pravo polje `TOC` čiji je **spremljeni rezultat** ta ista lista.
                        Word ga osvježi pri otvaranju (`updateFields`), LibreOffice
                        renderira spremljeni rezultat → **isti broj stranica**.

Time assert „pregled i predajna verzija imaju isti broj stranica" ima smisla: obje varijante
nose jednak sadržaj, a razlikuju se samo po tome je li lista polje ili nije.

    python3 sadrzaj.py rad.docx --toc toc.json --oblik staticni
    python3 sadrzaj.py rad.docx --toc toc.json --oblik zivi

Bez `toc.json` (prvi krug petlje) ne radi ništa i vraća 0 — polje ostaje kako ga je
graditelj ostavio.
"""

import argparse
import json
import os
import re
import sys

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT, WD_TAB_LEADER
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Cm, Pt

# Polje glavnog sadržaja poznaje se po prekidaču razina; `TOC \c "Tablica"` je popis
# prikaza i njega se NE dira — graditelj ga popunjava sam.
GLAVNI_TOC = re.compile(r"\bTOC\b[^\"]*\\o", re.I)


def _rpr(velicina=12, pismo="Times New Roman"):
    rPr = OxmlElement("w:rPr")
    rPr.append(_el("w:rFonts", ascii=pismo, hAnsi=pismo))
    rPr.append(_el("w:sz", val=str(int(velicina * 2))))
    rPr.append(_el("w:szCs", val=str(int(velicina * 2))))
    return rPr


def _el(tag, **atributi):
    e = OxmlElement(tag)
    for k, v in atributi.items():
        e.set(qn("w:" + k), v)
    return e


def _run(tekst=None, fldChar=None, instr=None, velicina=12):
    r = OxmlElement("w:r")
    r.append(_rpr(velicina))
    if fldChar:
        r.append(_el("w:fldChar", fldCharType=fldChar))
    elif instr is not None:
        it = OxmlElement("w:instrText")
        it.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        it.text = instr
        r.append(it)
    else:
        t = OxmlElement("w:t")
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        t.text = tekst or ""
        r.append(t)
    return r


def nadi_polje(d):
    """Vrati odlomak koji nosi glavno polje TOC, u bilo kojem od dva oblika zapisa."""
    for p in d.paragraphs:
        for fs in p._p.findall(qn("w:fldSimple")):
            if GLAVNI_TOC.search(fs.get(qn("w:instr")) or ""):
                return p, "fldSimple"
        for it in p._p.iter(qn("w:instrText")):
            if GLAVNI_TOC.search(it.text or ""):
                return p, "fldChar"
    return None, None


def ocisti(p, oblik):
    """Ukloni ostatke polja iz odlomka-nosača, ali ne i sam odlomak."""
    if oblik == "fldSimple":
        for fs in list(p._p.findall(qn("w:fldSimple"))):
            p._p.remove(fs)
    for r in list(p._p.findall(qn("w:r"))):
        p._p.remove(r)


def uredi(p, lvl, sirina_cm):
    pf = p.paragraph_format
    pf.alignment = WD_ALIGN_PARAGRAPH.LEFT
    pf.line_spacing = 1.0
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.first_line_indent = Cm(0)
    pf.left_indent = Cm(0.6 if lvl >= 2 else 0)
    pf.tab_stops.add_tab_stop(Cm(sirina_cm), WD_TAB_ALIGNMENT.RIGHT, WD_TAB_LEADER.DOTS)
    return p


def upisi(put_docx, put_toc, oblik, sirina_cm=16.0, velicina=12):
    if not os.path.exists(put_toc):
        print(f"ℹ️  {put_toc} još ne postoji — sadržaj ostavljam kako ga je graditelj dao")
        return 0
    stavke = [s for s in json.load(open(put_toc, encoding="utf-8"))
              if s.get("str") is not None]
    if not stavke:
        print(f"ℹ️  {put_toc} nema izmjerenih stranica — sadržaj ne mijenjam")
        return 0

    d = docx.Document(put_docx)
    nosac, kako = nadi_polje(d)
    if nosac is None:
        sys.exit("❌ ne nalazim glavno polje TOC u dokumentu. Graditelj ga mora ubaciti "
                 "(instr sadrži `TOC \\o`), a ovaj alat mu daje sadržaj.")
    stil = nosac.style
    ocisti(nosac, kako)

    # Novi odlomci idu ISPRED nosača, a nosač ostaje ZADNJI red sadržaja.
    #
    # Nije kozmetika. Graditelj prijelom sekcije (restart numeracije od 1) obično zapiše u
    # `w:pPr` odlomka koji je zadnji prije tijela — a to je upravo ovaj nosač. Ubacivanje
    # novih odlomaka ZA njega ostavlja prijelom na prvom redu sadržaja, pa svi ostali
    # redovi padnu u sekciju tijela: numeracija se restarta na stranici sa sadržajem i
    # Uvod dijeli list s njim. Vidi zamke.md, kvar 17.
    odlomci = []
    for _ in stavke[:-1]:
        novi = OxmlElement("w:p")
        nosac._p.addprevious(novi)
        odlomci.append(docx.text.paragraph.Paragraph(novi, nosac._parent))
    odlomci.append(nosac)

    for i, (p, s) in enumerate(zip(odlomci, stavke)):
        p.style = stil
        uredi(p, s.get("lvl", 1), sirina_cm)
        if oblik == "zivi" and i == 0:
            p._p.append(_run(fldChar="begin", velicina=velicina))
            p._p.append(_run(instr=' TOC \\o "1-2" \\h \\z \\u ', velicina=velicina))
            p._p.append(_run(fldChar="separate", velicina=velicina))
        p._p.append(_run(s["t"], velicina=velicina))
        r = OxmlElement("w:r")
        r.append(_rpr(velicina))
        r.append(OxmlElement("w:tab"))
        p._p.append(r)
        p._p.append(_run(str(s["str"]), velicina=velicina))
        if oblik == "zivi" and i == len(stavke) - 1:
            p._p.append(_run(fldChar="end", velicina=velicina))

    if oblik == "zivi":
        st = d.settings.element
        for e in st.findall(qn("w:updateFields")):
            st.remove(e)
        st.append(_el("w:updateFields", val="true"))

    d.save(put_docx)
    print(f"sadržaj: {oblik}, {len(stavke)} stavki"
          + (", updateFields=true" if oblik == "zivi" else ""))
    return len(stavke)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docx")
    ap.add_argument("--toc", default="toc.json")
    ap.add_argument("--oblik", choices=("staticni", "zivi"), required=True)
    ap.add_argument("--sirina", type=float, default=16.0,
                    help="pozicija desne tabulatorske stanice u cm (širina teksta)")
    ap.add_argument("--velicina", type=float, default=12.0)
    a = ap.parse_args()
    upisi(a.docx, a.toc, a.oblik, a.sirina, a.velicina)


if __name__ == "__main__":
    main()
