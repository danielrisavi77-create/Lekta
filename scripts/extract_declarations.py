"""
Izvlacenje DOSLOVNE formulacije izjave o izvornosti iz snapshotiranih PDF-ova (P6-3).

    python scripts/extract_declarations.py

Zasto Python: PyMuPDF cita tekstualni sloj PDF-a bez OCR-a, pa dijakritika ostaje netaknuta.
Izmjereno: 226 od 255 snapshota ima pravi tekstualni sloj, 104 spominju izjavu, a 69 sadrzi i samu
formulaciju u prvom licu.

KONTROLA KVALITETE je srz ovog skripta, ne dodatak. Dio PDF-ova ima pokvaren tekstualni sloj
(mjereno: "Z,IAVA kojom ja ... Sveudili5ta Rijeci" umjesto "IZJAVA kojom ja ... Sveucilista u
Rijeci"). Takav tekst NE SMIJE zavrsiti kao "sluzbena formulacija" - to je tekst koji student
potpisuje. Kandidat se zato odbacuje ako:
  - nema nijedan hrvatski dijakriticki znak (siguran znak da je sloj izgubio kodiranje),
  - ima znamenku unutar rijeci ("Sveudili5ta"),
  - ima premalo slova naspram ostalih znakova.

Izlaz je KANDIDAT, ne odluka: `data/declarations/extracted-candidates.json`. Tek TS korak
(scripts/seed-declarations.mts) provjerava shemu i odlucuje sto ulazi kao `official`.
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
OUT = os.path.join(ROOT, "data", "declarations", "extracted-candidates.json")

# Naslov obrasca; hvata i "IZJAVA O IZVORNOSTI", i "IZJAVA STUDENTA O AKADEMSKOJ CESTITOSTI".
HEADING = re.compile(
    r"IZJAV\w*(\s+STUDENT\w*)?\s+O\s+(IZVORNOSTI|AUTORSTVU|AKADEMSKOJ\s+ČESTITOSTI|AKADEMSKOJ\s+CESTITOSTI)",
    re.I,
)
# Prvo lice: bez toga je rijec o zahtjevu ("rad mora sadrzavati izjavu"), ne o obrascu.
FIRST_PERSON = re.compile(
    r"(izjavljujem|pod\s+punom\s+(moralnom|materijalnom)|vlastitim\s+radom|samostalno\s+(sam\s+)?izradi)",
    re.I,
)

DIACRITICS = set("čćžšđČĆŽŠĐ")
DIGIT_IN_WORD = re.compile(r"[A-Za-zčćžšđ][0-9][A-Za-zčćžšđ]")


def quality(text: str) -> tuple[bool, str]:
    """Vraca (prihvatljivo, razlog). Razlog se biljezi i kad je kandidat prihvacen."""
    if not any(ch in DIACRITICS for ch in text):
        return False, "bez ijednog dijakritickog znaka (pokvaren tekstualni sloj)"
    if DIGIT_IN_WORD.search(text):
        return False, "znamenka unutar rijeci (pokvaren tekstualni sloj)"
    letters = sum(ch.isalpha() for ch in text)
    if letters < len(text) * 0.45:
        return False, "premalo slova naspram ostalih znakova"
    return True, "dijakritika prisutna, bez tragova pokvarenog sloja"


def extract(path: str) -> dict | None:
    try:
        doc = fitz.open(path)
    except Exception:
        return None
    try:
        for page_index, page in enumerate(doc):
            text = page.get_text()
            if not text or not HEADING.search(text) or not FIRST_PERSON.search(text):
                continue
            start = HEADING.search(text).start()
            block = re.sub(r"[ \t]+", " ", text[start : start + 1200]).strip()
            ok, reason = quality(block)
            return {
                "file": os.path.relpath(path, ROOT).replace("\\", "/"),
                # Direktorij pod data/sources/ je unitId (npr. data/sources/agr/... -> "agr").
                "unitId": os.path.basename(os.path.dirname(path)),
                "page": page_index + 1,
                "wording": block,
                "accepted": ok,
                "qualityNote": reason,
            }
    finally:
        doc.close()
    return None


def main() -> None:
    pdfs = sorted(glob.glob(os.path.join(SOURCES, "**", "*.pdf"), recursive=True))
    candidates = [c for c in (extract(p) for p in pdfs) if c]
    candidates.sort(key=lambda c: (c["unitId"], c["file"]))

    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(candidates, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    accepted = [c for c in candidates if c["accepted"]]
    print("=== Ekstrakcija izjava ===")
    print(f"PDF-ova pregledano: {len(pdfs)}")
    print(f"kandidata s obrascem: {len(candidates)}")
    print(f"  prihvaceno (kvaliteta OK): {len(accepted)} kroz {len({c['unitId'] for c in accepted})} jedinica")
    print(f"  odbaceno: {len(candidates) - len(accepted)}")
    for c in candidates:
        if not c["accepted"]:
            print(f"    ODBACENO {c['file']}: {c['qualityNote']}")
    print("")
    print(f"zapisano: {os.path.relpath(OUT, ROOT)}")
    print("Kandidat NIJE odluka: shemu i status odlucuje scripts/seed-declarations.mts.")


if __name__ == "__main__":
    main()
