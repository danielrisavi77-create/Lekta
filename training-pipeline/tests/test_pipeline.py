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
extract_documents = load("extract_documents", PIPELINE / "scripts" / "extract_documents.py")
run_pipeline = load("run_pipeline", PIPELINE / "run_pipeline.py")
render_summary = load("render_summary", PIPELINE / "scripts" / "render_summary.py")


class PipelineTests(unittest.TestCase):
    def test_lawful_access_tdm_is_an_explicit_build_right(self):
        self.assertIn("lawful-access-tdm", lib.ALLOWED_RIGHTS)

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

    def test_rule_sources_and_test_fixtures_are_not_training_documents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "owner__repository"
            (root / "data" / "sources").mkdir(parents=True)
            (root / "tests" / "fixtures").mkdir(parents=True)
            (root / "academic-works").mkdir(parents=True)
            (root / "data" / "sources" / "rules.pdf").write_bytes(b"rules")
            (root / "tests" / "fixtures" / "golden.docx").write_bytes(b"fixture")
            (root / "academic-works" / "work.docx").write_bytes(b"work")
            records = list(discover_documents.discover([root], 1024))
            self.assertEqual([record["relativePath"] for record in records], ["academic-works/work.docx"])

    def test_pdf_analysis_statuses_distinguish_ocr_and_conversion_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "document.pdf"
            pdf.write_bytes(b"pdf")
            manifest = root / "manifest.jsonl"
            output = root / "docx"
            base = {"id": "document", "_localPath": str(pdf)}

            def status(text: str, convert: bool, converted):
                lib.write_jsonl(manifest, [base])
                with patch.object(extract_documents, "pdf_text", return_value=text), patch.object(
                    extract_documents, "pdf_to_docx", return_value=converted
                ):
                    return list(extract_documents.records(manifest, output, convert))[0]["analysisStatus"]

            self.assertEqual(status("", True, None), "ocr_required")
            self.assertEqual(status("tekst", False, None), "conversion_not_requested")
            self.assertEqual(status("tekst", True, None), "conversion_failed")
            converted = output / "document.docx"
            self.assertEqual(status("tekst", True, converted), "ready")

    def test_pdf_conversion_exception_is_not_reported_as_extraction_error(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf = root / "document.pdf"
            pdf.write_bytes(b"pdf")
            manifest = root / "manifest.jsonl"
            lib.write_jsonl(manifest, [{"id": "document", "_localPath": str(pdf)}])
            with patch.object(extract_documents, "pdf_text", return_value="tekst"), patch.object(
                extract_documents, "pdf_to_docx", side_effect=RuntimeError("conversion failed")
            ):
                record = list(extract_documents.records(manifest, root / "docx", True))[0]
            self.assertEqual(record["extractionStatus"], "ok")
            self.assertEqual(record["analysisStatus"], "conversion_error")
            self.assertEqual(record["conversionError"], "RuntimeError")

    def test_empty_docx_remains_ready_for_structural_analysis(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docx = root / "document.docx"
            docx.write_bytes(b"docx")
            manifest = root / "manifest.jsonl"
            lib.write_jsonl(manifest, [{"id": "document", "_localPath": str(docx)}])
            with patch.object(extract_documents, "docx_text", return_value=""):
                record = list(extract_documents.records(manifest, root / "docx", True))[0]
            self.assertEqual(record["extractionStatus"], "ok")
            self.assertEqual(record["analysisStatus"], "ready")

    def test_summary_reports_analysis_outcomes_without_document_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "documents.jsonl"
            summary = root / "summary.json"
            lib.write_jsonl(source, [
                {"repository": "owner/repo", "extension": ".pdf", "sizeBytes": 10, "extractionStatus": "ocr_required", "analysisStatus": "ocr_required"},
                {"repository": "owner/repo", "extension": ".pdf", "sizeBytes": 20, "extractionStatus": "ok", "analysisStatus": "conversion_failed"},
                {"repository": "owner/repo", "extension": ".docx", "sizeBytes": 30, "extractionStatus": "ok", "analysisStatus": "ready"},
            ])
            run_pipeline.summarize(source, summary)
            data = json.loads(summary.read_text(encoding="utf-8"))
            self.assertEqual(data["ocrRequired"], 1)
            self.assertEqual(data["conversionFailed"], 1)
            self.assertEqual(data["analysisReady"], 1)
            rendered = render_summary.render(data)
            self.assertIn("OCR potreban: **1**", rendered)
            self.assertNotIn("extractedText", rendered)

    def test_pending_summary_never_auto_approves_incomplete_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            summary = root / "summary.json"
            pending = root / "pending.jsonl"
            summary.write_text('{"total": 1, "repositories": {}}', encoding="utf-8")
            lib.write_jsonl(pending, [
                {"reviewStatus": "pending", "original": "nalaz", "correction": "", "explanation": "opis", "ruleSource": None, "confidence": 0.0},
                {"reviewStatus": "pending", "original": "nalaz", "correction": "ispravak", "explanation": "opis", "ruleSource": "source", "confidence": 0.8},
            ])
            run_pipeline.add_pending_summary(pending, summary)
            data = json.loads(summary.read_text(encoding="utf-8"))
            self.assertEqual(data["pendingExamples"]["total"], 2)
            self.assertEqual(data["pendingExamples"]["reviewReady"], 1)

    def test_npx_executable_uses_platform_resolver(self):
        with patch.object(run_pipeline.shutil, "which", return_value="C:/node/npx.cmd"):
            self.assertEqual(run_pipeline.npx_executable(), "C:/node/npx.cmd")

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
