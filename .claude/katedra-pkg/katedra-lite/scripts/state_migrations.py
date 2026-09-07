#!/usr/bin/env python3
"""Versioned migrations for project-local ``.katedra/stanje.json``.

Migrations are monotonic and never rewrite a newer/unknown state. File-level
migration creates a byte-for-byte backup under ``.katedra/migrations/`` before
atomically replacing the state file.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path

CURRENT_STATE_VERSION = 2


class MigrationError(ValueError):
    pass


def _v1_to_v2(state: dict) -> dict:
    out = copy.deepcopy(state)
    out["verzija"] = 2
    meta = out.get("state_meta") if isinstance(out.get("state_meta"), dict) else {}
    meta.update({
        "schema_version": 2,
        "migrated_from": 1,
        "artifact_manifest": "artifacts.json",
        "mentor_feedback": "zamjerke.json",
    })
    out["state_meta"] = meta
    return out


MIGRATIONS = {1: _v1_to_v2}


def migrate_state(state: dict) -> tuple[dict, bool]:
    if not isinstance(state, dict):
        raise MigrationError("stanje.json mora biti JSON objekt")
    try:
        version = int(state.get("verzija"))
    except (TypeError, ValueError):
        raise MigrationError("stanje.json nema valjanu numeričku verziju")
    if version > CURRENT_STATE_VERSION:
        raise MigrationError(
            f"stanje.json je iz novije verzije sheme ({version} > {CURRENT_STATE_VERSION}); "
            "ovu datoteku ne smijem prepisati starijim skillom"
        )
    if version < 1:
        raise MigrationError(f"nepodržana verzija stanja: {version}")
    out = copy.deepcopy(state)
    changed = False
    while version < CURRENT_STATE_VERSION:
        fn = MIGRATIONS.get(version)
        if fn is None:
            raise MigrationError(f"nema migracijskog koraka {version} → {version + 1}")
        out = fn(out)
        version += 1
        changed = True
    return out, changed


def migrate_file(path: str | os.PathLike[str]) -> tuple[dict, bool, str | None]:
    p = Path(path)
    raw = p.read_bytes()
    try:
        state = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise MigrationError(f"{p} nije čitljiv JSON: {e}") from e
    migrated, changed = migrate_state(state)
    if not changed:
        return migrated, False, None

    old_version = state.get("verzija")
    digest = hashlib.sha256(raw).hexdigest()[:12]
    backup_dir = p.parent / "migrations"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f"stanje_v{old_version}_{digest}.json"
    if not backup.exists():
        backup.write_bytes(raw)

    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(migrated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, p)
    return migrated, True, str(backup)
