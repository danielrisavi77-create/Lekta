#!/usr/bin/env python3
"""Redact common PII patterns from JSONL text fields."""
from __future__ import annotations
import argparse, json, re

PATTERNS = [
    (re.compile(r"\b\d{11}\b"), "[OIB_REDACTED]"),
    (re.compile(r"\b(?:\+385|0)\s?\d[\d ]{7,}\b"), "[PHONE_REDACTED]"),
    (re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I), "[EMAIL_REDACTED]"),
]

def redact(value: str) -> str:
    for pattern, replacement in PATTERNS:
        value = pattern.sub(replacement, value)
    return value

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    with open(args.input, encoding="utf-8") as source, open(args.output, "w", encoding="utf-8") as target:
        for line in source:
            record = json.loads(line)
            for key in ("text", "title", "author", "extractedText"):
                if isinstance(record.get(key), str):
                    record[key] = redact(record[key])
            record["anonymization"] = {"status": "first_pass", "humanReviewRequired": True}
            target.write(json.dumps(record, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    main()
