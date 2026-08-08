#!/usr/bin/env python3
"""Provjeri stoji li `quote` iz nacrta pravila DOSLOVNO u snapshotiranom izvoru.

Zasto strojno, a ne agentom: doslovnost citata je mehanicko pitanje s tocnim odgovorom. Agent na
njemu daje procjenu i kosta minute po nalazu; ovo je deterministicko, ponovljivo i traje sekunde.
Agent ostaje koristan za ono sto stroj ne moze: je li formulacija obvezujuca i odnosi li se na
pravu vrstu rada.

Sto NE provjerava (i zato ovo nije zamjena za ljudski pass):
  - je li izvor obveza ili preporuka,
  - odnosi li se na diplomski rad ili na nesto drugo,
  - slijedi li `value` doista iz citata.

  python scripts/verify-draft-quotes.py data/pilot-drafts
  python scripts/verify-draft-quotes.py data/profiles/pravo/drafts
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import fitz  # pymupdf
except ImportError:
    print("NEDOSTAJE OVISNOST: pip install pymupdf", file=sys.stderr)
    raise SystemExit(2)

PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def loose(text: str) -> str:
    """Kao normalize, ali bez interpunkcije.

    Upute cesto nabrajaju cjeline natuknicama, a PDF ih vadi kao dvostruke razmake. Nacrt takav
    popis obicno prepise sa zarezima, sto NIJE doslovan citat ali JEST vjerno izvoru. Ova razina
    to razlikuje od stvarno izmisljenog teksta.
    """
    return re.sub(r"\s+", " ", PUNCT.sub(" ", text)).strip()


ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "data" / "sources" / "source-registry.json"


def normalize(text: str) -> str:
    """Spljosti tekst da usporedba prezivi prelome redaka i tipografske varijante.

    PDF vadjenje teksta lomi recenice na proizvoljnim mjestima i koristi tipografske navodnike i
    crtice, pa doslovna usporedba znak po znak daje lazne negative. Dijakritika se NE skida: ona
    nosi znacenje i njezin gubitak bi bio stvarna razlika.
    """
    text = unicodedata.normalize("NFC", text)
    for dash in "‐‑‒–—―":
        text = text.replace(dash, "-")
    for quote in "‘’‚‛":
        text = text.replace(quote, "'")
    for quote in "“”„‟":
        text = text.replace(quote, '"')
    text = text.replace(" ", " ").replace("­", "")
    return re.sub(r"\s+", " ", text).strip().lower()


def source_index() -> dict[str, Path]:
    raw = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = raw if isinstance(raw, list) else raw.get("sources", [])
    out: dict[str, Path] = {}
    for entry in entries:
        path = entry.get("snapshotPath")
        if entry.get("id") and path:
            out[entry["id"]] = ROOT / path
    return out


def iter_entry_lists(raw: object) -> list[list]:
    """Vrati SVE liste unosa iz jedne datoteke nacrta.

    Oblici se razlikuju po generatoru: `{profiles: {id: [...]}}` (law-drafts),
    `{profileId, ruleEntries: [...]}` i `{profileId, entries: [...]}`. Prije se islo kroz
    `dict.values()`, pa su se i obicna polja poput `note` brojala kao skupine i davala lazan
    "bez citata".
    """
    out: list[list] = []
    if isinstance(raw, list):
        return [raw]
    if not isinstance(raw, dict):
        return out
    profiles = raw.get("profiles")
    if isinstance(profiles, dict):
        out.extend(value for value in profiles.values() if isinstance(value, list))
    for key in ("ruleEntries", "entries", "drafts"):
        value = raw.get(key)
        if isinstance(value, list):
            out.append(value)
    return out


_cache: dict[Path, str] = {}


def source_text(path: Path) -> str | None:
    if path in _cache:
        return _cache[path]
    if not path.exists() or path.suffix.lower() != ".pdf":
        return None
    try:
        with fitz.open(path) as document:
            text = normalize("\n".join(page.get_text() for page in document))
    except Exception:
        return None
    _cache[path] = text
    return text


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 2

    sources = source_index()
    stats = {"ok": 0, "loose": 0, "mismatch": 0, "no-source": 0, "unreadable": 0, "no-quote": 0}
    failures: list[str] = []

    for directory in argv:
        for file in sorted(Path(directory).rglob("*.json")):
            raw = json.loads(file.read_text(encoding="utf-8"))
            for entries in iter_entry_lists(raw):
                for entry in entries:
                    if not isinstance(entry, dict):
                        continue
                    quote, source_id = entry.get("quote"), entry.get("sourceId")
                    label = f"{file.name}:{entry.get('ruleId') or entry.get('checkId')}"
                    if not quote:
                        stats["no-quote"] += 1
                        continue
                    path = sources.get(source_id or "")
                    if path is None:
                        stats["no-source"] += 1
                        failures.append(f"NEMA IZVORA  {label} (sourceId={source_id})")
                        continue
                    text = source_text(path)
                    if text is None:
                        stats["unreadable"] += 1
                        failures.append(f"NECITLJIV    {label} ({path.name})")
                        continue
                    # Elipsa u citatu znaci "preskocen dio": provjerava se svaki ulomak zasebno.
                    parts = [p for p in re.split(r"\(\.\.\.\)|\.\.\.|…", normalize(quote)) if len(p.strip()) > 12]
                    if parts and all(part.strip() in text for part in parts):
                        stats["ok"] += 1
                    elif parts and all(loose(part) in loose(text) for part in parts):
                        # Sadrzaj se poklapa, razlikuje se samo interpunkcija (najcesce: natuknice
                        # izvornika prepisane zarezima). Vjerno izvoru, ali citat treba prepisati
                        # doslovno prije nego ijedno pravilo ide u podatke.
                        stats["loose"] += 1
                        failures.append(f"INTERPUNKCIJA {label}: {normalize(quote)[:70]}")
                    else:
                        stats["mismatch"] += 1
                        failures.append(f"NE STOJI     {label}: {normalize(quote)[:80]}")

    for line in failures:
        print(line)
    checked = stats["ok"] + stats["loose"] + stats["mismatch"] + stats["no-source"] + stats["unreadable"]
    print(f"\nprovjereno: {checked} | doslovno: {stats['ok']} | vjerno uz drugu interpunkciju: {stats['loose']}"
          f" | NE STOJI: {stats['mismatch']} | nema izvora: {stats['no-source']}"
          f" | necitljiv: {stats['unreadable']} | bez citata: {stats['no-quote']}")
    if checked:
        faithful = stats["ok"] + stats["loose"]
        print(f"doslovno: {stats['ok'] / checked * 100:.0f}%"
              f" | vjerno izvoru (doslovno + interpunkcija): {faithful / checked * 100:.0f}%")
    return 1 if stats["mismatch"] or stats["no-source"] else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
