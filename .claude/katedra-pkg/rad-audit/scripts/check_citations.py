#!/usr/bin/env python3
"""Provjera dosljednosti citiranja u NUMERIČKIM stilovima.

Uporaba:  python3 check_citations.py rad.docx [ieee|vancouver]

Bez drugog argumenta dijalekt se bira iz teksta (common.detect_citation_style).

  ieee       citat u uglatoj zagradi  [5], [12,40];  popis "[5] Autor..."
  vancouver  citat u ovalnoj zagradi   (5), (12,40); popis "5. Autor..."

Provjerava:
  - definirane reference u popisu (bez rupa u numeraciji)
  - siročad (referenca u popisu, ne citirana u tekstu)
  - citate bez reference
  - redoslijed prvog pojavljivanja (oba stila ga traže rastućim)
"""
import re
import sys
from common import (load_docx_text, load_supplementary_text, parse_citation_group,
                    detect_citation_style, find_vancouver_citations, LIT_HEADING_RE)


def _split_lit(body, dijalekt):
    m = list(LIT_HEADING_RE.finditer(body))
    if m:
        return m[-1].end()
    prvi = r"(?m)^\s*\[1\]" if dijalekt == "ieee" else r"(?m)^\s*1\.\s+\S"
    mm = re.search(prvi, body)
    return mm.start() if mm else len(body)


def main(path, dijalekt=None):
    body, cells, _ = load_docx_text(path, include_tables=True)
    sup = load_supplementary_text(path)

    if dijalekt not in ("ieee", "vancouver"):
        stil, counts = detect_citation_style(body)
        dijalekt = "vancouver" if stil == "vancouver" else "ieee"
        print(f"[dijalekt: {dijalekt} (auto) — {counts}]")

    # LITERATURA split SAMO na body tekstu; ćelije i fusnote se dodaju POSLIJE.
    split = _split_lit(body, dijalekt)
    lit = body[split:]
    used_text = "\n".join([body[:split], "\n".join(cells),
                           sup["footnotes"], sup["endnotes"]])

    if dijalekt == "ieee":
        defined = sorted(set(int(n) for n in re.findall(r"(?m)^\s*\[(\d+)\]", lit)))
        if not defined:
            defined = sorted(set(int(n) for n in re.findall(r"\[(\d+)\]\s+[A-ZČĆŠŽĐ]", lit)))
    else:
        # Vancouver: popis je numerirana lista "1. Autor A, Autor B. Naslov..."
        defined = sorted(set(int(n) for n in re.findall(
            r"(?m)^\s*(\d{1,3})\.\s+\S", lit)))

    cited, first_order, year_like = set(), [], set()
    if dijalekt == "ieee":
        for mm in re.finditer(r"\[([0-9][0-9,\s–\-]*)\]", used_text):
            for k in parse_citation_group(mm.group(1)):
                if k > 999:
                    year_like.add(k)
                    continue
                cited.add(k)
                if k not in first_order:
                    first_order.append(k)
    else:
        nalazi = find_vancouver_citations(body[:split])
        for c in cells:
            nalazi += find_vancouver_citations(c, u_tablici=True)
        nalazi += find_vancouver_citations(sup["footnotes"])
        nalazi += find_vancouver_citations(sup["endnotes"])
        for _pos, nums in nalazi:
            for k in nums:
                cited.add(k)
                if k not in first_order:
                    first_order.append(k)

    print("=" * 56)
    print(f"CITIRANJE ({dijalekt}) —", path)
    print("=" * 56)
    if defined:
        print(f"Definirano u popisu: {len(defined)}  (raspon {min(defined)}–{max(defined)})")
        gaps = [i for i in range(min(defined), max(defined) + 1) if i not in defined]
        print(f"  {'⚠ rupe u numeraciji' if gaps else 'rupe u numeraciji'}: {gaps or 'nema'}")
    else:
        print("⚠ Definirano u popisu: (nije prepoznat popis — provjeri ručno)")

    print(f"Citirano u tekstu (uklj. tablice/fusnote/endnote): {len(cited)}")
    if year_like:
        print(f"  ⚠ zagrada s brojem >999 (vjerojatno godina, NE citat): {sorted(year_like)}")
    orphans = [d for d in defined if d not in cited]
    undefined = [c for c in sorted(cited) if c not in defined]
    print(f"  {'⚠ SIROČAD' if orphans else 'SIROČAD'} (u popisu, ne citirano): {orphans or 'nema'}")
    print(f"  {'⚠ CITAT BEZ REFERENCE' if undefined else 'CITAT BEZ REFERENCE'}: {undefined or 'nema'}")

    viol, mx = [], 0
    for n in first_order:
        if n < mx:
            viol.append(n)
        mx = max(mx, n)
    if defined:
        print(f"\nRedoslijed prvog pojavljivanja: {first_order[:12]}{' …' if len(first_order) > 12 else ''}")
        if viol:
            print(f"  ⚠ krši rastući redoslijed na {len(viol)} mjesta: {viol[:10]} — "
                  f"prenumeriraj ili objasni tematsko grupiranje.")
        else:
            print("  ✓ prati redoslijed pojavljivanja")

    ok = bool(defined) and not orphans and not undefined and not viol
    print("\nREZULTAT:", "✓ interno konzistentno" if ok else "⚠ ima nalaza (v. gore)")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
