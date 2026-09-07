#!/usr/bin/env python3
"""Svaki subprocess poziv u tekstualnom načinu mora reći kojim kodiranjem čita dijete.

Kvar 119 → 152 → 153 → 155 → 159: `subprocess.run(..., text=True)` bez `encoding=` na Windows
konzoli (cp1250) dekodira UTF-8 izlaz djeteta krivo — u boljem slučaju mojibake, u gorem
čitač pukne na bajtu koji cp1250 ne poznaje (0x81, 0x83, 0x88, 0x90, 0x98) i `r.stdout`
je `None`, pa roditelj padne na `r.stdout + r.stderr`. Na Linuxu nevidljivo, pa se vraćalo
s svakom novom isporukom. Pregled je AST: `Call` na `subprocess.run|Popen|check_output` s
`text`/`universal_newlines` u kwargs bez `encoding`.

Uporaba:  python3 katedra/scripts/provjeri_subprocess.py [KORIJEN_PAKETA]
Izlaz:    0 = nijedan poziv bez encoding=; 1 = ima ih, svaki je imenovan (datoteka:redak).
"""
from __future__ import annotations

import ast
import os
import sys

KORIJENI = ("katedra-lite/scripts", "rad-audit/scripts", "rad-docx/scripts", "katedra/scripts",
            "rad-orchestrator", "service", "bin")


def _cilj(n: ast.AST) -> bool:
    return (isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
            and n.func.attr in ("run", "check_output", "Popen")
            and isinstance(n.func.value, ast.Name) and n.func.value.id == "subprocess")


def pregledaj(korijen: str) -> list[tuple[str, int, str]]:
    nalazi: list[tuple[str, int, str]] = []
    for k in KORIJENI:
        for d, _dirs, fs in os.walk(os.path.join(korijen, k)):
            if "__pycache__" in d:
                continue
            for f in sorted(fs):
                if not f.endswith(".py"):
                    continue
                p = os.path.join(d, f)
                try:
                    with open(p, encoding="utf-8") as h:
                        tree = ast.parse(h.read())
                except (SyntaxError, UnicodeDecodeError, OSError) as e:
                    nalazi.append((p, 0, f"NEPARSIRANO: {type(e).__name__}"))
                    continue
                for n in ast.walk(tree):
                    if not _cilj(n):
                        continue
                    kw = {x.arg for x in n.keywords}
                    if ("text" in kw or "universal_newlines" in kw) and "encoding" not in kw:
                        nalazi.append((os.path.relpath(p, korijen), n.lineno, f"subprocess.{n.func.attr}"))
    return nalazi


def main(argv=None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    korijen = argv[0] if argv else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    nalazi = pregledaj(korijen)
    if nalazi:
        print(f"❌ {len(nalazi)} subprocess poziva s text=True bez encoding= (kvar 159):")
        for p, ln, sto in nalazi:
            print(f"   {p}:{ln}  {sto}")
        print('   Što napraviti: dodaj encoding="utf-8", errors="replace" (i PYTHONIOENCODING djetetu ako piše ✔).')
        return 1
    print("✅ svaki subprocess poziv u tekstualnom načinu ima encoding=")
    return 0


if __name__ == "__main__":
    sys.exit(main())
