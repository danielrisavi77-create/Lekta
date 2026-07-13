#!/usr/bin/env python3
"""Orchestrate inventory and approved dataset build modes."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from lib import read_jsonl

ROOT = Path(__file__).resolve().parents[1]
PIPELINE = ROOT / "training-pipeline"
SCRIPTS = PIPELINE / "scripts"


def run(command: list[str]) -> None:
    printable = " ".join(command)
    print(f"[pipeline] {printable}")
    subprocess.run(command, cwd=ROOT, check=True)


def npx_executable() -> str:
    """Resolve npx on Windows, where the executable is commonly npx.cmd."""
    return shutil.which("npx") or "npx"


def summarize(path: Path, output: Path) -> None:
    counts: dict[str, object] = {
        "total": 0,
        "pdf": 0,
        "docx": 0,
        "ocrRequired": 0,
        "errors": 0,
        "analysisReady": 0,
        "conversionFailed": 0,
        "conversionErrors": 0,
        "conversionNotRequested": 0,
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
            analysis_status = record.get("analysisStatus")
            status_key = {
                "ready": "analysisReady",
                "conversion_failed": "conversionFailed",
                "conversion_error": "conversionErrors",
                "conversion_not_requested": "conversionNotRequested",
            }.get(analysis_status)
            if status_key:
                counts[status_key] = int(counts[status_key]) + 1
            repository = str(record.get("repository") or "unknown")
            repositories = counts["repositories"]
            assert isinstance(repositories, dict)
            item = repositories.setdefault(repository, {
                "pdf": 0,
                "docx": 0,
                "bytes": 0,
                "ocrRequired": 0,
                "errors": 0,
                "analysisReady": 0,
                "conversionFailed": 0,
                "conversionErrors": 0,
                "conversionNotRequested": 0,
            })
            if extension in {"pdf", "docx"}:
                item[extension] += 1
            item["bytes"] += int(record.get("sizeBytes") or 0)
            if record.get("extractionStatus") == "ocr_required":
                item["ocrRequired"] += 1
            if record.get("extractionStatus") == "error":
                item["errors"] += 1
            if status_key:
                item[status_key] += 1
    output.write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")


def add_pending_summary(path: Path, output: Path) -> None:
    data = json.loads(output.read_text(encoding="utf-8"))
    pending = {
        "total": 0,
        "withCorrection": 0,
        "withRuleSource": 0,
        "withPositiveConfidence": 0,
        "reviewReady": 0,
    }
    for record in read_jsonl(path):
        pending["total"] += 1
        has_correction = bool(str(record.get("correction") or "").strip())
        has_rule_source = bool(str(record.get("ruleSource") or "").strip())
        has_confidence = float(record.get("confidence") or 0) > 0
        if has_correction:
            pending["withCorrection"] += 1
        if has_rule_source:
            pending["withRuleSource"] += 1
        if has_confidence:
            pending["withPositiveConfidence"] += 1
        if (
            record.get("reviewStatus") == "pending"
            and str(record.get("original") or "").strip()
            and str(record.get("explanation") or "").strip()
            and has_correction
            and has_rule_source
            and has_confidence
        ):
            pending["reviewReady"] += 1
    data["pendingExamples"] = pending
    output.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roots", nargs="+", required=True, type=Path)
    parser.add_argument("--mode", choices=("inventory", "build"), default="inventory")
    parser.add_argument("--profile", default="fpzg-politologija-diplomski")
    parser.add_argument("--out-dir", type=Path, default=PIPELINE / "output")
    parser.add_argument("--convert-pdf", action="store_true")
    parser.add_argument("--max-documents", type=int, default=10)
    args = parser.parse_args()
    if not 1 <= args.max_documents <= 50:
        parser.error("--max-documents must be between 1 and 50")

    private = args.out_dir / ".private"
    sanitized = args.out_dir / "sanitized"
    private.mkdir(parents=True, exist_ok=True)
    sanitized.mkdir(parents=True, exist_ok=True)
    manifest = private / "documents.jsonl"
    extracted = private / "documents.extracted.jsonl"
    public_manifest = sanitized / "documents.jsonl"

    roots = [str(path.resolve()) for path in args.roots]
    discovery = [sys.executable, str(SCRIPTS / "discover_documents.py"), "--roots", *roots, "--out", str(manifest)]
    if args.mode == "build":
        discovery.extend(["--max-documents", str(args.max_documents)])
    run(discovery)
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
    run([
        npx_executable(),
        "vite-node",
        str(PIPELINE / "analyze_documents.mts"),
        "--input",
        str(extracted),
        "--output",
        str(raw_analysis),
        "--profile",
        args.profile,
    ])
    run([sys.executable, str(SCRIPTS / "redact_text.py"), "--input", str(raw_analysis), "--output", str(sanitized_analysis)])
    pending_dataset = sanitized / "error-dataset.pending.jsonl"
    run([sys.executable, str(SCRIPTS / "build_error_dataset.py"), "--input", str(sanitized_analysis), "--output", str(pending_dataset)])
    summarize(public_manifest, sanitized / "summary.json")
    add_pending_summary(pending_dataset, sanitized / "summary.json")
    print("Build complete. Every example remains pending until human review.")


if __name__ == "__main__":
    main()
