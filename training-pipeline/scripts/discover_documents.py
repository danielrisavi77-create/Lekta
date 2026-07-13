#!/usr/bin/env python3
"""Discover PDF/DOCX files and emit an internal manifest."""
from __future__ import annotations

import argparse
from pathlib import Path

from training_pipeline_bootstrap import add_pipeline_to_path

add_pipeline_to_path()
from lib import hash_file, write_jsonl  # noqa: E402

EXTENSIONS = {".pdf", ".docx"}
SKIP_PARTS = {".git", "node_modules", "dist", "artifacts", "training-pipeline"}


def discover(roots: list[Path], limit: int):
    for root in roots:
        if not root.exists():
            continue
        repository = root.name.replace("__", "/")
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in EXTENSIONS:
                continue
            if any(part in SKIP_PARTS for part in path.relative_to(root).parts):
                continue
            size = path.stat().st_size
            if size > limit:
                continue
            digest = hash_file(path)
            yield {
                "id": digest[:24],
                "repository": repository,
                "relativePath": path.relative_to(root).as_posix(),
                "extension": path.suffix.lower(),
                "sizeBytes": size,
                "sha256": digest,
                "reviewStatus": "pending",
                "_localPath": str(path.resolve()),
            }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roots", nargs="+", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--max-file-size-mb", type=int, default=50)
    args = parser.parse_args()
    count = write_jsonl(args.out, discover(args.roots, args.max_file_size_mb * 1024 * 1024))
    print(f"Discovered {count} documents")


if __name__ == "__main__":
    main()
