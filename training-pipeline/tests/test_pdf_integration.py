"""Integracijski test PDF puta sa stvarnim PyMuPDF-om i pdf2docx-om (pregled na #278).

Postojeci test_pipeline.py mockira pdf_text i pdf_to_docx, pa zelena provjera ne potvrdjuje
konverziju: upstream (PyMuPDF/pdf2docx #357) je pdf2docx 0.5.8 uz PyMuPDF >= 1.26.5 davao DOCX
od 0 bajtova. Ovdje se nista ne mockira. PDF-ovi su sinteticki i generiraju se u testu
PyMuPDF-om, bez ijednog stvarnog rada.
"""
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

PIPELINE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPELINE / "scripts"))


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


lib = load("pipeline_lib_pdf", PIPELINE / "lib.py")
extract_documents = load("extract_documents_pdf", PIPELINE / "scripts" / "extract_documents.py")

OCEKIVANO = "Lekta integracijski PDF 2026"


def tekstni_pdf(path: Path) -> None:
    import pymupdf

    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), OCEKIVANO, fontsize=12)
        page.insert_text((72, 100), "Drugi redak sinteticke stranice.", fontsize=12)
        # Okvir i crta: pdf2docx tada prolazi i kroz obradu oblika (upstream #357 je padao u Rect.get_area).
        page.draw_rect(pymupdf.Rect(72, 120, 300, 200), color=(0, 0, 0), fill=(0.8, 0.8, 0.8))
        page.draw_line((72, 220), (400, 220))
        page.insert_text((80, 160), "Tekst u okviru", fontsize=11)
        document.save(path)


def pdf_bez_tekstnog_sloja(path: Path) -> None:
    """Stranica samo s vektorskim crtezom: kao skenirani rad bez OCR sloja."""
    import pymupdf

    with pymupdf.open() as document:
        page = document.new_page()
        page.draw_rect(pymupdf.Rect(72, 72, 300, 200), color=(0, 0, 0), fill=(0.5, 0.5, 0.5))
        document.save(path)


class PdfIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.docx_dir = self.root / "docx"

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def record(self, pdf: Path, convert: bool) -> dict:
        manifest = self.root / "manifest.jsonl"
        lib.write_jsonl(manifest, [{"id": pdf.stem, "_localPath": str(pdf)}])
        return list(extract_documents.records(manifest, self.docx_dir, convert))[0]

    def test_pdf_text_izvlaci_ocekivani_niz(self):
        pdf = self.root / "tekst.pdf"
        tekstni_pdf(pdf)
        self.assertIn(OCEKIVANO, extract_documents.pdf_text(pdf))

    def test_pdf_to_docx_daje_otvoriv_nenulti_docx_s_tekstom(self):
        pdf = self.root / "tekst.pdf"
        tekstni_pdf(pdf)
        target = extract_documents.pdf_to_docx(pdf, self.docx_dir, "tekst")
        self.assertIsNotNone(target)
        assert target is not None
        self.assertGreater(target.stat().st_size, 0)
        with zipfile.ZipFile(target) as package:
            self.assertIsNone(package.testzip())
            document_xml = package.read("word/document.xml").decode("utf-8")
        self.assertIn("Lekta", document_xml)
        self.assertIn(OCEKIVANO, extract_documents.docx_text(target))

    def test_records_s_konverzijom_je_ready_i_pokazuje_na_docx(self):
        pdf = self.root / "tekst.pdf"
        tekstni_pdf(pdf)
        record = self.record(pdf, convert=True)
        self.assertEqual(record["extractionStatus"], "ok")
        self.assertEqual(record["analysisStatus"], "ready")
        docx = Path(record["_analysisDocxPath"])
        self.assertTrue(docx.is_file())
        self.assertGreater(docx.stat().st_size, 0)

    def test_convert_pdf_false_preskace_konverziju(self):
        pdf = self.root / "tekst.pdf"
        tekstni_pdf(pdf)
        record = self.record(pdf, convert=False)
        self.assertEqual(record["extractionStatus"], "ok")
        self.assertEqual(record["analysisStatus"], "conversion_not_requested")
        self.assertNotIn("_analysisDocxPath", record)
        self.assertFalse(self.docx_dir.exists() and any(self.docx_dir.iterdir()))

    def test_pdf_bez_tekstnog_sloja_trazi_ocr_bez_iznimke(self):
        pdf = self.root / "sken.pdf"
        pdf_bez_tekstnog_sloja(pdf)
        self.assertEqual(extract_documents.pdf_text(pdf).strip(), "")
        record = self.record(pdf, convert=True)
        self.assertEqual(record["extractedText"].strip(), "")
        self.assertEqual(record["extractionStatus"], "ocr_required")
        self.assertEqual(record["analysisStatus"], "ocr_required")
        self.assertNotIn("extractionError", record)
        self.assertNotIn("_analysisDocxPath", record)


if __name__ == "__main__":
    unittest.main()
