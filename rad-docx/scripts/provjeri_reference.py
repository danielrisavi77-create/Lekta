#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Brojevi stranica u sadržaju, popisima i unakrsnim referencama protiv OTISKA.

Zašto postoji: `katedra-lite/references/predaja.md` i `povratak.md` ovu skriptu zovu na
osam mjesta, `dijelovi.json` je veže uz dva obavezna dijela, a `gate.py --faza predaja`
je vodi kao BLOKIRAJUĆU. Skripte nije bilo. Gate je zato javljao „rad-docx nema
scripts/provjeri_reference.py — treba ponovna instalacija", što je kriva dijagnoza: paket
je bio potpun, provjera nije postojala. Korisnik ponovno instalira ispravan paket i dobije
isti nalaz, a jedina stvarno blokirajuća provjera brojeva stranica ostane nepokrenuta.

Mjeri se ono što se ne da provjeriti iz dokumenta samog: dokument može biti savršeno
dosljedan sam sa sobom i imati sve brojeve krive, jer Word keširanu vrijednost polja
`PAGEREF` ne osvježava dok ga netko ne otvori.

    python3 provjeri_reference.py rad.pdf --docx rad.docx
    python3 provjeri_reference.py rad.pdf --docx rad.docx --json .katedra/reference.json

Izlazni kod 1 = barem jedan broj se ne slaže s otiskom, rad se ne predaje.
Izlazni kod 2 = nije se dalo izmjeriti (nema PDF-a, nema `pdftotext`, nema polja).
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _stranice(pdf):
    try:
        out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"],
                             capture_output=True, text=True, encoding="utf-8", errors="replace", check=True).stdout
    except FileNotFoundError:
        print("⚠️  nema `pdftotext` (poppler-utils) — mjerenje se ne može provesti")
        return None
    except subprocess.CalledProcessError as e:
        print(f"⚠️  pdftotext nije uspio: {e}")
        return None
    return out.split("\f")


def _norm(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


def _unosi(docx_put):
    """[(tekst unosa, keširana stranica)] iz svakog hyperlinka s PAGEREF poljem."""
    xml = zipfile.ZipFile(docx_put).read("word/document.xml").decode("utf-8")
    out = []
    for h in re.finditer(r"<w:hyperlink[^>]*>(.*?)</w:hyperlink>", xml, re.S):
        unutra = h.group(1)
        m = re.search(r"PAGEREF[^<]*</w:instrText>.*?fldCharType=\"separate\"/>"
                      r".*?<w:t[^>]*>([^<]*)</w:t>", unutra, re.S)
        if not m:
            continue
        svi = re.findall(r"<w:t[^>]*>([^<]*)</w:t>", unutra)
        broj = m.group(1).strip()
        oznaka = "".join(svi)
        if oznaka.endswith(broj):
            oznaka = oznaka[: len(oznaka) - len(broj)]
        try:
            out.append((oznaka.strip(" .\t"), int(broj)))
        except ValueError:
            out.append((oznaka.strip(" .\t"), None))
    return out


def _pocetak_tijela(stranice, prva_oznaka):
    """PDF stranica na kojoj tijelo počinje; arapska numeracija kreće od nje."""
    kljuc = _norm(prva_oznaka)[:40]
    kandidati = [i for i, s in enumerate(stranice, 1)
                 if kljuc and kljuc in _norm(s) and "pageref" not in _norm(s)]
    # prva pojava je unos u sadržaju, tijelo je zadnja od prvih dviju pojava
    return kandidati[1] if len(kandidati) > 1 else (kandidati[0] if kandidati else 1)


def main():
    a = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("pdf")
    a.add_argument("--docx", help="ako se ne navede, traži se isto ime uz .docx")
    a.add_argument("--json", dest="kao_json")
    args = a.parse_args()

    pdf = Path(args.pdf)
    docx_put = Path(args.docx) if args.docx else pdf.with_suffix(".docx")
    if not pdf.exists() or not docx_put.exists():
        print(f"⚠️  nedostaje {'PDF' if not pdf.exists() else '.docx'} — ne mjeri se")
        return 2

    stranice = _stranice(pdf)
    if stranice is None:
        return 2
    unosi = _unosi(docx_put)
    if not unosi:
        print("⚠️  dokument nema PAGEREF polja — sadržaj i popisi su vjerojatno "
              "natipkani rukom, a to je zaseban nalaz (v. check_rules)")
        return 2

    pocetak = _pocetak_tijela(stranice, unosi[0][0])
    print("=" * 74)
    print(f"REFERENCE STRANICA — {docx_put.name} protiv {pdf.name}")
    print("=" * 74)
    print(f"stranica u otisku: {len(stranice)} · tijelo počinje na PDF str. {pocetak} · "
          f"unosa s brojem: {len(unosi)}\n")

    nalazi, zapisi = [], []
    for oznaka, tvrdi in unosi:
        kljuc = _norm(oznaka)[:55]
        stvarno = None
        for i, s in enumerate(stranice, 1):
            if i < pocetak or not kljuc:
                continue
            if kljuc in _norm(s):
                stvarno = i - pocetak + 1
                break
        ok = (stvarno is not None and stvarno == tvrdi)
        zapisi.append({"oznaka": oznaka, "tvrdi": tvrdi, "stvarno": stvarno, "ok": ok})
        if not ok:
            nalazi.append(zapisi[-1])
        print(f"  {'✅' if ok else '❌'} tvrdi {str(tvrdi):>3} · otisak "
              f"{str(stvarno):>4}   {oznaka[:60]}")

    print()
    if nalazi:
        print(f"❌ {len(nalazi)} od {len(unosi)} brojeva ne slaže se s otiskom — "
              f"rad se ne predaje.")
        print("   Ako je razlika u SVIM unosima ista, sadržaj je mjeren iz PDF-a u kojem "
              "sadržaja još nema (v. rad-docx kvar 25 u zamke.md).")
    else:
        print(f"✅ svih {len(unosi)} brojeva slaže se sa stvarnim prijelomom.")
    print("\nMjeri se keširana vrijednost polja. Word je osvježava tek kad netko otvori "
          "dokument\ni pokrene Update Field — zato je ovo zadnja provjera prije predaje, "
          "ne prva.")

    if args.kao_json:
        Path(args.kao_json).write_text(json.dumps(
            {"pdf": str(pdf), "docx": str(docx_put), "pocetak_tijela": pocetak,
             "unosi": zapisi, "nalaza": len(nalazi)},
            ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[json → {args.kao_json}]")
    return 1 if nalazi else 0


if __name__ == "__main__":
    sys.exit(main())
