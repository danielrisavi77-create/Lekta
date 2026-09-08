#!/usr/bin/env python3
"""Inventar .docx paketa: tko je proizveo koji dio i je li itko na njega upućen.

Blokirajuća stavka pred predaju. Biblioteke za generiranje ostavljaju dijelove koje nitko ne
priznaje, a koji mogu nadjačati kućni stil ili odati generator.

Nastalo iz ciklusa u kojemu je `word/stylesWithEffects.xml` (438 KB, VEĆI od styles.xml) nosio
drugi skup stilova: Normal bez fonta i proreda, Caption plav i 9 pt, TOC stilovi nepostojeći.
Word ga u dijelu inačica čita UMJESTO styles.xml, LibreOffice ga ignorira, pa ga renderiranje u
PDF fizički ne može otkriti.

    python3 inventar_paketa.py rad.docx
    python3 inventar_paketa.py rad.docx --json inventar.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile

SUMNJIVI = {
    "word/stylesWithEffects.xml": (
        "drugi skup stilova; Word ga u dijelu inačica čita umjesto styles.xml",
        "OBRIŠI zajedno s Override u [Content_Types].xml i Relationship u document.xml.rels"),
    "docProps/thumbnail.jpeg": (
        "sličica dokumenta iz predloška biblioteke",
        "OBRIŠI + ukloni <w:savePreviewPicture/> iz settings.xml, inače je Word vraća"),
    "docProps/thumbnail.emf": (
        "sličica dokumenta iz predloška biblioteke", "OBRIŠI"),
    "customXml/item1.xml": (
        "Wordova bibliografija (često prazna, sa SelectedStyle=/APA.XSL)",
        "OBRIŠI ako rad ne koristi Wordove citate; proturječi ručnom citatnom stilu"),
}
GENERATORI = ("python-docx", "docxtpl", "Aspose", "OpenXML SDK", "pandoc")


def inventar(put: str) -> dict:
    z = zipfile.ZipFile(put)
    imena = z.namelist()
    rels = {}
    for n in imena:
        if n.endswith(".rels"):
            try:
                rels[n] = z.read(n).decode("utf-8", "replace")
            except Exception:
                rels[n] = ""
    svi_rels = "\n".join(rels.values())
    try:
        ct = z.read("[Content_Types].xml").decode()
    except Exception:
        ct = ""
    try:
        doc = z.read("word/document.xml").decode()
    except Exception:
        doc = ""

    redci = []
    for n in sorted(imena):
        info = z.getinfo(n)
        osnova = n.split("/")[-1]
        referenciran = (osnova in svi_rels) or (n in ct) or n == "[Content_Types].xml"
        if n.endswith(".rels"):
            referenciran = True
        upotrijebljen = None
        # r:id se traži SAMO za dijelove koje document.xml doista adresira preko r:id
        # (zaglavlja, podnožja, slike, hiperveze). fontTable, settings, numbering, footnotes,
        # styles i theme vezani su relacijom na razini dijela i nemaju r:id u tijelu.
        ADRESIRANI = ("header", "footer", "media/", "image", "chart", "embeddings/")
        if any(k in n for k in ADRESIRANI):
            m = re.search(r'Id="([^"]+)"[^>]*Target="[^"]*%s"' % re.escape(osnova), svi_rels)
            if m:
                rid = m.group(1)
                upotrijebljen = ('r:id="%s"' % rid) in doc or ('r:embed="%s"' % rid) in doc
        sumnjiv = SUMNJIVI.get(n)
        redci.append({
            "dio": n, "bajtova": info.file_size,
            "referenciran": bool(referenciran), "upotrijebljen": upotrijebljen,
            "sumnjiv": bool(sumnjiv),
            "opis": sumnjiv[0] if sumnjiv else "",
            "postupak": sumnjiv[1] if sumnjiv else "",
        })

    tragovi = []
    for dio in ("docProps/core.xml", "docProps/app.xml", "word/settings.xml"):
        if dio not in imena:
            continue
        s = z.read(dio).decode("utf-8", "replace")
        for g in GENERATORI:
            if g.lower() in s.lower():
                tragovi.append({"dio": dio, "trag": g})
        for polje, uzorak in (("dc:creator", r"<dc:creator>([^<]*)</dc:creator>"),
                              ("dcterms:created", r"<dcterms:created[^>]*>([^<]*)<"),
                              ("Application", r"<Application>([^<]*)</Application>")):
            m = re.search(uzorak, s)
            if m and m.group(1).strip():
                tragovi.append({"dio": dio, "polje": polje, "vrijednost": m.group(1)[:60]})
        if "savePreviewPicture" in s:
            tragovi.append({"dio": dio, "trag": "savePreviewPicture (Word će vratiti sličicu)"})
    return {"redci": redci, "tragovi": tragovi}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docx")
    ap.add_argument("--json")
    a = ap.parse_args()

    r = inventar(a.docx)
    redci, tragovi = r["redci"], r["tragovi"]

    print("=" * 78)
    print("INVENTAR PAKETA — %s" % a.docx)
    print("=" * 78)
    print("%-44s%10s  ref  upotr" % ("dio", "bajtova"))
    for x in redci:
        u = {True: " da ", False: " NE ", None: "  ? "}[x["upotrijebljen"]]
        print("%-44s%10d  %s  %s%s" % (x["dio"], x["bajtova"],
              "da" if x["referenciran"] else "NE", u, "   <" if x["sumnjiv"] else ""))
    sumnjivi = [x for x in redci if x["sumnjiv"]]
    sirocad = [x for x in redci if not x["referenciran"]
               and not x["dio"].endswith(".rels") and x["dio"] != "[Content_Types].xml"]
    mrtvi = [x for x in redci if x["upotrijebljen"] is False]

    print()
    if sumnjivi:
        print("DIJELOVI KOJE NITKO NE PRIZNAJE")
        for x in sumnjivi:
            print("  %s  (%d B)" % (x["dio"], x["bajtova"]))
            print("      %s" % x["opis"])
            print("      -> %s" % x["postupak"])
    if sirocad:
        print("NEREFERENCIRANI DIJELOVI")
        for x in sirocad:
            print("  %s  (%d B)" % (x["dio"], x["bajtova"]))
    if mrtvi:
        print("RELACIJA POSTOJI, ALI DOKUMENT NE UPUCUJE NA NJU")
        for x in mrtvi:
            print("  %s" % x["dio"])
    if tragovi:
        print("\nTRAGOVI GENERATORA I METAPODACI")
        for t in tragovi:
            if "trag" in t:
                print("  ! %s: %s" % (t["dio"], t["trag"]))
            else:
                print("    %s: %s = %s" % (t["dio"], t["polje"], t["vrijednost"]))

    blokira = len(sumnjivi) + len(sirocad)
    print()
    if blokira:
        print("NEUREDNO: %d dio(jelova) treba obrisati ili obrazloziti prije predaje." % blokira)
    else:
        print("UREDNO: paket bez neprepoznatih dijelova.")
    if a.json:
        json.dump(r, open(a.json, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 1 if blokira else 0


if __name__ == "__main__":
    sys.exit(main())

def mrtvi_mediji(put: str) -> list[tuple[str, str, int]]:
    """Medijski dijelovi koje document.xml više ne referencira.

    Kvar 104 (audit Znahor, B2): zamjena slike novim grafikonom ostavlja stari
    PNG u `word/media/`. Relacija ostaje u `document.xml.rels`, ali je
    `document.xml` više ne koristi. Na stvarnom radu je to bilo **749 kB
    nevidljivog sadržaja, 49 % datoteke**, i nijedan alat to nije prijavljivao.

    Nije samo higijena: u mrtvom dijelu ostaje STARA verzija grafikona,
    dostupna svakome tko raspakira .docx. Za rad koji ide na provjeru
    podudarnosti i u repozitorij to je pitanje sadržaja, ne težine.

    Vraća [(rId, put_u_paketu, bajtova)].
    """
    import re
    import zipfile
    import xml.etree.ElementTree as ET
    NS_R = "{http://schemas.openxmlformats.org/package/2006/relationships}"
    mrtvi = []
    with zipfile.ZipFile(put) as z:
        doc = z.read("word/document.xml").decode("utf-8", "ignore")
        rabljeni = set(re.findall(r'r:(?:embed|link|id)="([^"]+)"', doc))
        try:
            rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
        except KeyError:
            return []
        imena = set(z.namelist())
        for rel in rels:
            meta = rel.get("Target") or ""
            if "media" not in meta or rel.get("Id") in rabljeni:
                continue
            ime = "word/" + meta.lstrip("/").replace("../", "")
            if ime in imena:
                mrtvi.append((rel.get("Id"), ime, z.getinfo(ime).file_size))
    return mrtvi


def tezina(put: str) -> dict:
    """Težina paketa i udio medija, sa zasebnim udjelom mrtvoga.

    B3 iz istog audita: rad je bio gotov, ispravan i NEPOŠILJIV — 1,5 MB ne
    prolazi kroz alat za e-poštu jer se privitak predaje kao base64. Predaja
    nije samo „je li rad ispravan" nego i „može li fizički otići".
    """
    import os
    import zipfile
    uk = os.path.getsize(put)
    medij = 0
    with zipfile.ZipFile(put) as z:
        for i in z.infolist():
            if i.filename.startswith("word/media/"):
                medij += i.file_size
    mrtvo = sum(b for _, _, b in mrtvi_mediji(put))
    return {"paket_bajtova": uk, "medij_bajtova": medij, "mrtvo_bajtova": mrtvo}

