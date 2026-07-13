#!/usr/bin/env python3
"""Run the safe first-pass document ingestion pipeline."""
from __future__ import annotations
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DISCOVER = ROOT / "training-pipeline/scripts/discover_documents.py"
REDACT = ROOT / "training-pipeline/scripts/redact_text.py"

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roots", nargs="+", required=True, type=Path)
    parser.add_argument("--out-dir", type=Path, default=ROOT / "training-pipeline/output")
    args = parser.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    manifest = args.out_dir / "documents.jsonl"
    redacted = args.out_dir / "documents.redacted.jsonl"
    subprocess.run([sys.executable, str(DISCOVER), "--roots", *map(str, args.roots), "--out", str(manifest)], check=True)
    subprocess.run([sys.executable, str(REDACT), "--input", str(manifest), "--output", str(redacted)], check=True)
    print(f"Manifest: {manifest}")
    print(f"Redacted manifest: {redacted}")
    print("Napomena: prije analize mora se potvrditi pravo korištenja i ručno pregledati anonimizacija.")

if __name__ == "__main__":
    main()
