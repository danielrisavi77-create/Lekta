#!/usr/bin/env python3
"""Project-local perspective map used before outlining a large academic work.

The map is deliberately separate from plan.json: it records competing or complementary
argumentative lenses before chapter structure hardens. For završni/diplomski work a
ready map needs at least two distinct, substantively described perspectives.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
from context import resolve_state_dir  # noqa: E402

SCHEMA_VERSION = 1
BIG_WORKS = {"zavrsni", "diplomski"}


def perspective_path(kat: str | os.PathLike[str]) -> Path:
    return Path(kat) / "perspectives.json"


def _norm(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().casefold())


def _pid(label: str, position: str) -> str:
    raw = f"{_norm(label)}\n{_norm(position)}".encode("utf-8")
    return "persp_" + hashlib.sha256(raw).hexdigest()[:12]


def new_map(topic: str, research_question: str) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "topic": topic.strip(),
        "research_question": research_question.strip(),
        "perspectives": [],
    }


def load_map(kat: str | os.PathLike[str]) -> dict[str, Any] | None:
    path = perspective_path(kat)
    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def save_map(data: dict[str, Any], kat: str | os.PathLike[str]) -> Path:
    path = perspective_path(kat)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)
    return path


def evaluate_map(data: dict[str, Any] | None, work_type: str | None = None) -> dict[str, Any]:
    reasons: list[str] = []
    if not isinstance(data, dict):
        reasons.append("perspective map ne postoji ili nije čitljiv JSON")
        return {"schema_version": 1, "ready": False, "perspective_count": 0,
                "blocking_reasons": reasons}
    if data.get("schema_version") != SCHEMA_VERSION:
        reasons.append(f"schema_version mora biti {SCHEMA_VERSION}")
    if not str(data.get("topic", "")).strip():
        reasons.append("topic je prazan")
    if not str(data.get("research_question", "")).strip():
        reasons.append("research_question je prazan")
    perspectives = data.get("perspectives")
    if not isinstance(perspectives, list):
        reasons.append("perspectives mora biti popis")
        perspectives = []

    signatures = set()
    valid_count = 0
    for i, item in enumerate(perspectives):
        if not isinstance(item, dict):
            reasons.append(f"perspectives[{i}] mora biti objekt")
            continue
        label = str(item.get("label", "")).strip()
        position = str(item.get("position", "")).strip()
        why = str(item.get("why_it_matters", "")).strip()
        if not label or not position or not why:
            reasons.append(f"perspectives[{i}] mora imati label, position i why_it_matters")
            continue
        source_ids = item.get("source_ids", [])
        evidence_ids = item.get("evidence_ids", [])
        if not isinstance(source_ids, list) or not all(isinstance(x, str) for x in source_ids):
            reasons.append(f"perspectives[{i}].source_ids mora biti popis stringova")
            continue
        if not isinstance(evidence_ids, list) or not all(isinstance(x, str) for x in evidence_ids):
            reasons.append(f"perspectives[{i}].evidence_ids mora biti popis stringova")
            continue
        signatures.add((_norm(label), _norm(position)))
        valid_count += 1

    if work_type in BIG_WORKS:
        if valid_count < 2:
            reasons.append("završni/diplomski perspective map mora imati najmanje 2 perspektive")
        elif len(signatures) < 2:
            reasons.append("perspektive moraju biti međusobno različite, ne duplikati iste pozicije")
    elif perspectives and valid_count < 1:
        reasons.append("perspective map nema valjanu perspektivu")

    return {
        "schema_version": 1,
        "ready": not reasons,
        "perspective_count": valid_count,
        "distinct_perspective_count": len(signatures),
        "blocking_reasons": reasons,
    }


def state_work_type(kat: str | os.PathLike[str]) -> str | None:
    try:
        with (Path(kat) / "stanje.json").open(encoding="utf-8") as f:
            value = json.load(f).get("tip")
        return value if isinstance(value, str) else None
    except (OSError, json.JSONDecodeError, AttributeError):
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Perspective map prije outlinea/plana.")
    ap.add_argument("--kat", default=None)
    ap.add_argument("--project-root", default=None)
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init")
    p.add_argument("--topic", required=True)
    p.add_argument("--question", required=True)
    p.add_argument("--force", action="store_true")

    p = sub.add_parser("add")
    p.add_argument("--label", required=True)
    p.add_argument("--position", required=True)
    p.add_argument("--why", required=True)
    p.add_argument("--source-id", action="append", default=[])
    p.add_argument("--evidence-id", action="append", default=[])

    p = sub.add_parser("validate")
    p.add_argument("--work-type", choices=["seminarski", "zavrsni", "diplomski", "esej"], default=None)
    sub.add_parser("show")

    args = ap.parse_args()
    kat = resolve_state_dir(args.kat, args.project_root)
    path = perspective_path(kat)

    if args.command == "init":
        if path.exists() and not args.force:
            print(f"❌ {path} već postoji; koristi --force samo ako svjesno resetiraš mapu.", file=sys.stderr)
            return 2
        save_map(new_map(args.topic, args.question), kat)
        print(f"✅ perspective map inicijaliziran: {path}")
        return 0

    data = load_map(kat)
    if data is None:
        print(f"❌ nema {path}; prvo perspective_map.py init --topic ... --question ...", file=sys.stderr)
        return 2

    if args.command == "add":
        pid = _pid(args.label, args.position)
        existing = {str(x.get("perspective_id")) for x in data.get("perspectives", []) if isinstance(x, dict)}
        if pid in existing:
            print("❌ ista perspektiva već postoji (isti label + position).", file=sys.stderr)
            return 2
        item = {
            "perspective_id": pid,
            "label": args.label.strip(),
            "position": args.position.strip(),
            "why_it_matters": args.why.strip(),
            "source_ids": list(dict.fromkeys(args.source_id)),
            "evidence_ids": list(dict.fromkeys(args.evidence_id)),
        }
        data.setdefault("perspectives", []).append(item)
        save_map(data, kat)
        print(f"✅ dodana perspektiva {pid}: {item['label']}")
        return 0

    if args.command == "show":
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    work_type = args.work_type or state_work_type(kat)
    report = evaluate_map(data, work_type)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
