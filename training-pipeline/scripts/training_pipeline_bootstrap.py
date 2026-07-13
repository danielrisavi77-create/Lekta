"""Allow standalone scripts to import modules from training-pipeline/."""
from __future__ import annotations

import sys
from pathlib import Path


def add_pipeline_to_path() -> None:
    pipeline = Path(__file__).resolve().parents[1]
    value = str(pipeline)
    if value not in sys.path:
        sys.path.insert(0, value)
