#!/usr/bin/env python3
"""Build a local SQLite FTS knowledge base from approved examples only."""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from training_pipeline_bootstrap import add_pipeline_to_path

add_pipeline_to_path()
from lib import read_jsonl  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(args.output)
    try:
        connection.execute("DROP TABLE IF EXISTS error_examples")
        connection.execute(
            "CREATE VIRTUAL TABLE error_examples USING fts5(id UNINDEXED, category, original, correction, explanation, rule_source)"
        )
        approved = 0
        for record in read_jsonl(args.input):
            if record.get("reviewStatus") != "approved":
                continue
            connection.execute(
                "INSERT INTO error_examples VALUES (?, ?, ?, ?, ?, ?)",
                (
                    record.get("id"),
                    record.get("category"),
                    record.get("original"),
                    record.get("correction"),
                    record.get("explanation"),
                    record.get("ruleSource"),
                ),
            )
            approved += 1
        connection.commit()
    finally:
        connection.close()
    print(f"Knowledge base contains {approved} approved examples")


if __name__ == "__main__":
    main()
