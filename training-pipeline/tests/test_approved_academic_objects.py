from __future__ import annotations

import importlib.util
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "training-pipeline/scripts"
sys.path.insert(0, str(SCRIPTS))


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


downloader = load("download_approved_academic_objects")


def registry() -> dict:
    return {"institutions": [{"units": [{
        "id": "test-unit",
        "hosts": ["repo.test.hr"],
        "pidNamespaces": ["test"],
    }]}]}


def approved() -> dict:
    return {
        "oaiIdentifier": "oai:repo.test.hr:test_42",
        "host": "repo.test.hr",
        "unitId": "test-unit",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "evidenceUrl": "https://repo.test.hr/islandora/object/test:42",
        "reviewStatus": "approved",
        "reviewedBy": "human-reviewer",
        "reviewedAt": date.today().isoformat(),
    }


class ApprovedAcademicObjectTests(unittest.TestCase):
    def test_valid_object_level_approval_is_accepted(self):
        result = downloader.validate_manifest({"version": 1, "objects": [approved()]}, registry())
        self.assertEqual(result[0]["_pid"], "test:42")
        self.assertNotIn("test:42", result[0]["_key"])

    def test_repository_wide_or_pending_approval_is_rejected(self):
        item = approved()
        item["reviewStatus"] = "pending"
        with self.assertRaisesRegex(ValueError, "nije rucno odobren"):
            downloader.validate_manifest({"version": 1, "objects": [item]}, registry())

    def test_conditional_license_is_rejected(self):
        item = approved()
        item["licenseUrl"] = "https://creativecommons.org/licenses/by-nc-nd/4.0/"
        with self.assertRaisesRegex(ValueError, "permisivnu licencu"):
            downloader.validate_manifest({"version": 1, "objects": [item]}, registry())

    def test_host_and_exact_object_evidence_are_enforced(self):
        item = approved()
        item["evidenceUrl"] = "https://evil.example/islandora/object/test:42"
        with self.assertRaisesRegex(ValueError, "istog Dabar repozitorija"):
            downloader.validate_manifest({"version": 1, "objects": [item]}, registry())
        item = approved()
        item["evidenceUrl"] = "https://repo.test.hr/islandora/object/test:99"
        with self.assertRaisesRegex(ValueError, "tocno odobreni"):
            downloader.validate_manifest({"version": 1, "objects": [item]}, registry())

    def test_live_rights_must_still_match_exact_approved_license(self):
        item = {**approved(), "_host": "repo.test.hr"}
        xml = b'''<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
          xmlns:dc="http://purl.org/dc/elements/1.1/"><GetRecord><record><metadata><x>
          <dc:rights>info:eu-repo/semantics/openAccess</dc:rights>
          <dc:rights>https://creativecommons.org/licenses/by/4.0/</dc:rights>
          </x></metadata></record></GetRecord></OAI-PMH>'''
        with patch.object(downloader, "fetch_bytes", return_value=xml):
            downloader.verify_live_rights(item)
        item["licenseUrl"] = "https://creativecommons.org/publicdomain/zero/1.0/"
        with patch.object(downloader, "fetch_bytes", return_value=xml):
            with self.assertRaisesRegex(ValueError, "vise ne potvrduje"):
                downloader.verify_live_rights(item)

    def test_redirect_to_another_host_is_rejected(self):
        class Response:
            headers = {}

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def geturl(self):
                return "https://evil.example/file.pdf"

            def read(self, _):
                return b"%PDF-1.7"

        with patch.object(downloader.urllib.request, "urlopen", return_value=Response()):
            with self.assertRaisesRegex(ValueError, "izvan odobrenog hosta"):
                downloader.fetch_bytes("https://repo.test.hr/file", "repo.test.hr", 100, True)


if __name__ == "__main__":
    unittest.main()
