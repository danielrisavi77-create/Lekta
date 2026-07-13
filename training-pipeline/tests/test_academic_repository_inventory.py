from __future__ import annotations

import importlib.util
import json
import sys
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "training-pipeline/scripts"
sys.path.insert(0, str(SCRIPTS))


def load(name: str):
    path = SCRIPTS / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


registry_module = load("build_academic_repository_registry")
inventory_module = load("inventory_academic_repositories")


class AcademicRepositoryInventoryTests(unittest.TestCase):
    def test_registry_covers_entire_catalog(self):
        registry = registry_module.build_registry(ROOT)
        registry_module.validate_registry(registry, ROOT)
        units = [unit for institution in registry["institutions"] for unit in institution["units"]]
        self.assertEqual(len(registry["institutions"]), 37)
        self.assertEqual(len(units), 117)
        self.assertEqual(sum(unit["mappingStatus"] == "mapped" for unit in units), 115)
        self.assertEqual(
            {unit["id"] for unit in units if unit["mappingStatus"] != "mapped"},
            {"vkjs", "vhzk"},
        )

    def test_parser_returns_only_aggregate_counts(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
          xmlns:dc="http://purl.org/dc/elements/1.1/"
          xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/">
          <ListRecords><record><header><identifier>oai:repo.test:fpzg_1</identifier></header>
          <metadata><oai_dc:dc><dc:title>Osobni naslov</dc:title><dc:creator>Ime Prezime</dc:creator>
          <dc:type>Diplomski rad</dc:type><dc:rights>info:eu-repo/semantics/openAccess</dc:rights>
          <dc:description>student@example.com OIB 12345678901</dc:description></oai_dc:dc></metadata>
          </record><resumptionToken></resumptionToken></ListRecords></OAI-PMH>"""
        counts, token = inventory_module.parse_page(xml, {"fpzg"})
        serialized = json.dumps(counts)
        self.assertEqual(counts, {"thesisRecords": 1, "openAccess": 1, "byLevel": {"diplomski": 1}})
        self.assertIsNone(token)
        self.assertNotIn("Ime Prezime", serialized)
        self.assertNotIn("student@example.com", serialized)
        self.assertNotIn("12345678901", serialized)

    def test_oai_url_keeps_redirects_on_https(self):
        url = inventory_module.oai_url("repo.test.hr", None, "2024-01-01")
        self.assertTrue(url.startswith("https://repo.test.hr/oai/?"))

    def test_shared_repository_can_be_filtered_by_publisher(self):
        xml = """<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
          xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/">
          <ListRecords><record><header><identifier>oai:repo.test:unipu_1</identifier></header>
          <metadata><oai_dc:dc><dc:publisher>Fakultet informatike u Puli</dc:publisher>
          <dc:type>Diplomski rad</dc:type></oai_dc:dc></metadata></record></ListRecords></OAI-PMH>"""
        included, _ = inventory_module.parse_page(xml, {"unipu"}, "Fakultet informatike u Puli")
        excluded, _ = inventory_module.parse_page(xml, {"unipu"}, "Medicinski fakultet u Puli")
        self.assertEqual(included["thesisRecords"], 1)
        self.assertNotIn("thesisRecords", excluded)

    def test_report_policy_forbids_content_download_and_identifiers(self):
        registry = {
            "institutions": [{"units": [{
                "id": "test",
                "mappingStatus": "mapped",
                "hosts": ["repo.test.hr"],
                "pidNamespaces": ["test"],
                "publisherFilters": {},
            }]}]
        }
        with patch.object(inventory_module, "fetch_page", return_value=""), patch.object(
            inventory_module,
            "parse_page",
            return_value=({"thesisRecords": 0, "openAccess": 0, "byLevel": {}}, None),
        ):
            report = inventory_module.run_inventory(registry, 1, None)
        self.assertFalse(report["policy"]["downloadsFiles"])
        self.assertFalse(report["policy"]["storesRecordIdentifiers"])
        self.assertFalse(report["policy"]["fullTextRightsApproved"])

    def test_unknown_unit_filter_is_rejected(self):
        registry = {"institutions": [{"units": []}]}
        with self.assertRaisesRegex(ValueError, "Nepoznati unitId"):
            inventory_module.run_inventory(registry, 1, None, {"ne-postoji"})

    def test_transient_url_error_is_retried(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _limit):
                return b"<OAI-PMH/>"

        inventory_module._fetch_page.cache_clear()
        with patch.object(
            inventory_module.urllib.request,
            "urlopen",
            side_effect=[urllib.error.URLError("temporary"), Response()],
        ) as urlopen, patch.object(inventory_module.time, "sleep"):
            self.assertEqual(
                inventory_module._fetch_page("https://repo.test.hr/oai", timeout=1),
                "<OAI-PMH/>",
            )
        self.assertEqual(urlopen.call_count, 2)


if __name__ == "__main__":
    unittest.main()
