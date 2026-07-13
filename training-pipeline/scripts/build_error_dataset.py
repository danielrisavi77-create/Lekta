#!/usr/bin/env python3
"""Convert sanitized Lekta analysis results into pending error examples."""
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from training_pipeline_bootstrap import add_pipeline_to_path

add_pipeline_to_path()
from lib import read_jsonl, write_jsonl  # noqa: E402

CATEGORY_MAP = {
    "structure": "structure",
    "citations": "citations",
    "language": "language",
    "elements": "formatting",
    "methodology": "methodology",
    "references": "references",
}


def stable_id(document_id: str, index: int, title: str) -> str:
    value = f"{document_id}:{index}:{title}".encode()
    return hashlib.sha256(value).hexdigest()[:24]


def examples(path: Path):
    for record in read_jsonl(path):
        document_id = str(record.get("sourceDocumentId") or record.get("id") or "unknown")
        analysis = record.get("analysis") or {}
        for index, issue in enumerate(analysis.get("issues") or []):
            title = str(issue.get("title") or issue.get("message") or "")
            yield {
                "id": stable_id(document_id, index, title),
                "sourceDocumentId": document_id,
                "category": CATEGORY_MAP.get(issue.get("category"), "other"),
                "original": issue.get("excerpt") or issue.get("detail") or "",
                "correction": issue.get("suggestedCorrection") or "",
                "explanation": title,
                "ruleSource": issue.get("source"),
                "confidence": 0.0,
                "reviewStatus": "pending",
                "reviewer": None,
            }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    count = write_jsonl(args.output, examples(args.input))
    print(f"Generated {count} pending examples; approval is required before use")


if __name__ == "__main__":
    main()
