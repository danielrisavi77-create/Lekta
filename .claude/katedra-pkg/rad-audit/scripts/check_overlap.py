#!/usr/bin/env python3
"""Detektor doslovnog preklapanja (verbatim-copy) rad vs izvorna građa.

Uporaba:
  python3 check_overlap.py rad.docx izvori_folder/
  python3 check_overlap.py rad.docx izvori_folder/ --ngram 8 --min-overlap 2
  python3 check_overlap.py rad.docx izvori_folder/ --min-words 15

Zašto ovo postoji: cross_check.py provjerava "je li tvrdnja/broj iz rada
prisutan u izvoru" (dobro — potvrđuje sadržaj). Ovo radi OBRNUTO: traži
odlomke koji su gotovo doslovno prepisani iz izvora BEZ vidljive oznake
citata (navodnici + referenca) — akademska čestitost, ne cross-check sadržaja.

Metoda: word n-grami (zadano n=8, ~jedna dulja fraza) po odlomku rada
naspram n-grama svakog izvora. Preklapanje ≥ min-overlap n-grama u istom
odlomku = kandidat za ručnu provjeru. NIJE Turnitin-razina alata (nema
fuzzy/sinonim usporedbe) — hvata samo blisko-doslovno podudaranje, i javlja
lažne pozitivce za formulaične/standardne fraze (nazivi normi, standardne
rečenice iz propisa). Preklapanje NIJE samo po sebi plagijat: ako je odlomak
već označen kao citat (navodnici + referenca odmah uz njega), to je očekivano
i u redu — alat to samo ističe da provjeriš je li oznaka doista prisutna.
"""
import re
import sys
import glob
import os
from collections import defaultdict
from docx import Document
from cross_check import read_any


def words_of(text):
    return re.findall(r"[a-zA-ZčćžšđČĆŽŠĐ]+", text.lower())


def ngrams(words, n):
    return set(tuple(words[i:i + n]) for i in range(len(words) - n + 1))


# Kvar 69: vlastita kopija ovog uzorka nije znala za „IZVORI I LITERATURA" ni
# „POPIS CITIRANE LITERATURE", pa je na FPZG i HKS radovima popis literature
# ulazio u analizu preklapanja i davao lažne verbatim pogotke.
from common import LIT_HEADING_RE
CITATION_MARK_RE = re.compile(r"\[\d+[\d,\s–\-]*\]|\([A-ZČĆŠŽĐ][\wčćžšđ\-]+.{0,60}?\d{4}[a-z]?\)")


def looks_marked_as_quote(text):
    """Gruba provjera: ima li odlomak navodnike I referencu (citat/broj-godina) u blizini."""
    has_quotes = ("„" in text) or ("“" in text) or ('"' in text)
    has_citation = bool(CITATION_MARK_RE.search(text))
    return has_quotes and has_citation


def main(argv):
    rad, folder = argv[0], argv[1]
    n = 8
    if "--ngram" in argv:
        n = int(argv[argv.index("--ngram") + 1])
    min_overlap = 2
    if "--min-overlap" in argv:
        min_overlap = int(argv[argv.index("--min-overlap") + 1])
    min_words = 15
    if "--min-words" in argv:
        min_words = int(argv[argv.index("--min-words") + 1])

    d = Document(rad)
    in_lit = False
    paragraphs = []
    for p in d.paragraphs:
        if LIT_HEADING_RE.match(p.text.strip()):
            in_lit = True
        if in_lit:
            continue
        w = words_of(p.text)
        if len(w) >= min_words:
            paragraphs.append(p.text)

    sources = {}
    for p in sorted(glob.glob(os.path.join(folder, "*"))):
        txt = read_any(p)
        if txt:
            sources[os.path.basename(p)] = ngrams(words_of(txt), n)
    if not sources:
        print("Nema čitljivih izvora u folderu (.txt/.md/.docx). Za PDF: pdftotext -layout.")
        return 2

    print("=" * 70)
    print(f"PREKLAPANJE (verbatim-copy) — {len(paragraphs)} odlomaka (≥{min_words} riječi) "
          f"vs {len(sources)} izvora, {n}-grami, prag {min_overlap}")
    print("=" * 70)

    flagged = 0
    unmarked = 0
    for idx, para in enumerate(paragraphs, 1):
        pw = words_of(para)
        pn = ngrams(pw, n)
        if not pn:
            continue
        best_name, best_overlap, best_example = None, 0, None
        for name, sn in sources.items():
            common = pn & sn
            if len(common) > best_overlap:
                best_overlap = len(common)
                best_name = name
                best_example = next(iter(common), None)
        if best_overlap >= min_overlap:
            flagged += 1
            marked = looks_marked_as_quote(para)
            if not marked:
                unmarked += 1
            phrase = " ".join(best_example) if best_example else "?"
            snippet = para[:100].replace("\n", " ")
            print(f"\n  odlomak #{idx}  preklapanje: {best_overlap}×{n}-gram s [{best_name}]")
            print(f"    primjer fraze: \"…{phrase}…\"")
            print(f"    odlomak: \"{snippet}…\"")
            print(f"    {'✓ izgleda označeno (navodnici + referenca u blizini)' if marked else '⚠ NEMA vidljive oznake citata (navodnici+referenca) uz odlomak'}")

    print("\n" + "-" * 70)
    print(f"SAŽETAK: {flagged} odlomak(a) s preklapanjem ≥ praga, od toga {unmarked} BEZ vidljive oznake citata.")
    print("Preklapanje NIJE samo po sebi dokaz plagijata — formulaične fraze (norme, standardni")
    print("izrazi) daju lažne pozitivce, i alat ne razumije sinonime/parafrazu. Provjeri ručno")
    print("svaki neoznačeni nalaz: je li to citat kojem fali navodnik/referenca, ili tek slučajno")
    print("podudaranje standardne formulacije.")
    return 1 if unmarked else 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
