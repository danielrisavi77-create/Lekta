"""Shared helpers for the Lekta offline training pipeline."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Iterable

ALLOWED_RIGHTS = {"owned", "licensed", "consented", "public-domain"}
PII_PATTERNS = (
    (re.compile(r"\b\d{11}\b"), "[OIB_REDACTED]"),
    (re.compile(r"\b(?:\+385|0)\s?\d[\d .()/+-]{7,}\b"), "[PHONE_REDACTED]"),
    (re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I), "[EMAIL_REDACTED]"),
)


def read_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at {path}:{line_number}: {exc}") from exc
            if not isinstance(value, dict):
                raise ValueError(f"Expected JSON object at {path}:{line_number}")
            yield value


def write_jsonl(path: Path, records: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with path.open("w", encoding="utf-8") as target:
        for record in records:
            target.write(json.dumps(record, ensure_ascii=False) + "\n")
            count += 1
    return count


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def redact_string(value: str) -> str:
    for pattern, replacement in PII_PATTERNS:
        value = pattern.sub(replacement, value)
    return value


def redact_value(value: Any) -> Any:
    if isinstance(value, str):
        return redact_string(value)
    if isinstance(value, list):
        return [redact_value(item) for item in value]
    if isinstance(value, dict):
        return {key: redact_value(item) for key, item in value.items()}
    return value


def public_record(record: dict[str, Any]) -> dict[str, Any]:
    """Remove runner-local paths before a record can become an artifact."""
    return {key: value for key, value in record.items() if not key.startswith("_")}
