#!/usr/bin/env python3
"""Clone configured GitHub repositories for inventory or approved dataset builds."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path

from training_pipeline_bootstrap import add_pipeline_to_path

add_pipeline_to_path()
from lib import ALLOWED_RIGHTS  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--mode", choices=("inventory", "build"), default="inventory")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    args.out.mkdir(parents=True, exist_ok=True)
    selected = []
    for source in config.get("repositories", []):
        if not source.get("inventory", True):
            continue
        if args.mode == "build" and source.get("rights") not in ALLOWED_RIGHTS:
            continue
        selected.append(source)
    if not selected:
        raise SystemExit("No repositories are eligible for this mode. Review source rights first.")
    env = os.environ.copy()
    token = env.get("LEKTA_REPOS_TOKEN", "")
    if token:
        env["GH_TOKEN"] = token
    roots = []
    for source in selected:
        repository = source["repository"]
        branch = source.get("branch") or "main"
        destination = args.out / repository.replace("/", "__")
        if destination.exists():
            roots.append(str(destination))
            continue
        command = ["gh", "repo", "clone", repository, str(destination), "--", "--depth", "1", "--branch", branch]
        result = subprocess.run(command, env=env, text=True, capture_output=True)
        if result.returncode:
            raise SystemExit(f"Could not clone {repository}. Connect the repo or set LEKTA_REPOS_TOKEN.")
        roots.append(str(destination))
    print(json.dumps({"mode": args.mode, "roots": roots}, ensure_ascii=False))


if __name__ == "__main__":
    main()
