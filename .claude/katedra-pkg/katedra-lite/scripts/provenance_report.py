#!/usr/bin/env python3
"""Read-only B08 provenance coverage/freshness report for a resolved profile."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
from profile_rules import (  # noqa: E402
    ProfileRuleError,
    build_provenance_report,
    resolve_profile,
)

DEFAULT_FACULTY_DIR = HERE.parent / "references" / "fakulteti"


def main() -> int:
    ap = argparse.ArgumentParser(description="Report Katedra rule provenance coverage and freshness (read-only).")
    ap.add_argument("--faculty-dir", default=str(DEFAULT_FACULTY_DIR))
    ap.add_argument("--fakultet", required=True)
    ap.add_argument("--institution")
    ap.add_argument("--program", dest="programme")
    ap.add_argument("--tip", dest="work_type")
    ap.add_argument("--predmet", dest="course")
    ap.add_argument("--mentor")
    ap.add_argument("--as-of", required=True, help="ISO datum na koji se freshness procjenjuje")
    ap.add_argument("--max-age-days", type=int, default=365)
    ap.add_argument(
        "--strict-coverage",
        action="store_true",
        help="naslijeđeni provenance (blanket provenance.default) tretiraj kao blokirajući nalaz",
    )
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    try:
        resolved = resolve_profile(
            args.fakultet,
            faculty_dir=args.faculty_dir,
            institution=args.institution,
            programme=args.programme,
            work_type=args.work_type,
            course=args.course,
            mentor=args.mentor,
        )
        report = build_provenance_report(
            resolved,
            as_of=args.as_of,
            max_age_days=args.max_age_days,
        )
    except ProfileRuleError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        s = report["summary"]
        print(
            f"provenance: fresh={s['fresh']} stale={s['stale']} "
            f"unknown={s['unknown']} untracked={s['untracked']}"
        )
        # v1.1-fix Q9c: pokrivenost je zasebna os — pravilo koje je samo naslijedilo
        # blanket provenance.default nije provjereno pravilo i ne smije se čitati kao zeleno.
        print(
            f"pokrivenost: vlastiti={s.get('own', 0)} naslijeđeni={s.get('inherited', 0)} "
            f"nepraćeni={s.get('untracked', 0)}"
        )
        for item in report["rules"]:
            if item["freshness"] != "fresh":
                print(f"{item['freshness'].upper()}: {item['pointer']} — {item['provenance'].get('source')}")
            elif item.get("coverage") == "inherited":
                print(
                    f"INHERITED: {item['pointer']} — nema vlastiti provenance zapis, "
                    f"naslijedio provenance.default"
                )
        if s.get("inherited"):
            print(
                f"⚠️ {s['inherited']}/{len(report['rules'])} pravila nema vlastiti izvor. "
                "Što napraviti: za svako pravilo upiši provenance.rules[\"<JSON Pointer>\"] "
                "s dokumentom, lokatorom i datumom provjere."
            )

    summary = report["summary"]
    blokira = (
        summary.get("stale", 0) or summary.get("unknown", 0) or summary.get("untracked", 0)
        or (args.strict_coverage and summary.get("inherited", 0))
    )
    return 1 if blokira else 0


if __name__ == "__main__":
    raise SystemExit(main())
