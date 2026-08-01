import io
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

os.environ.setdefault("LEKTA_FIELD_RENDER_TOKEN", "test-secret")
from app import _field_snapshot, _safe_zip  # noqa: E402


def docx_with_field(result: str = "1") -> bytes:
    xml = f'''<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:fldSimple w:instr="PAGE"><w:r><w:t>{result}</w:t></w:r></w:fldSimple></w:p></w:body></w:document>'''.encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", xml)
    return out.getvalue()


def docx_with_complex_field(result: str = "1") -> bytes:
    xml = f'''<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>{result}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:body></w:document>'''.encode()
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", xml)
    return out.getvalue()


class WorkerSafetyTests(unittest.TestCase):
    def test_snapshot_counts_fields_without_exposing_document_text(self):
        with zipfile.ZipFile(io.BytesIO(docx_with_field("42"))) as archive:
            xml = archive.read("word/document.xml")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "word").mkdir()
            (root / "word" / "document.xml").write_bytes(xml)
            snapshot = _field_snapshot(root)
        self.assertEqual(snapshot["count"], 1)
        self.assertNotIn("42", str(snapshot.keys()))

    def test_safe_zip_rejects_non_docx(self):
        with self.assertRaises(ValueError):
            _safe_zip(b"not-a-docx")

    def test_snapshot_reads_complex_field_char_type(self):
        with zipfile.ZipFile(io.BytesIO(docx_with_complex_field("7"))) as archive:
            xml = archive.read("word/document.xml")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "word").mkdir()
            (root / "word" / "document.xml").write_bytes(xml)
            snapshot = _field_snapshot(root)
        self.assertEqual(snapshot["count"], 1)
        self.assertEqual(snapshot["fields"][0], (" PAGE ".strip().upper(), "7"))


if __name__ == "__main__":
    unittest.main()
