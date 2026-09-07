#!/usr/bin/env python3
"""Evidence gate and Source Analysis Matrix for B13.

B12 stores claims and page-level evidence. This module decides whether those records
are sufficient for a workflow gate without mutating either ledger.

Policies:
- advisory: report what strict mode would block, but return success when structure is valid;
- strict: block claims that are unsupported, conflicted, contradicted, or linked to a
  source already marked blocking (`conflict`/`invalid`) by source verification.

`unverified` source identity remains visible but is not silently reclassified as invalid.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from claim_ledger import support_status, validate_records  # noqa: E402
from context import NesigurnaPutanja, atomic_write_text  # noqa: E402
from evidence_model import evidence_index, read_jsonl  # noqa: E402

POLICIES = ("advisory", "strict")
BLOCKING_SOURCE_STATUSES = {"conflict", "invalid"}


def _source_index(path: str | Path | None) -> dict[str, dict[str, Any]]:
    if not path:
        return {}
    p = Path(path)
    if not p.exists():
        raise ValueError(f"source verification JSON ne postoji: {p}")
    try:
        payload = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"source verification JSON nije čitljiv: {p}: {exc}") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("izvori"), list):
        raise ValueError("source verification JSON mora sadržavati listu `izvori`")
    out: dict[str, dict[str, Any]] = {}
    for record in payload["izvori"]:
        if not isinstance(record, dict):
            continue
        sid = str(record.get("source_id") or "")
        if sid:
            out[sid] = record
    return out


def _source_meta(source: dict[str, Any] | None) -> dict[str, Any]:
    if not source:
        return {"verification_status": None, "quality_class": None, "blocking": False}
    verification = source.get("verification") or {}
    quality = source.get("quality") or {}
    status = str(verification.get("status") or "") or None
    blocking = bool(source.get("blocking")) or status in BLOCKING_SOURCE_STATUSES
    return {
        "verification_status": status,
        "quality_class": quality.get("class"),
        "blocking": blocking,
    }


def evaluate_gate(
    claims: list[dict[str, Any]],
    evidence: list[dict[str, Any]],
    *,
    policy: str = "strict",
    sources: dict[str, dict[str, Any]] | None = None,
    sources_required: bool = False,
    evidence_path: str | None = None,
    project_root: str | None = None,
) -> dict[str, Any]:
    if policy not in POLICIES:
        raise ValueError(f"nepoznat evidence policy: {policy}")
    # v1.1-fix (Q19, 3. krug): gate mora razriješiti putanju izvora prema projektu
    # koji ledger implicira, inače podmetnuta datoteka prolazi ovdje jednako tiho
    # kao i u claim_ledgeru.
    errors = validate_records(
        claims, evidence, evidence_path=evidence_path, project_root=project_root)
    if errors:
        raise ValueError("; ".join(errors))

    eidx = evidence_index(evidence)
    sources = sources or {}
    matrix: list[dict[str, Any]] = []
    would_block = 0

    for claim in claims:
        status = support_status(claim)
        reasons: list[str] = []
        items: list[dict[str, Any]] = []
        source_ids: set[str] = set()
        blocking_source_ids: set[str] = set()

        for link in claim.get("evidence", []):
            ev = eidx[str(link["evidence_id"])]
            sid = str(ev.get("source_id") or "")
            source_ids.add(sid)
            smeta = _source_meta(sources.get(sid))
            if smeta["blocking"]:
                blocking_source_ids.add(sid)
            items.append({
                "evidence_id": ev["evidence_id"],
                "relation": link["relation"],
                "source_id": sid,
                "locator": ev.get("locator", {}),
                "source_verification": smeta["verification_status"],
                "source_quality": smeta["quality_class"],
                "source_blocking": smeta["blocking"],
            })

        if status == "unsupported":
            reasons.append("claim nema supporting evidence")
        elif status == "conflicted":
            reasons.append("claim ima supporting i contradicting evidence")
        elif status == "contradicted":
            reasons.append("claim ima contradicting evidence bez supporting evidence")
        if sources_required:
            missing_sources = sorted(sid for sid in source_ids if sid and sid not in sources)
            if missing_sources:
                reasons.append(
                    "source verification snapshot ne sadrži source_id: " + ", ".join(missing_sources)
                )
        if blocking_source_ids:
            states = sorted({
                str((_source_meta(sources.get(sid))["verification_status"] or "blocking"))
                for sid in blocking_source_ids
            })
            reasons.append(
                "linked evidence koristi blocking source status: " + ", ".join(states)
            )

        strict_block = bool(reasons)
        if strict_block:
            would_block += 1
        gate_status = "block" if policy == "strict" and strict_block else "pass"
        matrix.append({
            "claim_id": claim["claim_id"],
            "text": claim["text"],
            "location": claim.get("location", {}),
            "support_status": status,
            "gate_status": gate_status,
            "reasons": reasons,
            "source_ids": sorted(x for x in source_ids if x),
            "evidence": items,
        })

    blocked = sum(1 for row in matrix if row["gate_status"] == "block")
    gate_preconditions: list[str] = []
    if policy == "strict" and not claims:
        gate_preconditions.append("strict evidence gate nema nijedan claim za provjeru")
        blocked += 1
        would_block += 1
    # v1.1-fix (D6): strict gate bez source verification snapshota NIJE prošao
    # gate nego je gate bez provjere izvora. Prije se tiho degradirao u zeleno.
    # Ne diramo brojače claimova (nijedan claim nije sam po sebi kriv), nego
    # obarmo cijeli gate kroz precondition.
    snapshot_nedostaje = policy == "strict" and not sources_required
    if snapshot_nedostaje:
        gate_preconditions.append(
            "strict evidence gate nema source verification snapshot "
            "(.katedra/izvori.json); izvori claimova nisu provjereni. "
            "Što napraviti: pokreni verify_sources.py i predaj rezultat kroz --sources"
        )
    return {
        "schema_version": 1,
        "policy": policy,
        "passed": blocked == 0 and not snapshot_nedostaje,
        "summary": {
            "claims": len(claims),
            "passed": max(0, len(claims) - sum(1 for row in matrix if row["gate_status"] == "block")),
            "blocked": blocked,
            "would_block": would_block,
        },
        "preconditions": gate_preconditions,
        "matrix": matrix,
    }


def evaluate_files(
    claims_path: str | Path,
    evidence_path: str | Path,
    *,
    sources_path: str | Path | None = None,
    policy: str = "strict",
) -> dict[str, Any]:
    claims_p = Path(claims_path)
    evidence_p = Path(evidence_path)
    if not claims_p.is_file():
        raise ValueError(f"claim ledger ne postoji: {claims_p}")
    if not evidence_p.is_file():
        raise ValueError(f"evidence ledger ne postoji: {evidence_p}")
    claims = read_jsonl(claims_p)
    evidence = read_jsonl(evidence_p)
    sources = _source_index(sources_path)
    return evaluate_gate(
        claims, evidence, policy=policy, sources=sources,
        sources_required=sources_path is not None,
        evidence_path=str(evidence_p),
    )


def _pages_human(evidence: list[dict[str, Any]]) -> list[str]:
    """v1.1-fix (Q19): ispiši i tiskanu oznaku i fizički PDF indeks, sortirano brojčano.

    Student citira TISKANU stranicu (page_label), a ne redni broj PDF stranice;
    prije se ispisivao samo fizički indeks i to leksikografski (10, 105, 2, 9).
    """
    parovi: dict[int, str | None] = {}
    ostali: list[str] = []
    for item in evidence:
        locator = item.get("locator", {}) or {}
        page = locator.get("page")
        if not isinstance(page, int):
            # Kvar 47: lokator koji nije stranica (točka standarda, članak
            # propisa, odlomak bez paginacije) ispisuje se odvojeno, da se ne
            # bi činilo kako je sve mjereno istom mjerom.
            oznaka = (locator.get("clause_label") or locator.get("passage"))
            if oznaka and str(oznaka) not in ostali:
                ostali.append(str(oznaka))
            continue
        label = locator.get("page_label")
        parovi.setdefault(page, str(label) if label is not None else None)
    out: list[str] = []
    for page in sorted(parovi):
        label = parovi[page]
        out.append(f"{label} (pdf {page})" if label is not None else f"pdf {page}")
    out.extend(ostali)
    return out


def _human(payload: dict[str, Any]) -> str:
    rows = ["SOURCE ANALYSIS MATRIX"]
    rows.append("=" * 78)
    for row in payload["matrix"]:
        marker = "✓" if row["gate_status"] == "pass" else "✗"
        pages = _pages_human(row["evidence"])
        rows.append(
            f"{marker} {row['claim_id']}  {row['support_status']:<12} "
            f"sources={','.join(row['source_ids']) or '—'} pages={','.join(pages) or '—'}"
        )
        if row["reasons"]:
            for reason in row["reasons"]:
                rows.append(f"    - {reason}")
    # v1.1-fix (D6): preconditioni su dosad postojali samo u JSON-u, pa je
    # čovjek na terminalu vidio zeleno i kad gate nije prošao.
    for precondition in payload.get("preconditions", []):
        rows.append(f"✗ PRECONDITION: {precondition}")
    s = payload["summary"]
    rows.append(f"SUMMARY claims={s['claims']} passed={s['passed']} blocked={s['blocked']} would_block={s['would_block']}")
    return "\n".join(rows)


def main() -> int:
    ap = argparse.ArgumentParser(description="Evidence gate + Source Analysis Matrix")
    ap.add_argument("--claims", default=".katedra/claims.jsonl")
    ap.add_argument("--evidence", default=".katedra/evidence.jsonl")
    ap.add_argument("--sources", help="optional verify_sources JSON (.katedra/izvori.json)")
    ap.add_argument("--policy", choices=POLICIES, default="strict")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out", help="optional JSON report path")
    args = ap.parse_args()
    try:
        payload = evaluate_files(
            args.claims,
            args.evidence,
            sources_path=args.sources,
            policy=args.policy,
        )
    except (OSError, ValueError) as exc:
        print(f"❌ evidence gate structural error: {exc}", file=sys.stderr)
        return 2

    if args.out:
        # 2. krug (nedovršen popravak Q14): izvještaj se pisao golim
        # `Path.write_text()`. Podmetnuta simbolička poveznica na --out putanji
        # slijedila se bez pitanja, pa je izvještaj gatea završavao izvan projekta
        # (a .katedra/gate.json ostajao poveznica) uz izlaz 0 — dakle tiho. Uz to
        # zapis nije bio atomaran, pa je prekid usred pisanja ostavljao krnji JSON
        # koji sljedeći korak čita kao valjan. Ide kroz isti atomarni pisac kao i
        # ostalo stanje.
        try:
            atomic_write_text(
                args.out, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        except NesigurnaPutanja as exc:
            print(f"❌ izvještaj nije zapisan: {exc}", file=sys.stderr)
            return 2
        except OSError as exc:
            print(f"❌ izvještaj nije zapisan ({exc}).", file=sys.stderr)
            return 2
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(_human(payload))
    return 0 if payload["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
