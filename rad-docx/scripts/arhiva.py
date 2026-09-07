#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Naknadni prolaz po arhivi .docx-a: ono što nije u `document.xml`.

Tri postavke koje ni jedan graditelj dokumenata ne postavi sam, a mijenjaju **izgled i
paginaciju**, pa se moraju primijeniti na svaku varijantu izgradnje jednako:

  1. **Prijelom riječi** (`autoHyphenation`). Utječe na lom redaka, znači i na broj
     stranica. Rad bez njega u hrvatskom ima rijeke bjeline u obostranom poravnanju.
  2. **Font teme** (`theme1.xml`). Pandoc i Wordovi predlošci nose `Cambria`/`Calibri`.
     Stil može biti Times New Roman, ali sve što mentor naknadno utipka pada na temu i
     izađe drugim pismom (references/zamke.md, kvar 8).
  3. **`docDefaults`/`rFonts`**. Isti problem jednu razinu niže: stil koji font uzima
     „iz teme" (`asciiTheme="minorHAnsi"`) ne jamči ništa.

Zašto zaseban alat, a ne dio graditelja: graditelj je često Pythonov skript koji radi nad
`python-docx` objektom, a ovo su druge datoteke u zipu. U praksi to znači da graditelj kućnog
stila jedan dio posla ima u shell-cjevovodu **oko** svojega Pythona. Motor koji pozove samo
Python dobije dokument koji je u `document.xml` identičan, a drukčije se prelomi — nalaz s
prihvatnog testa, kolovoz 2026.

    python3 arhiva.py rad.docx --pismo "Times New Roman" --prijelom-rijeci
    python3 arhiva.py rad.docx --osvjezi-polja           # samo updateFields
"""

import argparse
import os
import re
import shutil
import sys
import tempfile
import zipfile

PRIJELOM = ('<w:autoHyphenation w:val="true"/>'
            '<w:hyphenationZone w:val="357"/>'
            '<w:consecutiveHyphenLimit w:val="2"/>'
            '<w:doNotHyphenateCaps w:val="true"/>')


def _settings(s, prijelom, osvjezi):
    m = re.search(r"<w:settings[^>]*>", s)
    if not m:
        return s, []
    dodano, ins = [], ""
    if prijelom and "autoHyphenation" not in s:
        ins += PRIJELOM
        dodano.append("prijelom riječi")
    if osvjezi and "updateFields" not in s:
        ins += '<w:updateFields w:val="true"/>'
        dodano.append("updateFields")
    return s[:m.end()] + ins + s[m.end():], dodano


def _tema(t, pismo):
    novo, n = re.subn(r'(<a:(?:major|minor)Font>\s*<a:latin[^/]*?typeface=")[^"]*"',
                      r"\g<1>" + pismo + '"', t)
    return novo, n


def _docdefaults(t, pismo):
    """Zamijeni rFonts unutar docDefaults. `[^/]*?` ne prolazi kroz `/>`, pa uzorak
    ne može pobjeći iz elementa."""
    novo, n = re.subn(
        r"(<w:docDefaults>.*?<w:rFonts)[^/]*?/>",
        r'\1 w:ascii="{p}" w:hAnsi="{p}" w:eastAsia="{p}" w:cs="{p}"/>'.format(p=pismo),
        t, count=1, flags=re.S)
    return novo, n


def obradi(put, pismo=None, prijelom=False, osvjezi=False):
    if not os.path.exists(put):
        sys.exit(f"❌ nema datoteke: {put}")
    izvjesce = []
    fd, privremeno = tempfile.mkstemp(suffix=".docx")
    os.close(fd)
    with zipfile.ZipFile(put) as zin, \
            zipfile.ZipFile(privremeno, "w", zipfile.ZIP_DEFLATED) as zout:
        imena = set(zin.namelist())
        for it in zin.infolist():
            data = zin.read(it.filename)
            if it.filename == "word/settings.xml":
                s, dodano = _settings(data.decode("utf-8"), prijelom, osvjezi)
                data = s.encode("utf-8")
                izvjesce += dodano
            elif pismo and it.filename.startswith("word/theme/"):
                t, n = _tema(data.decode("utf-8"), pismo)
                data = t.encode("utf-8")
                if n:
                    izvjesce.append(f"tema: {n}× → {pismo}")
            elif pismo and it.filename == "word/styles.xml":
                t, n = _docdefaults(data.decode("utf-8"), pismo)
                data = t.encode("utf-8")
                izvjesce.append(f"docDefaults → {pismo}" if n
                                else "⚠️  docDefaults/rFonts nisam našao")
            zout.writestr(it, data)
        if "word/settings.xml" not in imena and (prijelom or osvjezi):
            izvjesce.append("⚠️  nema word/settings.xml — prijelom riječi nije primijenjen")
    shutil.move(privremeno, put)
    print("arhiva: " + (", ".join(izvjesce) if izvjesce else "ništa za mijenjati"))
    return izvjesce


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docx")
    ap.add_argument("--pismo", help='npr. "Times New Roman" — tema i docDefaults')
    ap.add_argument("--prijelom-rijeci", action="store_true",
                    help="uključi automatski prijelom riječi (mijenja paginaciju!)")
    ap.add_argument("--osvjezi-polja", action="store_true",
                    help="updateFields=true — Word osvježi sadržaj pri otvaranju")
    a = ap.parse_args()
    obradi(a.docx, a.pismo, a.prijelom_rijeci, a.osvjezi_polja)


if __name__ == "__main__":
    main()
