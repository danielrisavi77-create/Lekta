# -*- coding: utf-8 -*-
"""Sken snapshot PDF-ova sluzbenih izvora za sadrzaj o NASLOVNICI (korak A pipeline-a).

Za svaki PDF iz data/sources/source-registry.json nadje stranice koje spominju
naslovnicu/korice/predlozak i dumpa njihov tekst + spanove (font/velicina/bold),
te heuristicki oznaci stranice koje IZGLEDAJU kao sluzbeni predlozak naslovnice
(malo teksta, veliki fontovi, placeholder uzorci poput "Ime i prezime").

Izlaz (artifacts/ je gitignoriran):
  artifacts/title-harvest/official/scan/<sourceId>.json
  artifacts/title-harvest/official/scan/index.json

Deterministicki, bez mreze. Pokretanje: python scripts/title-pages/scan_sources.py
Zahtijeva PyMuPDF (pip install --user pymupdf); obrazac iz scripts/ocr_pdf.py.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit("PyMuPDF nije instaliran: pip install --user pymupdf")

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "artifacts" / "title-harvest" / "official" / "scan"

KEYWORDS = ("naslovnic", "naslovna stranica", "naslovnoj stranici", "korice", "koricama",
            "predloz", "obrazac naslovn")
PLACEHOLDERS = ("ime i prezime", "ime prezime", "naslov rada", "naslov zavrsnog",
                "naslov diplomskog", "titula", "puni naziv", "akad. god")


def plain(text):
    """Bez dijakritike, lowercase (hrvatski izvori mijesaju c/ć/č po OCR-u)."""
    norm = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in norm if not unicodedata.combining(ch)).lower()


def page_spans(page):
    """Kompaktan dump linija stranice: tekst + dominantan font/velicina/bold po liniji."""
    out = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            text = "".join(s.get("text", "") for s in spans).strip()
            if not text:
                continue
            main = max(spans, key=lambda s: len(s.get("text", "")))
            font = main.get("font", "")
            out.append({
                "text": text[:300],
                "font": font,
                "sizePt": round(main.get("size", 0) * 2) / 2,
                "bold": bool(main.get("flags", 0) & 16) or "bold" in font.lower(),
                "y": round(line.get("bbox", [0, 0, 0, 0])[1], 1),
            })
    return out


def looks_like_template(page, text_plain, spans):
    """Stranica koja JE predlozak naslovnice: malo rijeci, veliki font, placeholderi."""
    words = len(text_plain.split())
    if words == 0 or words > 90:
        return False
    has_placeholder = any(p in text_plain for p in PLACEHOLDERS)
    has_big_font = any(s["sizePt"] >= 16 for s in spans)
    return has_placeholder and has_big_font


def scan_pdf(path):
    """Vrati (pogodjene stranice, ukupno stranica) ili None ako PDF ne moze otvoriti."""
    try:
        doc = fitz.open(path)
    except Exception as exc:  # noqa: BLE001 - snapshotovi znaju biti osteceni
        return None, f"open-failed: {exc}"
    hits = []
    try:
        for idx in range(doc.page_count):
            try:
                page = doc[idx]
                raw = page.get_text("text")
            except Exception as exc:  # noqa: BLE001 - poznati fitz crashevi po stranici
                hits.append({"page": idx + 1, "error": f"page-failed: {exc}"})
                continue
            tp = plain(raw)
            matched = sorted({k for k in KEYWORDS if k in tp})
            spans = None
            template_candidate = False
            if matched or len(tp.split()) <= 90:
                spans = page_spans(page)
                template_candidate = looks_like_template(page, tp, spans)
            if matched or template_candidate:
                hits.append({
                    "page": idx + 1,
                    "keywords": matched,
                    "isTemplateCandidate": template_candidate,
                    "text": raw[:4000],
                    "lines": spans or [],
                })
        return {"pages": doc.page_count, "hits": hits}, None
    finally:
        doc.close()


def main():
    registry = json.loads((ROOT / "data" / "sources" / "source-registry.json").read_text("utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index = []
    for src in registry:
        snap = src.get("snapshotPath") or ""
        if not snap.lower().endswith(".pdf"):
            continue
        path = ROOT / Path(snap)
        if not path.exists():
            index.append({"id": src["id"], "status": "missing", "snapshotPath": snap})
            continue
        result, err = scan_pdf(path)
        if err:
            index.append({"id": src["id"], "status": "error", "error": err, "snapshotPath": snap})
            continue
        n_hits = len(result["hits"])
        n_templates = sum(1 for h in result["hits"] if h.get("isTemplateCandidate"))
        index.append({
            "id": src["id"], "status": "ok", "snapshotPath": snap,
            "pages": result["pages"], "hits": n_hits, "templateCandidates": n_templates,
        })
        if n_hits:
            out = {"sourceId": src["id"], "title": src.get("title"), "url": src.get("url"),
                   "snapshotPath": snap, **result}
            (OUT_DIR / f"{src['id']}.json").write_text(
                json.dumps(out, ensure_ascii=False, indent=1), "utf-8")
    (OUT_DIR / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), "utf-8")
    ok = [i for i in index if i["status"] == "ok"]
    with_hits = [i for i in ok if i["hits"]]
    with_tpl = [i for i in ok if i.get("templateCandidates")]
    print(f"skenirano {len(ok)} PDF-ova, {len(with_hits)} s pogotkom o naslovnici, "
          f"{len(with_tpl)} s kandidatom za predlozak -> {OUT_DIR}")
    for i in sorted(with_tpl, key=lambda x: -x["templateCandidates"])[:20]:
        print(f"  TEMPLATE? {i['id']}: {i['templateCandidates']} str. ({i['hits']} pogodaka)")


if __name__ == "__main__":
    main()
