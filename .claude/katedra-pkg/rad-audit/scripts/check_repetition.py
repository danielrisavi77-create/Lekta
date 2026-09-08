#!/usr/bin/env python3
"""Analiza ponavljanja i ritma rečenica.

Uporaba:  python3 check_repetition.py rad.docx [--top N]

Ispisuje: najčešće početke rečenica (2 riječi), najčešće fraze (4-grami),
raspodjelu duljine rečenica i udio "staccato" (kratkih) rečenica.
"""
import re
import sys
import statistics
from collections import Counter
from common import load_docx_text, sentences


def main(path, top=15):
    body, _cells, _ = load_docx_text(path, include_tables=False)  # samo proza
    # odreži popis literature (inače "HRN EN"/"Zagreb: HZN" dominiraju)
    # Kvar 69: treća kopija istog uzorka, također bez „IZVORI I LITERATURA".
    # Naslovi i nakladnici iz popisa kvarili su mjeru ritma rečenica.
    from common import LIT_HEADING_RE
    m = list(LIT_HEADING_RE.finditer(body))
    if m:
        body = body[:m[-1].start()]
    sents = sentences(body)
    if not sents:
        print("Nema teksta.")
        return 0
    lens = [len(s.split()) for s in sents]

    print("=" * 56)
    print("PONAVLJANJA I RITAM —", path)
    print("=" * 56)
    print(f"rečenica: {len(sents)} | prosj. duljina: {statistics.mean(lens):.1f} | "
          f"medijan: {statistics.median(lens)} | min/max: {min(lens)}/{max(lens)}")
    short = sum(1 for x in lens if x <= 8)
    print(f"vrlo kratke (≤8 riječi): {short} ({100*short/len(lens):.0f}%)"
          + ("  ⚠ moguć staccato ritam" if short/len(lens) > 0.25 else ""))

    starts = Counter(" ".join(s.split()[:2]).lower() for s in sents)
    print("\nNajčešći početci rečenica (2 riječi):")
    for k, v in starts.most_common(top):
        flag = "  ⚠" if v >= 6 else ""
        print(f"  {v:3d}  {k}{flag}")

    words = re.findall(r"\w+", body.lower())
    grams = Counter(tuple(words[i:i+4]) for i in range(len(words) - 4))
    print("\nNajčešće fraze (4 riječi, ≥4×):")
    shown = 0
    for k, v in grams.most_common(60):
        if v >= 4 and not all(w.isdigit() for w in k):
            print(f"  {v:3d}  {' '.join(k)}")
            shown += 1
            if shown >= top:
                break

    # atribucijski glagoli
    upozorenja = 0
    for verb in ["navodi", "navode", "opisuje", "prikazuje"]:
        c = len(re.findall(r"\b" + verb + r"\b", body))
        if c >= 8:
            print(f"\n⚠ glagol '{verb}': {c}× — variraj uvode izvora")
            upozorenja += 1
    return 1 if upozorenja else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    top = 15
    if "--top" in sys.argv:
        top = int(sys.argv[sys.argv.index("--top") + 1])
    sys.exit(main(sys.argv[1], top))
