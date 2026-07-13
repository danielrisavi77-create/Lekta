from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path


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


rights_inventory = load("inventory_academic_rights")


def record(identifier: str, rights: list[str], title: str = "Osobni naslov") -> str:
    rights_xml = "".join(f"<dc:rights>{value}</dc:rights>" for value in rights)
    return f"""<record><header><identifier>{identifier}</identifier></header><metadata><oai_dc:dc>
      <dc:title>{title}</dc:title><dc:creator>Ime Prezime</dc:creator><dc:type>Diplomski rad</dc:type>
      {rights_xml}<dc:description>student@example.com OIB 12345678901</dc:description>
      </oai_dc:dc></metadata></record>"""


class AcademicRightsInventoryTests(unittest.TestCase):
    def test_access_and_license_classes_are_separate(self):
        self.assertEqual(
            rights_inventory.license_class("open", ["https://creativecommons.org/licenses/by/4.0/"]),
            "permissive-license-candidate",
        )
        self.assertEqual(
            rights_inventory.license_class("open", ["https://creativecommons.org/licenses/by-nc-nd/4.0/"]),
            "conditional-license-review",
        )
        self.assertEqual(
            rights_inventory.license_class("open", ["https://rightsstatements.org/vocab/InC/1.0/"]),
            "in-copyright-review",
        )
        self.assertEqual(
            rights_inventory.license_class("closed", ["https://creativecommons.org/licenses/by/4.0/"]),
            "not-open-access",
        )
        self.assertEqual(
            rights_inventory.license_class("open", [
                "https://creativecommons.org/licenses/by/4.0/",
                "https://creativecommons.org/licenses/by-nd/4.0/",
            ]),
            "conditional-license-review",
        )

    def test_public_counts_omit_pii_and_raw_identifiers(self):
        xml = f"""<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
          xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/">
          <ListRecords>{record('oai:repo.test:test_1', [
              'info:eu-repo/semantics/openAccess',
              'https://creativecommons.org/licenses/by/4.0/',
          ])}</ListRecords></OAI-PMH>"""
        counts, candidates, token = rights_inventory.parse_rights_page(xml, {"test"})
        public_text = json.dumps(dict(counts))
        self.assertEqual(counts["permissive-license-candidate"], 1)
        self.assertEqual(counts["access:open"], 1)
        self.assertIsNone(token)
        self.assertNotIn("Ime Prezime", public_text)
        self.assertNotIn("student@example.com", public_text)
        self.assertNotIn("test_1", public_text)
        self.assertEqual(candidates[0]["reviewStatus"], "pending")
        self.assertEqual(candidates[0]["oaiIdentifier"], "oai:repo.test:test_1")

    def test_only_permissive_open_records_enter_private_candidates(self):
        xml = f"""<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
          xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/">
          <ListRecords>
          {record('oai:repo.test:test_1', ['info:eu-repo/semantics/openAccess', 'https://creativecommons.org/licenses/by/4.0/'])}
          {record('oai:repo.test:test_2', ['info:eu-repo/semantics/openAccess', 'https://creativecommons.org/licenses/by-nc-nd/4.0/'])}
          {record('oai:repo.test:test_3', ['info:eu-repo/semantics/openAccess', 'https://rightsstatements.org/vocab/InC/1.0/'])}
          </ListRecords></OAI-PMH>"""
        counts, candidates, _ = rights_inventory.parse_rights_page(xml, {"test"})
        self.assertEqual(counts["permissive-license-candidate"], 1)
        self.assertEqual(counts["conditional-license-review"], 1)
        self.assertEqual(counts["in-copyright-review"], 1)
        self.assertEqual([candidate["oaiIdentifier"] for candidate in candidates], ["oai:repo.test:test_1"])


if __name__ == "__main__":
    unittest.main()
