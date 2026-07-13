#!/usr/bin/env python3
"""Discover PDF/DOCX files in local repository clones. Emits metadata only."""
from __future__ import annotations
import argparse, hashlib, json
from pathlib import Path

EXTENSIONS = {".pdf", ".docx"}

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roots", nargs="+", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--max-file-size-mb", type=int, default=50)
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    limit = args.max_file_size_mb * 1024 * 1024
    count = 0
    with args.out.open("w", encoding="utf-8") as output:
        for root in args.roots:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
                    continue
                if path.stat().st_size > limit:
                    continue
                digest = sha256(path)
                record = {
                    "id": digest[:24],
                    "path": str(path.resolve()),
                    "extension": path.suffix.lower(),
                    "sizeBytes": path.stat().st_size,
                    "sha256": digest,
                    "sourceRoot": str(root.resolve()),
                    "consentStatus": "unknown",
                    "reviewStatus": "pending"
                }
                output.write(json.dumps(record, ensure_ascii=False) + "\n")
                count += 1
    print(f"Discovered {count} documents")

if __name__ == "__main__":
    main()
