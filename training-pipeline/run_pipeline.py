#!/usr/bin/env python3
"""Orchestrate inventory and approved dataset build modes."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "training-pipeline"
SCRIPTS = PIPELINE / "scripts"


def run(command: list[str]) -> None:
    printable = " ".join(command)
    print(f"[pipeline] {printable}")
    subprocess.run(command, cwd=ROOT, check=True)


def summarize(path: Path, output: Path) -> None:
    counts: dict[str, object] = {
        "total": 0,
        "pdf": 0,
        "docx": 0,
        "ocrRequired": 0,
        "errors": 0,
        "repositories": {},
    }
    with path.open(encoding="utf-8") as source:
        for line in source:
            if not line.strip():
                continue
            record = json.loads(line)
            counts["total"] = int(counts["total"]) + 1
            extension = str(record.get("extension", "")).lstrip(".")
            if extension in {"pdf", "docx"}:
                counts[extension] = int(counts[extension]) + 1
            if record.get("extractionStatus") == "ocr_required":
                counts["ocrRequired"] = int(counts["ocrRequired"]) + 1
            if record.get("extractionStatus") == "error":
                counts["errors"] = int(counts["errors"]) + 1
            repository = str(record.get("repository") or "unknown")
            repositories = counts["repositories"]
            assert isinstance(repositories, dict)
            item = repositories.setdefault(repository, {"pdf": 0, "docx": 0, "bytes": 0, "ocrRequired": 0})
            if extension in {"pdf", "docx"}:
                item[extension] += 1
            item["bytes"] += int(record.get("sizeBytes") or 0)
            if record.get("extractionStatus") == "ocr_required":
                item["ocrRequired"] += 1
    output.write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roots", nargs="+", required=True, type=Path)
    parser.add_argument("--mode", choices=("inventory", "build"), default="inventory")
    parser.add_argument("--profile", default="fpzg-politologija-diplomski")
    parser.add_argument("--out-dir", type=Path, default=PIPELINE / "output")
    parser.add_argument("--convert-pdf", action="store_true")
    args = parser.parse_args()

    private = args.out_dir / ".private"
    sanitized = args.out_dir / "sanitized"
    private.mkdir(parents=True, exist_ok=True)
    sanitized.mkdir(parents=True, exist_ok=True)
    manifest = private / "documents.jsonl"
    extracted = private / "documents.extracted.jsonl"
    public_manifest = sanitized / "documents.jsonl"

    roots = [str(path.resolve()) for path in args.roots]
    run([sys.executable, str(SCRIPTS / "discover_documents.py"), "--roots", *roots, "--out", str(manifest)])
    if args.mode == "inventory":
        run([sys.executable, str(SCRIPTS / "redact_text.py"), "--input", str(manifest), "--output", str(public_manifest)])
        summarize(public_manifest, sanitized / "summary.json")
        print(f"Inventory complete: {sanitized / 'summary.json'}")
        return

    extraction = [sys.executable, str(SCRIPTS / "extract_documents.py"), "--manifest", str(manifest), "--output", str(extracted), "--docx-dir", str(private / "docx")]
    if args.convert_pdf:
        extraction.append("--convert-pdf")
    run(extraction)
    run([sys.executable, str(SCRIPTS / "redact_text.py"), "--input", str(extracted), "--output", str(public_manifest)])

    raw_analysis = private / "analysis.jsonl"
    sanitized_analysis = sanitized / "analysis.jsonl"
    run(["npx", "vite-node", str(PIPELINE / "analyze_documents.mts"), "--input", str(extracted), "--output", str(raw_analysis), "--profile", args.profile])
    run([sys.executable, str(SCRIPTS / "redact_text.py"), "--input", str(raw_analysis), "--output", str(sanitized_analysis)])
    run([sys.executable, str(SCRIPTS / "build_error_dataset.py"), "--input", str(sanitized_analysis), "--output", str(sanitized / "error-dataset.pending.jsonl")])
    summarize(public_manifest, sanitized / "summary.json")
    print("Build complete. Every example remains pending until human review.")


if __name__ == "__main__":
    main()
