#!/usr/bin/env python3
"""Review/mutation capability boundary for Katedra.

Review and diagnostic actions are read-only. A document-mutating action may run only
when the caller explicitly authorizes mutation and the current document hash matches
a recorded snapshot in the project-local artifact manifest.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from artifact_state import current_record, file_sha256
from context import resolve_project_root


def mutation_snapshot_status(document: str | Path, project_root: str | Path | None = None) -> dict[str, Any]:
    root = Path(resolve_project_root(str(project_root) if project_root is not None else None)).resolve()
    doc = Path(document).resolve()
    snapshot_upute = (
        "Što napraviti: pokreni python3 <KATEDRA_SKILL>/scripts/diff_versions.py "
        "--snapshot ./rad.docx --biljeska \"prije faze G\" pa ponovi fazu G."
    )
    if not doc.is_file():
        return {"passed": False, "reason": f"dokument ne postoji: {doc}"}
    try:
        artifact, current = current_record(root, doc)
    except (OSError, ValueError) as exc:
        return {"passed": False, "reason": f"artifact manifest nije čitljiv: {exc}"}
    if artifact is None or current is None:
        return {
            "passed": False,
            "reason": f"snapshot/artifact zapis ne postoji za trenutni dokument. {snapshot_upute}",
        }
    digest = file_sha256(doc)
    if digest != current.get("sha256"):
        return {
            "passed": False,
            "reason": (
                "trenutni dokument se razlikuje od zadnjeg snapshot hasha; "
                f"napravi novi snapshot prije mutation faze. {snapshot_upute}"
            ),
        }
    snapshot_rel = str(current.get("snapshot_path") or "")
    snapshot_id = str(current.get("snapshot_id") or "")
    if not snapshot_rel or not snapshot_id:
        return {
            "passed": False,
            "reason": f"trenutna artifact verzija nema snapshot dokaz. {snapshot_upute}",
        }
    # v1.1 fix: snapshot mora stvarno ležati u project-local .katedra/ stanju.
    # Zapis koji pokazuje izvan njega (npr. relativnim skokom na sam dokument)
    # prošao bi hash usporedbu iako rollback ne postoji — to je rupa u capability granici.
    state_dir = (root / ".katedra").resolve()
    snapshot = (state_dir / snapshot_rel).resolve()
    if snapshot == state_dir or state_dir not in snapshot.parents:
        return {
            "passed": False,
            "reason": (
                f"snapshot putanja vodi izvan projektnog .katedra stanja: {snapshot_rel}. "
                f"{snapshot_upute}"
            ),
        }
    if not snapshot.is_file():
        return {"passed": False, "reason": f"snapshot datoteka nedostaje: {snapshot}. {snapshot_upute}"}
    if file_sha256(snapshot) != digest:
        return {
            "passed": False,
            "reason": f"snapshot hash ne odgovara trenutnom dokumentu. {snapshot_upute}",
        }
    return {
        "passed": True,
        "reason": "current document hash matches recorded snapshot",
        "artifact_id": artifact.get("artifact_id"),
        "version_id": current.get("version_id"),
        "snapshot_id": snapshot_id,
        "sha256": digest,
    }
