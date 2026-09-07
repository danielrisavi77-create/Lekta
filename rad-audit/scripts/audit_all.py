#!/usr/bin/env python3
"""Pokreni sve read-only provjere odjednom i ispiši objedinjeni izvještaj.

Uporaba:
  python3 audit_all.py rad.docx
  python3 audit_all.py rad.docx --sources izvori_folder/

Ne mijenja dokument. Za XSD validaciju koristi docx skill:
  python3 /root/.claude/skills/docx/scripts/office/validate.py rad.docx --original original.docx

Za razvrstan, spremljeni izvještaj (Kritično/Srednje/Kozmetičko + Markdown/JSON)
umjesto sirovog ispisa u terminal, koristi generate_report.py.
"""
import sys
import runpy
import os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import check_citations
import check_citations_authoryear
import check_fields
import check_placeholders
import check_uputnice
import check_tablice
import check_statistika
import check_hipoteze
import brojke_iz_rasprave
import provjeri_metapodatke
import check_typography
import check_repetition
import numbers_inventory
from common import load_docx_text, detect_citation_style


# Kvar 63: run() je gutao i izlazni kod i iznimku, a main() je bezuvjetno
# vraćao 0. Audit je time bio izvještaj koji se smije ignorirati bez ijedne
# tehničke posljedice. Sada svaki korak upisuje svoj kod, a main vraća najgori.
KODOVI: dict[str, int] = {}


def run(title, fn, *args):
    print("\n\n" + "#" * 60)
    print("#  " + title)
    print("#" * 60)
    kod = 0
    try:
        kod = fn(*args) or 0
    except SystemExit as e:
        kod = e.code if isinstance(e.code, int) else (1 if e.code else 0)
    except Exception as e:
        print(f"⚠ greška u modulu: {e}")
        kod = 2
    KODOVI[title] = kod
    return kod


def main(argv):
    path = argv[0]
    sources = None
    if "--sources" in argv:
        sources = argv[argv.index("--sources") + 1]

    run("A/F — POLJA I FORMATIRANJE", check_fields.main, path)
    run("A2 — RADNE OZNAKE U TEKSTU", check_placeholders.main, path)
    run("A4 — METAPODACI", provjeri_metapodatke.main, [path])
    run("C2 — BROJKE IZ RASPRAVE", brojke_iz_rasprave.main, path)
    run("F2 — UPUTNICE NA PRIKAZE", check_uputnice.main, path)
    run("C4 — ARITMETIKA U TABLICAMA", check_tablice.main, path)
    run("C3 — STATISTIČKO IZVJEŠTAVANJE", check_statistika.main, path)
    run("G1 — HIPOTEZE I CILJEVI", check_hipoteze.main, path)

    body, cells, _ = load_docx_text(path, include_tables=True)
    style, style_counts = detect_citation_style(body + "\n" + "\n".join(cells))
    print(f"\n[detektiran stil citiranja: {style}  (IEEE-sličnih: {style_counts['ieee']}, "
          f"Vancouver-sličnih: {style_counts.get('vancouver', 0)}, "
          f"autor-godina-sličnih: {style_counts['authoryear']})]")
    if style in ("ieee", "unknown"):
        run("B — CITIRANJE (IEEE [N])", check_citations.main, path, "ieee")
    if style == "vancouver" or (style == "unknown" and style_counts.get("vancouver", 0)):
        run("B — CITIRANJE (Vancouver (N))", check_citations.main, path, "vancouver")
    if style in ("authoryear", "unknown", "mixed"):
        run("B — CITIRANJE (autor-godina)", check_citations_authoryear.main, path)
    if style == "mixed":
        run("B — CITIRANJE (IEEE [N])", check_citations.main, path, "ieee")
        print("\n[⚠ oba stila detektirana u sličnoj mjeri — provjeri ručno koristi li rad "
              "dosljedno JEDAN stil ili je miješanje namjerno (npr. norme u uglatim zagradama "
              "uz autor-godina tekst)]")

    run("C — BROJČANI INVENTAR", numbers_inventory.main, path)
    run("E — TIPOGRAFIJA", check_typography.main, path)
    run("E — PONAVLJANJA I RITAM", check_repetition.main, path)

    if sources:
        import cross_check
        import check_overlap
        run("D — CROSS-CHECK S IZVORIMA", cross_check.main, [path, sources])
        run("D — PREKLAPANJE (verbatim-copy)", check_overlap.main, [path, sources])
    else:
        print("\n\n[D — cross-check/preklapanje preskočeni: dodaj --sources <folder> s izvornom građom]")

    print("\n\n" + "=" * 60)
    print("Objedinjeni audit gotov. Ručno još: aritmetika, format svake reference,")
    print("granica dokaza, XSD validacija (docx skill), i vizualni render ako radi.")
    pukli = [t for t, k in KODOVI.items() if k >= 2]
    nalazi = [t for t, k in KODOVI.items() if k == 1]
    if pukli:
        print(f"💥 faze koje se NISU izvele: {', '.join(pukli)}")
    if nalazi:
        print(f"❌ faze s nalazima: {', '.join(nalazi)}")
    if not pukli and not nalazi:
        print("✅ nijedna faza nije prijavila nalaz.")
    print("=" * 60)
    return max(KODOVI.values(), default=0)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
