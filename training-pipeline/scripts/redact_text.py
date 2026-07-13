#!/usr/bin/env python3
"""Recursively redact common PII from JSONL records."""
from __future__ import annotations

import argparse
from pathlib import Path

from training_pipeline_bootstrap import add_pipeline_to_path

add_pipeline_to_path()
from lib import public_record, read_jsonl, redact_value, write_jsonl  # noqa: E402


def records(path: Path, keep_private_paths: bool):
    for record in read_jsonl(path):
        redacted = redact_value(record)
        redacted["anonymization"] = {
            "status": "first_pass",
            "humanReviewRequired": True,
        }
        yield redacted if keep_private_paths else public_record(redacted)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--keep-private-paths", action="store_true")
    args = parser.parse_args()
    count = write_jsonl(args.output, records(args.input, args.keep_private_paths))
    print(f"Redacted {count} records; human review is still required")


if __name__ == "__main__":
    main()
