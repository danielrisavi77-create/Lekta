#!/usr/bin/env python3
"""Validate repository inventory and rights configuration."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from training_pipeline_bootstrap import add_pipeline_to_path

add_pipeline_to_path()
from lib import ALLOWED_RIGHTS  # noqa: E402

REPOSITORY = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
RIGHTS = ALLOWED_RIGHTS | {"review-required", "excluded"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True, type=Path)
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    errors = []
    seen = set()
    for index, source in enumerate(config.get("repositories", [])):
        repository = source.get("repository", "")
        if not REPOSITORY.fullmatch(repository):
            errors.append(f"repositories[{index}].repository is invalid")
        if repository in seen:
            errors.append(f"duplicate repository: {repository}")
        seen.add(repository)
        if source.get("rights") not in RIGHTS:
            errors.append(f"{repository}: invalid rights value")
        if not isinstance(source.get("inventory", True), bool):
            errors.append(f"{repository}: inventory must be boolean")
    if errors:
        raise SystemExit("Invalid source configuration:\n- " + "\n- ".join(errors))
    eligible = sum(1 for source in config.get("repositories", []) if source.get("rights") in ALLOWED_RIGHTS)
    print(f"Configuration valid: {len(seen)} repositories, {eligible} eligible for build")


if __name__ == "__main__":
    main()
