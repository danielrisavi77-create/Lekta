#!/usr/bin/env python3
"""Turn reviewed Lekta analysis results into training examples.

Input records must contain sourceDocumentId and an analysis object with issues.
Only approved records should be used for model training.
"""
from __future__ import annotations
import argparse, json, uuid
from pathlib import Path

CATEGORY_MAP = {
    "structure": "structure",
    "citations": "citations",
    "language": "language",
    "elements": "formatting",
    "methodology": "methodology",
    "references": "references",
}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    with args.input.open(encoding="utf-8") as source, args.output.open("w", encoding="utf-8") as target:
        for line in source:
            record = json.loads(line)
            document_id = record.get("sourceDocumentId") or record.get("id")
            analysis = record.get("analysis") or {}
            for issue in analysis.get("issues", []):
                category = CATEGORY_MAP.get(issue.get("category"), "other")
                example = {
                    "id": str(uuid.uuid4()),
                    "sourceDocumentId": document_id,
                    "category": category,
                    "original": issue.get("excerpt") or issue.get("evidence") or "",
                    "correction": issue.get("suggestedCorrection") or "",
                    "explanation": issue.get("message") or issue.get("description") or "",
                    "ruleSource": issue.get("source"),
                    "confidence": 0.0,
                    "reviewStatus": "pending",
                    "reviewer": None
                }
                target.write(json.dumps(example, ensure_ascii=False) + "\n")
                written += 1
    print(f"Generated {written} pending examples. Human review is required before training.")

if __name__ == "__main__":
    main()
