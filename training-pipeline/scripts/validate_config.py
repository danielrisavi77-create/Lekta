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
        if source.get("rights") == "lawful-access-tdm":
            basis = source.get("rightsBasis")
            if not isinstance(basis, dict):
                errors.append(f"{repository}: lawful-access-tdm requires rightsBasis")
            else:
                if basis.get("publicAccess") is not True:
                    errors.append(f"{repository}: rightsBasis.publicAccess must be true")
                if basis.get("tdmReservation") != "not-found":
                    errors.append(f"{repository}: rightsBasis.tdmReservation must be not-found")
                if not isinstance(basis.get("confirmedBy"), str) or not basis["confirmedBy"].strip():
                    errors.append(f"{repository}: rightsBasis.confirmedBy is required")
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(basis.get("confirmedAt", ""))):
                    errors.append(f"{repository}: rightsBasis.confirmedAt must be YYYY-MM-DD")
        if not isinstance(source.get("inventory", True), bool):
            errors.append(f"{repository}: inventory must be boolean")
    if errors:
        raise SystemExit("Invalid source configuration:\n- " + "\n- ".join(errors))
    eligible = sum(1 for source in config.get("repositories", []) if source.get("rights") in ALLOWED_RIGHTS)
    print(f"Configuration valid: {len(seen)} repositories, {eligible} eligible for build")


if __name__ == "__main__":
    main()
