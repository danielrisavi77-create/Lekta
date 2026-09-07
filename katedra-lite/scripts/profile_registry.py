#!/usr/bin/env python3
"""Generate or verify references/fakulteti/index.json from canonical sources."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from profile_rules import ProfileRuleError, generate_registry, refresh_stale_admissions  # noqa: E402

DEFAULT_FACULTY_DIR = HERE.parent / "references" / "fakulteti"


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate/check Katedra faculty registry v2.")
    ap.add_argument("--faculty-dir", default=str(DEFAULT_FACULTY_DIR))
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="exit 0 ako index.json nema drift")
    group.add_argument("--write", action="store_true", help="regeneriraj index.json")
    ap.add_argument("--bez-admisije", action="store_true",
                    help="uz --write: stale admission hash osvježi BEZ gatea, tier → advisory (kvar 32)")
    args = ap.parse_args()
    if args.bez_admisije and not args.write:
        ap.error("--bez-admisije ide samo uz --write")

    root = Path(args.faculty_dir)
    index = root / "index.json"
    try:
        if args.bez_admisije:
            for slug, stari in refresh_stale_admissions(root):
                print(f"⚠ {slug}: bundle promijenjen bez ponovne admisije — tier {stari} → advisory, hash osvježen (kvar 32)")
        expected = generate_registry(root)
    except ProfileRuleError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2

    if args.write:
        index.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"✅ registry generiran: {index}")
        return 0

    try:
        current = json.loads(index.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"❌ registry drift/nečitljiv: {exc}", file=sys.stderr)
        return 1
    if current != expected:
        print("❌ registry drift: index.json nije jednak canonical profilima/overlayima", file=sys.stderr)
        return 1
    print("✅ registry nema drift")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
