from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


lib = load("pipeline_lib", PIPELINE / "lib.py")


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


if __name__ == "__main__":
    unittest.main()
