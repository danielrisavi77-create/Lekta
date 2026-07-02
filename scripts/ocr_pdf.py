#!/usr/bin/env python3
"""OCR fallback za skenirane sluzbene PDF-ove (kad ocrmypdf nije dostupan).

Rasterizira svaku stranicu PyMuPDF-om (300 DPI) i pusta tesseract (hrv+eng) po
stranici. Cist Python + tesseract binarij; ne treba Ghostscript ni ocrmypdf.
Skenirani izvor bez tekstualnog sloja ovime dobije .txt koji covjek/agent cita da
izvuce DOSLOVNE citate pravila (isti standard grep-provjere kao ostali izvori).

Ovisnosti:
  pip install --user pymupdf
  tesseract na PATH-u ili na standardnoj Windows putanji; hrv.traineddata u
  TESSDATA_PREFIX (npr. C:/Users/<user>/AppData/Local/tessdata).

Uporaba:
  python scripts/ocr_pdf.py <in.pdf> [out.txt] [--dpi 300] [--lang hrv+eng]
Ako out.txt izostane, pise pored ulaza kao <ime>-ocr.txt.
"""
import os
import sys
import shutil
import subprocess
import tempfile

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.stderr.write("Nedostaje PyMuPDF. Instaliraj: pip install --user pymupdf\n")
    sys.exit(2)


def find_tesseract():
    exe = shutil.which("tesseract")
    if exe:
        return exe
    for cand in (
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
    ):
        if os.path.exists(cand):
            return cand
    return None


def main():
    args = [a for a in sys.argv[1:]]
    dpi = 300
    lang = "hrv+eng"
    positional = []
    i = 0
    while i < len(args):
        if args[i] == "--dpi":
            dpi = int(args[i + 1]); i += 2
        elif args[i] == "--lang":
            lang = args[i + 1]; i += 2
        else:
            positional.append(args[i]); i += 1
    if not positional:
        sys.stderr.write("Uporaba: python scripts/ocr_pdf.py <in.pdf> [out.txt] [--dpi N] [--lang hrv+eng]\n")
        sys.exit(1)
    pdf = positional[0]
    out = positional[1] if len(positional) > 1 else pdf.rsplit(".", 1)[0] + "-ocr.txt"

    tess = find_tesseract()
    if not tess:
        sys.stderr.write("Nedostaje tesseract. Instaliraj (Windows): winget install UB-Mannheim.TesseractOCR\n")
        sys.exit(2)
    if not os.environ.get("TESSDATA_PREFIX"):
        default_td = os.path.expandvars(r"%LOCALAPPDATA%\tessdata")
        if os.path.exists(os.path.join(default_td, "hrv.traineddata")):
            os.environ["TESSDATA_PREFIX"] = default_td

    doc = fitz.open(pdf)
    parts = []
    with tempfile.TemporaryDirectory() as td:
        for idx in range(doc.page_count):
            pix = doc[idx].get_pixmap(dpi=dpi)
            png = os.path.join(td, f"p{idx+1}.png")
            pix.save(png)
            r = subprocess.run(
                [tess, png, "stdout", "-l", lang, "--psm", "3"],
                capture_output=True, text=True, encoding="utf-8",
            )
            parts.append(f"===== PAGE {idx+1}/{doc.page_count} =====\n" + (r.stdout or ""))
            sys.stderr.write(f"  OCR str {idx+1}/{doc.page_count}\r")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(parts))
    sys.stderr.write(f"\nGotovo: {out} ({os.path.getsize(out)} B)\n")


if __name__ == "__main__":
    main()
