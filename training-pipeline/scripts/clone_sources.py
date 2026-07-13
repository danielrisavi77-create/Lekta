#!/usr/bin/env python3
"""Clone configured GitHub repositories for inventory or approved dataset builds."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from training_pipeline_bootstrap import add_pipeline_to_path

add_pipeline_to_path()
from lib import ALLOWED_RIGHTS  # noqa: E402


def repository_size(repository: str, env: dict[str, str]) -> int:
    result = subprocess.run(
        ["gh", "api", f"repos/{repository}", "--jq", ".size"],
        env=env,
        text=True,
        capture_output=True,
    )
    if result.returncode:
        raise SystemExit(f"Could not inspect {repository}. Connect the repo or check LEKTA_REPOS_TOKEN access.")
    try:
        return int(result.stdout.strip())
    except ValueError as exc:
        raise SystemExit(f"GitHub returned invalid repository metadata for {repository}.") from exc


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
    skipped = []
    for source in selected:
        repository = source["repository"]
        branch = source.get("branch") or "main"
        if repository_size(repository, env) == 0:
            skipped.append({"repository": repository, "reason": "empty"})
            print(f"Skipping empty repository: {repository}", file=sys.stderr)
            continue
        destination = args.out / repository.replace("/", "__")
        if destination.exists():
            roots.append(str(destination))
            continue
        command = ["gh", "repo", "clone", repository, str(destination), "--", "--depth", "1", "--branch", branch]
        result = subprocess.run(command, env=env, text=True, capture_output=True)
        if result.returncode:
            raise SystemExit(f"Could not clone {repository} branch {branch}. Check repository access and configuration.")
        roots.append(str(destination))
    if not roots:
        raise SystemExit("No non-empty repositories are available for this mode.")
    print(json.dumps({"mode": args.mode, "roots": roots, "skipped": skipped}, ensure_ascii=False))


if __name__ == "__main__":
    main()
