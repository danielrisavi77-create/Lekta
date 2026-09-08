#!/usr/bin/env python3
"""Verzija rada za slanje: bez mrtvih dijelova, s grafikonima na ciljanih 300 dpi.

Uporaba:
  python3 priprema_slanja.py rad.docx --izlaz rad-za-slanje.docx
  python3 priprema_slanja.py rad.docx --izlaz rad-za-slanje.docx --dpi 300

Zašto je ovo POSEBAN korak, a ne dio gradi.py
---------------------------------------------
Arhivska verzija ostaje u punoj rezoluciji. Ovo je izvedenica za slanje, i
nikad ne smije tiho zamijeniti original: rad koji se predaje u repozitorij i
rad koji se šalje e-poštom nisu ista datoteka.

Što radi (audit Znahor, B2 i B3)
--------------------------------
1. Izbacuje MRTVE medijske dijelove: PNG-ove koje `document.xml` više ne
   referencira, a ostali su u paketu nakon zamjene slike. Na stvarnom radu to je
   bilo 749 kB, 49 % datoteke, i uz težinu je nosilo STARU verziju grafikona
   dostupnu svakome tko raspakira .docx.
2. Skalira svaku sliku na `--dpi` u odnosu na širinu UMETANJA, ne na izvornu
   veličinu. Slika umetnuta na 12 cm ne treba biti 4000 px široka.
3. Ne dira ni jedan XML osim relacija koje uklanja, pa prijelom stranica ostaje
   isti. Mjereno na stvarnom radu: 1 522 kB → 403 kB, 61 stranica prije i poslije.

Izlazni kod: 0 uvijek kad je datoteka napisana; 2 na grešci ulaza.
"""
from __future__ import annotations

import argparse
import io
import os
import re
import shutil
import sys
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from inventar_paketa import mrtvi_mediji, tezina  # noqa: E402

EMU_PO_INCU = 914400


def _sirine_umetanja(doc_xml: str) -> dict[str, int]:
    """{rId: širina u EMU} iz svakog <wp:extent> uz <a:blip r:embed>."""
    out = {}
    for m in re.finditer(r'<wp:extent[^>]*cx="(\d+)"[^>]*/>.*?r:embed="([^"]+)"',
                         doc_xml, re.S):
        cx, rid = int(m.group(1)), m.group(2)
        out[rid] = max(out.get(rid, 0), cx)
    return out


def _rid_za_medij(z: zipfile.ZipFile) -> dict[str, str]:
    import xml.etree.ElementTree as ET
    out = {}
    try:
        rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    except KeyError:
        return out
    for rel in rels:
        t = rel.get("Target") or ""
        if "media" in t:
            out["word/" + t.lstrip("/").replace("../", "")] = rel.get("Id")
    return out


def pripremi(ulaz: str, izlaz: str, dpi: int = 300) -> dict:
    from PIL import Image

    mrtvi = {ime for _rid, ime, _b in mrtvi_mediji(ulaz)}
    mrtvi_rid = {rid for rid, _ime, _b in mrtvi_mediji(ulaz)}
    prije = tezina(ulaz)

    tmp = tempfile.mkdtemp(prefix="slanje-")
    try:
        with zipfile.ZipFile(ulaz) as z:
            z.extractall(tmp)
            doc = z.read("word/document.xml").decode("utf-8", "ignore")
            rid_po_mediju = _rid_za_medij(z)
        sirine = _sirine_umetanja(doc)

        # 1) mrtvi dijelovi van, i iz paketa i iz relacija
        for ime in mrtvi:
            put = os.path.join(tmp, *ime.split("/"))
            if os.path.exists(put):
                os.remove(put)
        rels_put = os.path.join(tmp, "word", "_rels", "document.xml.rels")
        if mrtvi_rid and os.path.exists(rels_put):
            rels = open(rels_put, encoding="utf-8").read()
            for rid in mrtvi_rid:
                rels = re.sub(r'<Relationship[^>]*Id="%s".*?/>' % re.escape(rid),
                              "", rels, flags=re.S)
            open(rels_put, "w", encoding="utf-8").write(rels)

        # 2) skaliranje na ciljani dpi prema širini umetanja
        skalirano = 0
        media_dir = os.path.join(tmp, "word", "media")
        if os.path.isdir(media_dir):
            for fn in sorted(os.listdir(media_dir)):
                put = os.path.join(media_dir, fn)
                rid = rid_po_mediju.get("word/media/" + fn)
                cx = sirine.get(rid)
                if not cx or not fn.lower().endswith((".png", ".jpg", ".jpeg")):
                    continue
                try:
                    im = Image.open(put)
                except Exception:  # noqa: BLE001
                    continue
                ciljna_sirina = int(round(cx / EMU_PO_INCU * dpi))
                if im.size[0] <= ciljna_sirina * 1.05:
                    continue
                nova = im.resize(
                    (ciljna_sirina, max(1, int(im.size[1] * ciljna_sirina / im.size[0]))),
                    Image.LANCZOS)
                buf = io.BytesIO()
                if fn.lower().endswith(".png"):
                    nova.convert("P", palette=Image.ADAPTIVE, colors=256).save(
                        buf, format="PNG", optimize=True)
                else:
                    nova.save(buf, format="JPEG", quality=85, optimize=True)
                if buf.tell() < os.path.getsize(put):
                    open(put, "wb").write(buf.getvalue())
                    skalirano += 1

        if os.path.exists(izlaz):
            os.remove(izlaz)
        zf = zipfile.ZipFile(izlaz, "w", zipfile.ZIP_DEFLATED)
        for korijen, _d, fajlovi in os.walk(tmp):
            for fn in fajlovi:
                fp = os.path.join(korijen, fn)
                zf.write(fp, os.path.relpath(fp, tmp))
        zf.close()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    poslije = tezina(izlaz)
    return {"prije": prije, "poslije": poslije,
            "mrtvih_uklonjeno": len(mrtvi), "slika_skalirano": skalirano}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Verzija rada za slanje e-poštom.")
    ap.add_argument("rad")
    ap.add_argument("--izlaz", required=True)
    ap.add_argument("--dpi", type=int, default=300,
                    help="ciljani dpi u odnosu na širinu umetanja (zadano 300)")
    a = ap.parse_args(argv)
    if not os.path.isfile(a.rad):
        print(f"❌ nema datoteke: {a.rad}", file=sys.stderr)
        return 2
    if os.path.abspath(a.rad) == os.path.abspath(a.izlaz):
        print("❌ izlaz ne smije biti isti kao ulaz — arhivska verzija ostaje netaknuta",
              file=sys.stderr)
        return 2

    r = pripremi(a.rad, a.izlaz, a.dpi)
    kb = lambda b: f"{b / 1024:.0f} kB"  # noqa: E731
    print("PRIPREMA ZA SLANJE")
    print("=" * 52)
    print(f"  prije:   {kb(r['prije']['paket_bajtova'])} "
          f"(medij {kb(r['prije']['medij_bajtova'])}, "
          f"od toga mrtvo {kb(r['prije']['mrtvo_bajtova'])})")
    print(f"  poslije: {kb(r['poslije']['paket_bajtova'])} "
          f"(medij {kb(r['poslije']['medij_bajtova'])})")
    print(f"  uklonjeno mrtvih dijelova: {r['mrtvih_uklonjeno']} · "
          f"skalirano slika: {r['slika_skalirano']}")
    print(f"\n✔ {a.izlaz}")
    print("  Arhivska verzija je NETAKNUTA. Prije slanja provjeri prijelom:")
    print("  broj stranica mora biti isti kao u izvorniku.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
