#!/usr/bin/env python3
"""Deterministička, read-only simulacija reviewer lensova.

Ne glumi stvarnog mentora niti stručni peer review. Spaja postojeće Katedrine
mjerne artefakte u reproducibilan popis pitanja koja bi reviewer trebao otvoriti.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

LENS_ORDER = ("argument", "evidence", "consistency", "mentor")


def _load_optional(path: str | None, label: str) -> dict[str, Any] | None:
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        raise ValueError(f"{label} ne postoji: {p}")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"{label} nije čitljiv JSON: {p}: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"{label} mora biti JSON objekt")
    return data


def _lens(lens: str, present: bool, issues: list[dict[str, str]], insufficient: bool = False) -> dict[str, Any]:
    if not present:
        status = "not_run"
    elif insufficient:
        # v1.1 fix Q12: producent je izričito odbio certificirati pokrivenost —
        # to se ne smije prikazati kao „clear”, nego kao vlastito stanje.
        # Zatvaranje recenzentske primjedbe: odabrana je opcija „proširi enum”, ne
        # „preslikaj na not_run”. Razlog: mjerenje JEST pokrenuto i leća nosi
        # visokoprioritetno pitanje u issues, pa bi „not_run” (leća se nije mjerila)
        # bila druga netočnost umjesto prve. Ugovor je zato namjerno proširen i
        # dokumentiran u references/reviewer_simulation_schema.json.
        status = "nedovoljno_pokriveno"
    elif any(i["priority"] == "high" for i in issues):
        status = "risk"
    elif issues:
        status = "watch"
    else:
        status = "clear"
    return {"lens": lens, "status": status, "issues": issues}


def simulate(
    *,
    argument: dict[str, Any] | None = None,
    evidence_gate: dict[str, Any] | None = None,
    consistency: dict[str, Any] | None = None,
    mentor_feedback: dict[str, Any] | None = None,
) -> dict[str, Any]:
    per_lens: dict[str, list[dict[str, str]]] = {k: [] for k in LENS_ORDER}

    if argument is not None:
        for row in argument.get("dimenzije", []):
            if not isinstance(row, dict):
                continue
            state = str(row.get("stanje") or "")
            if state not in {"❌", "⚠️"}:
                continue
            name = str(row.get("dimenzija") or "argumentacijska dimenzija")
            detail = str(row.get("nalaz") or row.get("brojka") or "")
            per_lens["argument"].append({
                "priority": "high" if state == "❌" else "medium",
                "code": f"argument:{name}",
                "question": f"Kako ćete pred reviewerom obraniti dimenziju „{name}”? {detail}".strip(),
            })

    if evidence_gate is not None:
        for row in evidence_gate.get("matrix", []):
            if isinstance(row, dict) and row.get("gate_status") == "block":
                cid = str(row.get("claim_id") or "claim")
                reasons = "; ".join(str(x) for x in row.get("reasons", []))
                per_lens["evidence"].append({
                    "priority": "high",
                    "code": f"evidence:{cid}",
                    "question": f"Koji dokaz na konkretnoj stranici podupire {cid}? {reasons}".strip(),
                })

    consistency_insufficient = False
    if consistency is not None:
        # v1.1 fix Q12: consistency_check odbija certificirati ledger s manje od dva
        # poglavlja. Čitanje samo findings polja pretvorilo bi to odbijanje u „clear”.
        if str(consistency.get("coverage_status") or "") == "insufficient":
            consistency_insufficient = True
            per_lens["consistency"].append({
                "priority": "high",
                "code": "consistency:coverage_insufficient",
                "question": (
                    "Cross-chapter consistency je nedovoljno pokriveno "
                    "(coverage_status=insufficient, claim ledger pokriva manje od dva poglavlja) — "
                    "odsutnost nalaza ovdje nije dokaz dosljednosti. "
                    "Što napraviti: dopuni claim ledger i ponovi consistency_check.py."
                ),
            })
        for finding in consistency.get("findings", []):
            if not isinstance(finding, dict):
                continue
            ftype = str(finding.get("type") or "consistency")
            chapters = ", ".join(str(x) for x in finding.get("chapters", []))
            per_lens["consistency"].append({
                "priority": "high" if finding.get("severity", "blocking") == "blocking" else "medium",
                "code": f"consistency:{ftype}",
                "question": f"Kako usklađujete {ftype} između poglavlja {chapters}?".strip(),
            })

    if mentor_feedback is not None:
        for z in mentor_feedback.get("zamjerke", []):
            if not isinstance(z, dict) or z.get("status") != "otvoreno":
                continue
            zid = str(z.get("id") or "zamjerka")
            text = str(z.get("tekst") or z.get("komentar") or "")
            per_lens["mentor"].append({
                "priority": "high",
                "code": f"mentor:{zid}",
                "question": f"Kako je riješena otvorena mentorova zamjerka {zid}: {text}".strip(),
            })

    lenses = [
        _lens("argument", argument is not None, per_lens["argument"]),
        _lens("evidence", evidence_gate is not None, per_lens["evidence"]),
        _lens("consistency", consistency is not None, per_lens["consistency"], consistency_insufficient),
        _lens("mentor", mentor_feedback is not None, per_lens["mentor"]),
    ]
    questions = []
    for lens in LENS_ORDER:
        questions.extend({"lens": lens, **issue} for issue in per_lens[lens])
    questions.sort(key=lambda q: (0 if q["priority"] == "high" else 1, LENS_ORDER.index(q["lens"]), q["code"]))
    high = sum(1 for q in questions if q["priority"] == "high")
    medium = sum(1 for q in questions if q["priority"] == "medium")
    return {
        "schema_version": 1,
        "simulation_kind": "deterministic_reviewer_lenses",
        "read_only": True,
        "lenses": lenses,
        "questions": questions,
        "summary": {
            "high_priority": high,
            "medium_priority": medium,
            "total_questions": len(questions),
            "blocking_review_risks": high,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Read-only deterministic reviewer simulation")
    ap.add_argument("--argument")
    ap.add_argument("--evidence-gate")
    ap.add_argument("--consistency")
    ap.add_argument("--mentor-feedback")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out")
    args = ap.parse_args()
    if not any((args.argument, args.evidence_gate, args.consistency, args.mentor_feedback)):
        print("❌ reviewer simulation treba barem jedan review artefakt", file=sys.stderr)
        return 2
    try:
        payload = simulate(
            argument=_load_optional(args.argument, "argument report"),
            evidence_gate=_load_optional(args.evidence_gate, "evidence gate report"),
            consistency=_load_optional(args.consistency, "consistency report"),
            mentor_feedback=_load_optional(args.mentor_feedback, "mentor feedback"),
        )
    except (OSError, ValueError) as exc:
        print(f"❌ reviewer simulation: {exc}", file=sys.stderr)
        return 2
    if args.out:
        # Dead-code sweep: `except OSError` iznad bio je mrtva grana
        # (`_load_optional` svaki OSError pretvara u ValueError, a `simulate` ne
        # radi I/O), dok je jedini pravi OSError — zapis izvještaja — stajao IZVAN
        # bloka i izlazio kao goli traceback. Zaštita ide onamo gdje je I/O.
        try:
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
        except OSError as exc:
            print(f"❌ reviewer simulation: izvještaj se ne može zapisati u "
                  f"{args.out}: {exc}", file=sys.stderr)
            print("   Što napraviti: provjeri putanju i prava pisanja, pa ponovi.",
                  file=sys.stderr)
            return 2
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print("REVIEWER SIMULATION — deterministic/read-only")
        print("=" * 72)
        for q in payload["questions"]:
            mark = "!" if q["priority"] == "high" else "?"
            print(f"{mark} [{q['lens']}] {q['question']}")
        s = payload["summary"]
        print(f"SUMMARY high={s['high_priority']} medium={s['medium_priority']} total={s['total_questions']}")
    return 1 if payload["summary"]["high_priority"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
