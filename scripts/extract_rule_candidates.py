"""
Kandidati za pravila oblikovanja iz snapshotiranih izvora (P2-3 / P2-2).

    python scripts/extract_rule_candidates.py [unitId ...]

Zasto: 41 profil je na razini E jer nema nijedno bodovano pravilo. Mjerenje je pokazalo da svih 13
njihovih jedinica VEC IMA izvore na disku (2 do 50 datoteka), dakle posao je rudarenje, ne
prikupljanje.

Sto ovaj skript RADI: nalazi mjesta u sluzbenom dokumentu koja govore o fontu, velicini, proredu,
marginama i formatu papira, i uz svako biljezi STRANICU i DOSLOVAN kontekst.

Sto NE radi: ne odlucuje. Izlaz je dosje kandidata; vrijednost pravila i njegov `checkId` upisuje
covjek (ili zaseban, pregledan korak), jer je pogresno pravilo gore od nikakvog - njime bi se
studentov rad bodovao krivo. Zato ovdje nema mapiranja u `ruleEntries`.

Kontrola kvalitete je ista kao kod izjava: kandidat iz pokvarenog tekstualnog sloja se odbacuje,
inace bi "Times New Roman 12" moglo doci iz teksta u kojem su znamenke pomijesane sa slovima.
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    print("PyMuPDF nije instaliran: pip install pymupdf", file=sys.stderr)
    raise SystemExit(1)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SOURCES = os.path.join(ROOT, "data", "sources")
OUT = os.path.join(ROOT, "docs", "generated", "rule-candidates.json")
DOSSIER_DIR = os.path.join(ROOT, "data", "verification", "rule-dossiers")

FONT_NAMES = r"(Times New Roman|Arial|Calibri|Garamond|Cambria|Book Antiqua|Helvetica|Verdana)"

PATTERNS: dict[str, re.Pattern[str]] = {
    # checkId -> uzorak. Namjerno siroki: cilj je NACI mjesto, ne izvesti vrijednost.
    "font": re.compile(FONT_NAMES, re.I),
    "font-size": re.compile(r"\b(8|9|10|11|12|13|14)\s*(pt\b|to[cč]k|tipografsk)", re.I),
    "line-spacing": re.compile(
        r"prored\w*[^.\n]{0,40}?(jednostruk\w*|dvostruk\w*|1[,.]0|1[,.]15|1[,.]5|1[,.]2)", re.I
    ),
    "margins": re.compile(r"(margin\w*|rub\w*)[^.\n]{0,60}?\d[,.]?\d?\s*cm", re.I),
    "paper-size": re.compile(r"\bA4\b", re.I),
}

DIGIT_IN_WORD = re.compile(r"[A-Za-zčćžšđ][0-9][A-Za-zčćžšđ]")
DIACRITICS = set("čćžšđČĆŽŠĐ")


def usable(text: str) -> bool:
    """Isti prag kao kod izjava: pokvaren tekstualni sloj ne smije proizvesti pravilo."""
    if DIGIT_IN_WORD.search(text):
        return False
    letters = sum(ch.isalpha() for ch in text)
    return letters >= len(text) * 0.4


def scan(path: str, unit_id: str) -> list[dict]:
    try:
        doc = fitz.open(path)
    except Exception:
        return []
    found: list[dict] = []
    seen: set[tuple[str, str]] = set()
    try:
        for page_index, page in enumerate(doc):
            text = page.get_text()
            if not text or len(text.strip()) < 200:
                continue
            for check_id, pattern in PATTERNS.items():
                for match in pattern.finditer(text):
                    start = max(0, match.start() - 120)
                    context = re.sub(r"\s+", " ", text[start : match.end() + 160]).strip()
                    if not usable(context):
                        continue
                    key = (check_id, context[:90])
                    if key in seen:
                        continue
                    seen.add(key)
                    found.append(
                        {
                            "unitId": unit_id,
                            "file": os.path.relpath(path, ROOT).replace("\\", "/"),
                            "page": page_index + 1,
                            "checkId": check_id,
                            "match": match.group(0),
                            "context": context,
                        }
                    )
    finally:
        doc.close()
    return found


def main() -> None:
    wanted = set(sys.argv[1:])
    units = sorted(
        d for d in os.listdir(SOURCES) if os.path.isdir(os.path.join(SOURCES, d)) and (not wanted or d in wanted)
    )

    candidates: list[dict] = []
    for unit_id in units:
        for path in sorted(glob.glob(os.path.join(SOURCES, unit_id, "*.pdf"))):
            candidates.extend(scan(path, unit_id))

    by_unit: dict[str, dict[str, int]] = {}
    for c in candidates:
        by_unit.setdefault(c["unitId"], {}).setdefault(c["checkId"], 0)
        by_unit[c["unitId"]][c["checkId"]] += 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"schemaVersion": 1, "candidates": candidates}, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("=== Kandidati za pravila oblikovanja ===")
    print(f"jedinica pregledano: {len(units)} | kandidata: {len(candidates)}")
    for unit_id in sorted(by_unit):
        axes = by_unit[unit_id]
        print(f"  {unit_id:12} " + ", ".join(f"{k}={v}" for k, v in sorted(axes.items())))
    # Dosje po jedinici: isti obrazac kao verifikacijski worklist - covjek otvori izvor na
    # lokatoru, procita DOSLOVAN kontekst i upise vrijednost pravila. Bez ovoga je 479 kandidata
    # samo JSON kroz koji se ne moze raditi.
    os.makedirs(DOSSIER_DIR, exist_ok=True)
    written = 0
    for unit_id in sorted(by_unit):
        rows = [c for c in candidates if c["unitId"] == unit_id]
        lines = [f"# Kandidati za pravila: {unit_id}", ""]
        lines.append(
            "Svaki unos je MJESTO u sluzbenom dokumentu, ne pravilo. Otvori izvor na navedenoj "
            "stranici, procitaj kontekst i upisi vrijednost; pogresno pravilo boduje studentov rad krivo."
        )
        lines.append("")
        for check_id in sorted({r["checkId"] for r in rows}):
            subset = [r for r in rows if r["checkId"] == check_id]
            lines.append(f"## {check_id} ({len(subset)})")
            lines.append("")
            for r in subset:
                lines.append(f"- `{os.path.basename(r['file'])}` str. {r['page']} - nadjeno: **{r['match']}**")
                lines.append(f"  > {r['context']}")
            lines.append("")
        out_path = os.path.join(DOSSIER_DIR, f"{unit_id}.md")
        with open(out_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(lines) + "\n")
        written += 1

    print("")
    print(f"zapisano: {os.path.relpath(OUT, ROOT)} i {written} dosjea u data/verification/rule-dossiers/")
    print("Kandidat NIJE pravilo: vrijednost i checkId upisuje covjek, jer pogresno pravilo boduje krivo.")


if __name__ == "__main__":
    main()
