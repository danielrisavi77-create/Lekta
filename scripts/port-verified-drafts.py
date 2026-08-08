#!/usr/bin/env python3
"""Prenesi nacrte pravila koji prolaze OBJE strojne provjere u profile, kao PREPORUKE.

Ulaz su nacrti (npr. `data/pilot-drafts`), izlaz su dopunjene datoteke u
`data/profiles/<ustanova>/drafts/<profileId>.json`. Prolazi samo unos koji:

  1. ima citat koji doista stoji u snapshotiranom izvoru  (verify-draft-quotes.py), i
  2. ima vrijednost koja iz tog citata doista slijedi     (verify-draft-values.py).

Sve preneseno dobiva `status: 'advisory'` i `scored: false`, dakle ulazi kao PREPORUKA koja se
korisniku nudi, ali ne moze pomaknuti ocjenu. To nije opreznost nego tocnost: izvori ovih ustanova
sami sebe zovu preporukom ("Predstavljaju samo jednu od vise mogucnosti"), pa bi bodovanje po njima
bilo izmisljanje pravila. Prijelaz na `verified` + `scored: true` trazi ljudski pass i sluzben
izvor koji obvezuje; ovaj alat ga NE radi i ne smije raditi.

Citat koji je vjeran izvoru ali drukcije interpunktiran prepisuje se DOSLOVNO iz izvora (upute
nabrajaju natuknicama, nacrti to prepisu zarezima). Uspjeh se ne pretpostavlja: nakon porta ponovno
pokreni verify-draft-quotes.py nad profilima i svaki preneseni citat mora ispasti doslovan.

  python scripts/port-verified-drafts.py data/pilot-drafts            # suho, samo ispis
  python scripts/port-verified-drafts.py data/pilot-drafts --apply    # upisi
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


quotes = _load("vdq", "scripts/verify-draft-quotes.py")
values = _load("vdv", "scripts/verify-draft-values.py")


def raw_source_text(path: Path) -> str | None:
    """Tekst izvora s OCUVANIM velikim slovima (za doslovan prepis), samo sazetih razmaka."""
    try:
        import fitz
        with fitz.open(path) as document:
            text = "\n".join(page.get_text() for page in document)
    except Exception:
        return None
    text = unicodedata.normalize("NFC", text)
    for dash in "‐‑‒–—―":
        text = text.replace(dash, "-")
    for ch in "‘’‚‛":
        text = text.replace(ch, "'")
    for ch in "“”„‟":
        text = text.replace(ch, '"')
    return re.sub(r"\s+", " ", text.replace(" ", " ").replace("­", "")).strip()


def literal_span(raw: str, quote: str) -> str | None:
    """Nadji u izvoru doslovan tekst koji odgovara citatu s drukcijom interpunkcijom.

    Gradi se verzija izvora bez interpunkcije, zajedno s preslikavanjem svakog njezinog znaka na
    polozaj u izvorniku. Citat se trazi u toj verziji, a vraca se IZVORNI raspon, pa rezultat nosi
    izvornu interpunkciju i velika slova.
    """
    stripped_chars: list[str] = []
    index_map: list[int] = []
    for i, ch in enumerate(raw):
        out = ch if (ch.isalnum() or ch.isspace()) else " "
        if out.isspace():
            if stripped_chars and stripped_chars[-1] == " ":
                continue
            out = " "
        stripped_chars.append(out.lower())
        index_map.append(i)
    stripped = "".join(stripped_chars)
    needle = values.fold(re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", quote))).strip()
    needle = re.sub(r"\s+", " ", needle)
    # Usporedba mora ici bez dijakritike na OBJE strane, inace "sazetak" ne nadje "sažetak".
    folded = values.fold(stripped)
    at = folded.find(needle)
    if at < 0 or not needle:
        return None
    start = index_map[at]
    end = index_map[min(at + len(needle) - 1, len(index_map) - 1)]
    return raw[start:end + 1].strip()


def insert_entries(text: str, new_entries: list[dict]) -> str:
    """Umetni unose na kraj polja `entries`, bez diranja postojeceg oblika datoteke.

    Namjerno se NE serijalizira cijela datoteka: json.dumps bi presloizo i one unose koji se ne
    mijenjaju, pa bi diff bio nepregledan bas ondje gdje ga treba citati (podaci koji idu korisniku).
    Ovako su u diffu iskljucivo dodani redci.
    """
    start = text.index('"entries"')
    open_at = text.index("[", start)
    depth, i = 0, open_at
    while i < len(text):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                break
        elif text[i] == '"':  # preskoci nizove da zagrada u citatu ne pomakne dubinu
            i += 1
            while i < len(text) and text[i] != '"':
                i += 2 if text[i] == "\\" else 1
        i += 1
    close_at = i
    body = text[open_at + 1:close_at].rstrip()
    blocks = []
    for entry in new_entries:
        dumped = json.dumps(entry, ensure_ascii=False, indent=2)
        blocks.append("\n".join("    " + line for line in dumped.splitlines()))
    joined = ",\n".join(blocks)
    sep = ",\n" if body.strip() else "\n"
    return text[:open_at + 1] + body + sep + joined + "\n  " + text[close_at:]


def main(argv: list[str]) -> int:
    apply = "--apply" in argv
    dirs = [a for a in argv if not a.startswith("--")]
    if not dirs:
        print(__doc__)
        return 2

    sources = quotes.source_index()
    ported: list[tuple[str, str, str]] = []
    skipped: dict[str, int] = {}
    rewritten = 0
    targets: dict[Path, dict] = {}

    def note(reason: str) -> None:
        skipped[reason] = skipped.get(reason, 0) + 1

    for directory in dirs:
        for file in sorted(Path(directory).rglob("*.json")):
            data = json.loads(file.read_text(encoding="utf-8"))
            profile_id = data.get("profileId")
            entries = data.get("entries") or data.get("ruleEntries") or []
            if not profile_id:
                continue
            unit = profile_id.split("-")[0]
            target = ROOT / "data" / "profiles" / unit / "drafts" / f"{profile_id}.json"
            if not target.exists():
                note(f"nema odredisne datoteke ({unit})")
                continue
            if target not in targets:
                targets[target] = json.loads(target.read_text(encoding="utf-8"))
            existing = targets[target].get("entries") or []
            taken_checks = {e.get("checkId") for e in existing}
            taken_rules = {e.get("ruleId") for e in existing}

            for entry in entries:
                if not entry.get("quote") or not entry.get("sourceId"):
                    note("bez citata ili izvora")
                    continue
                path = sources.get(entry["sourceId"])
                text = quotes.source_text(path) if path else None
                if text is None:
                    note("izvor nedostupan")
                    continue
                quote = entry["quote"]
                parts = [p for p in re.split(r"\(\.\.\.\)|\.\.\.|…", quotes.normalize(quote)) if len(p.strip()) > 12]
                literal = bool(parts) and all(p.strip() in text for p in parts)
                loose_ok = bool(parts) and all(quotes.loose(p) in quotes.loose(text) for p in parts)
                if not (literal or loose_ok):
                    note("citat ne stoji u izvoru")
                    continue
                bad, unknown = values.claims(entry.get("checkId"), entry.get("value"), quote)
                if bad or unknown:
                    note("vrijednost ne slijedi iz citata")
                    continue
                if entry.get("checkId") in taken_checks or entry.get("ruleId") in taken_rules:
                    note("profil vec ima to pravilo")
                    continue

                if not literal:
                    raw = raw_source_text(path)
                    span = literal_span(raw, quote) if raw else None
                    if not span:
                        note("citat se ne da doslovno prepisati")
                        continue
                    quote = span
                    rewritten += 1

                ported.append((profile_id, entry.get("checkId"), entry.get("ruleId")))
                taken_checks.add(entry.get("checkId"))
                taken_rules.add(entry.get("ruleId"))
                existing.append({
                    "ruleId": entry.get("ruleId"),
                    "checkId": entry.get("checkId"),
                    "value": entry.get("value"),
                    "category": entry.get("category"),
                    "label": entry.get("label"),
                    "machineCheckable": entry.get("machineCheckable", True),
                    "authority": entry.get("authority"),
                    "sourceId": entry.get("sourceId"),
                    "sourcePage": entry.get("sourcePage"),
                    "quote": quote,
                    # Preporuka, ne propis: ulazi u ponudu popravaka, ne u ocjenu. Vidi docstring.
                    "status": "advisory",
                    "scored": False,
                    "lastVerified": None,
                    "verifiedBy": None,
                    "reviewedBy": None,
                })
                targets[target]["entries"] = existing
                targets[target].setdefault("_added", []).append(existing[-1])

    by_profile: dict[str, int] = {}
    for profile_id, _, _ in ported:
        by_profile[profile_id] = by_profile.get(profile_id, 0) + 1
    for profile_id in sorted(by_profile):
        print(f"  {profile_id:42} +{by_profile[profile_id]}")
    print(f"\npreneseno: {len(ported)} pravila u {len(by_profile)} profila"
          f" | citat prepisan doslovno: {rewritten}")
    for reason in sorted(skipped):
        print(f"  preskoceno ({reason}): {skipped[reason]}")

    if not apply:
        print("\nSUHI HOD. Za upis dodaj --apply")
        return 0
    written = 0
    for path, data in targets.items():
        added = data.get("_added") or []
        if not added:
            continue  # nista dodano: ne diraj datoteku (inace ostane samo formatna buka)
        path.write_text(insert_entries(path.read_text(encoding="utf-8"), added), encoding="utf-8")
        written += 1
    print(f"\nupisano u {written} datoteka")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
