#!/usr/bin/env python3
"""Tier 1 provjera: otvara li se .docx paket pod NEOVISNOM implementacijom (python-docx + lxml).

Zasto uz vec postojeci Tier 0 (src/repair/package-integrity.ts):
  - Tier 0 je nas vlastiti skener, pa dijeli pretpostavke s kodom koji provjerava. lxml je tudji,
    stroziji parser koji ne dijeli nijednu nasu pretpostavku.
  - python-docx cita OPC relacije, pa hvata klasu koju cisti XML skener ne vidi: visece `r:id`
    veze, dio koji nedostaje u `[Content_Types].xml`, neispravan `_rels` graf.
  - Vrti se na ubuntuu u CI-ju, za razliku od Tier 2 (Word COM), koji je Windows-only i rucni.

Ne provjerava OBLIKOVANJE (to je Tier 2 posao, scripts/word-verify/check.ps1), samo je li paket
uopce valjan. Prvi pad -> izlazni kod 1.

  python scripts/verify-docx/strict-open.py tests/fixtures/docx
  python scripts/verify-docx/strict-open.py a.docx b.docx
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

try:
    import docx  # type: ignore
    from lxml import etree  # type: ignore
except ImportError:
    print("NEDOSTAJE OVISNOST: pip install python-docx lxml", file=sys.stderr)
    raise SystemExit(2)

XML_SUFFIXES = (".xml", ".rels")


def collect(paths: list[str]) -> list[Path]:
    found: list[Path] = []
    for raw in paths:
        path = Path(raw)
        if path.is_dir():
            found.extend(sorted(path.rglob("*.docx")))
        elif path.is_file():
            found.append(path)
        else:
            print(f"NE POSTOJI: {path}", file=sys.stderr)
            raise SystemExit(2)
    return found


def problems_for(path: Path) -> list[str]:
    """Prazna lista = paket je cist po oba misljenja (lxml po dijelu + python-docx OPC)."""
    problems: list[str] = []

    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            for name in names:
                if not name.lower().endswith(XML_SUFFIXES):
                    continue
                try:
                    etree.fromstring(archive.read(name))
                except etree.XMLSyntaxError as error:
                    problems.append(f"{name}: {error}")
            if "[Content_Types].xml" not in names:
                problems.append("nedostaje [Content_Types].xml")
    except zipfile.BadZipFile as error:
        return [f"nije valjan zip: {error}"]

    # Drugo misljenje: puni OPC ucitavac (relacije, tipovi sadrzaja, tijelo dokumenta).
    try:
        document = docx.Document(str(path))
        _ = len(document.paragraphs)
    except Exception as error:  # python-docx die na sve od KeyError do vlastitih iznimaka
        problems.append(f"python-docx ne otvara paket: {type(error).__name__}: {error}")

    return problems


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2

    files = collect(argv)
    if not files:
        print("NIJEDAN .docx nije pronaden (prazan skup je crveno, ne tiho zeleno).", file=sys.stderr)
        return 1

    failed = 0
    for path in files:
        problems = problems_for(path)
        if problems:
            failed += 1
            print(f"PAD {path}")
            for problem in problems:
                print(f"     {problem}")
        else:
            print(f"OK  {path}")

    print(f"\n{len(files) - failed}/{len(files)} paketa prolazi strogo otvaranje.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
