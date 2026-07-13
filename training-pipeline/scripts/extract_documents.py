#!/usr/bin/env python3
"""Extract text from PDF/DOCX files without copying originals."""
from __future__ import annotations
import argparse, json, subprocess
from pathlib import Path

def pdf_text(path: Path) -> str:
    try:
        import fitz
    except ImportError:
        raise SystemExit("Install PyMuPDF: pip install pymupdf")
    doc = fitz.open(path)
    return "\n".join(page.get_text() for page in doc)

def docx_text(path: Path) -> str:
    try:
        from docx import Document
    except ImportError:
        raise SystemExit("Install python-docx: pip install python-docx")
    return "\n".join(p.text for p in Document(path).paragraphs)

def convert_pdf_to_docx(path: Path, output_dir: Path) -> str | None:
    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(["libreoffice", "--headless", "--convert-to", "docx",
                        "--outdir", str(output_dir), str(path)],
                       check=True, capture_output=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    result = output_dir / (path.stem + ".docx")
    return str(result) if result.exists() else None

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--docx-dir", type=Path, default=Path("training-pipeline/output/docx"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.manifest.open(encoding="utf-8") as source, args.output.open("w", encoding="utf-8") as target:
        for line in source:
            record = json.loads(line)
            path = Path(record["path"])
            try:
                text = pdf_text(path) if path.suffix.lower() == ".pdf" else docx_text(path)
                record["extractedText"] = text
                record["extractionStatus"] = "ok"
                if path.suffix.lower() == ".pdf":
                    record["convertedDocxPath"] = convert_pdf_to_docx(path, args.docx_dir)
            except Exception as exc:
                record["extractionStatus"] = "error"
                record["extractionError"] = str(exc)
            target.write(json.dumps(record, ensure_ascii=False) + "\n")

if __name__ == "__main__":
    main()
