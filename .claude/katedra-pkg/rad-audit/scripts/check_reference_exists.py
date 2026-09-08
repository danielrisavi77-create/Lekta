#!/usr/bin/env python3
"""Faza B2 — postoji li jedinica iz popisa literature uopće.

Uporaba:
  python3 check_reference_exists.py rad.docx --izvori izvori/
  python3 check_reference_exists.py rad.docx --izvori izvori/ --strogo

Zašto postoji
-------------
Cijeli sloj provjere citata gleda samo ZATVORENOST skupa: je li svaki citat u
popisu i svaka jedinica citirana. Izmišljena jedinica koja JE citirana prolazi
kao potpuno čista. To je najskuplji mogući nalaz na obrani, a alat ga nije imao.

Ovdje se svaka jedinica svrstava u jednu od četiri razine, po tome čime je
potkrijepljena:

* **građa** — priložena je datoteka izvora (mapa.json ili ime datoteke);
* **identifikator** — jedinica nosi valjan DOI, ISBN ili URL;
* **službeni** — propis, presuda ili službena oznaka (NN, ECLI, CELEX, COM);
* **NEPOTVRĐENA** — ni jedno od navedenoga.

Alat NE tvrdi da je nepotvrđena jedinica izmišljena. Tvrdi da ništa u projektu
ne pokazuje da postoji, i da to na obrani nosi autor. Zato je nalaz savjetodavan
po zadanome, a `--strogo` ga pretvara u blokadu (mod 6 ga tako zove).

Izlazni kod: 1 ako ima neispravnih identifikatora, ili ako je `--strogo` i ima
nepotvrđenih jedinica; 0 inače.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common as C  # noqa: E402
import mapa_izvora  # noqa: E402

DOI = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.I)
ISBN = re.compile(r"\bISBN[\s:]*((?:97[89][- ]?)?(?:\d[- ]?){9}[\dXx])", re.I)
URL = re.compile(r"https?://[^\s,;)\]]+")
SLUZBENI = re.compile(
    # Kvar 80: „Uredba (EU, Euratom) 2020/2092" nije prolazila jer je uzorak
    # tražio doslovno „Uredba (EU)". Službena oznaka akta ima više oblika nego
    # jedan, a propis bez DOI-ja nije nepotvrđena jedinica.
    r"\b(NN\s*\d+/\d+|ECLI:[A-Z:0-9.]+|CELEX[:\s]*\d*[A-Z]\d+|COM\(\d{4}\)\s*\d+"
    r"|SL\s*L\s*\d+|Uredb\w*\s*\((?:EU|EZ|EEZ)[^)]{0,30}\)\s*\d{4}/\d+"
    r"|Direktiv\w*\s*\d{4}/\d+|Odluk\w*\s*\((?:EU|EZ)[^)]{0,30}\)"
    r"|Zakon\w*\s+o\s|Pravilnik\w*\s+o\s|Ustav\w*\s|Ugovor\w*\s+o\s"
    r"|[čc]l(?:anak|\.)\s*\d+|presuda|predmet\s+[CT]-\d+)",
    re.I)


def _isbn_valjan(s: str) -> bool:
    z = re.sub(r"[^0-9Xx]", "", s).upper()
    if len(z) == 10:
        if not re.fullmatch(r"\d{9}[\dX]", z):
            return False
        zbroj = sum((10 - i) * (10 if c == "X" else int(c)) for i, c in enumerate(z))
        return zbroj % 11 == 0
    if len(z) == 13:
        if not z.isdigit():
            return False
        zbroj = sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(z))
        return zbroj % 10 == 0
    return False


def _jedinice(rad: str) -> list[str]:
    body, _cells, _ = C.load_docx_text(rad, include_tables=True)
    lit = C.dio_literature(body)
    if not lit:
        return []
    return [r.strip() for r in lit.split("\n")
            if len(r.strip()) > 20 and re.search(r"\d{4}", r)]


def provjeri(rad: str, izvori: str | None, mapa_put: str | None) -> dict:
    mapa = mapa_izvora.ucitaj(mapa_put) if mapa_put else {}
    s_gradom = {k for k, v in mapa.items() if v.get("datoteka")
                and izvori and os.path.isfile(os.path.join(izvori, v["datoteka"]))}
    imena_datoteka = ""
    if izvori and os.path.isdir(izvori):
        for korijen, _d, f in os.walk(izvori):
            imena_datoteka += " ".join(f).lower() + " "

    out = {"gradja": [], "identifikator": [], "sluzbeni": [],
           "nepotvrdeno": [], "neispravan_identifikator": []}

    for redak in _jedinice(rad):
        prezime = re.match(r"\s*([A-ZČĆŽŠĐ][\wčćžšđ\-']+)", redak)
        godina = re.search(r"\((\d{4})", redak) or re.search(r"\b(19|20)\d\d\b", redak)
        kljuc = ""
        if prezime and godina:
            kljuc = f"{C.kljuc_prezimena(prezime.group(1))}-{godina.group(0).strip('(')}"

        kratko = redak[:120]
        isbn = ISBN.search(redak)
        if isbn and not _isbn_valjan(isbn.group(1)):
            out["neispravan_identifikator"].append(
                {"jedinica": kratko, "razlog": f"ISBN kontrolna znamenka ne valja: {isbn.group(1)}"})
            continue

        if kljuc and kljuc in s_gradom:
            out["gradja"].append(kratko)
        elif prezime and godina and prezime.group(1)[:5].lower() in imena_datoteka:
            out["gradja"].append(kratko)
        elif DOI.search(redak) or isbn or URL.search(redak):
            out["identifikator"].append(kratko)
        elif SLUZBENI.search(redak):
            out["sluzbeni"].append(kratko)
        else:
            out["nepotvrdeno"].append(kratko)
    return out


def ispisi(n: dict, strogo: bool) -> None:
    print("=" * 62)
    print("B2 — POSTOJANJE JEDINICA IZ POPISA LITERATURE")
    print("=" * 62)
    uk = sum(len(v) for v in n.values())
    print(f"jedinica: {uk} | građa {len(n['gradja'])} · identifikator "
          f"{len(n['identifikator'])} · službeni {len(n['sluzbeni'])} · "
          f"NEPOTVRĐENO {len(n['nepotvrdeno'])}")

    if n["neispravan_identifikator"]:
        print(f"\n⚠ NEISPRAVAN IDENTIFIKATOR ({len(n['neispravan_identifikator'])}):")
        for x in n["neispravan_identifikator"]:
            print(f"   • {x['razlog']}")
            print(f"       {x['jedinica']}")

    if n["nepotvrdeno"]:
        znak = "⚠" if strogo else "ℹ️"
        print(f"\n{znak} NEPOTVRĐENE JEDINICE ({len(n['nepotvrdeno'])}) — nema priložene "
              f"građe, DOI-ja, ISBN-a, URL-a ni službene oznake:")
        for x in n["nepotvrdeno"][:20]:
            print(f"   • {x}")
        if len(n["nepotvrdeno"]) > 20:
            print(f"   … još {len(n['nepotvrdeno']) - 20}")
        print("   Alat NE tvrdi da su izmišljene. Tvrdi da ništa u projektu ne")
        print("   pokazuje da postoje, a na obrani to nosi autor.")
    else:
        print("\n✅ svaka jedinica ima građu, identifikator ili službenu oznaku")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Postoji li jedinica iz popisa literature.")
    ap.add_argument("rad")
    ap.add_argument("--izvori")
    ap.add_argument("--mapa")
    ap.add_argument("--strogo", action="store_true",
                    help="nepotvrđena jedinica blokira (mod 6)")
    ap.add_argument("--json", dest="json_out")
    a = ap.parse_args(argv)

    mapa_put = a.mapa or (os.path.join(a.izvori, "mapa.json") if a.izvori else None)
    n = provjeri(a.rad, a.izvori, mapa_put if mapa_put and os.path.isfile(mapa_put) else None)
    ispisi(n, a.strogo)
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as fh:
            json.dump(n, fh, ensure_ascii=False, indent=2)
    if n["neispravan_identifikator"]:
        return 1
    return 1 if (a.strogo and n["nepotvrdeno"]) else 0


if __name__ == "__main__":
    sys.exit(main())
