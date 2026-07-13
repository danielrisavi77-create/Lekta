#!/usr/bin/env python3
"""Render a sanitized pipeline summary as GitHub-flavored Markdown."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def render(data: dict[str, object]) -> str:
    pending = data.get("pendingExamples") or {}
    assert isinstance(pending, dict)
    lines = [
        "## Lekta training pipeline",
        "",
        f"Ukupno dokumenata: **{data.get('total', 0)}**",
        f"Spremno za DOCX analizu: **{data.get('analysisReady', 0)}**",
        f"OCR potreban: **{data.get('ocrRequired', 0)}**",
        f"Neuspjela PDF konverzija: **{data.get('conversionFailed', 0)}**",
        f"Pogreška PDF konverzije: **{data.get('conversionErrors', 0)}**",
        f"PDF konverzija nije zatražena: **{data.get('conversionNotRequested', 0)}**",
        f"Pogreška ekstrakcije: **{data.get('errors', 0)}**",
        "",
        f"Pending primjeri: **{pending.get('total', 0)}**",
        f"Kandidati za odobrenje: **{pending.get('reviewReady', 0)}**",
        f"S korekcijom: **{pending.get('withCorrection', 0)}**",
        f"S izvorom pravila: **{pending.get('withRuleSource', 0)}**",
        "",
        "| Repozitorij | PDF | DOCX | Spremno | OCR | Konverzija nije uspjela | Pogreška ekstrakcije | Veličina |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    repositories = data.get("repositories") or {}
    assert isinstance(repositories, dict)
    for repository, raw_item in sorted(repositories.items()):
        assert isinstance(raw_item, dict)
        item = raw_item
        megabytes = int(item.get("bytes", 0)) / 1024 / 1024
        conversion_failures = int(item.get("conversionFailed", 0)) + int(item.get("conversionErrors", 0))
        lines.append(
            f"| {repository} | {item.get('pdf', 0)} | {item.get('docx', 0)} | "
            f"{item.get('analysisReady', 0)} | {item.get('ocrRequired', 0)} | "
            f"{conversion_failures} | {item.get('errors', 0)} | {megabytes:.2f} MB |"
        )
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    args.output.write_text(render(data), encoding="utf-8")


if __name__ == "__main__":
    main()
