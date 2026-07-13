#!/usr/bin/env python3
"""Render a sanitized pipeline summary as GitHub-flavored Markdown."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    lines = [
        "## Lekta training pipeline",
        "",
        f"Ukupno dokumenata: **{data.get('total', 0)}**",
        "",
        "| Repozitorij | PDF | DOCX | Veličina | OCR potreban |",
        "|---|---:|---:|---:|---:|",
    ]
    for repository, item in sorted((data.get("repositories") or {}).items()):
        megabytes = item.get("bytes", 0) / 1024 / 1024
        lines.append(
            f"| {repository} | {item.get('pdf', 0)} | {item.get('docx', 0)} | {megabytes:.2f} MB | {item.get('ocrRequired', 0)} |"
        )
    args.output.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
