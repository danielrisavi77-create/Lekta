from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE / "scripts"))


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


lib = load("pipeline_lib", PIPELINE / "lib.py")
discover_documents = load("discover_documents", PIPELINE / "scripts" / "discover_documents.py")
clone_sources = load("clone_sources", PIPELINE / "scripts" / "clone_sources.py")


class PipelineTests(unittest.TestCase):
    def test_recursive_redaction(self):
        value = {"email": "daniel@example.com", "nested": ["OIB 12345678901"]}
        redacted = lib.redact_value(value)
        self.assertEqual(redacted["email"], "[EMAIL_REDACTED]")
        self.assertNotIn("12345678901", redacted["nested"][0])

    def test_private_paths_are_removed(self):
        value = {"id": "a", "_localPath": "/tmp/private.docx", "_analysisDocxPath": "/tmp/a.docx"}
        self.assertEqual(lib.public_record(value), {"id": "a"})

    def test_jsonl_round_trip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.jsonl"
            count = lib.write_jsonl(path, [{"id": "1"}, {"id": "2"}])
            self.assertEqual(count, 2)
            self.assertEqual([item["id"] for item in lib.read_jsonl(path)], ["1", "2"])

    def test_document_discovery_hard_cap_is_deterministic(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "owner__repository"
            root.mkdir()
            for name in ("c.docx", "a.docx", "b.pdf"):
                (root / name).write_bytes(name.encode())
            records = list(discover_documents.discover([root], 1024, max_documents=2))
            self.assertEqual([record["relativePath"] for record in records], ["a.docx", "b.pdf"])

    def test_empty_repository_metadata_is_detected_without_cloning(self):
        with patch.object(
            clone_sources.subprocess,
            "run",
            return_value=SimpleNamespace(returncode=0, stdout="0\n"),
        ) as run:
            self.assertEqual(clone_sources.repository_size("owner/empty", {}), 0)
            run.assert_called_once_with(
                ["gh", "api", "repos/owner/empty", "--jq", ".size"],
                env={},
                text=True,
                capture_output=True,
            )

    def test_repository_metadata_failure_stays_fatal(self):
        with patch.object(
            clone_sources.subprocess,
            "run",
            return_value=SimpleNamespace(returncode=1, stdout=""),
        ):
            with self.assertRaisesRegex(SystemExit, "Could not inspect owner/private"):
                clone_sources.repository_size("owner/private", {})


if __name__ == "__main__":
    unittest.main()
